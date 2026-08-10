from __future__ import annotations

from typing import get_args

from app.models.enums import TaskStatus
from app.schemas.task import TaskTypeValue


def test_task_status_values():
    assert {item.value for item in TaskStatus} == {"pending", "running", "success", "failed"}


def test_task_type_values_include_async_workflows():
    values = set(get_args(TaskTypeValue))

    assert "teacher_course_design" in values
    assert "knowledge_ingest" in values
    assert "student_resource_generation" in values
    assert "student_resource_single_generation" in values
