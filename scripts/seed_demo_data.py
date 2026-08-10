from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

from e2e_smoke_api import ApiClient, ApiError, Recorder, data_of, poll_task, register_or_login

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


DEFAULT_DEMO_TEACHER_PASSWORD = "DemoTeacher123!"
DEFAULT_DEMO_STUDENT_PASSWORD = "DemoStudent123!"
DEMO_PREFIX = "棱镜智教-PrismMind 个性化学习演示"
DEMO_COURSE_CODE = "DEMO-PRISMMIND-PERSONALIZED-LEARNING"
DEMO_COURSE_NAME = "FastAPI 后端开发"
DEMO_COURSE_DESCRIPTION = "面向计算机专业学生的后端开发实践课程，覆盖 FastAPI、REST API、数据库、认证与异步任务。"
DEMO_COURSE_ASSIGNMENT_TITLE = "FastAPI 路由与数据校验随堂测验"
DEMO_PERSONAL_EXERCISE_TITLE = "PrismMind 个人巩固练习：FastAPI 路由"
DEMO_ASSISTANT_SESSION_TITLE = "棱镜智教 FastAPI 课程知识库问答演示"
LEGACY_DEMO_ASSISTANT_SESSION_TITLES = {"PrismMind Demo Assistant Course QA"}
DEMO_ASSISTANT_QUESTIONS = [
    "请根据课程资料解释 FastAPI 路由函数和 Pydantic 数据校验的关系。",
    "如何设计一个带 JWT 鉴权的课程作业提交接口？",
    "Celery 在后端异步任务中有什么作用？",
]
DEMO_ASSISTANT_QUESTION = DEMO_ASSISTANT_QUESTIONS[0]


def first_matching(items: list[dict[str, Any]], key: str, value: str) -> dict[str, Any] | None:
    for item in items:
        if item.get(key) == value:
            return item
    return None


def first_demo_artifact(items: list[dict[str, Any]], artifact_type: str) -> dict[str, Any] | None:
    title_markers = [DEMO_PREFIX, "RAG 支持的个性化学习"]
    for item in items:
        title = str(item.get("title") or "")
        if item.get("artifact_type") == artifact_type and any(marker in title for marker in title_markers):
            return item
    return None


def ensure_demo_course(client: ApiClient, teacher_token: str, student_token: str) -> dict[str, Any]:
    """Create or reuse the stable demo course through the public course APIs."""
    courses = data_of(client.request("GET", "/courses/my?page=1&page_size=100", token=teacher_token))
    course = first_matching(courses.get("items", []), "name", DEMO_COURSE_NAME)
    if course is None:
        course = data_of(
            client.request(
                "POST",
                "/courses",
                token=teacher_token,
                payload={
                    "name": DEMO_COURSE_NAME,
                    "description": DEMO_COURSE_DESCRIPTION,
                },
            )
        )
    elif course.get("status") == "active" and course.get("description") != DEMO_COURSE_DESCRIPTION:
        course = data_of(
            client.request(
                "PATCH",
                f"/courses/{course['id']}",
                token=teacher_token,
                payload={
                    "name": DEMO_COURSE_NAME,
                    "description": DEMO_COURSE_DESCRIPTION,
                },
            )
        )

    join_result = data_of(
        client.request(
            "POST",
            "/courses/join",
            token=student_token,
            payload={"code": course["code"]},
        )
    )
    return join_result["course"]

def ensure_resource(
    client: ApiClient,
    token: str,
    topic: str,
    resource_type: str,
    course_id: int | None = None,
) -> dict[str, Any]:
    topic_query = quote(topic, safe="")
    existing = data_of(
        client.request(
            "GET",
            f"/student/resources?page=1&page_size=50&topic={topic_query}",
            token=token,
        )
    )
    match = first_matching(existing.get("items", []), "topic", topic)
    if match:
        return match
    generated = data_of(
        client.request(
            "POST",
            "/student/resources/generate-single",
            token=token,
            payload={
                "topic": topic,
                "course_id": course_id,
                "resource_type": resource_type,
                "difficulty": "normal",
                "knowledge_points": ["自适应学习", "AI 辅导"],
                "use_profile": True,
                "use_knowledge_base": False,
                "top_k": 3,
            },
        )
    )
    return generated["resources"][0]


def find_learning_path(client: ApiClient, token: str, title: str, topic: str) -> dict[str, Any] | None:
    topic_query = quote(topic, safe="")
    paths = data_of(
        client.request(
            "GET",
            f"/student/learning-paths?page=1&page_size=50&topic={topic_query}",
            token=token,
        )
    )
    for item in paths.get("items", []):
        if item.get("title") == title or item.get("topic") == topic:
            return item
    return None


