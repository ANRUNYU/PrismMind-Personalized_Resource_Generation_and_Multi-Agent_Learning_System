from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.assignment import CourseAssignment
from app.models.course import Course, CourseMember
from app.models.enums import UserRole
from app.models.student_exercise import StudentExercise
from app.models.user import User
from app.repositories.course_assignment_repository import course_assignment_repository
from app.repositories.student_exercise_repository import student_exercise_repository
from app.schemas.student_exercise import (
    StudentExerciseCreate,
    StudentExerciseListResponse,
    StudentExerciseRead,
    StudentExerciseStartResponse,
    StudentExerciseSubmitRequest,
    StudentExerciseSubmitResponse,
    StudentExerciseSummary,
    StudentExerciseUpdate,
)
from app.services.agents.test_agent import test_agent
from app.services.course_service import course_service
from app.services.quality_analysis_service import quality_analysis_service


PERSONAL_PREFIX = "personal:"
ASSIGNMENT_PREFIX = "assignment:"

STATUS_LABELS = {
    "not_started": "未开始",
    "in_progress": "进行中",
    "submitted": "已提交",
    "graded": "已评分",
    "completed": "已完成",
    "published": "待练习",
    "closed": "已结束",
}

TYPE_LABELS = {
    "quiz": "随堂练习",
    "homework": "课程练习",
    "exam": "阶段测验",
    "personal": "个人习题",
}


