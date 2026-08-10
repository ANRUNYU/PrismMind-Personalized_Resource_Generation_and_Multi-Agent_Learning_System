from __future__ import annotations

import asyncio
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
import re
import time
from typing import Any

from fastapi import status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppException, BadRequestException, ForbiddenException, NotFoundException
from app.models.artifact import GeneratedArtifact
from app.models.assignment import CourseAssignmentSubmission
from app.models.course import Course, CourseMember
from app.models.enums import ArtifactStatus, ArtifactType, FileParseStatus, KnowledgeDocumentStatus, UserRole
from app.models.user import User
from app.repositories.artifact_repository import artifact_repository
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.schemas.teacher_generation import (
    CourseDesignGenerateRequest,
    ExerciseGenerateRequest,
    PaperGenerateRequest,
    ProjectPracticeGenerateRequest,
    TeachingDesignGenerateRequest,
    TrainingPlanExtractSkillsRequest,
    TrainingPlanExtractSkillsResponse,
    TrainingPlanGenerateRequest,
    TrainingPlanSkill,
)
from app.services.documents.parser import DocumentParseError, parse_document
from app.services.documents.storage import get_file_path
from app.services.llm.prompt_registry import render_prompt
from app.services.agents.base import BaseAgent
from app.services.knowledge.models import EvidenceStatus, GroundingPolicy
from app.services.knowledge.service import KnowledgeAccessError, KnowledgeService
from app.services.llm.base import ChatMessage, StreamChunkType
from app.services.llm.model_registry import AgentRole
from app.services.llm.router import router
from app.services.quality_analysis_service import quality_analysis_service
from app.services.generation.question_generation_service import question_generation_service
from app.services.generation.reference_context_service import reference_context_service


REFERENCE_FIELD_NAMES = {
    "course_id",
    "file_ids",
    "knowledge_document_ids",
    "use_knowledge_base",
    "retrieval_query",
    "top_k",
}

TEACHER_GENERATION_SYSTEM_PROMPT = (
    "你是高校课程建设与教学资源生成专家。请使用中文输出，结构清晰、可直接给教师修改使用。"
    "不要输出内部 ID，不要编造资料来源；引用资料不足时请说明不确定性，并给出可执行教学建议。"
    "输出必须是合法 Markdown；数学公式使用合法 LaTeX，行内公式用 $...$、独立公式用 $$...$$，上下标必须加花括号。"
)


@dataclass
class ReferenceItem:
    source_type: str
    file_id: int | None = None
    document_id: int | None = None
    chunk_index: int | None = None
    source_filename: str | None = None
    excerpt: str | None = None
    chunk_id: str | None = None
    source_hash: str | None = None
    source_version: str | None = None
    retrieval_similarity: float | None = None