def find_student_test(client: ApiClient, token: str, topic: str) -> dict[str, Any] | None:
    topic_query = quote(topic, safe="")
    tests = data_of(
        client.request("GET", f"/student/tests?page=1&page_size=50&topic={topic_query}", token=token)
    )
    for item in tests.get("items", []):
        if item.get("topic") == topic:
            return item
    return None


def find_course_assignment(client: ApiClient, token: str, course_id: int, title: str) -> dict[str, Any] | None:
    assignments = data_of(
        client.request(
            "GET",
            f"/courses/{course_id}/assignments?page=1&page_size=100",
            token=token,
        )
    )
    for item in assignments.get("items", []):
        if item.get("title") == title:
            return item
    return None


def find_student_exercise(client: ApiClient, token: str, title: str) -> dict[str, Any] | None:
    exercises = data_of(client.request("GET", "/student/exercises?page=1&page_size=100", token=token))
    for item in exercises.get("items", []):
        if item.get("title") == title and item.get("source") == "personal":
            return item
    return None


def ensure_demo_personal_exercise(client: ApiClient, recorder: Recorder, *, student_token: str) -> dict[str, Any]:
    exercise = find_student_exercise(client, student_token, DEMO_PERSONAL_EXERCISE_TITLE)
    if exercise:
        recorder.skip("student personal exercise", f"exists exercise_id={exercise['id']}")
        return exercise

    exercise = data_of(
        client.request(
            "POST",
            "/student/exercises",
            token=student_token,
            payload={
                "title": DEMO_PERSONAL_EXERCISE_TITLE,
                "description": "用于演示学生端“我的习题”新增、作答、反馈和复盘闭环。",
                "content": "请说明 FastAPI 路由函数如何结合依赖注入完成一次受保护的业务请求。",
                "answer": "FastAPI 路由 依赖注入 认证 业务服务",
                "explanation": "可从路由声明、Depends 依赖、当前用户校验和服务层调用四个角度组织答案。",
                "difficulty": "medium",
                "category": "个人习题",
                "tags": ["FastAPI", "路由", "依赖注入", "认证"],
                "total_score": 100,
            },
        )
    )
    recorder.pass_("student personal exercise", f"exercise_id={exercise['id']}")
    return exercise


def answers_from_answer_key(answer_key: dict[str, Any]) -> dict[str, Any]:
    answers: dict[str, Any] = {}
    for question_id, detail in answer_key.items():
        if isinstance(detail, dict):
            answers[question_id] = detail.get("answer")
    return answers


def quality_summary(analysis: dict[str, Any] | None) -> dict[str, Any] | None:
    if not analysis:
        return None
    coverage = analysis.get("coverage") or {}
    confidence = analysis.get("confidence") or {}
    return {
        "coverage_rate": coverage.get("coverage_rate"),
        "confidence_score": confidence.get("score"),
        "confidence_level": confidence.get("level"),
    }


def ensure_demo_course_assignment(
    client: ApiClient,
    recorder: Recorder,
    *,
    teacher_token: str,
    student_token: str,
    course_id: int,
    document_id: int | None,
) -> dict[str, Any]:
    assignment = find_course_assignment(client, teacher_token, course_id, DEMO_COURSE_ASSIGNMENT_TITLE)
    if assignment is None or assignment.get("status") not in {"published", "closed"}:
        payload = {
            "title": DEMO_COURSE_ASSIGNMENT_TITLE,
            "description": "稳定演示测验：覆盖 FastAPI 路由、Pydantic 数据校验、SQLAlchemy 与 Celery 基础概念。",
            "assignment_type": "quiz",
            "topic": "FastAPI 路由与数据校验",
            "difficulty": "medium",
            "question_count": 4,
            "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
            "knowledge_document_ids": [document_id] if document_id else [],
            "generation_mode": "ai",
            "status": "published",
        }
        assignment = data_of(
            client.request(
                "POST",
                f"/courses/{course_id}/assignments",
                token=teacher_token,
                payload=payload,
            )
        )
        recorder.pass_("course assignment publish", f"assignment_id={assignment['id']}")
    else:
        recorder.skip("course assignment publish", f"exists assignment_id={assignment['id']}")

    assignment_id = int(assignment["id"])
    detail = data_of(
        client.request(
            "GET",
            f"/courses/{course_id}/assignments/{assignment_id}",
            token=teacher_token,
        )
    )
    try:
        my_submission = data_of(
            client.request(
                "GET",
                f"/courses/{course_id}/assignments/{assignment_id}/submissions/me",
                token=student_token,
            )
        )
    except ApiError as exc:
        if exc.status != 404:
            raise
        my_submission = None

    if my_submission and my_submission.get("status") in {"submitted", "graded"}:
        recorder.skip("course assignment submission", f"exists submission_id={my_submission['id']}")
        return {
            "assignment": detail,
            "submission": my_submission,
        }

    client.request(
        "POST",
        f"/courses/{course_id}/assignments/{assignment_id}/start",
        token=student_token,
    )
    submitted = data_of(
        client.request(
            "POST",
            f"/courses/{course_id}/assignments/{assignment_id}/submit",
            token=student_token,
            payload={"answers": answers_from_answer_key(detail.get("answer_key") or {})},
        )
    )
    recorder.pass_(
        "course assignment submission",
        f"assignment_id={assignment_id} submission_id={submitted['submission_id']} score={submitted['score']}",
    )
    return {
        "assignment": detail,
        "submission": submitted,
    }


