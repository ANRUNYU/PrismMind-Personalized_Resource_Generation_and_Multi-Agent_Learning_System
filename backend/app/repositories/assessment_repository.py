from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.assessment import LearningAssessment


class AssessmentRepository:
    def create_assessment(
        self,
        db: Session,
        *,
        user_id: int,
        assessment_type: str,
        topic: str | None,
        resource_id: int | None,
        path_id: int | None,
        test_id: int | None,
        score: float | None,
        correct_topics: list[Any],
        incorrect_topics: list[Any],
        analysis: str,
        recommendations: list[dict[str, Any]],
    ) -> LearningAssessment:
        assessment = LearningAssessment(
            user_id=user_id,
            assessment_type=assessment_type,
            topic=topic,
            resource_id=resource_id,
            path_id=path_id,
            test_id=test_id,
            score=score,
            correct_topics=correct_topics,
            incorrect_topics=incorrect_topics,
            analysis=analysis,
            recommendations=recommendations,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    def get_by_id(self, db: Session, assessment_id: int) -> LearningAssessment | None:
        return db.get(LearningAssessment, assessment_id)

    def get_by_test_id(self, db: Session, test_id: int) -> LearningAssessment | None:
        return db.scalar(select(LearningAssessment).where(LearningAssessment.test_id == test_id).order_by(LearningAssessment.id).limit(1))

    def submit_assessment(
        self,
        db: Session,
        *,
        assessment: LearningAssessment,
        answers: dict[str, Any],
        reflection: str | None,
        self_rating: float | None,
        feedback: str | None,
        score: float,
        correct_topics: list[Any],
        incorrect_topics: list[Any],
        analysis: str,
        recommendations: list[dict[str, Any]],
    ) -> LearningAssessment:
        assessment.answers = answers
        assessment.reflection = reflection
        assessment.self_rating = self_rating
        assessment.feedback = feedback
        assessment.score = score
        assessment.correct_topics = correct_topics
        assessment.incorrect_topics = incorrect_topics
        assessment.analysis = analysis
        assessment.recommendations = recommendations
        assessment.submitted_at = datetime.now(timezone.utc)
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    def list_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        page_size: int = 10,
        assessment_type: str | None = None,
        topic: str | None = None,
        min_score: float | None = None,
        max_score: float | None = None,
    ) -> tuple[list[LearningAssessment], int]:
        stmt = select(LearningAssessment).where(LearningAssessment.user_id == user_id)
        count_stmt = select(func.count()).select_from(LearningAssessment).where(LearningAssessment.user_id == user_id)
        stmt, count_stmt = self._apply_filters(
            stmt,
            count_stmt,
            assessment_type=assessment_type,
            topic=topic,
            min_score=min_score,
            max_score=max_score,
        )
        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(LearningAssessment.created_at.desc(), LearningAssessment.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_recent_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        limit: int = 50,
    ) -> list[LearningAssessment]:
        stmt = (
            select(LearningAssessment)
            .where(LearningAssessment.user_id == user_id)
            .order_by(LearningAssessment.created_at.desc(), LearningAssessment.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def list_all_by_user(self, db: Session, *, user_id: int) -> list[LearningAssessment]:
        stmt = (
            select(LearningAssessment)
            .where(LearningAssessment.user_id == user_id)
            .order_by(LearningAssessment.created_at.desc(), LearningAssessment.id.desc())
        )
        return list(db.scalars(stmt))

    def _apply_filters(
        self,
        stmt,
        count_stmt,
        *,
        assessment_type: str | None,
        topic: str | None,
        min_score: float | None,
        max_score: float | None,
    ):
        if assessment_type:
            stmt = stmt.where(LearningAssessment.assessment_type == assessment_type)
            count_stmt = count_stmt.where(LearningAssessment.assessment_type == assessment_type)
        if topic:
            pattern = f"%{topic}%"
            stmt = stmt.where(LearningAssessment.topic.ilike(pattern))
            count_stmt = count_stmt.where(LearningAssessment.topic.ilike(pattern))
        if min_score is not None:
            stmt = stmt.where(LearningAssessment.score >= min_score)
            count_stmt = count_stmt.where(LearningAssessment.score >= min_score)
        if max_score is not None:
            stmt = stmt.where(LearningAssessment.score <= max_score)
            count_stmt = count_stmt.where(LearningAssessment.score <= max_score)
        return stmt, count_stmt


assessment_repository = AssessmentRepository()
