from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.profile import ProfileConversation, StudentProfile
from app.repositories.profile_repository import profile_repository
from app.services.agents.profile_agent import SCORE_KEYS, profile_agent

ONBOARDING_STEPS = ["identity", "knowledge", "practice", "innovation", "exam", "efficiency", "quality"]
DIMENSION_BY_STEP = {
    "knowledge": "knowledge_score", "practice": "practice_score", "innovation": "innovation_score",
    "exam": "exam_score", "efficiency": "efficiency_score", "quality": "quality_score",
}
QUESTIONS = {
    "knowledge": "请介绍你的知识基础、已经掌握的内容和目前的薄弱点。",
    "practice": "你做过哪些编程、实验、课程项目或其他实践？遇到过什么困难？",
    "innovation": "遇到陌生问题时，你通常怎样探索、验证并找到解决方案？",
    "exam": "你平时如何刷题和准备考试？常见失分点是什么？",
    "efficiency": "你每天能投入多少时间？主要分心或拖延因素是什么？怎样识别重点？",
    "quality": "你通常怎样复习、记笔记、总结、讲解和巩固所学内容？",
}


class ProfileUpdateService:
    def onboarding_state(self, db: Session, *, user_id: int) -> tuple[StudentProfile, ProfileConversation]:
        profile = profile_repository.get_or_create_profile(db, user_id)
        conversation = profile_repository.get_active_conversation(db, user_id)
        if conversation is not None and profile.is_complete and conversation.current_step in {"summary", "completed"}:
            conversation.status = "completed"
            profile_repository.save_conversation(db, conversation)
            conversation = None
        if conversation is None:
            mode = "continuous" if profile.is_complete else "onboarding"
            step = "continuous" if profile.is_complete else self._first_step(profile)
            conversation = profile_repository.create_conversation(db, user_id=user_id, profile_id=profile.id, mode=mode, step=step)
            question = self.question_for(profile, step)
            profile_repository.create_message(
                db, conversation_id=conversation.id, role="assistant", step=step, content=question,
                question=question, answer=None, extracted_fields={}, dimension_updates={},
                profile_before=self.snapshot(profile), profile_after=self.snapshot(profile), idempotency_key=None,
            )
        return profile, conversation

    def answer(
        self, db: Session, *, user_id: int, conversation_id: int, answer: str,
        idempotency_key: str, continuous_reply_override: str | None = None,
    ) -> dict[str, Any]:
        existing = profile_repository.get_message_by_key(db, conversation_id, idempotency_key)
        if existing is not None:
            conversation = profile_repository.get_conversation(db, existing.conversation_id, user_id)
            if conversation is None:
                raise ValueError("Conversation does not belong to the current user")
            profile = profile_repository.get_by_user_id(db, user_id)
            return self._result(db, profile, conversation, existing, duplicate=True)
        conversation = profile_repository.get_conversation(db, conversation_id, user_id)
        if conversation is None:
            raise ValueError("Profile conversation not found")
        profile = profile_repository.get_by_user_id(db, user_id)
        if profile is None:
            raise ValueError("Student profile not found")
        step = conversation.current_step
        if step in {"summary", "completed"} and profile.is_complete:
            conversation.status = "completed"
            profile_repository.save_conversation(db, conversation)
            profile, conversation = self.onboarding_state(db, user_id=user_id)
            step = conversation.current_step
        elif step in {"summary", "completed"}:
            raise ValueError("Onboarding has already completed")
        before = self.snapshot(profile)
        # Continuous profile Q&A is an interpretation surface, not an evidence
        # ingestion path. Persist the chat messages, but leave the profile and its
        # updated_at untouched unless a verified learning event updates a score.
        extracted = {} if step == "continuous" else self.extract(step, answer)
        data = dict(profile.profile_data or {})
        data.update(extracted)
        changed_fields = [key for key, value in extracted.items() if before["profile_data"].get(key) != value]
        updates: dict[str, float] = {}
        dimension = DIMENSION_BY_STEP.get(step)
        if dimension:
            score = self._answer_score(answer)
            updates[dimension] = score
        if step == "continuous":
            history = [
                {"role": item.role, "content": item.content}
                for item in profile_repository.list_messages(db, conversation.id)[-12:]
            ]
            continuous_reply = continuous_reply_override or profile_agent.answer_profile_question(
                question=answer, profile_snapshot={**before, "profile_summary": profile.profile_summary},
                conversation_history=history,
            )
            next_step = "continuous"
        elif step == "identity" and not all(data.get(key) for key in ("major", "grade", "learning_goal")):
            next_step = "identity"
        else:
            next_step = self._next_step(step)
        complete = next_step == "summary"
        if step != "continuous":
            profile = profile_repository.update_profile(
                db, profile=profile, major=data.get("major"), grade=data.get("grade"), learning_goal=data.get("learning_goal"),
                scores=updates, profile_data=data,
                build_step=7 if complete else ONBOARDING_STEPS.index(next_step),
                is_complete=complete,
                profile_summary=profile_agent.generate_profile_summary(data, {key: updates.get(key, float(getattr(profile, key))) for key in SCORE_KEYS}) if complete else None,
            )
        after = self.snapshot(profile)
        message = profile_repository.create_message(
            db, conversation_id=conversation.id, role="user", step=step, content=answer,
            question=self.question_for(profile, step), answer=answer, extracted_fields=extracted,
            dimension_updates=updates, profile_before=before, profile_after=after, idempotency_key=idempotency_key,
        )
        if complete:
            conversation.current_step = "summary"; conversation.status = "completed"; conversation.summary = profile.profile_summary
            reply = profile.profile_summary or "画像构建已完成。"
        elif step == "continuous":
            conversation.current_step = "continuous"
            reply = continuous_reply
        else:
            conversation.current_step = next_step
            reply = self.question_for(profile, next_step)
        profile_repository.save_conversation(db, conversation)
        profile_repository.create_message(
            db, conversation_id=conversation.id, role="assistant", step=conversation.current_step, content=reply,
            question=reply, answer=None, extracted_fields={}, dimension_updates={}, profile_before=after, profile_after=after,
            idempotency_key=None,
        )
        return self._result(db, profile, conversation, message, duplicate=False, changed_fields=changed_fields, changed_dimensions=list(updates))

    def apply_event(self, db: Session, *, user_id: int, idempotency_key: str, source_type: str, source_id: str | None, reason: str, evidence: dict[str, Any], dimension: str, observed_score: float) -> Any:
        existing = profile_repository.get_event_by_key(db, user_id, idempotency_key)
        if existing is not None:
            return existing
        if source_type not in {
            "test_completed", "path_step_completed", "course_assignment_completed",
            "project_completed", "resource_completed", "study_streak",
        }:
            raise ValueError("Unsupported profile event type")
        if dimension not in SCORE_KEYS:
            raise ValueError("Unsupported profile dimension")
        profile = profile_repository.get_or_create_profile(db, user_id)
        before = self.snapshot(profile)
        current = float(getattr(profile, dimension))
        bounded_observation = max(0.0, min(100.0, float(observed_score)))
        updated = round(current * 0.8 + bounded_observation * 0.2, 2)
        profile_repository.update_scores(db, profile=profile, scores={dimension: updated})
        after = self.snapshot(profile)
        return profile_repository.create_event(db, user_id=user_id, profile_id=profile.id, idempotency_key=idempotency_key,
            source_type=source_type, source_id=source_id, reason=reason, evidence=evidence, before=before, after=after)

    def apply_course_assignment_result(
        self,
        db: Session,
        *,
        user_id: int,
        submission_id: int,
        assignment_id: int,
        course_id: int,
        course_name: str,
        score: float,
        correct_topics: list[str],
        incorrect_topics: list[str],
    ) -> dict[str, Any]:
        evidence = {
            "submission_id": submission_id,
            "assignment_id": assignment_id,
            "course_id": course_id,
            "course_name": course_name,
            "score": score,
            "correct_topics": list(dict.fromkeys(correct_topics)),
            "incorrect_topics": list(dict.fromkeys(incorrect_topics)),
        }
        for dimension in ("exam_score", "knowledge_score"):
            self.apply_event(
                db,
                user_id=user_id,
                idempotency_key=f"course-assignment:{submission_id}:{dimension}",
                source_type="course_assignment_completed",
                source_id=str(submission_id),
                reason=f"完成课程“{course_name}”作业/测试并形成逐题诊断",
                evidence=evidence,
                dimension=dimension,
                observed_score=score,
            )

        profile = profile_repository.get_or_create_profile(db, user_id)
        data = dict(profile.profile_data or {})
        data["current_course"] = course_name
        data["weaknesses"] = list(dict.fromkeys(incorrect_topics))[:12]
        data["mastered_topics"] = list(dict.fromkeys(correct_topics))[:12]
        history = list(data.get("course_assignment_history") or [])
        history.append(evidence)
        data["course_assignment_history"] = history[-20:]
        scores = {key: float(getattr(profile, key)) for key in SCORE_KEYS}
        profile.profile_data = data
        profile.profile_summary = profile_agent.generate_profile_summary(data, scores)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return self.snapshot(profile)

    def extract(self, step: str, text: str) -> dict[str, Any]:
        if step == "identity":
            result: dict[str, Any] = {}
            grade = re.search(r"(大[一二三四五]|研[一二三]|高[一二三])", text)
            if grade: result["grade"] = grade.group(1)
            major = re.search(r"([\u4e00-\u9fff]{2,12}(?:专业|工程|科学与技术))", text)
            if "计算机" in text: result["major"] = "计算机专业"
            elif major: result["major"] = major.group(1)
            goal = re.search(r"((?:准备)?考研(?:408)?|保研|就业|考公|出国|提升[^，。；]{0,20})", text)
            if goal: result["learning_goal"] = goal.group(1)
            course = re.search(r"(?:现在学|正在学|课程是)([^，。；]{2,30})", text)
            if course: result["current_course"] = course.group(1)
            return result
        field = {
            "knowledge": "knowledge_evidence", "practice": "practice_experience", "innovation": "innovation_evidence",
            "exam": "exam_evidence", "efficiency": "efficiency_evidence", "quality": "quality_evidence",
        }[step]
        result = {field: text}
        if step == "knowledge":
            weakness = re.search(r"([^，。；]{1,30}(?:不会|不熟|薄弱|较弱))", text)
            result["current_level"] = text
            if weakness: result["weaknesses"] = [weakness.group(1)]
        return result

    def question_for(self, profile: StudentProfile, step: str) -> str:
        if step == "continuous": return "你的画像已经建立。最近有什么新的学习进展、困难或目标变化？"
        if step == "summary": return profile.profile_summary or "画像构建已完成。"
        if step == "identity":
            missing = []
            if not profile.major: missing.append("专业")
            if not profile.grade: missing.append("年级")
            if not profile.learning_goal: missing.append("学习目标")
            return f"请介绍你的{'、'.join(missing)}，也可以补充当前课程。"
        return QUESTIONS[step]

    def _first_step(self, profile: StudentProfile) -> str:
        return "identity" if not (profile.major and profile.grade and profile.learning_goal) else "knowledge"

    def _next_step(self, step: str) -> str:
        index = ONBOARDING_STEPS.index(step)
        return ONBOARDING_STEPS[index + 1] if index + 1 < len(ONBOARDING_STEPS) else "summary"

    def _answer_score(self, answer: str) -> float:
        normalized = answer.strip()
        informativeness = min(1.0, len(normalized) / 100)
        concrete = min(1.0, len(re.findall(r"\d+|项目|实验|考试|错题|复习|总结|调试|计划|每天|每周", normalized)) / 4)
        reflection = 1.0 if re.search(r"不会|困难|失分|薄弱|改进|原因|拖延|分心", normalized) else 0.0
        return round(max(0.0, min(100.0, 15 + 55 * informativeness + 20 * concrete + 10 * reflection)), 2)

    def snapshot(self, profile: StudentProfile) -> dict[str, Any]:
        return {"major": profile.major, "grade": profile.grade, "learning_goal": profile.learning_goal,
            "profile_data": dict(profile.profile_data or {}), "scores": {key: float(getattr(profile, key)) for key in SCORE_KEYS},
            "profile_summary": profile.profile_summary, "updated_at": profile.updated_at.isoformat() if profile.updated_at else None}

    def _result(self, db: Session, profile: StudentProfile, conversation: ProfileConversation, message: Any, duplicate: bool, changed_fields: list[str] | None = None, changed_dimensions: list[str] | None = None) -> dict[str, Any]:
        return {"profile": profile, "conversation": conversation, "messages": profile_repository.list_messages(db, conversation.id),
            "changed_fields": changed_fields or [], "changed_dimensions": changed_dimensions or [], "duplicate": duplicate,
            "answer_message": message}


profile_update_service = ProfileUpdateService()