def find_assessment(client: ApiClient, token: str, topic: str) -> dict[str, Any] | None:
    topic_query = quote(topic, safe="")
    assessments = data_of(
        client.request(
            "GET",
            f"/student/assessments?page=1&page_size=50&topic={topic_query}",
            token=token,
        )
    )
    for item in assessments.get("items", []):
        if item.get("topic") == topic:
            return item
    return None


def find_tutoring_session(client: ApiClient, token: str, question: str) -> dict[str, Any] | None:
    sessions = data_of(client.request("GET", "/student/tutoring/sessions?page=1&page_size=50", token=token))
    for item in sessions.get("items", []):
        if item.get("user_question") == question or item.get("topic") == question:
            return item
    return None


def find_assistant_session(client: ApiClient, token: str, title: str, course_id: int) -> dict[str, Any] | None:
    sessions = data_of(
        client.request(
            "GET",
            f"/assistant/sessions?page=1&page_size=100&course_id={course_id}",
            token=token,
        )
    )
    accepted_titles = {title, *LEGACY_DEMO_ASSISTANT_SESSION_TITLES}
    for item in sessions.get("items", []):
        if item.get("title") in accepted_titles:
            return item
    return None


def ensure_demo_assistant_session(
    client: ApiClient,
    recorder: Recorder,
    *,
    token: str,
    course_id: int,
    document_id: int | None,
) -> dict[str, Any]:
    existing = find_assistant_session(client, token, DEMO_ASSISTANT_SESSION_TITLE, course_id)
    if existing:
        detail = data_of(client.request("GET", f"/assistant/sessions/{existing['id']}", token=token))
        has_demo_question = any(
            item.get("role") == "user" and item.get("content") == DEMO_ASSISTANT_QUESTION
            for item in detail.get("messages", [])
        )
        if not has_demo_question:
            answer = data_of(
                client.request(
                    "POST",
                    f"/assistant/sessions/{existing['id']}/messages",
                    token=token,
                    payload={
                        "message": DEMO_ASSISTANT_QUESTION,
                        "course_id": course_id,
                        "use_course_knowledge": True,
                        "knowledge_document_ids": [document_id] if document_id else [],
                        "answer_style": "normal",
                        "top_k": 3,
                    },
                )
            )
            recorder.pass_(
                "assistant course QA",
                f"session_id={existing['id']} refreshed references={len(answer.get('references', []))}",
            )
            return {
                "session_id": existing["id"],
                "answer_summary": str(answer.get("answer") or "")[:160],
            }
        assistant_messages = [item for item in detail.get("messages", []) if item.get("role") == "assistant"]
        answer = assistant_messages[-1]["content"] if assistant_messages else ""
        recorder.skip("assistant course QA", f"exists session_id={existing['id']}")
        return {
            "session_id": existing["id"],
            "answer_summary": answer[:160],
        }

    session = data_of(
        client.request(
            "POST",
            "/assistant/sessions",
            token=token,
            payload={
                "course_id": course_id,
                "title": DEMO_ASSISTANT_SESSION_TITLE,
                "mode": "course_qa",
            },
        )
    )
    answer = data_of(
        client.request(
            "POST",
            f"/assistant/sessions/{session['id']}/messages",
            token=token,
            payload={
                "message": DEMO_ASSISTANT_QUESTION,
                "course_id": course_id,
                "use_course_knowledge": True,
                "knowledge_document_ids": [document_id] if document_id else [],
                "answer_style": "normal",
                "top_k": 3,
            },
        )
    )
    recorder.pass_(
        "assistant course QA",
        f"session_id={session['id']} references={len(answer.get('references', []))}",
    )
    return {
        "session_id": session["id"],
        "answer_summary": str(answer.get("answer") or "")[:160],
    }


