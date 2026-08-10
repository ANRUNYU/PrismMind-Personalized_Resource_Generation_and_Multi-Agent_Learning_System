from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.course import Course
from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.profile import StudentProfile
from app.models.resource import LearningResource
from app.models.user import User
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.profile_repository import profile_repository
from app.repositories.resource_repository import resource_repository
from app.schemas.resource import ResourceGenerateRequest, ResourceGenerateSingleRequest, ResourceReference
from app.services.agents.profile_agent import SCORE_KEYS
from app.services.agents.resource_agent import GeneratedLearningResource, resource_agent
from app.services.knowledge.models import EvidenceStatus, GroundingPolicy
from app.services.knowledge.service import KnowledgeAccessError, KnowledgeService
from app.services.llm.model_registry import AgentRole
from app.services.quality_analysis_service import quality_analysis_service


@dataclass
class StudentResourceGenerationResult:
    resources: list[LearningResource]
    references: list[ResourceReference] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class StudentGenerationService:
    def generate_resources(
        self,
        db: Session,
        *,
        current_user: User,
        payload: ResourceGenerateRequest,
        generation_task_id: int | None = None,
        on_delta: Callable[[str], None] | None = None,
    ) -> StudentResourceGenerationResult:
        course_id = self.validate_course_id(db, payload.course_id)
        profile, profile_context, profile_warnings = self._profile_context(
            db,
            user_id=current_user.id,
            use_profile=payload.use_profile,
        )
        reference_context, references, rag_warnings = self._reference_context(
            db,
            current_user=current_user,
            query=self._retrieval_query(payload.topic, payload.knowledge_points),
            course_id=course_id,
            knowledge_document_ids=payload.knowledge_document_ids or [],
            use_knowledge_base=payload.use_knowledge_base,
            top_k=payload.top_k,
        )
        generated = resource_agent.generate_resources(
            topic=payload.topic,
            resource_types=payload.resource_types,
            difficulty=payload.difficulty,
            knowledge_points=payload.knowledge_points,
            profile_context=profile_context,
            reference_context=reference_context,
            additional_requirements=payload.additional_requirements,
            on_delta=on_delta,
        )
        saved = self._save_resources(
            db,
            current_user=current_user,
            profile=profile,
            course_id=course_id,
            topic=payload.topic,
            difficulty=payload.difficulty,
            generated=generated,
            references=references,
            warnings=profile_warnings + rag_warnings,
            generation_task_id=generation_task_id,
            generation_parameters=payload.model_dump(mode="json"),
        )
        return StudentResourceGenerationResult(
            resources=saved,
            references=references,
            warnings=profile_warnings + rag_warnings,
        )

    def generate_single_resource(
        self,
        db: Session,
        *,
        current_user: User,
        payload: ResourceGenerateSingleRequest,
        generation_task_id: int | None = None,
        on_delta: Callable[[str], None] | None = None,
    ) -> StudentResourceGenerationResult:
        multi_payload = ResourceGenerateRequest(
            topic=payload.topic,
            course_id=payload.course_id,
            resource_types=[payload.resource_type],
            difficulty=payload.difficulty,
            knowledge_points=payload.knowledge_points,
            use_profile=payload.use_profile,
            use_knowledge_base=payload.use_knowledge_base,
            knowledge_document_ids=payload.knowledge_document_ids,
            top_k=payload.top_k,
            additional_requirements=payload.additional_requirements,
        )
        return self.generate_resources(
            db, current_user=current_user, payload=multi_payload,
            generation_task_id=generation_task_id,
            on_delta=on_delta,
        )

    def generate_resources_for_task(
        self,
        db: Session,
        *,
        owner_id: int,
        task_type: str,
        payload_data: dict[str, Any],
        task_id: int,
        on_delta: Callable[[str], None] | None = None,
    ) -> StudentResourceGenerationResult:
        """Run resource generation from a Celery worker using persisted task input."""
        user = db.get(User, owner_id)
        if user is None:
            raise NotFoundException("用户不存在")

        if task_type == "student_resource_generation":
            payload = ResourceGenerateRequest.model_validate(payload_data)
            return self.generate_resources(
                db, current_user=user, payload=payload, generation_task_id=task_id, on_delta=on_delta
            )

        if task_type == "student_resource_single_generation":
            payload = ResourceGenerateSingleRequest.model_validate(payload_data)
            return self.generate_single_resource(
                db, current_user=user, payload=payload, generation_task_id=task_id, on_delta=on_delta
            )

        raise BadRequestException("不支持的学生资源生成任务类型")

    def validate_course_id(self, db: Session, course_id: int | None) -> int | None:
        """Validate optional course id before retrieval, LLM generation, or DB writes."""
        if course_id is None:
            return None
        if db.get(Course, course_id) is None:
            raise BadRequestException("课程不存在")
        return course_id

    def _profile_context(
        self,
        db: Session,
        *,
        user_id: int,
        use_profile: bool,
    ) -> tuple[StudentProfile | None, str, list[str]]:
        if not use_profile:
            return None, "", []
        profile = profile_repository.get_by_user_id(db, user_id)
        if profile is None:
            return None, "", ["尚未创建学习画像，生成结果未充分个性化。"]

        data = dict(profile.profile_data or {})
        scores = {key: float(getattr(profile, key)) for key in SCORE_KEYS}
        learning_goal = self._usable_profile_text(profile.learning_goal, field="learning_goal")
        preferred_style = self._usable_profile_text(data.get("preferred_style"))
        weaknesses = [
            item for value in (data.get("weaknesses") or [])
            if (item := self._usable_profile_text(value))
        ]
        profile_lines = [
            f"专业：{profile.major or '未填写'}",
            f"年级：{profile.grade or '未填写'}",
            f"学习目标：{learning_goal or '未填写'}",
            f"学习方式偏好：{preferred_style or '未填写'}",
            f"薄弱点：{'、'.join(weaknesses) or '未填写'}",
            f"兴趣方向：{'、'.join(data.get('interests') or []) or '未填写'}",
            f"每周可用时间：{data.get('available_time_per_week') or '未填写'}小时",
            "六维分数：" + "，".join(f"{key}={value}" for key, value in scores.items()),
        ]
        if data.get("current_level") and profile.knowledge_score < 60:
            profile_lines.append("适配建议：知识基础偏弱，需要更基础、更分步的讲解。")
        if data.get("practice_experience") and profile.practice_score >= 70:
            profile_lines.append("适配建议：实践能力较强，可以加入动手任务。")
        if (data.get("exam_evidence") or data.get("exam_pressure")) and profile.exam_score >= 70:
            profile_lines.append("适配建议：应试需求较强，可以加入考点和自测题。")
        if (data.get("efficiency_evidence") or data.get("available_time_per_week")) and profile.efficiency_score < 60:
            profile_lines.append("适配建议：学习效率偏低，需要明确步骤和时间安排。")
        return profile, "\n".join(profile_lines), []

    def _reference_context(
        self,
        db: Session,
        *,
        current_user: User,
        query: str,
        course_id: int | None,
        knowledge_document_ids: list[int],
        use_knowledge_base: bool,
        top_k: int,
    ) -> tuple[str, list[ResourceReference], list[str]]:
        document_ids = self._unique_ints(knowledge_document_ids)
        if not use_knowledge_base and not document_ids:
            return "", [], []

        try:
            pack = KnowledgeService(db).retrieve_for_agent(
                AgentRole.RESOURCE.value, current_user, course_id, query,
                document_ids=document_ids or None, top_k=top_k, policy=GroundingPolicy.STRICT,
            )
        except KnowledgeAccessError as exc:
            raise ForbiddenException(str(exc)) from exc
        if pack.status != EvidenceStatus.sufficient:
            reason = pack.insufficient_reason or "没有检索到足够的个人知识库证据"
            warnings = list(pack.warnings)
            warnings.append(f"{reason}；本次将使用通用 AI 知识生成，来源覆盖率与匹配度不可计算。")
            return "", [], list(dict.fromkeys(warnings))
        references = [
            ResourceReference(
                document_id=chunk.document_id, chunk_index=chunk.chunk_index,
                source_filename=chunk.source_filename, excerpt=self._truncate(chunk.content, 1200),
                score=chunk.similarity,
            )
            for chunk in pack.chunks
        ]
        sections = [f"[{chunk.citation_id}]\n{self._truncate(chunk.content, 1200)}" for chunk in pack.chunks]
        return "\n\n".join(sections), references, list(pack.warnings)

    def _validate_documents(
        self,
        db: Session,
        *,
        current_user: User,
        document_ids: list[int],
    ):
        if not document_ids:
            return []
        documents, missing_ids, forbidden_ids = knowledge_repository.list_accessible_documents_by_ids(
            db,
            document_ids=document_ids,
            current_user=current_user,
        )
        if missing_ids:
            raise NotFoundException(f"知识库文档不存在：{missing_ids[0]}")
        if forbidden_ids:
            raise ForbiddenException(f"无权访问知识库文档 {forbidden_ids[0]}")
        for document in documents:
            if current_user.role != UserRole.admin and document.owner_id != current_user.id:
                raise ForbiddenException(f"无权访问知识库文档 {document.id}")
            if document.status != KnowledgeDocumentStatus.ingested:
                raise BadRequestException(
                    f"知识库文档 {document.id} 尚未入库，请先执行入库。"
                )
        return documents

    def _save_resources(
        self,
        db: Session,
        *,
        current_user: User,
        profile: StudentProfile | None,
        course_id: int | None,
        topic: str,
        difficulty: str,
        generated: list[GeneratedLearningResource],
        references: list[ResourceReference],
        warnings: list[str],
        generation_task_id: int | None,
        generation_parameters: dict[str, Any],
    ) -> list[LearningResource]:
        course = db.get(Course, course_id) if course_id is not None else None
        profile_snapshot = self._profile_snapshot(
            profile,
            topic=topic,
            course_name=course.name if course is not None else None,
        )
        payloads = [
            {
                "user_id": current_user.id,
                "profile_id": profile.id if profile else None,
                "course_id": course_id,
                "resource_type": item.resource_type,
                "title": item.title,
                "content": item.content,
                "topic": topic,
                "difficulty_level": difficulty,
                "tags": item.tags,
                "is_viewed": False,
                "is_completed": False,
                "user_rating": None,
                "quality_analysis": quality_analysis_service.analyze_generated_content(
                    content=item.content,
                    references=[reference.model_dump(mode="json") for reference in references],
                    warnings=warnings,
                ).model_dump(mode="json"),
                "profile_snapshot": profile_snapshot,
                "reference_snapshot": [reference.model_dump(mode="json") for reference in references],
                "generation_task_id": generation_task_id,
                "generation_parameters": generation_parameters,
            }
            for item in generated
        ]
        return resource_repository.create_resources(db, resources=payloads)

    def _profile_snapshot(
        self,
        profile: StudentProfile | None,
        *,
        topic: str | None = None,
        course_name: str | None = None,
    ) -> dict[str, Any] | None:
        if profile is None:
            return None
        data = dict(profile.profile_data or {})
        scores = {key: float(getattr(profile, key)) for key in SCORE_KEYS}
        learning_goal = self._usable_profile_text(profile.learning_goal, field="learning_goal")
        course = (
            self._usable_profile_text(data.get("current_course"))
            or self._usable_profile_text(course_name)
            or self._usable_profile_text(topic)
        )
        preferred_style = (
            self._usable_profile_text(data.get("preferred_style"))
            or self._usable_profile_text(data.get("quality_evidence"))
        )
        if preferred_style:
            preferred_style = self._truncate(preferred_style, 160)
        weaknesses = [
            item for value in (data.get("weaknesses") or [])
            if (item := self._usable_profile_text(value))
        ]
        dimension_labels = {
            "knowledge_score": "知识基础",
            "practice_score": "实践能力",
            "innovation_score": "创新能力",
            "exam_score": "应试能力",
            "efficiency_score": "学习效率",
            "quality_score": "学习质量",
        }
        scored_dimensions = sorted(
            ((key, score) for key, score in scores.items() if score > 0),
            key=lambda item: item[1],
        )
        development_focus = [
            f"{dimension_labels[key]}（{score:g} 分）"
            for key, score in scored_dimensions[:2]
        ]
        strategies: list[str] = []
        if learning_goal:
            strategies.append(f"围绕学习目标“{learning_goal}”组织内容与练习")
        if learning_goal and any(keyword in learning_goal for keyword in ("考研", "考试", "考公", "证书")):
            strategies.append("突出考试重点、阶段自测与失分复盘")
        if course:
            strategies.append(f"结合当前课程“{course}”选取概念与示例")
        if weaknesses:
            strategies.append(f"优先讲解薄弱点：{'、'.join(weaknesses[:3])}")
        if preferred_style:
            strategies.append(f"按“{preferred_style}”的学习偏好组织呈现")
        if not weaknesses and development_focus:
            strategies.append(f"依据六维画像优先加强：{'、'.join(development_focus)}")
        if data.get("current_level") and profile.knowledge_score < 60:
            strategies.append("补充前置知识并分步骤讲解")
        if data.get("practice_experience") and profile.practice_score >= 70:
            strategies.append("增加实践任务和迁移练习")
        if (data.get("exam_evidence") or data.get("exam_pressure")) and profile.exam_score >= 70:
            strategies.append("突出考点、自测与失分复盘")
        if (data.get("efficiency_evidence") or data.get("available_time_per_week")) and profile.efficiency_score < 60:
            strategies.append("提供明确步骤和时间安排")
        if not strategies:
            strategies.append("平衡概念讲解、练习和复盘")
        return {
            "learning_goal": learning_goal,
            "course": course,
            "major": self._usable_profile_text(profile.major),
            "grade": self._usable_profile_text(profile.grade),
            "profile_summary": self._usable_profile_text(profile.profile_summary),
            "dimension_scores": scores,
            "weaknesses": weaknesses,
            "development_focus": development_focus,
            "learning_preferences": preferred_style,
            "personalization_strategies": strategies,
        }

    def _usable_profile_text(self, value: Any, *, field: str | None = None) -> str | None:
        text = str(value or "").strip()
        if not text:
            return None
        if field == "learning_goal" and any(
            marker in text
            for marker in ("学习画像智能助手", "你可以询问六维能力", "我的能力如何")
        ):
            return None
        return text

    def _append_results(
        self,
        results: list[dict[str, Any]],
        *,
        sections: list[str],
        references: list[ResourceReference],
    ) -> None:
        for result in results:
            content = str(result.get("content") or "").strip()
            if not content:
                continue
            metadata = result.get("metadata") or {}
            document_id = self._safe_int(metadata.get("document_id"))
            chunk_index = self._safe_int(metadata.get("chunk_index"))
            source_filename = metadata.get("source_filename")
            score = result.get("score")
            label = f"[document {document_id or '-'} / chunk {chunk_index if chunk_index is not None else '-'}]"
            if source_filename:
                label = f"[{source_filename} / chunk {chunk_index if chunk_index is not None else '-'}]"
            excerpt = self._truncate(content, 1200)
            sections.append(f"{label}\n{excerpt}")
            references.append(
                ResourceReference(
                    document_id=document_id,
                    chunk_index=chunk_index,
                    source_filename=source_filename,
                    excerpt=excerpt,
                    score=float(score) if score is not None else None,
                )
            )

    def _retrieval_query(self, topic: str, knowledge_points: list[str] | None) -> str:
        if knowledge_points:
            return f"{topic} {' '.join(knowledge_points)} personalized learning resource"
        return f"{topic} personalized learning resource"

    def _unique_ints(self, values: list[int]) -> list[int]:
        return list(dict.fromkeys(int(value) for value in values))

    def _safe_int(self, value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _truncate(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 20)].rstrip() + "\n...[truncated]"


student_generation_service = StudentGenerationService()
