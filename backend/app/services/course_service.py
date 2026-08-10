from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.course import Course, CourseMember
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.schemas.course import (
    CourseCreate,
    CourseJoinResponse,
    CourseListResponse,
    CourseMemberListResponse,
    CourseMemberRead,
    CourseRead,
    CourseUpdate,
)


class CourseService:
    def create_course(self, db: Session, payload: CourseCreate, current_user: User) -> CourseRead:
        if current_user.role not in {UserRole.teacher, UserRole.admin}:
            raise ForbiddenException("只有教师或管理员可以创建课程")
        course = course_repository.create_course(db, payload, current_user)
        return self.to_course_read(db, course, current_user)

    def list_my_courses(self, db: Session, current_user: User, page: int, page_size: int) -> CourseListResponse:
        items, total = course_repository.list_visible_courses(db, current_user, page, page_size)
        return CourseListResponse(
            items=[self.to_course_read(db, course, current_user) for course in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_course_detail(self, db: Session, course_id: int, current_user: User) -> CourseRead:
        course = self.get_course_or_404(db, course_id)
        if not self.can_view_course(db, course, current_user):
            raise ForbiddenException("无权访问该课程")
        return self.to_course_read(db, course, current_user)

    def update_course(self, db: Session, course_id: int, payload: CourseUpdate, current_user: User) -> CourseRead:
        course = self.get_course_or_404(db, course_id)
        self.assert_can_manage_course(course, current_user, allow_archived_admin_only=True)
        if payload.name is None and payload.description is None:
            raise BadRequestException("请至少提供一个需要更新的字段")
        updated = course_repository.update_course(db, course, payload)
        return self.to_course_read(db, updated, current_user)

    def archive_course(self, db: Session, course_id: int, current_user: User) -> CourseRead:
        course = self.get_course_or_404(db, course_id)
        self.assert_can_manage_course(course, current_user, allow_archived_admin_only=False)
        archived = course_repository.archive_course(db, course)
        return self.to_course_read(db, archived, current_user)

    def join_course(self, db: Session, code: str, current_user: User) -> CourseJoinResponse:
        if current_user.role not in {UserRole.student, UserRole.admin}:
            raise ForbiddenException("只有学生或管理员可以加入课程")
        course = course_repository.get_by_code(db, code)
        if course is None:
            raise NotFoundException("课程不存在或加入码无效")
        if course.status == "archived" and current_user.role != UserRole.admin:
            raise BadRequestException("课程已归档，暂不能加入")

        member_role = "student"
        member, already_joined = course_repository.ensure_member(
            db,
            course_id=course.id,
            user_id=current_user.id,
            role=member_role,
        )
        db.commit()
        db.refresh(member)
        db.refresh(course)
        return CourseJoinResponse(
            course=self.to_course_read(db, course, current_user),
            member=self.to_member_read(member),
            already_joined=already_joined,
        )

    def list_members(
        self,
        db: Session,
        course_id: int,
        current_user: User,
        page: int,
        page_size: int,
    ) -> CourseMemberListResponse:
        course = self.get_course_or_404(db, course_id)
        if not self.can_manage_course(course, current_user):
            raise ForbiddenException("无权查看课程成员")
        items, total = course_repository.list_members(db, course_id, page, page_size)
        return CourseMemberListResponse(
            items=[self.to_member_read(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_course_or_404(self, db: Session, course_id: int) -> Course:
        course = course_repository.get_by_id(db, course_id)
        if course is None:
            raise NotFoundException("课程不存在")
        return course

    def can_view_course(self, db: Session, course: Course, current_user: User) -> bool:
        if current_user.role == UserRole.admin:
            return True
        if course.owner_id == current_user.id:
            return True
        member = course_repository.get_active_membership(db, course.id, current_user.id)
        return member is not None

    def can_manage_course(self, course: Course, current_user: User) -> bool:
        if current_user.role == UserRole.admin:
            return True
        return current_user.role == UserRole.teacher and course.owner_id == current_user.id

    def assert_can_manage_course(
        self,
        course: Course,
        current_user: User,
        *,
        allow_archived_admin_only: bool,
    ) -> None:
        if not self.can_manage_course(course, current_user):
            raise ForbiddenException("无权管理该课程")
        if allow_archived_admin_only and course.status == "archived" and current_user.role != UserRole.admin:
            raise BadRequestException("课程已归档，仅管理员可以继续修改")

    def current_course_role(self, db: Session, course: Course, current_user: User) -> str | None:
        if current_user.role == UserRole.admin:
            return "admin"
        if course.owner_id == current_user.id:
            return "teacher"
        member = course_repository.get_active_membership(db, course.id, current_user.id)
        return member.role if member is not None else None

    def to_course_read(self, db: Session, course: Course, current_user: User) -> CourseRead:
        teacher = course.owner
        teacher_name = None
        if teacher is not None:
            teacher_name = teacher.full_name or teacher.username
        return CourseRead(
            id=course.id,
            name=course.name,
            description=course.description,
            code=course.code,
            invite_code=course.code,
            teacher_id=course.owner_id,
            teacher_name=teacher_name,
            student_count=course_repository.count_students(db, course.id),
            current_user_role=self.current_course_role(db, course, current_user),
            status=course.status,
            created_at=course.created_at,
            updated_at=course.updated_at,
        )

    def to_member_read(self, member: CourseMember) -> CourseMemberRead:
        user = member.user
        profile = user.profile if member.role == "student" else None
        profile_data = dict(profile.profile_data or {}) if profile is not None else {}
        return CourseMemberRead(
            id=member.id,
            course_id=member.course_id,
            user_id=member.user_id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=member.role,
            status=member.status,
            profile={
                "knowledge_score": float(profile.knowledge_score),
                "practice_score": float(profile.practice_score),
                "innovation_score": float(profile.innovation_score),
                "exam_score": float(profile.exam_score),
                "efficiency_score": float(profile.efficiency_score),
                "quality_score": float(profile.quality_score),
                "learning_goal": profile.learning_goal,
                "current_course": profile_data.get("current_course"),
                "weaknesses": profile_data.get("weaknesses") or [],
                "mastered_topics": profile_data.get("mastered_topics") or [],
                "profile_summary": profile.profile_summary,
                "updated_at": profile.updated_at,
            } if profile is not None else None,
            joined_at=member.joined_at,
            created_at=member.created_at,
            updated_at=member.updated_at,
        )


course_service = CourseService()
