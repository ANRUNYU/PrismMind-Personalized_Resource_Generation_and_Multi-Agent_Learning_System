from __future__ import annotations

import random
import string

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.course import Course, CourseMember
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.course import CourseCreate, CourseUpdate


class CourseRepository:
    def get_by_id(self, db: Session, course_id: int) -> Course | None:
        return db.get(Course, course_id)

    def get_by_code(self, db: Session, code: str) -> Course | None:
        normalized = self.normalize_code(code)
        return db.scalar(select(Course).where(func.upper(Course.code) == normalized))

    def normalize_code(self, code: str) -> str:
        return "".join(str(code or "").strip().upper().split())

    def generate_code(self, db: Session) -> str:
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(30):
            code = "PM-" + "".join(random.choice(alphabet) for _ in range(6))
            if self.get_by_code(db, code) is None:
                return code
        raise RuntimeError("Cannot generate unique course code")

    def create_course(self, db: Session, payload: CourseCreate, owner: User) -> Course:
        course = Course(
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None,
            code=self.generate_code(db),
            owner_id=owner.id,
            status="active",
        )
        db.add(course)
        db.flush()
        self.ensure_member(db, course_id=course.id, user_id=owner.id, role="teacher")
        db.commit()
        db.refresh(course)
        return course

    def update_course(self, db: Session, course: Course, payload: CourseUpdate) -> Course:
        if payload.name is not None:
            course.name = payload.name.strip()
        if payload.description is not None:
            course.description = payload.description.strip() or None
        db.add(course)
        db.commit()
        db.refresh(course)
        return course

    def archive_course(self, db: Session, course: Course) -> Course:
        course.status = "archived"
        db.add(course)
        db.commit()
        db.refresh(course)
        return course

    def list_visible_courses(self, db: Session, user: User, page: int, page_size: int) -> tuple[list[Course], int]:
        if user.role == UserRole.admin:
            stmt = select(Course)
        elif user.role == UserRole.teacher:
            stmt = (
                select(Course)
                .outerjoin(CourseMember, CourseMember.course_id == Course.id)
                .where(
                    or_(
                        Course.owner_id == user.id,
                        and_(
                            CourseMember.user_id == user.id,
                            CourseMember.role == "teacher",
                            CourseMember.status == "active",
                        ),
                    )
                )
                .distinct()
            )
        else:
            stmt = (
                select(Course)
                .join(CourseMember, CourseMember.course_id == Course.id)
                .where(
                    CourseMember.user_id == user.id,
                    CourseMember.role == "student",
                    CourseMember.status == "active",
                )
            )

        total_stmt = select(func.count()).select_from(stmt.with_only_columns(Course.id).order_by(None).subquery())
        total = int(db.scalar(total_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(Course.created_at.desc(), Course.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).unique()
        )
        return items, total

    def get_membership(self, db: Session, course_id: int, user_id: int) -> CourseMember | None:
        return db.scalar(
            select(CourseMember).where(
                CourseMember.course_id == course_id,
                CourseMember.user_id == user_id,
            )
        )

    def get_active_membership(self, db: Session, course_id: int, user_id: int) -> CourseMember | None:
        return db.scalar(
            select(CourseMember).where(
                CourseMember.course_id == course_id,
                CourseMember.user_id == user_id,
                CourseMember.status == "active",
            )
        )

    def ensure_member(self, db: Session, *, course_id: int, user_id: int, role: str) -> tuple[CourseMember, bool]:
        member = self.get_membership(db, course_id, user_id)
        if member is not None:
            already_active = member.status == "active" and member.role == role
            member.role = role
            member.status = "active"
            db.add(member)
            db.flush()
            return member, already_active

        member = CourseMember(
            course_id=course_id,
            user_id=user_id,
            role=role,
            status="active",
        )
        db.add(member)
        db.flush()
        return member, False

    def list_members(self, db: Session, course_id: int, page: int, page_size: int) -> tuple[list[CourseMember], int]:
        stmt = (
            select(CourseMember)
            .options(selectinload(CourseMember.user).selectinload(User.profile))
            .where(CourseMember.course_id == course_id)
        )
        total = int(db.scalar(select(func.count()).select_from(stmt.with_only_columns(CourseMember.id).subquery())) or 0)
        items = list(
            db.scalars(
                stmt.order_by(CourseMember.role.asc(), CourseMember.joined_at.asc(), CourseMember.id.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def count_students(self, db: Session, course_id: int) -> int:
        return int(
            db.scalar(
                select(func.count())
                .select_from(CourseMember)
                .where(
                    CourseMember.course_id == course_id,
                    CourseMember.role == "student",
                    CourseMember.status == "active",
                )
            )
            or 0
        )


course_repository = CourseRepository()
