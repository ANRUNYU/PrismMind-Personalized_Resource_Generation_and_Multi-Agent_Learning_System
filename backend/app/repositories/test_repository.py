from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import TestStatus
from app.models.test import StudentTest


EXTERNAL_TO_DB_STATUS = {
    "generated": TestStatus.created,
    "in_progress": TestStatus.started,
    "submitted": TestStatus.submitted,
}

DB_TO_EXTERNAL_STATUS = {
    TestStatus.created: "generated",
    TestStatus.started: "in_progress",
    TestStatus.submitted: "submitted",
    TestStatus.graded: "submitted",
}


def external_test_status(status: TestStatus | str) -> str:
    if isinstance(status, TestStatus):
        return DB_TO_EXTERNAL_STATUS.get(status, str(status.value))
    return DB_TO_EXTERNAL_STATUS.get(TestStatus(status), status) if status in TestStatus._value2member_map_ else status


class StudentTestRepository:
    def create_test(
        self,
        db: Session,
        *,
        user_id: int,
        topic: str,
        difficulty: str,
        questions: list[dict[str, Any]],
        answers: dict[str, Any],
        learning_path_id: int | None = None,
        learning_path_step_id: int | None = None,
        resource_id: int | None = None,
        source_type: str | None = None,
        evidence_snapshot: dict[str, Any] | None = None,
        source_file_ids: list[int] | None = None,
        source_document_ids: list[int] | None = None,
        source_chunk_ids: list[int | str] | None = None,
        generation_parameters: dict[str, Any] | None = None,
        quality_analysis: dict[str, Any] | None = None,
    ) -> StudentTest:
        test = StudentTest(
            user_id=user_id,
            topic=topic,
            difficulty=difficulty,
            questions=questions,
            answers=answers,
            user_answers={},
            status=TestStatus.created,
            learning_path_id=learning_path_id,
            learning_path_step_id=learning_path_step_id,
            resource_id=resource_id,
            source_type=source_type,
            evidence_snapshot=evidence_snapshot or {},
            source_file_ids=source_file_ids or [], source_document_ids=source_document_ids or [],
            source_chunk_ids=source_chunk_ids or [], generation_parameters=generation_parameters or {},
            quality_analysis=quality_analysis or {},
        )
        db.add(test)
        db.commit()
        db.refresh(test)
        return test

    def get_by_id(self, db: Session, test_id: int) -> StudentTest | None:
        return db.get(StudentTest, test_id)

    def list_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        topic: str | None = None,
        difficulty: str | None = None,
    ) -> tuple[list[StudentTest], int]:
        stmt = select(StudentTest).where(StudentTest.user_id == user_id)
        count_stmt = select(func.count()).select_from(StudentTest).where(StudentTest.user_id == user_id)
        stmt, count_stmt = self._apply_filters(
            stmt,
            count_stmt,
            status=status,
            topic=topic,
            difficulty=difficulty,
        )
        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(StudentTest.created_at.desc(), StudentTest.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_recent_by_user(self, db: Session, *, user_id: int, limit: int = 20) -> list[StudentTest]:
        stmt = (
            select(StudentTest)
            .where(StudentTest.user_id == user_id)
            .order_by(StudentTest.created_at.desc(), StudentTest.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def list_submitted_by_user(self, db: Session, *, user_id: int, limit: int = 20) -> list[StudentTest]:
        stmt = (
            select(StudentTest)
            .where(StudentTest.user_id == user_id, StudentTest.status.in_([TestStatus.submitted, TestStatus.graded]))
            .order_by(StudentTest.submitted_at.desc().nullslast(), StudentTest.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def start_test(self, db: Session, test: StudentTest) -> StudentTest:
        test.status = TestStatus.started
        test.started_at = test.started_at or datetime.now(UTC)
        db.add(test)
        db.commit()
        db.refresh(test)
        return test

    def submit_test(
        self,
        db: Session,
        *,
        test: StudentTest,
        user_answers: dict[str, Any],
        score: float,
        analysis: str,
        feedback: str,
        question_results: list[dict[str, Any]] | None = None,
    ) -> StudentTest:
        test.user_answers = user_answers
        test.score = score
        test.analysis = analysis
        test.feedback = feedback
        test.question_results = question_results or []
        test.status = TestStatus.submitted
        test.submitted_at = datetime.now(UTC)
        if test.started_at is None:
            test.started_at = test.submitted_at
        db.add(test)
        db.commit()
        db.refresh(test)
        return test

    def _apply_filters(
        self,
        stmt,
        count_stmt,
        *,
        status: str | None,
        topic: str | None,
        difficulty: str | None,
    ):
        if status:
            db_status = EXTERNAL_TO_DB_STATUS.get(status)
            if db_status is not None:
                if status == "submitted":
                    stmt = stmt.where(StudentTest.status.in_([TestStatus.submitted, TestStatus.graded]))
                    count_stmt = count_stmt.where(StudentTest.status.in_([TestStatus.submitted, TestStatus.graded]))
                else:
                    stmt = stmt.where(StudentTest.status == db_status)
                    count_stmt = count_stmt.where(StudentTest.status == db_status)
        if topic:
            pattern = f"%{topic}%"
            stmt = stmt.where(StudentTest.topic.ilike(pattern))
            count_stmt = count_stmt.where(StudentTest.topic.ilike(pattern))
        if difficulty:
            stmt = stmt.where(StudentTest.difficulty == difficulty)
            count_stmt = count_stmt.where(StudentTest.difficulty == difficulty)
        return stmt, count_stmt


student_test_repository = StudentTestRepository()
