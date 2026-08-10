from __future__ import annotations

import importlib

from app.tasks.celery_app import celery_app


def test_celery_app_imports_known_task_modules():
    modules = [
        "app.tasks.generation_tasks",
        "app.tasks.knowledge_tasks",
        "app.tasks.document_tasks",
        "app.tasks.resource_tasks",
    ]
    for module_name in modules:
        importlib.import_module(module_name)

    registered_tasks = set(celery_app.tasks.keys())
    assert "app.tasks.generation_tasks.run_teacher_generation_task" in registered_tasks
    assert "app.tasks.knowledge_tasks.run_knowledge_ingest_task" in registered_tasks
    assert "app.tasks.document_tasks.parse_file_asset_task" in registered_tasks
    assert "app.tasks.resource_tasks.run_student_resource_generation_task" in registered_tasks
    assert "app.tasks.resource_tasks.run_student_test_generation_task" in registered_tasks
