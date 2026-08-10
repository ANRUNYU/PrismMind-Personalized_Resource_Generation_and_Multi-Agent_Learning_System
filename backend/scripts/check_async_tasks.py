from __future__ import annotations

import importlib
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.tasks.celery_app import celery_app


EXPECTED_MODULES = [
    "app.tasks.generation_tasks",
    "app.tasks.knowledge_tasks",
    "app.tasks.resource_tasks",
]

EXPECTED_TASKS = [
    "app.tasks.generation_tasks.run_teacher_generation_task",
    "app.tasks.knowledge_tasks.run_knowledge_ingest_task",
    "app.tasks.resource_tasks.run_student_resource_generation_task",
]


def main() -> None:
    for module_name in EXPECTED_MODULES:
        importlib.import_module(module_name)

    registered = sorted(celery_app.tasks.keys())
    print(f"celery_app={celery_app.main}")
    for task_name in EXPECTED_TASKS:
        print(f"{task_name}: {'ok' if task_name in registered else 'missing'}")


if __name__ == "__main__":
    main()