@dataclass
class ReferenceContext:
    text: str = ""
    references: list[ReferenceItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


@dataclass
class GenerationResult:
    artifact: GeneratedArtifact
    references: list[ReferenceItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    quality_analysis: Any | None = None


class TeacherGenerationService:
    PROFILE_SCORE_FIELDS = (
        "knowledge_score",
        "practice_score",
        "innovation_score",
        "exam_score",
        "efficiency_score",
        "quality_score",
    )

    def validate_course_selection(self, db: Session, current_user: User, payload: BaseModel) -> Course | None:
        course_id = getattr(payload, "course_id", None)
        if course_id is None:
            return None
        course = db.get(Course, int(course_id))
        if course is None:
            raise NotFoundException("选择的班级不存在")
        if current_user.role != UserRole.admin and course.owner_id != current_user.id:
            raise ForbiddenException("只能选择自己负责的班级")
        return course

    def build_class_profile_context(
        self,
        db: Session,
        *,
        current_user: User,
        payload: BaseModel,
    ) -> tuple[str, dict[str, Any]]:
        course = self.validate_course_selection(db, current_user, payload)
        if course is None:
            return "未选择班级，请仅依据教师填写的目标和参考资料生成。", {}
        members = list(
            db.scalars(
                select(CourseMember)
                .options(selectinload(CourseMember.user).selectinload(User.profile))
                .where(
                    CourseMember.course_id == course.id,
                    CourseMember.role == "student",
                    CourseMember.status == "active",
                )
                .order_by(CourseMember.id)
            )
        )
        profiles = [member.user.profile for member in members if member.user is not None and member.user.profile is not None]
        score_averages = {
            field: round(sum(float(getattr(profile, field) or 0) for profile in profiles) / len(profiles), 2)
            for field in self.PROFILE_SCORE_FIELDS
        } if profiles else {field: 0.0 for field in self.PROFILE_SCORE_FIELDS}
        weakness_counter: Counter[str] = Counter()
        goal_counter: Counter[str] = Counter()
        for profile in profiles:
            profile_data = profile.profile_data or {}
            weakness_counter.update(
                str(item).strip()
                for item in profile_data.get("weaknesses") or []
                if str(item).strip()
            )
            if profile.learning_goal and profile.learning_goal.strip():
                goal_counter[profile.learning_goal.strip()] += 1

        submissions = list(
            db.scalars(
                select(CourseAssignmentSubmission).where(
                    CourseAssignmentSubmission.course_id == course.id,
                    CourseAssignmentSubmission.score.is_not(None),
                    CourseAssignmentSubmission.status.in_(["submitted", "graded"]),
                )
            )
        )
        achievement_rates = [
            float(item.score or 0) / max(1.0, float(item.max_score or 100))
            for item in submissions
        ]
        assignment_rate = round(sum(achievement_rates) / len(achievement_rates), 4) if achievement_rates else None
        for submission in submissions:
            feedback = submission.feedback or {}
            weakness_counter.update(
                str(item).strip()
                for item in feedback.get("incorrect_topics") or []
                if str(item).strip()
            )
        indicators: list[float] = []
        if profiles:
            indicators.append(sum(score_averages.values()) / len(score_averages))
        if assignment_rate is not None:
            indicators.append(assignment_rate * 100)
        overall_score = round(sum(indicators) / len(indicators), 2) if indicators else 0.0
        if not indicators:
            level = "画像数据不足"
        elif overall_score >= 80:
            level = "整体较强"
        elif overall_score >= 65:
            level = "整体中等"
        else:
            level = "基础仍需巩固"
        snapshot = {
            "course_name": course.name,
            "course_description": course.description,
            "student_count": len(members),
            "profiled_student_count": len(profiles),
            "overall_level": level,
            "average_profile_scores": score_averages,
            "top_weaknesses": [
                {"topic": topic, "student_count": count}
                for topic, count in weakness_counter.most_common(8)
            ],
            "learning_goals": [
                {"goal": goal, "student_count": count}
                for goal, count in goal_counter.most_common(5)
            ],
            "graded_submission_count": len(submissions),
            "average_assignment_achievement_rate": assignment_rate,
        }
        context = (
            "以下是教师所选班级的实时聚合学情。生成内容必须据此调整难度、前置知识、教学活动、分层任务和评价方式；"
            "不得展示学生姓名、账号或任何个人身份信息。\n"
            f"{snapshot}"
        )
        return context, snapshot
    TRAINING_SKILL_PATTERNS = [
        {
            "name": "大模型应用与智能体协同",
            "category": "智能教育能力",
            "level": "高阶",
            "description": "能够围绕教育场景设计大模型提示、智能体协作流程与生成结果校验机制。",
            "courses": ["大模型应用开发", "教育智能体设计", "提示工程与生成式 AI"],
            "terms": ["大模型", "llm", "ai", "智能体", "agent", "生成式", "prompt", "提示词"],
        },
        {
            "name": "知识库检索增强应用",
            "category": "知识工程能力",
            "level": "高阶",
            "description": "能够建设课程知识库，完成文档切分、向量检索、引用追踪和 RAG 回答增强。",
            "courses": ["知识工程", "向量数据库与检索", "RAG 教育应用"],
            "terms": ["rag", "知识库", "检索", "chroma", "向量", "embedding", "文档", "引用"],
        },
        {
            "name": "后端接口与服务架构设计",
            "category": "工程实现能力",
            "level": "进阶",
            "description": "能够使用现代 Web 框架设计权限清晰、契约稳定、可测试的后端服务接口。",
            "courses": ["FastAPI 后端开发", "Web 服务架构", "API 契约设计"],
            "terms": ["fastapi", "api", "接口", "后端", "服务", "rbac", "认证", "权限"],
        },
        {
            "name": "数据库建模与迁移管理",
            "category": "数据治理能力",
            "level": "进阶",
            "description": "能够完成领域模型抽象、关系数据库设计、迁移管理和数据一致性维护。",
            "courses": ["数据库系统", "SQLAlchemy 应用", "PostgreSQL 与 Alembic"],
            "terms": ["postgres", "postgresql", "sqlalchemy", "alembic", "数据库", "模型", "迁移", "sql"],
        },
        {
            "name": "异步任务与系统调度",
            "category": "平台运维能力",
            "level": "进阶",
            "description": "能够将耗时生成、文档入库和批处理流程封装为可追踪的异步任务。",
            "courses": ["Redis 与 Celery", "异步任务调度", "分布式系统基础"],
            "terms": ["celery", "redis", "异步", "任务", "队列", "worker", "调度"],
        },
        {
            "name": "前端工程化与交互实现",
            "category": "产品实现能力",
            "level": "进阶",
            "description": "能够基于组件化框架构建角色化页面、表单联调、状态反馈和可视化交互。",
            "courses": ["Vue3 前端工程化", "TypeScript 应用", "交互设计与前后端联调"],
            "terms": ["vue", "vite", "typescript", "前端", "页面", "交互", "组件", "ui"],
        },
        {
            "name": "学习数据分析与评价",
            "category": "教育评价能力",
            "level": "高阶",
            "description": "能够基于学生画像、测试结果和学习过程数据构建个性化评估闭环。",
            "courses": ["学习分析", "教育测量与评价", "个性化学习系统"],
            "terms": ["画像", "评估", "评价", "测试", "学习路径", "个性化", "学生", "资源"],
        },
        {
            "name": "Python 编程与数据处理",
            "category": "专业基础能力",
            "level": "基础",
            "description": "能够使用 Python 完成程序设计、数据处理、自动化脚本和基础算法实现。",
            "courses": ["Python 程序设计", "数据结构与算法", "数据处理基础"],
            "terms": ["python", "编程", "算法", "数据结构", "pandas", "matplotlib", "机器学习"],
        },
    ]

    def extract_training_plan_skills(
        self,
        db: Session,
        current_user: User,
        payload: TrainingPlanExtractSkillsRequest,
    ) -> TrainingPlanExtractSkillsResponse:
        file_ids = self._unique_ints([*(payload.file_ids or []), *([payload.uploaded_file_id] if payload.uploaded_file_id else [])])
        reference_payload = payload.model_copy(update={"file_ids": file_ids})
        reference_context = self.build_reference_context(
            db,
            current_user=current_user,
            prompt_key="training_plan",
            payload=reference_payload,
        )
        class_profile_context, _class_profile_snapshot = self.build_class_profile_context(
            db,
            current_user=current_user,
            payload=reference_payload,
        )
        source_text = "\n".join(
            item.strip()
            for item in [
                payload.focus_prompt or "",
                payload.additional_requirements or "",
                payload.raw_text or "",
                payload.reference_text or "",
                reference_context.text,
                class_profile_context if payload.course_id is not None else "",
            ]
            if item and item.strip()
        )
        if not source_text:
            raise BadRequestException("请先输入关注点或上传参考材料。")

        skills = self._derive_training_plan_skills(source_text)
        objectives = self._build_training_objectives(source_text, skills)
        graduation_requirements = self._build_graduation_requirements(skills)
        core_courses = self._dedupe_text([course for skill in skills for course in skill.related_courses])[:12]
        industry_requirements = self._build_industry_requirements(source_text, skills)
        summary = self._build_training_skill_summary(source_text, skills)
        analysis_text = "\n".join(
            [
                summary,
                "核心技能：" + "、".join(skill.name for skill in skills),
                "培养目标：" + "；".join(objectives),
                "毕业要求：" + "；".join(graduation_requirements),
                "核心课程：" + "、".join(core_courses),
                industry_requirements,
            ]
        )
        quality_analysis = quality_analysis_service.analyze_generated_content(
            content=analysis_text,
            request_payload=payload.model_dump(mode="json"),
            expected_keywords=[skill.name for skill in skills],
            references=[reference.__dict__ for reference in reference_context.references],
            warnings=reference_context.warnings,
            context_label="培养方案核心技能提取",
        )

        return TrainingPlanExtractSkillsResponse(
            skills=skills,
            summary=summary,
            suggested_objectives=objectives,
            suggested_graduation_requirements=graduation_requirements,
            suggested_core_courses=core_courses,
            industry_requirements=industry_requirements,
            warnings=reference_context.warnings,
            references=[
                {
                    "source_type": reference.source_type,
                    "file_id": reference.file_id,
                    "document_id": reference.document_id,
                    "chunk_index": reference.chunk_index,
                    "source_filename": reference.source_filename,
                    "excerpt": reference.excerpt,
                }
                for reference in reference_context.references
            ],
            quality_analysis=quality_analysis,
        )

    def generate_training_plan(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="training_plan",
            artifact_type=ArtifactType.training_plan,
            title=f"{payload.major_name}专业人才培养方案",
            payload=payload,
            fallback=self._training_plan_fallback(payload),
        )

    def generate_course_design(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="course_design",
            artifact_type=ArtifactType.course_design,
            title=f"{payload.course_name}课程教学设计",
            payload=payload,
            fallback=self._course_design_fallback(payload),
        )

    def generate_teaching_design(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="teaching_design",
            artifact_type=ArtifactType.teaching_design,
            title=f"{payload.lesson_topic}教学活动设计",
            payload=payload,
            fallback=self._teaching_design_fallback(payload),
        )

    def generate_exercises(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="exercise",
            artifact_type=ArtifactType.exercise,
            title=f"{payload.course_name}课程习题",
            payload=payload,
            fallback=self._exercise_fallback(payload),
        )

    def generate_paper(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="paper",
            artifact_type=ArtifactType.paper,
            title=f"{payload.course_name}课程试卷",
            payload=payload,
            fallback=self._paper_fallback(payload),
        )

    def generate_project_practice(self, db: Session, current_user: User, payload: BaseModel) -> GenerationResult:
        return self._generate(
            db,
            current_user=current_user,
            prompt_key="project_practice",
            artifact_type=ArtifactType.project_practice,
            title=f"{payload.project_topic}项目实践方案",
            payload=payload,
            fallback=self._project_fallback(payload),
        )

    def generate_teacher_artifact_for_task(
        self,
        db: Session,
        *,
        owner_id: int,
        task_type: str,
        payload_data: dict[str, Any],
    ) -> GenerationResult:
        user = db.get(User, owner_id)
        if user is None:
            raise NotFoundException("Task owner not found")
        if task_type == "teacher_training_plan":
            return self.generate_training_plan(db, user, TrainingPlanGenerateRequest(**payload_data))
        if task_type == "teacher_course_design":
            return self.generate_course_design(db, user, CourseDesignGenerateRequest(**payload_data))
        if task_type == "teacher_teaching_design":
            return self.generate_teaching_design(db, user, TeachingDesignGenerateRequest(**payload_data))
        if task_type == "teacher_exercise":
            return self.generate_exercises(db, user, ExerciseGenerateRequest(**payload_data))
        if task_type == "teacher_paper":
            return self.generate_paper(db, user, PaperGenerateRequest(**payload_data))
        if task_type == "teacher_project":
            return self.generate_project_practice(db, user, ProjectPracticeGenerateRequest(**payload_data))
        raise BadRequestException(f"Unsupported teacher generation task type: {task_type}")

    async def stream_teacher_artifact_for_task(
        self,
        db: Session,
        *,
        owner_id: int,
        task_type: str,
        payload_data: dict[str, Any],
        emitter: Any,
    ) -> GenerationResult:
        user = db.get(User, owner_id)
        if user is None:
            raise NotFoundException("Task owner not found")
        configurations: dict[str, tuple[type[BaseModel], str, ArtifactType]] = {
            "teacher_training_plan": (TrainingPlanGenerateRequest, "training_plan", ArtifactType.training_plan),
            "teacher_course_design": (CourseDesignGenerateRequest, "course_design", ArtifactType.course_design),
            "teacher_teaching_design": (TeachingDesignGenerateRequest, "teaching_design", ArtifactType.teaching_design),
            "teacher_exercise": (ExerciseGenerateRequest, "exercise", ArtifactType.exercise),
            "teacher_paper": (PaperGenerateRequest, "paper", ArtifactType.paper),
            "teacher_project": (ProjectPracticeGenerateRequest, "project_practice", ArtifactType.project_practice),
        }
        configuration = configurations.get(task_type)
        if configuration is None:
            raise BadRequestException(f"Unsupported teacher generation task type: {task_type}")
        schema, prompt_key, artifact_type = configuration
        payload = schema(**payload_data)
        title_value = (
            getattr(payload, "major_name", None) or getattr(payload, "course_name", None)
            or getattr(payload, "lesson_topic", None) or getattr(payload, "project_topic", None)
            or "教师生成资源"
        )
        emitter.stage("parsing_references")
        await self.wait_for_reference_files(
            db,
            current_user=user,
            file_ids=self._unique_ints(getattr(payload, "file_ids", None)),
            emitter=emitter,
        )
        reference_context = self.build_reference_context(db, current_user=user, prompt_key=prompt_key, payload=payload)
        for reference in reference_context.references:
            emitter.reference(reference.__dict__)
        for warning in reference_context.warnings:
            emitter.warning(warning)
        emitter.stage("retrieving")
        request_payload = payload.model_dump(mode="json")
        class_profile_context, class_profile_snapshot = self.build_class_profile_context(
            db,
            current_user=user,
            payload=payload,
        )
        request_payload["class_profile_snapshot"] = class_profile_snapshot
        prompt_payload = {key: value for key, value in request_payload.items() if key not in REFERENCE_FIELD_NAMES}
        prompt_payload["reference_context"] = reference_context.text
        prompt_payload["class_profile_context"] = class_profile_context
        prompt_payload = question_generation_service.apply_teacher_spec(
            prompt_key=prompt_key, payload=prompt_payload, evidence_text=reference_context.text,
        )
        emitter.stage("building_prompt")
        prompt = render_prompt(prompt_key, prompt_payload)
        emitter.stage("generating")
        content = ""
        role = self._agent_role(prompt_key)
        model_name = router.for_role(role).model_id
        async for chunk in router.stream_chat(
            role=role,
            messages=[ChatMessage(role="system", content=TEACHER_GENERATION_SYSTEM_PROMPT), ChatMessage(role="user", content=prompt)],
            temperature=0.3,
            max_tokens=self._generation_max_tokens(prompt_key, payload),
        ):
            if chunk.type == StreamChunkType.delta and chunk.delta:
                content += chunk.delta
                emitter.delta(chunk.delta)
            elif chunk.type == StreamChunkType.error:
                raise RuntimeError(chunk.error or "LLM stream failed")

        paper_issues = self._paper_validation_issues(prompt_key, payload, content)
        if paper_issues:
            repair_prompt = question_generation_service.build_paper_repair_prompt(prompt, paper_issues)
            emitter.replace_content(
                "",
                message=f"检测到题量不完整（{'；'.join(paper_issues)}），正在重新生成完整试卷",
            )
            content = ""
            async for chunk in router.stream_chat(
                role=role,
                messages=[
                    ChatMessage(role="system", content=TEACHER_GENERATION_SYSTEM_PROMPT),
                    ChatMessage(role="user", content=repair_prompt),
                ],
                temperature=0.2,
                max_tokens=self._generation_max_tokens(prompt_key, payload),
            ):
                if chunk.type == StreamChunkType.delta and chunk.delta:
                    content += chunk.delta
                    emitter.delta(chunk.delta)
                elif chunk.type == StreamChunkType.error:
                    raise RuntimeError(chunk.error or "LLM repair stream failed")
            remaining_issues = self._paper_validation_issues(prompt_key, payload, content)
            if remaining_issues:
                raise RuntimeError(f"试卷题量验收失败：{'；'.join(remaining_issues)}。请缩小单次题量后重试。")

        emitter.stage("quality_analysis")
        quality_analysis = quality_analysis_service.analyze_generated_content(
            content=content, request_payload=request_payload,
            difficulty=str(request_payload.get("difficulty") or request_payload.get("difficulty_ratio") or ""),
            references=[reference.__dict__ for reference in reference_context.references],
            warnings=reference_context.warnings, context_label=str(title_value),
        )
        emitter.stage("persisting")
        artifact = artifact_repository.create_artifact(
            db, owner_id=user.id, artifact_type=artifact_type, title=str(title_value), content=content,
            content_format="markdown", request_payload=request_payload, status=ArtifactStatus.completed,
            model_name=model_name, token_usage=None, quality_analysis=quality_analysis.model_dump(mode="json"),
        )
        return GenerationResult(
            artifact=artifact, references=reference_context.references,
            warnings=reference_context.warnings, quality_analysis=quality_analysis,
        )

    async def wait_for_reference_files(
        self,
        db: Session,
        *,
        current_user: User,
        file_ids: list[int],
        emitter: Any,
    ) -> None:
        if not file_ids:
            return
        settings = get_settings()
        deadline = time.monotonic() + settings.generation_reference_wait_seconds
        while True:
            waiting: list[str] = []
            for file_id in file_ids:
                asset, accessible = file_repository.get_accessible_file(db, file_id=file_id, current_user=current_user)
                if asset is None:
                    raise NotFoundException(f"File {file_id} not found")
                if not accessible:
                    raise ForbiddenException(f"No permission to use file {file_id}")
                db.refresh(asset)
                if asset.parse_status == FileParseStatus.failed:
                    raise BadRequestException(f"文件“{asset.original_filename}”解析失败：{asset.parse_error or '未知错误'}")
                if asset.parse_status in {FileParseStatus.pending, FileParseStatus.parsing}:
                    waiting.append(asset.original_filename)
                elif asset.parse_status != FileParseStatus.parsed:
                    raise BadRequestException(f"文件“{asset.original_filename}”当前不可用于生成")
            if not waiting:
                return
            if time.monotonic() >= deadline:
                raise BadRequestException(f"等待文件解析超时：{'、'.join(waiting)}。文件仍保留，可解析完成后重试生成。")
            emitter.stage(
                "parsing_references",
                message=f"正在等待 {len(waiting)} 个参考文件解析完成：{'、'.join(waiting[:3])}",
            )
            await asyncio.sleep(settings.generation_reference_poll_seconds)

    def _generate(
        self,
        db: Session,
        *,
        current_user: User,
        prompt_key: str,
        artifact_type: ArtifactType,
        title: str,
        payload: BaseModel,
        fallback: str,
    ) -> GenerationResult:
        request_payload = payload.model_dump(mode="json")
        class_profile_context, class_profile_snapshot = self.build_class_profile_context(
            db,
            current_user=current_user,
            payload=payload,
        )
        request_payload["class_profile_snapshot"] = class_profile_snapshot
        reference_context = self.build_reference_context(
            db,
            current_user=current_user,
            prompt_key=prompt_key,
            payload=payload,
        )
        prompt_payload = {
            key: value
            for key, value in request_payload.items()
            if key not in REFERENCE_FIELD_NAMES
        }
        prompt_payload["reference_context"] = reference_context.text
        prompt_payload["class_profile_context"] = class_profile_context
        prompt_payload = question_generation_service.apply_teacher_spec(
            prompt_key=prompt_key, payload=prompt_payload, evidence_text=reference_context.text,
        )
        prompt = render_prompt(prompt_key, prompt_payload)
        result = BaseAgent._sync(router.chat(
            role=self._agent_role(prompt_key),
            messages=[ChatMessage(role="system", content=TEACHER_GENERATION_SYSTEM_PROMPT), ChatMessage(role="user", content=prompt)],
            temperature=0.3,
            max_tokens=self._generation_max_tokens(prompt_key, payload),
        ))
        paper_issues = self._paper_validation_issues(prompt_key, payload, result.content)
        if paper_issues:
            repair_prompt = question_generation_service.build_paper_repair_prompt(prompt, paper_issues)
            result = BaseAgent._sync(router.chat(
                role=self._agent_role(prompt_key),
                messages=[
                    ChatMessage(role="system", content=TEACHER_GENERATION_SYSTEM_PROMPT),
                    ChatMessage(role="user", content=repair_prompt),
                ],
                temperature=0.2,
                max_tokens=self._generation_max_tokens(prompt_key, payload),
            ))
            remaining_issues = self._paper_validation_issues(prompt_key, payload, result.content)
            if remaining_issues:
                raise BadRequestException(
                    f"试卷题量验收失败：{'；'.join(remaining_issues)}。请缩小单次题量后重试。"
                )

        persisted_payload = {
            key: value
            for key, value in request_payload.items()
            if key not in {"reference_context"}
        }
        persisted_payload["reference_summary"] = reference_context.summary
        persisted_payload["warnings"] = reference_context.warnings

        artifact = artifact_repository.create_artifact(
            db,
            owner_id=current_user.id,
            artifact_type=artifact_type,
            title=title,
            content=result.content,
            content_format="markdown",
            request_payload=persisted_payload,
            status=ArtifactStatus.completed,
            model_name=result.model,
            token_usage=result.usage.model_dump(mode="json") if result.usage else None,
        )
        quality_analysis = quality_analysis_service.analyze_generated_content(
            content=result.content,
            request_payload=request_payload,
            difficulty=str(request_payload.get("difficulty") or request_payload.get("difficulty_ratio") or ""),
            references=[reference.__dict__ for reference in reference_context.references],
            warnings=reference_context.warnings,
            context_label=title,
        )
        artifact_repository.save_quality_analysis(db, artifact, quality_analysis)
        return GenerationResult(
            artifact=artifact,
            references=reference_context.references,
            warnings=reference_context.warnings,
            quality_analysis=quality_analysis,
        )

    def _generation_max_tokens(self, prompt_key: str, payload: BaseModel) -> int | None:
        if prompt_key != "paper":
            return None
        specs = question_generation_service.parse_paper_distribution(
            str(getattr(payload, "question_distribution", "") or "")
        )
        total_questions = sum(int(item["count"]) for item in specs)
        return min(16_000, max(8_000, total_questions * 320))

    def _paper_validation_issues(self, prompt_key: str, payload: BaseModel, content: str) -> list[str]:
        if prompt_key != "paper" or get_settings().app_env == "test":
            return []
        return question_generation_service.validate_paper_content(
            content,
            str(getattr(payload, "question_distribution", "") or ""),
        )

    def build_reference_context(
        self,
        db: Session,
        *,
        current_user: User,
        prompt_key: str,
        payload: BaseModel,
    ) -> ReferenceContext:
        shared = reference_context_service.build(
            db, current_user=current_user,
            file_ids=self._unique_ints(getattr(payload, "file_ids", None)),
            knowledge_document_ids=self._unique_ints(getattr(payload, "knowledge_document_ids", None)),
            use_knowledge_base=bool(getattr(payload, "use_knowledge_base", False)),
            top_k=int(getattr(payload, "top_k", 5) or 5),
            course_id=getattr(payload, "course_id", None),
            query=getattr(payload, "retrieval_query", None) or self.build_retrieval_query(prompt_key, payload),
        )
        return ReferenceContext(
            text=shared.text,
            references=[ReferenceItem(
                source_type=item.get("source_type", "file"), file_id=item.get("file_id"),
                document_id=item.get("knowledge_document_id"), source_filename=item.get("source_filename"),
                excerpt=item.get("excerpt"), chunk_id=str(item.get("chunk_id")) if item.get("chunk_id") is not None else None,
                source_hash=item.get("source_hash"), source_version=item.get("source_version"),
                retrieval_similarity=item.get("similarity"),
            ) for item in shared.references],
            warnings=shared.warnings, summary=shared.evidence_snapshot,
        )
        file_ids = self._unique_ints(getattr(payload, "file_ids", None))
        document_ids = self._unique_ints(getattr(payload, "knowledge_document_ids", None))
        use_knowledge_base = bool(getattr(payload, "use_knowledge_base", False))
        top_k = int(getattr(payload, "top_k", 5) or 5)
        effective_retrieval_query = None
        if use_knowledge_base or document_ids:
            effective_retrieval_query = getattr(payload, "retrieval_query", None) or self.build_retrieval_query(
                prompt_key,
                payload,
            )

        sections: list[str] = []
        references: list[ReferenceItem] = []
        warnings: list[str] = []

        file_context, file_references, file_warnings = self.load_reference_files(
            db,
            current_user=current_user,
            file_ids=file_ids,
        )
        if file_context:
            sections.append("### Uploaded reference files\n" + file_context)
        references.extend(file_references)
        warnings.extend(file_warnings)

        if use_knowledge_base or document_ids:
            knowledge_context, knowledge_references, knowledge_warnings = self.retrieve_knowledge_context(
                db,
                current_user=current_user,
                prompt_key=prompt_key,
                payload=payload,
                document_ids=document_ids,
                top_k=top_k,
            )
            if knowledge_context:
                sections.append("### Knowledge base retrieval\n" + knowledge_context)
            references.extend(knowledge_references)
            warnings.extend(knowledge_warnings)

        if (file_ids or document_ids or use_knowledge_base) and not sections:
            warnings.append("Reference options were provided, but no usable reference content was found.")

        summary = {
            "file_ids": file_ids,
            "knowledge_document_ids": document_ids,
            "use_knowledge_base": use_knowledge_base,
            "retrieval_query": effective_retrieval_query,
            "top_k": top_k,
            "reference_count": len(references),
            "warning_count": len(warnings),
        }
        return ReferenceContext(
            text="\n\n".join(sections).strip(),
            references=references,
            warnings=warnings,
            summary=summary,
        )

    def load_reference_files(
        self,
        db: Session,
        *,
        current_user: User,
        file_ids: list[int],
        per_file_limit: int = 3000,
        total_limit: int = 8000,
    ) -> tuple[str, list[ReferenceItem], list[str]]:
        if not file_ids:
            return "", [], []

        remaining = total_limit
        sections: list[str] = []
        references: list[ReferenceItem] = []
        warnings: list[str] = []

        for file_id in file_ids:
            file_asset, accessible = file_repository.get_accessible_file(
                db,
                file_id=file_id,
                current_user=current_user,
            )
            if file_asset is None:
                raise NotFoundException(f"Reference file {file_id} not found")
            if not accessible:
                raise ForbiddenException(f"No permission to use reference file {file_id}")

            try:
                file_path = get_file_path(file_asset.storage_path)
                text = parse_document(file_path, Path(file_asset.original_filename).suffix).strip()
            except DocumentParseError as exc:
                raise BadRequestException(f"Reference file {file_id} cannot be parsed", detail=str(exc)) from exc
            except Exception as exc:
                raise AppException(
                    "Failed to parse reference file",
                    code=50030,
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=str(exc),
                ) from exc

            if not text:
                warnings.append(f"Reference file {file_id} produced empty text.")
                continue

            excerpt_limit = min(per_file_limit, remaining)
            if excerpt_limit <= 0:
                warnings.append("Reference file text exceeded the total prompt context limit and was truncated.")
                break
            excerpt = self._truncate(text, excerpt_limit)
            if len(text) > excerpt_limit:
                warnings.append(f"Reference file {file_id} was truncated to {excerpt_limit} characters.")
            remaining -= len(excerpt)
            label = f"[file {file_id} / {file_asset.original_filename}]"
            sections.append(f"{label}\n{excerpt}")
            references.append(
                ReferenceItem(
                    source_type="file",
                    file_id=file_asset.id,
                    source_filename=file_asset.original_filename,
                    excerpt=excerpt,
                    chunk_id=f"file:{file_asset.id}",
                    source_hash=file_asset.file_hash,
                    source_version=str(file_asset.updated_at),
                )
            )

        return "\n\n".join(sections).strip(), references, warnings

    def retrieve_knowledge_context(
        self,
        db: Session,
        *,
        current_user: User,
        prompt_key: str,
        payload: BaseModel,
        document_ids: list[int],
        top_k: int,
    ) -> tuple[str, list[ReferenceItem], list[str]]:
        retrieval_query = getattr(payload, "retrieval_query", None) or self.build_retrieval_query(prompt_key, payload)
        try:
            pack = KnowledgeService(db).retrieve_for_agent(
                self._agent_role(prompt_key).value, current_user, getattr(payload, "course_id", None),
                retrieval_query, document_ids=document_ids or None, top_k=top_k, policy=GroundingPolicy.STRICT,
            )
        except KnowledgeAccessError as exc:
            raise ForbiddenException(str(exc)) from exc
        if pack.status != EvidenceStatus.sufficient:
            return "", [], [*(pack.warnings or []), pack.insufficient_reason or "Knowledge-base evidence is insufficient"]
        sections = [f"[{chunk.citation_id}]\n{chunk.content}" for chunk in pack.chunks]
        references = [ReferenceItem(
            source_type="knowledge", file_id=chunk.file_id, document_id=chunk.document_id,
            chunk_index=chunk.chunk_index, source_filename=chunk.source_filename,
            excerpt=self._truncate(chunk.content, 1200), chunk_id=chunk.citation_id,
            retrieval_similarity=chunk.similarity,
        ) for chunk in pack.chunks]
        return "\n\n".join(sections), references, list(pack.warnings)

    @staticmethod
    def _agent_role(prompt_key: str) -> AgentRole:
        return AgentRole.TEST if prompt_key in {"exercise", "paper"} else AgentRole.RESOURCE

    def validate_knowledge_documents(
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
            raise ForbiddenException(f"无权使用知识库文档 {forbidden_ids[0]}")

        for document in documents:
            if document.status != KnowledgeDocumentStatus.ingested:
                raise BadRequestException(
                    f"知识库文档 {document.id} 尚未入库，请先执行入库。"
                )
            if current_user.role != UserRole.admin and document.owner_id != current_user.id:
                raise ForbiddenException(f"无权使用知识库文档 {document.id}")
        return documents

    def build_retrieval_query(self, prompt_key: str, payload: BaseModel) -> str:
        if prompt_key == "training_plan":
            return (
                f"{getattr(payload, 'major_name', '')} professional training objectives, graduation requirements, "
                f"curriculum system, industry requirements"
            )
        if prompt_key == "course_design":
            return (
                f"{getattr(payload, 'course_name', '')} course objectives, teaching content, assessment methods, "
                f"key topics"
            )
        if prompt_key == "teaching_design":
            return (
                f"{getattr(payload, 'lesson_topic', '')} teaching objectives, key points, difficult points, classroom activities"
            )
        if prompt_key == "exercise":
            return (
                f"{getattr(payload, 'course_name', '')} exercises "
                f"{self._join(getattr(payload, 'knowledge_points', None))} "
                f"{getattr(payload, 'difficulty', '')} {self._join(getattr(payload, 'question_types', None))}"
            )
        if prompt_key == "paper":
            return (
                f"{getattr(payload, 'course_name', '')} exam scope, question distribution, scoring standard, "
                f"{getattr(payload, 'exam_scope', '')}"
            )
        if prompt_key == "project_practice":
            return (
                f"{getattr(payload, 'project_topic', '')} project practice skills deliverables evaluation criteria "
                f"{self._join(getattr(payload, 'expected_skills', None))}"
            )
        return str(payload.model_dump(mode="json"))

    def _append_retrieval_results(
        self,
        results: list[dict[str, Any]],
        *,
        sections: list[str],
        references: list[ReferenceItem],
        warnings: list[str],
        fallback_document_id: int | None,
    ) -> None:
        if not results:
            if fallback_document_id is not None:
                warnings.append(f"知识库文档 {fallback_document_id} 暂未检索到匹配片段。")
            return
        for result in results:
            metadata = result.get("metadata") or {}
            content = str(result.get("content") or "").strip()
            if not content:
                continue
            document_id = self._metadata_int(metadata.get("document_id"), fallback_document_id)
            chunk_index = self._metadata_int(metadata.get("chunk_index"), None)
            file_id = self._metadata_int(metadata.get("file_id"), None)
            source_filename = metadata.get("source_filename")
            label = f"[document {document_id or '-'} / chunk {chunk_index if chunk_index is not None else '-'}]"
            if source_filename:
                label = f"[{source_filename} / chunk {chunk_index if chunk_index is not None else '-'}]"
            excerpt = self._truncate(content, 1200)
            sections.append(f"{label}\n{excerpt}")
            references.append(
                ReferenceItem(
                    source_type="knowledge_chunk",
                    file_id=file_id,
                    document_id=document_id,
                    chunk_index=chunk_index,
                    source_filename=source_filename,
                    excerpt=excerpt,
                    chunk_id=str(metadata.get("chunk_id") or metadata.get("chroma_id") or f"document:{document_id or '-'}:chunk:{chunk_index if chunk_index is not None else '-'}"),
                    source_hash=metadata.get("source_hash") or metadata.get("file_hash"),
                    source_version=str(metadata.get("source_version")) if metadata.get("source_version") is not None else None,
                    retrieval_similarity=max(0.0, min(1.0, 1.0 - float(result["score"]))) if result.get("score") is not None else None,
                )
            )

    def _unique_ints(self, values: list[int] | None) -> list[int]:
        if not values:
            return []
        return list(dict.fromkeys(int(value) for value in values))

    def _truncate(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 20)].rstrip() + "\n...[truncated]"

    def _metadata_int(self, value: Any, default: int | None) -> int | None:
        if value in (None, ""):
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _derive_training_plan_skills(self, source_text: str) -> list[TrainingPlanSkill]:
        normalized = source_text.lower()
        scored: list[tuple[int, dict[str, Any]]] = []
        for pattern in self.TRAINING_SKILL_PATTERNS:
            hits = sum(1 for term in pattern["terms"] if term.lower() in normalized)
            if hits:
                scored.append((hits, pattern))

        scored.sort(key=lambda item: (-item[0], item[1]["name"]))
        selected = [pattern for _, pattern in scored[:8]]
        if len(selected) < 6:
            selected_names = {pattern["name"] for pattern in selected}
            for pattern in self.TRAINING_SKILL_PATTERNS:
                if pattern["name"] not in selected_names:
                    selected.append(pattern)
                    selected_names.add(pattern["name"])
                if len(selected) >= 6:
                    break

        topic = self._topic_label(source_text)
        skills: list[TrainingPlanSkill] = []
        for index, pattern in enumerate(selected[:8]):
            description = pattern["description"]
            if not any(term.lower() in normalized for term in pattern["terms"]):
                description = f"围绕“{topic}”培养{pattern['description']}"
            skills.append(
                TrainingPlanSkill(
                    name=pattern["name"],
                    category=pattern["category"],
                    level=pattern["level"],
                    description=description,
                    related_courses=pattern["courses"],
                    weight=f"{max(64, 96 - index * 4)}%",
                )
            )
        return skills

    def _build_training_objectives(self, source_text: str, skills: list[TrainingPlanSkill]) -> list[str]:
        topic = self._topic_label(source_text)
        first_skills = "、".join(skill.name for skill in skills[:3])
        return [
            f"面向{topic}相关岗位与学习场景，培养具备{first_skills}的复合型应用人才。",
            "强化真实项目驱动、知识库检索增强、生成式 AI 工具使用与学习效果评估能力。",
            "形成能够持续迭代课程资源、分析学习数据并完成工程化交付的综合实践能力。",
        ]

    def _build_graduation_requirements(self, skills: list[TrainingPlanSkill]) -> list[str]:
        return [
            f"能够掌握{skill.name}，并在课程项目或综合实践中完成可验证成果。"
            for skill in skills[:6]
        ]

    def _build_industry_requirements(self, source_text: str, skills: list[TrainingPlanSkill]) -> str:
        topic = self._topic_label(source_text)
        skill_names = "、".join(skill.name for skill in skills[:5])
        return (
            f"行业侧需要学生能够围绕{topic}完成需求分析、系统设计、AI 工具协同、数据治理和结果评估，"
            f"重点支撑{skill_names}等能力在真实教育科技项目中的落地。"
        )

    def _build_training_skill_summary(self, source_text: str, skills: list[TrainingPlanSkill]) -> str:
        topic = self._topic_label(source_text)
        skill_names = "、".join(skill.name for skill in skills[:5])
        return f"已根据输入材料识别出“{topic}”方向的核心能力群，优先建议围绕{skill_names}组织培养目标、课程模块与实践评价。"

    def _topic_label(self, text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text.strip())
        tokens = [
            token.strip(" ，。；;、,.!?！？（）()[]【】")
            for token in re.split(r"[\n\r,，。；;、]+", cleaned)
            if token.strip()
        ]
        for token in tokens:
            if 2 <= len(token) <= 36:
                return token
        return "智能教育与个性化学习"

    def _dedupe_text(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            text = str(value).strip()
            key = text.lower()
            if not text or key in seen:
                continue
            seen.add(key)
            result.append(text)
        return result

    def _training_plan_fallback(self, payload: BaseModel) -> str:
        courses = self._join(payload.core_courses)
        return f"""# {payload.major_name}专业人才培养方案

## 一、专业定位
{payload.program_name}面向{payload.education_level}人才培养需求，聚焦{payload.major_name}专业核心能力建设，服务区域产业升级与数字化转型。

## 二、培养目标
{payload.training_objectives}

## 三、毕业要求
{payload.graduation_requirements or "毕业生应具备扎实理论基础、工程实践能力、沟通协作能力、持续学习能力和职业伦理意识。"}

## 四、课程体系设计
核心课程建议包括：{courses or "专业导论、核心基础课程、专业方向课程、综合实践课程"}。课程体系应按照“基础能力、专业能力、综合实践、创新拓展”递进组织。

## 五、实践教学体系
构建课程实验、综合实训、企业项目、毕业设计四层实践体系，强化真实任务驱动和成果导向评价。

## 六、能力达成关系
将课程目标、毕业要求和实践任务建立矩阵映射，确保每项能力均有课程支撑、实践验证和评价证据。

## 七、实施建议
{payload.additional_requirements or "建议建立年度培养方案评审机制，引入行业专家和毕业生反馈，持续优化课程结构。"}
"""

    def _course_design_fallback(self, payload: BaseModel) -> str:
        return f"""# {payload.course_name}课程教学设计

## 一、课程基本信息
- 课程名称：{payload.course_name}
- 面向学生：{payload.target_students}
- 总学时：{payload.total_hours}

## 二、课程目标
{payload.course_objectives}

## 三、教学内容与学时安排
围绕{self._join(payload.key_topics) or "课程核心主题"}组织模块化教学，建议采用理论讲授、案例分析、课堂练习和综合任务相结合的方式分配学时。

## 四、教学方法
建议采用问题导向、案例驱动、小组研讨、项目实践和形成性评价结合的教学策略。

## 五、考核方式
建议平时表现、阶段作业、实验/项目成果和期末考核综合评价，突出过程性证据。

## 六、课程资源建议
{payload.references or "建议建设课程讲义、案例库、习题库、实验指导书和拓展阅读清单。"}
"""

    def _teaching_design_fallback(self, payload: BaseModel) -> str:
        return f"""# {payload.lesson_topic}教学活动设计

## 一、教学主题
本次教学围绕“{payload.lesson_topic}”展开，属于{payload.course_name}课程的重要教学单元。

## 二、学情分析
教学对象为{payload.target_students}，需要结合学生已有知识基础和实践经验设计分层任务。

## 三、教学目标
{payload.teaching_objectives}

## 四、重点与难点
- 教学重点：{payload.key_points or "核心概念理解、方法步骤掌握和实际应用迁移。"}
- 教学难点：{payload.difficult_points or "抽象概念到真实问题的转化，以及综合分析能力形成。"}

## 五、教学流程
1. 情境导入：提出真实问题，引出学习任务。
2. 知识讲授：讲解核心概念、方法流程和典型案例。
3. 课堂活动：组织讨论、演练或小组任务。
4. 巩固练习：完成即时测验或案例分析。
5. 总结提升：归纳知识框架并布置拓展任务。

## 六、课堂活动设计
采用{self._join(payload.teaching_methods) or "讲授、讨论、案例分析、任务驱动"}等方式组织学习活动。

## 七、评价方式
结合课堂表现、任务完成质量、提问互动和课后作业进行形成性评价。
"""

    def _exercise_fallback(self, payload: BaseModel) -> str:
        return f"""# {payload.course_name}课程习题

## 一、知识点范围
本组习题覆盖：{self._join(payload.knowledge_points)}。整体难度：{payload.difficulty}。

## 二、选择题
1. 下列关于{payload.knowledge_points[0]}的说法，哪一项最准确？
   - A. 只需要记忆定义
   - B. 需要结合场景理解概念边界
   - C. 与课程其他内容没有关系
   - D. 不能通过练习提升

## 三、填空题
1. 在分析{payload.knowledge_points[0]}相关问题时，应首先明确问题背景、输入条件和______。

## 四、简答题
1. 请结合课程案例说明{payload.knowledge_points[0]}的核心思想和适用场景。

## 五、应用题/编程题
1. 设计一个小型任务，要求学生使用本节知识解决真实或仿真的课程问题，并说明实现步骤。

## 六、参考答案与解析
- 选择题：B。解析：知识点理解应关注概念边界、适用条件和迁移应用。
- 填空题：评价目标。解析：明确评价目标有助于判断方法是否有效。
- 简答题和应用题应重点考查学生是否能将知识应用到具体问题中。
"""

    def _paper_fallback(self, payload: BaseModel) -> str:
        return f"""# {payload.course_name}课程试卷

## 一、试卷说明
- 考试范围：{payload.exam_scope}
- 总分：{payload.total_score}
- 考试时长：{payload.duration_minutes}分钟
- 难度比例：{payload.difficulty_ratio}

## 二、题型分布
{payload.question_distribution}

## 三、试题正文
### 选择题
1. 请根据课程核心概念选择最符合题意的一项。

### 简答题
1. 结合课程知识说明关键概念、方法步骤和应用条件。

### 综合题
1. 阅读给定教学或工程情境，完成问题分析、方案设计和结果评价。

## 四、参考答案
参考答案应覆盖关键术语、推理过程、计算步骤或设计依据。

## 五、评分标准
按照概念准确性、分析完整性、方法合理性、表达规范性和创新性进行分项评分。
"""

    def _project_fallback(self, payload: BaseModel) -> str:
        return f"""# {payload.project_topic}项目实践方案

## 一、项目背景
本项目面向{payload.target_students}，结合{payload.course_name}课程内容设计真实任务场景，促进知识综合应用。

## 二、项目目标
通过项目实践培养学生的{self._join(payload.expected_skills)}等能力。

## 三、项目任务
围绕“{payload.project_topic}”完成需求分析、方案设计、实施验证、成果展示和反思改进。

## 四、团队分工
团队规模建议：{payload.team_size or "3-5人"}。可设置项目负责人、资料分析、方案设计、实现验证和汇报展示等角色。

## 五、实施步骤
1. 明确问题背景和项目目标。
2. 分解任务并制定进度计划。
3. 完成核心方案设计与实施。
4. 进行测试、评价和迭代优化。
5. 汇报成果并完成复盘。

## 六、成果提交要求
需提交：{self._join(payload.deliverables) or "项目报告、演示材料、过程记录和成果附件"}。

## 七、评价标准
{payload.evaluation_criteria or "从目标达成、过程规范、成果质量、团队协作和创新拓展五个维度进行评价。"}

## 八、拓展方向
可进一步引入企业真实案例、竞赛任务或跨课程综合实践，形成持续迭代的项目库。
"""

    def _join(self, values: list[Any] | None) -> str:
        if not values:
            return ""
        return "、".join(str(value) for value in values)


teacher_generation_service = TeacherGenerationService()