def run_seed(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_base_url)
    recorder = Recorder()
    ids: dict[str, Any] = {}

    teacher_username = args.teacher_username or os.getenv("DEMO_TEACHER_USERNAME", "demo_teacher")
    teacher_password = args.teacher_password or os.getenv("DEMO_TEACHER_PASSWORD", DEFAULT_DEMO_TEACHER_PASSWORD)
    student_username = args.student_username or os.getenv("DEMO_STUDENT_USERNAME", "demo_student")
    student_password = args.student_password or os.getenv("DEMO_STUDENT_PASSWORD", DEFAULT_DEMO_STUDENT_PASSWORD)

    try:
        data_of(client.request("GET", "/health"))
        recorder.pass_("health")

        teacher_token, _ = register_or_login(
            client,
            username=teacher_username,
            email=f"{teacher_username}@example.com",
            password=teacher_password,
            role="teacher",
            full_name="Demo Teacher",
            recorder=recorder,
        )
        student_token, _ = register_or_login(
            client,
            username=student_username,
            email=f"{student_username}@example.com",
            password=student_password,
            role="student",
            full_name="Demo Student",
            recorder=recorder,
        )
        course = ensure_demo_course(client, teacher_token, student_token)
        course_id = course["id"]
        ids["course_id"] = course_id
        ids["course_code"] = course["code"]
        recorder.pass_("demo course", f"course_id={course_id} course_code={course['code']}")

        course_payload = {
            "course_name": f"{DEMO_PREFIX}课程",
            "target_students": "高校人工智能课程学习者",
            "total_hours": 32,
            "course_objectives": "使用棱镜智教-PrismMind 演示学习画像、RAG 辅导、个性化资源、学习路径、测试和评估闭环。",
            "key_topics": ["学习画像", "RAG 辅导", "个性化学习资源"],
            "additional_requirements": "输出适合答辩演示的 Markdown 内容。",
            "use_knowledge_base": False,
            "top_k": 3,
        }
        artifacts = data_of(client.request("GET", "/teacher/generated-artifacts?page=1&page_size=50", token=teacher_token))
        existing_course = first_demo_artifact(artifacts.get("items", []), "course_design")
        if existing_course:
            ids["course_artifact_id"] = existing_course["id"]
            course_detail = data_of(client.request("GET", f"/teacher/generated-artifacts/{existing_course['id']}", token=teacher_token))
            ids["course_artifact_quality"] = quality_summary(course_detail.get("quality_analysis"))
            recorder.skip("teacher course design", f"exists artifact_id={existing_course['id']}")
        else:
            course = data_of(client.request("POST", "/teacher/course-designs/generate", token=teacher_token, payload=course_payload))
            ids["course_artifact_id"] = course["artifact_id"]
            ids["course_artifact_quality"] = quality_summary(course.get("quality_analysis"))
            recorder.pass_("teacher course design", f"artifact_id={course['artifact_id']}")

        teaching_payload = {
            "course_name": f"{DEMO_PREFIX}课程",
            "lesson_topic": "RAG 支持的个性化学习",
            "target_students": "高校人工智能课程学习者",
            "teaching_objectives": "讲清学习画像、RAG 辅导、个性化资源、学习路径、测试和评估如何形成闭环。",
            "key_points": "画像驱动的自适应学习与知识库检索增强。",
            "difficult_points": "清晰解释异步任务状态和 RAG 引用来源。",
            "teaching_hours": 2,
            "teaching_methods": ["案例教学", "系统演示"],
            "additional_requirements": "演示流程要便于评审快速理解。",
            "use_knowledge_base": False,
            "top_k": 3,
        }
        existing_teaching = first_demo_artifact(artifacts.get("items", []), "teaching_design")
        if existing_teaching:
            ids["teaching_artifact_id"] = existing_teaching["id"]
            recorder.skip("teacher teaching design", f"exists artifact_id={existing_teaching['id']}")
        else:
            teaching = data_of(client.request("POST", "/teacher/teaching-designs/generate", token=teacher_token, payload=teaching_payload))
            ids["teaching_artifact_id"] = teaching["artifact_id"]
            recorder.pass_("teacher teaching design", f"artifact_id={teaching['artifact_id']}")

        exercise_payload = {
            "course_name": f"{DEMO_PREFIX}课程",
            "knowledge_points": ["学习画像", "RAG 辅导", "异步任务"],
            "difficulty": "normal",
            "question_types": ["single_choice", "short_answer"],
            "question_count": 4,
            "additional_requirements": "生成适合演示的中文练习题。",
            "use_knowledge_base": False,
            "top_k": 3,
        }
        existing_exercises = first_demo_artifact(artifacts.get("items", []), "exercise")
        if existing_exercises:
            ids["exercise_artifact_id"] = existing_exercises["id"]
            recorder.skip("teacher exercises", f"exists artifact_id={existing_exercises['id']}")
        else:
            exercises = data_of(client.request("POST", "/teacher/exercises/generate", token=teacher_token, payload=exercise_payload))
            ids["exercise_artifact_id"] = exercises["artifact_id"]
            recorder.pass_("teacher exercises", f"artifact_id={exercises['artifact_id']}")

        if not args.skip_async:
            task = data_of(client.request("POST", "/teacher/course-designs/generate-async", token=teacher_token, payload=course_payload))
            ids["teacher_async_task_id"] = task["task_id"]
            recorder.pass_("teacher async task submit", f"task_id={task['task_id']}")
            poll_task(
                client,
                recorder,
                task_id=task["task_id"],
                token=teacher_token,
                step="teacher async task execute",
                timeout_seconds=args.task_timeout,
            )
        else:
            recorder.skip("teacher async task", "--skip-async")

        doc_title = f"{DEMO_PREFIX} FastAPI 课程知识库"
        documents = data_of(
            client.request(
                "GET",
                f"/courses/{course_id}/knowledge/documents?page=1&page_size=100",
                token=teacher_token,
            )
        )
        existing_doc = first_matching(documents.get("items", []), "title", doc_title)
        if existing_doc:
            ids["course_knowledge_document_id"] = existing_doc["id"]
            ids["course_knowledge_chunks"] = existing_doc.get("chunk_count", 0)
            recorder.skip("course knowledge document", f"exists document_id={existing_doc['id']}")
        else:
            with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tmp:
                tmp.write(
                    "# FastAPI 后端开发课程资料\n\n"
                    "## FastAPI 路由\n"
                    "FastAPI 路由函数负责声明 HTTP 方法、访问路径、依赖注入、响应模型和状态码。"
                    "在棱镜智教-PrismMind 中，课程、作业、测试、知识库和智能助手接口均统一挂载在 /api/v1 下，"
                    "便于前端按照模块调用，也便于 OpenAPI 文档自动生成。\n\n"
                    "## Pydantic 数据校验\n"
                    "Pydantic schema 用来描述请求体和响应体结构。请求进入业务服务前，Pydantic 会先校验字段类型、"
                    "必填项、枚举值和范围约束；校验失败时接口返回清晰的参数错误提示。"
                    "因此，路由函数更关注权限和流程编排，schema 负责把不合法输入挡在业务逻辑之外。\n\n"
                    "## SQLAlchemy ORM 与 PostgreSQL\n"
                    "SQLAlchemy 2.0 ORM 将 Python 模型映射到 PostgreSQL 表和关系。"
                    "课程、成员、知识库文档、作业提交、测试结果和学习评估都通过仓储和服务层读写数据库，"
                    "并由 Alembic 管理结构变更。\n\n"
                    "## JWT 认证与角色权限\n"
                    "JWT 用于保护 /api/v1 接口，并携带当前用户身份。"
                    "教师可以管理课程资料、发布作业和查看提交；学生可以加入课程、完成测试和发起问答；"
                    "管理员可以查看用户管理和系统状态。课程作业提交接口通常需要先校验 token，再校验课程成员关系，"
                    "最后写入提交记录并触发评分或质量分析。\n\n"
                    "## Celery 异步任务\n"
                    "Celery 用于执行耗时任务，例如知识库入库、教学资源生成和学生学习资源生成。"
                    "接口先创建任务并返回任务状态，前端通过任务中心轮询 pending、running、success、failed 等状态，"
                    "这样可以避免长请求阻塞页面，也方便展示进度和失败原因。\n\n"
                    "## 棱镜智教-PrismMind 演示闭环\n"
                    "系统将课程知识库、智能问答、教师出题、学生作答、质量分析、学习画像、个性化资源、学习路径和学习评估串联起来。"
                    "演示时可以围绕 FastAPI 后端开发课程，展示从教师上传资料到学生基于课程资料学习与评估的完整闭环。\n"
                )
                path = Path(tmp.name)
            upload = data_of(
                client.upload_file(
                    path,
                    teacher_token,
                    asset_type="course_material",
                    upload_path=f"/courses/{course_id}/files/upload",
                )
            )
            ids["course_knowledge_file_id"] = upload["id"]
            doc = data_of(
                client.request(
                    "POST",
                    f"/courses/{course_id}/knowledge/documents",
                    token=teacher_token,
                    payload={
                        "file_id": upload["id"],
                        "title": doc_title,
                        "description": "棱镜智教-PrismMind 稳定演示知识库：覆盖 FastAPI 路由、Pydantic、SQLAlchemy、JWT 与 Celery。",
                    },
                )
            )
            ids["course_knowledge_document_id"] = doc["id"]
            ingest = data_of(
                client.request(
                    "POST",
                    f"/courses/{course_id}/knowledge/documents/{doc['id']}/ingest",
                    token=teacher_token,
                )
            )
            ids["course_knowledge_chunks"] = ingest["chunk_count"]
            recorder.pass_("course knowledge document ingest", f"document_id={doc['id']} chunks={ingest['chunk_count']}")

        if ids.get("course_knowledge_document_id") and int(ids.get("course_knowledge_chunks") or 0) <= 0:
            ingest = data_of(
                client.request(
                    "POST",
                    f"/courses/{course_id}/knowledge/documents/{ids['course_knowledge_document_id']}/ingest",
                    token=teacher_token,
                )
            )
            ids["course_knowledge_chunks"] = ingest["chunk_count"]
            recorder.pass_(
                "course knowledge document ingest",
                f"document_id={ids['course_knowledge_document_id']} chunks={ingest['chunk_count']}",
            )

        retrieve_check = data_of(
            client.request(
                "POST",
                f"/courses/{course_id}/knowledge/retrieve",
                token=student_token,
                payload={"query": "FastAPI 路由函数如何配合 Pydantic 校验和 Celery 异步任务？", "top_k": 3},
            )
        )
        ids["course_knowledge_retrieve_results"] = len(retrieve_check.get("results", []))
        recorder.pass_("course knowledge retrieve", f"results={ids['course_knowledge_retrieve_results']}")

        assistant_demo = ensure_demo_assistant_session(
            client,
            recorder,
            token=student_token,
            course_id=course_id,
            document_id=ids.get("course_knowledge_document_id"),
        )
        ids["assistant_session_id"] = assistant_demo["session_id"]
        ids["assistant_answer_summary"] = assistant_demo["answer_summary"]

        course_assignment = ensure_demo_course_assignment(
            client,
            recorder,
            teacher_token=teacher_token,
            student_token=student_token,
            course_id=course_id,
            document_id=ids.get("course_knowledge_document_id"),
        )
        ids["course_assignment_id"] = course_assignment["assignment"]["id"]
        ids["course_assignment_title"] = course_assignment["assignment"]["title"]
        ids["course_assignment_quality"] = quality_summary(course_assignment["assignment"].get("quality_analysis"))
        submission = course_assignment["submission"]
        ids["course_submission_id"] = submission.get("submission_id") or submission.get("id")
        ids["course_submission_score"] = submission.get("score")
        ids["course_submission_quality"] = quality_summary(submission.get("quality_analysis"))

        personal_exercise = ensure_demo_personal_exercise(client, recorder, student_token=student_token)
        ids["personal_exercise_id"] = personal_exercise["id"]
        ids["personal_exercise_title"] = personal_exercise["title"]

        try:
            profile = data_of(client.request("GET", "/student/profile/me", token=student_token))
            recorder.skip("student profile", f"exists profile_id={profile['id']}")
        except ApiError as exc:
            if exc.status != 404:
                raise
            profile = data_of(
                client.request(
                    "POST",
                    "/student/profile",
                    token=student_token,
                    payload={
                        "major": "计算机科学与技术",
                        "grade": "大二",
                        "learning_goal": "使用棱镜智教-PrismMind 准备人工智能课程项目展示",
                        "current_level": "具备基础 Python 能力，但机器学习理论掌握不够稳定",
                        "preferred_style": "项目实践和可视化案例",
                        "available_time_per_week": 8,
                        "exam_pressure": "medium",
                        "practice_experience": "做过简单 Web 项目",
                        "weaknesses": ["数学基础", "模型原理"],
                        "interests": ["AI 应用", "数据分析", "学习系统"],
                    },
                )
            )
            recorder.pass_("student profile", f"profile_id={profile['id']}")
        ids["profile_id"] = profile["id"]

        tutoring_question = "棱镜智教-PrismMind 如何实现个性化学习？"
        existing_tutoring = find_tutoring_session(client, student_token, tutoring_question)
        if existing_tutoring:
            tutoring = {"session_id": existing_tutoring["id"]}
            recorder.skip("student tutoring", f"exists session_id={existing_tutoring['id']}")
        else:
            tutoring = data_of(
                client.request(
                    "POST",
                    "/student/tutoring/ask",
                    token=student_token,
                    payload={
                        "question": tutoring_question,
                        "use_knowledge_base": False,
                        "top_k": 3,
                        "response_format": "markdown",
                        "difficulty": "normal",
                    },
                )
            )
            recorder.pass_("student tutoring", f"session_id={tutoring['session_id']}")
        ids["tutoring_session_id"] = tutoring["session_id"]

        resource_one = ensure_resource(client, student_token, f"{DEMO_PREFIX}资源 1", "concept_explanation", course_id)
        resource_two = ensure_resource(client, student_token, f"{DEMO_PREFIX}资源 2", "practice_task", course_id)
        ids["resource_ids"] = [resource_one["id"], resource_two["id"]]
        recorder.pass_("student resources", f"ids={ids['resource_ids']}")

        if not args.skip_async:
            task = data_of(
                client.request(
                    "POST",
                    "/student/resources/generate-async",
                    token=student_token,
                    payload={
                        "topic": f"{DEMO_PREFIX}异步学习资源",
                        "course_id": course_id,
                        "resource_types": ["summary_notes"],
                        "difficulty": "normal",
                        "knowledge_points": ["异步任务", "个性化学习"],
                        "use_profile": True,
                        "use_knowledge_base": False,
                        "top_k": 3,
                    },
                )
            )
            ids["student_resource_task_id"] = task["task_id"]
            recorder.pass_("student resource async submit", f"task_id={task['task_id']}")
            poll_task(
                client,
                recorder,
                task_id=task["task_id"],
                token=student_token,
                step="student resource async execute",
                timeout_seconds=args.task_timeout,
            )
        else:
            recorder.skip("student resource async", "--skip-async")

        path_title = f"{DEMO_PREFIX}学习路径"
        path_topic = f"{DEMO_PREFIX}路径主题"
        existing_path = find_learning_path(client, student_token, path_title, path_topic)
        if existing_path:
            path = existing_path
            recorder.skip("student learning path", f"exists path_id={path['id']}")
        else:
            path = data_of(
                client.request(
                    "POST",
                    "/student/learning-paths",
                    token=student_token,
                    payload={
                        "title": path_title,
                        "topic": path_topic,
                        "course_id": course_id,
                        "target_goal": "理解棱镜智教-PrismMind 个性化学习闭环，并能够完成答辩演示。",
                        "knowledge_points": ["学习画像", "RAG 辅导", "学习资源", "在线测试", "学习评估"],
                        "duration_days": 7,
                        "daily_minutes": 45,
                        "difficulty": "normal",
                        "resource_ids": ids["resource_ids"],
                        "use_profile": True,
                        "use_existing_resources": True,
                    },
                )
            )
            recorder.pass_("student learning path", f"path_id={path['id']}")
        ids["learning_path_id"] = path["id"]

        test_topic = f"{DEMO_PREFIX}在线测试"
        existing_test = find_student_test(client, student_token, test_topic)
        if existing_test:
            ids["test_id"] = existing_test["id"]
            ids["test_score"] = existing_test.get("score")
            test_detail = data_of(client.request("GET", f"/student/tests/{existing_test['id']}", token=student_token))
            ids["test_quality"] = quality_summary(test_detail.get("quality_analysis"))
            recorder.skip("student submitted test", f"exists test_id={existing_test['id']}")
        else:
            test = data_of(
                client.request(
                    "POST",
                    "/student/tests/generate",
                    token=student_token,
                    payload={
                        "topic": test_topic,
                        "difficulty": "medium",
                        "question_count": 4,
                        "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
                        "knowledge_points": ["学习画像", "RAG 辅导", "异步任务"],
                        "use_question_bank": True,
                    },
                )
            )
            ids["test_id"] = test["test_id"]
            detail = data_of(client.request("GET", f"/student/tests/{test['test_id']}", token=student_token))
            client.request("POST", f"/student/tests/{test['test_id']}/start", token=student_token)
            answers: dict[str, Any] = {}
            for question in detail.get("questions", []):
                if question["question_type"] == "multiple_choice":
                    answers[question["id"]] = ["A"]
                elif question["question_type"] == "true_false":
                    answers[question["id"]] = True
                elif question["question_type"] == "short_answer":
                    answers[question["id"]] = "学习画像 RAG 辅导 异步任务 学习评估"
                else:
                    answers[question["id"]] = "A"
            submitted = data_of(
                client.request(
                    "POST",
                    f"/student/tests/{test['test_id']}/submit",
                    token=student_token,
                    payload={"user_answers": answers},
                )
            )
            ids["test_score"] = submitted["score"]
            ids["auto_assessment_id"] = submitted.get("assessment_id")
            ids["test_quality"] = quality_summary(submitted.get("quality_analysis"))
            recorder.pass_("student submitted test", f"test_id={test['test_id']} score={submitted['score']}")

        existing_assessment = find_assessment(client, student_token, DEMO_PREFIX)
        if existing_assessment:
            ids["manual_assessment_id"] = existing_assessment["id"]
            ids["manual_assessment_quality"] = quality_summary(existing_assessment.get("quality_analysis"))
            recorder.skip("student manual assessment", f"exists assessment_id={existing_assessment['id']}")
        else:
            assessment = data_of(
                client.request(
                    "POST",
                    "/student/assessments",
                    token=student_token,
                    payload={
                        "assessment_type": "comprehensive",
                        "topic": DEMO_PREFIX,
                        "score": 86,
                        "correct_topics": ["学习画像", "RAG 辅导"],
                        "incorrect_topics": ["异步任务监控"],
                        "learning_evidence": {"self_reflection": "演示学生需要继续复习异步任务监控。"},
                    },
                )
            )
            ids["manual_assessment_id"] = assessment["id"]
            ids["manual_assessment_quality"] = quality_summary(assessment.get("quality_analysis"))
            recorder.pass_("student manual assessment", f"assessment_id={assessment['id']}")

        assessment_detail = data_of(
            client.request(
                "GET",
                f"/student/assessments/{ids['manual_assessment_id']}",
                token=student_token,
            )
        )
        ids["manual_assessment_level"] = assessment_detail.get("level")
        recorder.pass_("student manual assessment detail", f"level={ids['manual_assessment_level']}")
        assessment_submit = data_of(
            client.request(
                "POST",
                f"/student/assessments/{ids['manual_assessment_id']}/submit",
                token=student_token,
                payload={
                    "answers": {
                        "strengths": ["学习画像", "RAG 辅导"],
                        "weak_topics": ["异步任务监控"],
                    },
                    "reflection": "演示学生已完成学习评估反馈提交。",
                    "self_rating": 87,
                    "feedback": "建议继续加强异步任务状态追踪。",
                },
            )
        )
        ids["manual_assessment_submit_score"] = assessment_submit.get("score")
        ids["manual_assessment_submit_quality"] = quality_summary(assessment_submit.get("quality_analysis"))
        recorder.pass_("student manual assessment submit", f"score={ids['manual_assessment_submit_score']}")

        dashboard = data_of(client.request("GET", "/student/dashboard/summary", token=student_token))
        ids["student_dashboard_summary"] = {
            "courses": dashboard.get("courses", {}).get("total"),
            "resources": dashboard.get("resources", {}).get("total"),
            "assessments": dashboard.get("assessments", {}).get("total"),
            "tutoring_sessions": dashboard.get("tutoring", {}).get("sessions"),
        }
        recorder.pass_("student dashboard summary", json.dumps(ids["student_dashboard_summary"], ensure_ascii=False))

    except Exception as exc:
        recorder.fail("unexpected exception", f"{exc.__class__.__name__}: {exc}")

    summary = recorder.summary()
    print("\n=== Demo Data Summary ===")
    print(
        json.dumps(
            {
                "accounts": {
                    "teacher": teacher_username,
                    "student": student_username,
                    "passwords": "优先使用 DEMO_*_PASSWORD 环境变量；本地演示可使用脚本内默认值。",
                },
                "ids": ids,
                "demo_questions": DEMO_ASSISTANT_QUESTIONS,
                "routes": [
                    "/teacher/dashboard",
                    "/teacher/courses",
                    "/teacher/artifacts",
                    "/teacher/knowledge",
                    "/assistant",
                    "/student/courses",
                    "/student/exercises",
                    "/student/profile",
                    "/student/tutoring",
                    "/student/resources",
                    "/student/learning-paths",
                    "/student/tests",
                    "/student/assessments",
                    "/tasks",
                ],
                "summary": summary,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if summary["failed"] else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed stable PrismMind demo data through HTTP APIs.")
    parser.add_argument("--api-base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000/api/v1"))
    parser.add_argument("--teacher-username", default=os.getenv("DEMO_TEACHER_USERNAME", "demo_teacher"))
    parser.add_argument("--teacher-password", default=os.getenv("DEMO_TEACHER_PASSWORD", DEFAULT_DEMO_TEACHER_PASSWORD))
    parser.add_argument("--student-username", default=os.getenv("DEMO_STUDENT_USERNAME", "demo_student"))
    parser.add_argument("--student-password", default=os.getenv("DEMO_STUDENT_PASSWORD", DEFAULT_DEMO_STUDENT_PASSWORD))
    parser.add_argument("--skip-async", action="store_true", help="Skip Celery-backed demo task creation.")
    parser.add_argument("--task-timeout", type=int, default=60, help="Seconds to wait for async demo tasks.")
    return parser


def main() -> int:
    return run_seed(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