class StudentExerciseService:
    def create_personal_exercise(
        self,
        db: Session,
        payload: StudentExerciseCreate,
        current_user: User,
    ) -> StudentExerciseRead:
        exercise = student_exercise_repository.create(
            db,
            student_id=current_user.id,
            title=payload.title,
            description=payload.description,
            content=payload.content,
            answer=payload.answer,
            explanation=payload.explanation,
            difficulty=str(payload.difficulty),
            category=payload.category,
            tags=payload.tags,
            total_score=payload.total_score,
        )
        return self._personal_read(exercise, include_answers=True)

    def list_exercises(
        self,
        db: Session,
        current_user: User,
        *,
        page: int,
        page_size: int,
    ) -> StudentExerciseListResponse:
        personal, _ = student_exercise_repository.list_by_student(
            db,
            student_id=current_user.id,
            page=1,
            page_size=1000,
        )
        items: list[StudentExerciseSummary] = [self._personal_summary(exercise) for exercise in personal]
        items.extend(self._list_assignment_summaries(db, current_user))
        items.sort(key=lambda item: item.updated_at or item.created_at, reverse=True)
        total = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        return StudentExerciseListResponse(items=items[start:end], total=total, page=page, page_size=page_size)

    def get_exercise(self, db: Session, exercise_id: str, current_user: User) -> StudentExerciseRead:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind == "personal":
            exercise = self._get_personal_or_404(db, values[0], current_user)
            return self._personal_read(exercise, include_answers=True)
        assignment, course = self._get_assignment_or_404(db, course_id=values[0], assignment_id=values[1], current_user=current_user)
        return self._assignment_read(db, assignment, course, current_user)

    def update_personal_exercise(
        self,
        db: Session,
        exercise_id: str,
        payload: StudentExerciseUpdate,
        current_user: User,
    ) -> StudentExerciseRead:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind != "personal":
            raise BadRequestException("课程练习不能在这里编辑")
        exercise = self._get_personal_or_404(db, values[0], current_user)
        updates = payload.model_dump(exclude_unset=True)
        if "title" in updates and updates["title"] is not None:
            updates["title"] = updates["title"].strip()
        if "description" in updates and updates["description"] is not None:
            updates["description"] = updates["description"].strip()
        if "content" in updates and updates["content"] is not None:
            updates["content"] = updates["content"].strip()
        if "answer" in updates and updates["answer"] is not None:
            updates["answer"] = updates["answer"].strip()
        if "explanation" in updates and updates["explanation"] is not None:
            updates["explanation"] = updates["explanation"].strip()
        exercise = student_exercise_repository.update(db, exercise, updates)
        return self._personal_read(exercise, include_answers=True)

    def delete_personal_exercise(self, db: Session, exercise_id: str, current_user: User) -> dict[str, Any]:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind != "personal":
            raise BadRequestException("课程练习不能由学生删除")
        exercise = self._get_personal_or_404(db, values[0], current_user)
        student_exercise_repository.delete(db, exercise)
        return {"exercise_id": exercise_id, "deleted": True}

    def start_exercise(self, db: Session, exercise_id: str, current_user: User) -> StudentExerciseStartResponse:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind == "personal":
            exercise = self._get_personal_or_404(db, values[0], current_user)
            exercise = student_exercise_repository.start(db, exercise)
            return StudentExerciseStartResponse(exercise=self._personal_read(exercise, include_answers=True))

        assignment, course = self._get_assignment_or_404(db, course_id=values[0], assignment_id=values[1], current_user=current_user)
        if assignment.status != "published":
            if assignment.status == "closed":
                raise BadRequestException("这项练习已结束，不能开始作答")
            raise ForbiddenException("这项练习尚未发布")
        submission = course_assignment_repository.ensure_submission(db, assignment=assignment, student_id=current_user.id)
        course_assignment_repository.start_submission(db, submission)
        return StudentExerciseStartResponse(exercise=self._assignment_read(db, assignment, course, current_user))

    def submit_exercise(
        self,
        db: Session,
        exercise_id: str,
        payload: StudentExerciseSubmitRequest,
        current_user: User,
    ) -> StudentExerciseSubmitResponse:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind == "personal":
            exercise = self._get_personal_or_404(db, values[0], current_user)
            return self._submit_personal(db, exercise, payload)
        assignment, course = self._get_assignment_or_404(db, course_id=values[0], assignment_id=values[1], current_user=current_user)
        return self._submit_assignment(db, assignment, course, payload, current_user)

    def favorite_personal_exercise(self, db: Session, exercise_id: str, current_user: User) -> StudentExerciseRead:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind != "personal":
            raise BadRequestException("课程练习暂不支持收藏")
        exercise = self._get_personal_or_404(db, values[0], current_user)
        exercise = student_exercise_repository.favorite(db, exercise)
        return self._personal_read(exercise, include_answers=True)

    def complete_personal_exercise(self, db: Session, exercise_id: str, current_user: User) -> StudentExerciseRead:
        kind, values = self._parse_exercise_id(exercise_id)
        if kind != "personal":
            raise BadRequestException("课程练习请通过提交答案完成")
        exercise = self._get_personal_or_404(db, values[0], current_user)
        exercise = student_exercise_repository.complete(db, exercise)
        return self._personal_read(exercise, include_answers=True)

    def _parse_exercise_id(self, exercise_id: str) -> tuple[str, list[int]]:
        raw = str(exercise_id).strip()
        if raw.startswith(PERSONAL_PREFIX):
            value = raw.removeprefix(PERSONAL_PREFIX)
            if value.isdigit():
                return "personal", [int(value)]
        if raw.startswith(ASSIGNMENT_PREFIX):
            parts = raw.removeprefix(ASSIGNMENT_PREFIX).split(":")
            if len(parts) == 2 and all(part.isdigit() for part in parts):
                return "assignment", [int(parts[0]), int(parts[1])]
        if raw.isdigit():
            return "personal", [int(raw)]
        raise BadRequestException("练习标识不合法")

    def _get_personal_or_404(self, db: Session, exercise_id: int, current_user: User) -> StudentExercise:
        exercise = student_exercise_repository.get_by_id(db, exercise_id)
        if exercise is None:
            raise NotFoundException("练习不存在")
        if current_user.role != UserRole.admin and exercise.student_id != current_user.id:
            raise ForbiddenException("无权访问这道练习")
        return exercise

    def _get_assignment_or_404(
        self,
        db: Session,
        *,
        course_id: int,
        assignment_id: int,
        current_user: User,
    ) -> tuple[CourseAssignment, Course]:
        course = course_service.get_course_or_404(db, course_id)
        if not course_service.can_view_course(db, course, current_user):
            raise ForbiddenException("无权访问这门课程")
        assignment = course_assignment_repository.get_by_course(db, course_id=course_id, assignment_id=assignment_id)
        if assignment is None:
            raise NotFoundException("练习不存在")
        if assignment.status not in {"published", "closed"} and not course_service.can_manage_course(course, current_user):
            raise ForbiddenException("这项练习尚未发布")
        return assignment, course

    def _list_assignment_summaries(self, db: Session, current_user: User) -> list[StudentExerciseSummary]:
        stmt = (
            select(CourseAssignment, Course)
            .join(Course, Course.id == CourseAssignment.course_id)
            .join(CourseMember, CourseMember.course_id == Course.id)
            .where(
                CourseMember.user_id == current_user.id,
                CourseMember.status == "active",
                Course.status == "active",
                CourseAssignment.status.in_(["published", "closed"]),
            )
            .order_by(CourseAssignment.updated_at.desc(), CourseAssignment.created_at.desc())
        )
        rows = db.execute(stmt).all()
        return [self._assignment_summary(db, assignment, course, current_user) for assignment, course in rows]

    def _personal_summary(self, exercise: StudentExercise) -> StudentExerciseSummary:
        return StudentExerciseSummary(
            id=f"{PERSONAL_PREFIX}{exercise.id}",
            source="personal",
            personal_id=exercise.id,
            course_name="个人习题库",
            title=exercise.title,
            description=exercise.description,
            content=exercise.content,
            category=exercise.category,
            difficulty=exercise.difficulty,
            status=exercise.status,
            status_label=STATUS_LABELS.get(exercise.status, exercise.status),
            is_favorite=exercise.is_favorite,
            score=exercise.score,
            total_score=exercise.total_score,
            tags=[str(tag) for tag in exercise.tags or []],
            question_count=1,
            started_at=exercise.started_at,
            submitted_at=exercise.submitted_at,
            completed_at=exercise.completed_at,
            created_at=exercise.created_at,
            updated_at=exercise.updated_at,
        )

    def _personal_read(self, exercise: StudentExercise, *, include_answers: bool) -> StudentExerciseRead:
        answer_key = self._personal_answer_key(exercise) if include_answers else None
        return StudentExerciseRead(
            **self._personal_summary(exercise).model_dump(),
            questions=[self._personal_question(exercise)],
            answer_key=answer_key,
            explanation=exercise.explanation,
            feedback=exercise.feedback,
            user_answers={"q1": exercise.user_answer} if exercise.user_answer else {},
            question_results=exercise.question_results or [],
            quality_analysis=exercise.quality_analysis or None,
        )

    def _personal_question(self, exercise: StudentExercise) -> dict[str, Any]:
        return {
            "id": "q1",
            "question_type": "short_answer",
            "stem": exercise.content,
            "options": [],
            "knowledge_points": [str(tag) for tag in exercise.tags or []] or [exercise.category],
            "score": exercise.total_score,
        }

    def _personal_answer_key(self, exercise: StudentExercise) -> dict[str, dict[str, Any]]:
        answer = exercise.answer or "请围绕题目要求，写出概念、步骤和示例。"
        return {
            "q1": {
                "answer": answer,
                "analysis": exercise.explanation or "参考答案用于帮助你复盘关键概念、推理过程和表达完整度。",
                "keywords": self._keywords_from_personal(exercise),
            }
        }

    def _keywords_from_personal(self, exercise: StudentExercise) -> list[str]:
        candidates: list[str] = []
        candidates.extend(str(tag) for tag in exercise.tags or [])
        candidates.extend(re.split(r"[\s,，;；、]+", exercise.answer or ""))
        candidates.extend(re.split(r"[\s,，;；、]+", exercise.title or ""))
        candidates.append(exercise.category)
        return [item for item in dict.fromkeys(candidate.strip() for candidate in candidates) if len(item) > 1][:8]

    def _assignment_summary(
        self,
        db: Session,
        assignment: CourseAssignment,
        course: Course,
        current_user: User,
    ) -> StudentExerciseSummary:
        submission = course_assignment_repository.get_submission(
            db,
            assignment_id=assignment.id,
            student_id=current_user.id,
        )
        status = submission.status if submission is not None else ("closed" if assignment.status == "closed" else "not_started")
        tags = [
            course.name,
            TYPE_LABELS.get(assignment.assignment_type, assignment.assignment_type),
            assignment.topic or "",
            STATUS_LABELS.get(status, status),
        ]
        return StudentExerciseSummary(
            id=f"{ASSIGNMENT_PREFIX}{course.id}:{assignment.id}",
            source="assignment",
            course_id=course.id,
            assignment_id=assignment.id,
            course_name=course.name,
            title=assignment.title,
            description=assignment.description,
            content=assignment.topic,
            category=TYPE_LABELS.get(assignment.assignment_type, assignment.assignment_type),
            difficulty=assignment.difficulty,
            status=status,
            status_label=STATUS_LABELS.get(status, status),
            is_favorite=False,
            score=submission.score if submission is not None else None,
            total_score=assignment.total_score,
            tags=[item for item in dict.fromkeys(tags) if item],
            question_count=len(assignment.questions or []) or assignment.question_count,
            due_at=assignment.due_at,
            started_at=submission.started_at if submission is not None else None,
            submitted_at=submission.submitted_at if submission is not None else None,
            completed_at=submission.graded_at if submission is not None else None,
            created_at=assignment.created_at,
            updated_at=submission.updated_at if submission is not None else assignment.updated_at,
        )

    def _assignment_read(
        self,
        db: Session,
        assignment: CourseAssignment,
        course: Course,
        current_user: User,
    ) -> StudentExerciseRead:
        submission = course_assignment_repository.get_submission(
            db,
            assignment_id=assignment.id,
            student_id=current_user.id,
        )
        include_answers = submission is not None and submission.status in {"submitted", "graded"}
        summary = self._assignment_summary(db, assignment, course, current_user)
        feedback = submission.feedback if submission is not None and isinstance(submission.feedback, dict) else {}
        return StudentExerciseRead(
            **summary.model_dump(),
            questions=assignment.questions or [],
            answer_key=assignment.answer_key if include_answers else None,
            explanation="完成提交后可查看参考答案与解析。" if not include_answers else None,
            feedback=str(feedback.get("feedback") or "") if feedback else None,
            user_answers=submission.answers if submission is not None else {},
            question_results=submission.question_results if submission is not None else [],
            quality_analysis=feedback.get("quality_analysis") if feedback else self._assignment_quality_analysis(assignment),
        )

    def _assignment_quality_analysis(self, assignment: CourseAssignment) -> dict[str, Any]:
        return quality_analysis_service.analyze_generated_content(
            content={
                "questions": assignment.questions or [],
                "answer_key": assignment.answer_key or {},
                "explanations": assignment.explanations or {},
            },
            request_payload={
                "title": assignment.title,
                "description": assignment.description,
                "assignment_type": assignment.assignment_type,
                "topic": assignment.topic,
                "difficulty": assignment.difficulty,
                "question_count": assignment.question_count,
            },
            difficulty=assignment.difficulty,
            context_label=assignment.title,
        ).model_dump(mode="json")

    def _submit_personal(
        self,
        db: Session,
        exercise: StudentExercise,
        payload: StudentExerciseSubmitRequest,
    ) -> StudentExerciseSubmitResponse:
        user_answer = self._first_answer_text(payload.answers)
        if not user_answer:
            raise BadRequestException("请输入作答内容")
        questions = [self._personal_question(exercise)]
        answer_key = self._personal_answer_key(exercise)
        grade = test_agent.grade(questions=questions, answers=answer_key, user_answers={"q1": user_answer})
        quality_analysis = self._submission_quality_analysis(
            title=exercise.title,
            difficulty=exercise.difficulty,
            grade=grade,
            expected_keywords=self._keywords_from_personal(exercise),
        )
        exercise = student_exercise_repository.submit(
            db,
            exercise=exercise,
            user_answer=user_answer,
            score=grade["score"],
            feedback=grade["feedback"],
            question_results=grade["question_results"],
            quality_analysis=quality_analysis,
        )
        read = self._personal_read(exercise, include_answers=True)
        return StudentExerciseSubmitResponse(
            exercise=read,
            status=read.status,
            score=grade["score"],
            max_score=exercise.total_score,
            analysis=grade["analysis"],
            feedback=grade["feedback"],
            question_results=grade["question_results"],
            answer_key=answer_key,
            quality_analysis=quality_analysis,
        )

    def _submit_assignment(
        self,
        db: Session,
        assignment: CourseAssignment,
        course: Course,
        payload: StudentExerciseSubmitRequest,
        current_user: User,
    ) -> StudentExerciseSubmitResponse:
        if assignment.status != "published":
            raise BadRequestException("这项练习暂不能提交")
        submission = course_assignment_repository.ensure_submission(db, assignment=assignment, student_id=current_user.id)
        if submission.status in {"submitted", "graded"}:
            raise BadRequestException("这项练习已经提交，不能重复提交")
        grade = test_agent.grade(
            questions=assignment.questions or [],
            answers=assignment.answer_key or {},
            user_answers=payload.answers,
        )
        quality_analysis = self._submission_quality_analysis(
            title=assignment.title,
            difficulty=assignment.difficulty,
            grade=grade,
            expected_keywords=grade.get("incorrect_topics") or grade.get("correct_topics") or [],
        )
        feedback = {
            "analysis": grade["analysis"],
            "feedback": grade["feedback"],
            "recommendations": [grade["feedback"]],
            "correct_topics": grade["correct_topics"],
            "incorrect_topics": grade["incorrect_topics"],
            "quality_analysis": quality_analysis,
        }
        course_assignment_repository.submit_submission(
            db,
            submission=submission,
            answers=payload.answers,
            score=grade["score"],
            question_results=grade["question_results"],
            feedback=feedback,
        )
        read = self._assignment_read(db, assignment, course, current_user)
        return StudentExerciseSubmitResponse(
            exercise=read,
            status=read.status,
            score=grade["score"],
            max_score=assignment.total_score,
            analysis=grade["analysis"],
            feedback=grade["feedback"],
            question_results=grade["question_results"],
            answer_key=assignment.answer_key or {},
            quality_analysis=quality_analysis,
        )

    def _submission_quality_analysis(
        self,
        *,
        title: str,
        difficulty: str,
        grade: dict[str, Any],
        expected_keywords: list[str],
    ) -> dict[str, Any]:
        return quality_analysis_service.analyze_generated_content(
            content={
                "analysis": grade.get("analysis"),
                "feedback": grade.get("feedback"),
                "question_results": grade.get("question_results") or [],
            },
            request_payload={
                "title": title,
                "difficulty": difficulty,
                "correct_topics": grade.get("correct_topics") or [],
                "incorrect_topics": grade.get("incorrect_topics") or [],
            },
            expected_keywords=[str(item) for item in expected_keywords],
            difficulty=difficulty,
            context_label="练习反馈结果",
        ).model_dump(mode="json")

    def _first_answer_text(self, answers: dict[str, Any]) -> str:
        if "q1" in answers:
            return str(answers.get("q1") or "").strip()
        for value in answers.values():
            text = str(value or "").strip()
            if text:
                return text
        return ""


student_exercise_service = StudentExerciseService()
