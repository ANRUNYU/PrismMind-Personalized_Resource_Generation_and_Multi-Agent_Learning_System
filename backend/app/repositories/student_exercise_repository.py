from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.student_exercise import StudentExercise


class StudentExerciseRepository:
    def create(
        self,
        db: Session,
        *,
        student_id: int,
        title: str,
        description: str | None,
        content: str,
        answer: str | None,
        explanation: str | None,
        difficulty: str,
        category: str,
        tags: list[str],
        total_score: float,
    ) -> StudentExercise:
        exercise = StudentExercise(
            student_id=student_id,
            title=title.strip(),
            description=description.strip() if description else None,
            content=content.strip(),
            answer=answer.strip() if answer else None,
            explanation=explanation.strip() if explanation else None,
            difficulty=difficulty,
            category=category.strip(),
            tags=tags,
            total_score=total_score,
            status="not_started",
            is_favorite=False,
            question_results=[],
            quality_analysis={},
        )
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise

    def get_by_id(self, db: Session, exercise_id: int) -> StudentExercise | None:
        return db.get(StudentExercise, exercise_id)

    def list_by_student(
        self,
        db: Session,
        *,
        student_id: int,
        page: int,
        page_size: int,
    ) -> tuple[list[StudentExercise], int]:
        stmt = select(StudentExercise).where(StudentExercise.student_id == student_id)
        count_stmt = select(func.count()).select_from(StudentExercise).where(StudentExercise.student_id == student_id)
        total = int(db.scalar(count_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(
                    StudentExercise.updated_at.desc(),
                    StudentExercise.created_at.desc(),
                    StudentExercise.id.desc(),
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def update(self, db: Session, exercise: StudentExercise, values: dict[str, Any]) -> StudentExercise:
        for key, value in values.items():
            setattr(exercise, key, value)
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise

    def start(self, db: Session, exercise: StudentExercise) -> StudentExercise:
        if exercise.status == "not_started":
            exercise.status = "in_progress"
            exercise.started_at = exercise.started_at or datetime.now(UTC)
            db.add(exercise)
            db.commit()
            db.refresh(exercise)
        return exercise

    def submit(
        self,
        db: Session,
        *,
        exercise: StudentExercise,
        user_answer: str,
        score: float,
        feedback: str,
        question_results: list[dict[str, Any]],
        quality_analysis: dict[str, Any],
    ) -> StudentExercise:
        now = datetime.now(UTC)
        exercise.user_answer = user_answer
        exercise.score = score
        exercise.feedback = feedback
        exercise.question_results = question_results
        exercise.quality_analysis = quality_analysis
        exercise.status = "graded"
        exercise.started_at = exercise.started_at or now
        exercise.submitted_at = now
        exercise.completed_at = now
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise

    def favorite(self, db: Session, exercise: StudentExercise, is_favorite: bool | None = None) -> StudentExercise:
        exercise.is_favorite = (not exercise.is_favorite) if is_favorite is None else is_favorite
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise

    def complete(self, db: Session, exercise: StudentExercise) -> StudentExercise:
        now = datetime.now(UTC)
        exercise.status = "completed"
        exercise.completed_at = exercise.completed_at or now
        db.add(exercise)
        db.commit()
        db.refresh(exercise)
        return exercise

    def delete(self, db: Session, exercise: StudentExercise) -> None:
        db.delete(exercise)
        db.commit()


student_exercise_repository = StudentExerciseRepository()
