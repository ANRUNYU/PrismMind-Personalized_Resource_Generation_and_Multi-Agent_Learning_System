from enum import StrEnum


class UserRole(StrEnum):
    teacher = "teacher"
    student = "student"
    admin = "admin"


class ArtifactType(StrEnum):
    training_plan = "training_plan"
    course_design = "course_design"
    teaching_design = "teaching_design"
    exercise = "exercise"
    paper = "paper"
    project_practice = "project_practice"
    learning_plan = "learning_plan"


class ArtifactStatus(StrEnum):
    draft = "draft"
    generating = "generating"
    completed = "completed"
    failed = "failed"


class LearningPathStatus(StrEnum):
    active = "active"
    completed = "completed"
    archived = "archived"


class TestStatus(StrEnum):
    created = "created"
    started = "started"
    submitted = "submitted"
    graded = "graded"


class PaperStatus(StrEnum):
    draft = "draft"
    published = "published"
    archived = "archived"


class FileParseStatus(StrEnum):
    pending = "pending"
    parsing = "parsing"
    parsed = "parsed"
    failed = "failed"
    deleted = "deleted"


class KnowledgeDocumentStatus(StrEnum):
    pending = "pending"
    parsing = "parsing"
    ingested = "ingested"
    failed = "failed"
    deleted = "deleted"


class TaskStatus(StrEnum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


class AgentRunStatus(StrEnum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"
