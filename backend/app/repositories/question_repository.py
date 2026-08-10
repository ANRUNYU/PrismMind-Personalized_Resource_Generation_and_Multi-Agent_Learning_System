from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.test import QuestionBank


class QuestionRepository:
    def find_questions(
        self,
        db: Session,
        *,
        topic: str,
        difficulty: str | None,
        knowledge_points: list[str],
        question_types: list[str],
        limit: int,
    ) -> list[QuestionBank]:
        stmt = select(QuestionBank)
        if question_types:
            stmt = stmt.where(QuestionBank.question_type.in_(question_types))
        if difficulty and difficulty != "mixed":
            stmt = stmt.where(QuestionBank.difficulty.in_([difficulty, "mixed", None]))
        candidates = list(db.scalars(stmt.order_by(QuestionBank.created_at.desc(), QuestionBank.id.desc()).limit(limit * 5)))

        topic_lower = topic.lower()
        point_set = {point.lower() for point in knowledge_points or []}

        def score(question: QuestionBank) -> int:
            value = 0
            if topic_lower and topic_lower in (question.stem or "").lower():
                value += 2
            q_points = {str(point).lower() for point in question.knowledge_points or []}
            value += len(point_set.intersection(q_points)) * 3
            return value

        ranked = sorted(candidates, key=score, reverse=True)
        if point_set:
            ranked = [question for question in ranked if score(question) > 0] + [
                question for question in ranked if score(question) == 0
            ]
        return ranked[:limit]


question_repository = QuestionRepository()
