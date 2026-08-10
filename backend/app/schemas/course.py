from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CourseStatus = Literal["active", "archived"]
CourseMemberRole = Literal["teacher", "student"]
CourseMemberStatus = Literal["active", "removed"]


class CourseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160, description="课程名称")
    description: str | None = Field(default=None, max_length=2000, description="课程简介")


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160, description="课程名称")
    description: str | None = Field(default=None, max_length=2000, description="课程简介")


class CourseJoinRequest(BaseModel):
    code: str = Field(min_length=4, max_length=64, description="课程加入码")


class CourseRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    code: str
    invite_code: str
    teacher_id: int | None = None
    teacher_name: str | None = None
    student_count: int = 0
    current_user_role: CourseMemberRole | Literal["admin"] | None = None
    status: CourseStatus
    created_at: datetime
    updated_at: datetime


class CourseMemberProfileSnapshot(BaseModel):
    knowledge_score: float
    practice_score: float
    innovation_score: float
    exam_score: float
    efficiency_score: float
    quality_score: float
    learning_goal: str | None = None
    current_course: str | None = None
    weaknesses: list[str] = Field(default_factory=list)
    mastered_topics: list[str] = Field(default_factory=list)
    profile_summary: str | None = None
    updated_at: datetime


class CourseMemberRead(BaseModel):
    id: int
    course_id: int
    user_id: int
    username: str
    email: str
    full_name: str | None = None
    role: CourseMemberRole
    status: CourseMemberStatus
    profile: CourseMemberProfileSnapshot | None = None
    joined_at: datetime
    created_at: datetime
    updated_at: datetime


class CourseListResponse(BaseModel):
    items: list[CourseRead]
    total: int
    page: int
    page_size: int


class CourseMemberListResponse(BaseModel):
    items: list[CourseMemberRead]
    total: int
    page: int
    page_size: int


class CourseJoinResponse(BaseModel):
    course: CourseRead
    member: CourseMemberRead
    already_joined: bool = False
