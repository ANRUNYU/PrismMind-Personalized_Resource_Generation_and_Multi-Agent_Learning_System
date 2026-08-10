from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assignment import CourseAssignment, CourseAssignmentSubmission


class CourseAssignmentRepository:
    def create_assignment(
        self,
        db: Session,
        *,
        course_id: int,
        teacher_id: int | None,
        title: str,
        description: str | None,
        assignment_type: str,
        source: str,
        difficulty: str,
        topic: str | None,
        question_count: int,
        total_score: float,
        time_limit_minutes: int | None,
        due_at,
        status: str,
        knowledge_document_ids: list[int],
        questions: list[dict[str, Any]],
        answer_key: dict[str, Any],
        explanations: dict[str, Any],
    ) -> CourseAssignment:
        assignment = CourseAssignment(
            course_id=course_id,
            teacher_id=teacher_id,
            title=title.strip(),
            description=description.strip() if description else None,
            assignment_type=assignment_type,
            source=source,
            difficulty=difficulty,
            topic=topic.strip() if topic else None,
            question_count=question_count,
            total_score=total_score,
            time_limit_minutes=time_limit_minutes,
            due_at=due_at,
            status=status,
            knowledge_document_ids=knowledge_document_ids,
            questions=questions,
            answer_key=answer_key,
            explanations=explanations,
            published_at=datetime.now(UTC) if status == "published" else None,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment

    def get_by_id(self, db: Session, assignment_id: int) -> CourseAssignment | None:
        return db.get(CourseAssignment, assignment_id)

    def get_by_course(self, db: Session, *, course_id: int, assignment_id: int) -> CourseAssignment | None:
        return db.scalar(
            select(CourseAssignment).where(
                CourseAssignment.id == assignment_id,
                CourseAssignment.course_id == course_id,
            )
        )

    def list_by_course(
        self,
        db: Session,
        *,
        course_id: int,
        include_statuses: list[str] | None,
        page: int,
        page_size: int,
    ) -> tuple[list[CourseAssignment], int]:
        stmt = select(CourseAssignment).where(CourseAssignment.course_id == course_id)
        count_stmt = select(func.count()).select_from(CourseAssignment).where(CourseAssignment.course_id == course_id)
        if include_statuses:
            stmt = stmt.where(CourseAssignment.status.in_(include_statuses))
            count_stmt = count_stmt.where(CourseAssignment.status.in_(include_statuses))
        total = int(db.scalar(count_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(CourseAssignment.created_at.desc(), CourseAssignment.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def count_submissions(self, db: Session, assignment_id: int) -> int:
        return int(
            db.scalar(
                select(func.count())
                .select_from(CourseAssignmentSubmission)
                .where(
                    CourseAssignmentSubmission.assignment_id == assignment_id,
                    CourseAssignmentSubmission.status.in_(["submitted", "graded"]),
                )
            )
            or 0
        )

    def get_submission(
        self,
        db: Session,
        *,
        assignment_id: int,
        student_id: int,
    ) -> CourseAssignmentSubmission | None:
        return db.scalar(
            select(CourseAssignmentSubmission).where(
                CourseAssignmentSubmission.assignment_id == assignment_id,
                CourseAssignmentSubmission.student_id == student_id,
            )
        )

    def ensure_submission(
        self,
        db: Session,
        *,
        assignment: CourseAssignment,
        student_id: int,
    ) -> CourseAssignmentSubmission:
        submission = self.get_submission(db, assignment_id=assignment.id, student_id=student_id)
        if submission is not None:
            return submission
        submission = CourseAssignmentSubmission(
            assignment_id=assignment.id,
            course_id=assignment.course_id,
            student_id=student_id,
            answers={},
            max_score=assignment.total_score,
            status="not_started",
            feedback={},
            question_results=[],
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission

    def start_submission(self, db: Session, submission: CourseAssignmentSubmission) -> CourseAssignmentSubmission:
        if submission.status == "not_started":
            submission.status = "in_progress"
            submission.started_at = submission.started_at or datetime.now(UTC)
            db.add(submission)
            db.commit()
            db.refresh(submission)
        return submission

    def submit_submission(
        self,
        db: Session,
        *,
        submission: CourseAssignmentSubmission,
        answers: dict[str, Any],
        score: float,
        question_results: list[dict[str, Any]],
        feedback: dict[str, Any],
    ) -> CourseAssignmentSubmission:
        now = datetime.now(UTC)
        submission.answers = answers
        submission.score = score
        submission.question_results = question_results
        submission.feedback = feedback
        submission.status = "graded"
        submission.submitted_at = now
        submission.graded_at = now
        if submission.started_at is None:
            submission.started_at = now
        db.add(submission)
        db.commit()
        db.refresh(submission)
        return submission

    def list_submissions(
        self,
        db: Session,
        *,
        assignment_id: int,
        page: int,
        page_size: int,
    ) -> tuple[list[CourseAssignmentSubmission], int]:
        stmt = select(CourseAssignmentSubmission).where(CourseAssignmentSubmission.assignment_id == assignment_id)
        count_stmt = select(func.count()).select_from(CourseAssignmentSubmission).where(
            CourseAssignmentSubmission.assignment_id == assignment_id
        )
        total = int(db.scalar(count_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(
                    CourseAssignmentSubmission.submitted_at.desc().nullslast(),
                    CourseAssignmentSubmission.created_at.desc(),
                    CourseAssignmentSubmission.id.desc(),
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def close_assignment(self, db: Session, assignment: CourseAssignment) -> CourseAssignment:
        assignment.status = "closed"
        db.add(assignment)
        db.commit()
        db.refresh(assignment)
        return assignment


course_assignment_repository = CourseAssignmentRepository()
