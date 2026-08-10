from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib import error, parse, request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


DEFAULT_STUDENT_PASSWORD = "Student123!"
DEFAULT_TEACHER_PASSWORD = "Teacher123!"


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body[:300]}")


class ApiClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        payload: dict[str, Any] | None = None,
        timeout: int = 120,
    ) -> Any:
        url = self.base_url + path
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8")
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise ApiError(exc.code, body) from exc
        except error.URLError as exc:
            raise RuntimeError(f"Network error calling {url}: {exc.reason}") from exc
        if not text:
            return None
        return json.loads(text)

    def raw_get(self, path: str, timeout: int = 60) -> tuple[int, str]:
        url = self.base_url.rsplit("/api/v1", 1)[0] + path if path.startswith("/") else path
        req = request.Request(url, method="GET")
        try:
            with request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8", errors="replace")
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise ApiError(exc.code, body) from exc

    def upload_file(
        self,
        path: Path,
        token: str,
        *,
        asset_type: str = "knowledge_source",
        upload_path: str = "/files/upload",
    ) -> Any:
        boundary = f"----PrismMindSmoke{uuid.uuid4().hex}"
        file_bytes = path.read_bytes()
        parts: list[bytes] = []
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="asset_type"\r\n\r\n'
                f"{asset_type}\r\n"
            ).encode("utf-8")
        )
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
                f"Content-Type: text/markdown\r\n\r\n"
            ).encode("utf-8")
        )
        parts.append(file_bytes)
        parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        }
        req = request.Request(
            self.base_url + upload_path,
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=120) as resp:
                text = resp.read().decode("utf-8")
        except error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            raise ApiError(exc.code, body_text) from exc
        return json.loads(text)


@dataclass
class StepResult:
    step: str
    status: str
    detail: str = ""


@dataclass
class Recorder:
    results: list[StepResult] = field(default_factory=list)

    def add(self, step: str, status: str, detail: str = "") -> None:
        self.results.append(StepResult(step=step, status=status, detail=detail))
        print(f"[{status}] {step} {detail}".rstrip())

    def pass_(self, step: str, detail: str = "") -> None:
        self.add(step, "PASS", detail)

    def fail(self, step: str, detail: str = "") -> None:
        self.add(step, "FAIL", detail)

    def skip(self, step: str, detail: str = "") -> None:
        self.add(step, "SKIP", detail)

    def summary(self) -> dict[str, int]:
        return {
            "passed": sum(1 for item in self.results if item.status == "PASS"),
            "failed": sum(1 for item in self.results if item.status == "FAIL"),
            "skipped": sum(1 for item in self.results if item.status == "SKIP"),
        }


def data_of(resp: Any) -> Any:
    if isinstance(resp, dict) and "data" in resp:
        return resp["data"]
    return resp


def quality_summary(analysis: dict[str, Any] | None) -> str:
    if not analysis:
        raise AssertionError("quality_analysis is missing")
    coverage = analysis.get("coverage") or {}
    confidence = analysis.get("confidence") or {}
    coverage_rate = coverage.get("coverage_rate")
    confidence_score = confidence.get("score")
    if not isinstance(coverage_rate, (int, float)) or not 0 <= float(coverage_rate) <= 1:
        raise AssertionError("quality_analysis.coverage.coverage_rate must be between 0 and 1")
    if not isinstance(confidence_score, (int, float)) or not 0 <= float(confidence_score) <= 1:
        raise AssertionError("quality_analysis.confidence.score must be between 0 and 1")
    return f"coverage={coverage_rate} confidence={confidence_score}"


def register_or_login(
    client: ApiClient,
    *,
    username: str,
    email: str,
    password: str,
    role: str,
    full_name: str,
    recorder: Recorder,
) -> tuple[str, dict[str, Any]]:
    try:
        client.request(
            "POST",
            "/auth/register",
            payload={
                "username": username,
                "email": email,
                "password": password,
                "role": role,
                "full_name": full_name,
            },
        )
        recorder.pass_(f"register {role}", username)
    except ApiError as exc:
        if exc.status == 409:
            recorder.skip(f"register {role}", f"{username} already exists; trying login")
        else:
            raise
    login = client.request("POST", "/auth/login", payload={"username": username, "password": password})
    login_data = data_of(login)
    recorder.pass_(f"login {role}", f"user={login_data['user']['username']}")
    return login_data["access_token"], login_data["user"]


def expect_http_error(
    client: ApiClient,
    recorder: Recorder,
    *,
    step: str,
    method: str,
    path: str,
    expected_status: int,
    token: str,
    payload: dict[str, Any] | None = None,
) -> None:
    try:
        client.request(method, path, token=token, payload=payload)
    except ApiError as exc:
        if exc.status == expected_status:
            recorder.pass_(step, f"HTTP {exc.status}")
        else:
            recorder.fail(step, f"expected HTTP {expected_status}, got HTTP {exc.status}")
        return
    recorder.fail(step, f"expected HTTP {expected_status}, request succeeded")


def poll_task(
    client: ApiClient,
    recorder: Recorder,
    *,
    task_id: int,
    token: str,
    step: str,
    timeout_seconds: int,
) -> dict[str, Any] | None:
    deadline = time.time() + timeout_seconds
    last_status = "unknown"
    while time.time() < deadline:
        task = data_of(client.request("GET", f"/tasks/{task_id}", token=token))
        last_status = str(task.get("status"))
        if last_status in {"success", "failed"}:
            if last_status == "success":
                recorder.pass_(step, f"task_id={task_id} status=success progress={task.get('progress')}")
            else:
                recorder.fail(step, f"task_id={task_id} failed: {task.get('error_message')}")
            return task
        time.sleep(2)
    recorder.fail(step, f"task_id={task_id} timed out; last_status={last_status}")
    return None


def maybe_async(
    *,
    skip_async: bool,
    recorder: Recorder,
    skipped_step: str,
) -> bool:
    if skip_async:
        recorder.skip(skipped_step, "--skip-async")
        return False
    return True


def run_smoke(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_base_url)
    recorder = Recorder()
    ids: dict[str, Any] = {}
    suffix = str(int(time.time()))

    student_username = args.student_username or os.getenv("SMOKE_STUDENT_USERNAME") or f"smoke_student_{suffix}"
    teacher_username = args.teacher_username or os.getenv("SMOKE_TEACHER_USERNAME") or f"smoke_teacher_{suffix}"
    student_password = args.student_password or os.getenv("SMOKE_STUDENT_PASSWORD") or DEFAULT_STUDENT_PASSWORD
    teacher_password = args.teacher_password or os.getenv("SMOKE_TEACHER_PASSWORD") or DEFAULT_TEACHER_PASSWORD

    try:
        health = data_of(client.request("GET", "/health"))
        recorder.pass_("health", f"status={health.get('status')}")
        status, _ = client.raw_get("/openapi.json")
        recorder.pass_("openapi", f"HTTP {status}")

        student_token, _ = register_or_login(
            client,
            username=student_username,
            email=f"{student_username}@example.com",
            password=student_password,
            role="student",
            full_name="Smoke Student",
            recorder=recorder,
        )
        teacher_token, _ = register_or_login(
            client,
            username=teacher_username,
            email=f"{teacher_username}@example.com",
            password=teacher_password,
            role="teacher",
            full_name="Smoke Teacher",
            recorder=recorder,
        )

        me = data_of(client.request("GET", "/auth/me", token=student_token))
        recorder.pass_("auth me", f"username={me.get('username')}")
        llm_status = data_of(client.request("GET", "/llm/status", token=teacher_token))
        recorder.pass_(
            "llm status",
            f"provider={llm_status.get('provider')} model={llm_status.get('model')} configured={llm_status.get('configured')}",
        )
        expect_http_error(
            client,
            recorder,
            step="student cannot access teacher artifacts",
            method="GET",
            path="/teacher/generated-artifacts",
            expected_status=403,
            token=student_token,
        )
        expect_http_error(
            client,
            recorder,
            step="teacher cannot access student profile",
            method="GET",
            path="/student/profile/me",
            expected_status=403,
            token=teacher_token,
        )

        course_payload = {
            "course_name": "Smoke 机器学习课程",
            "target_students": "计算机专业大二学生",
            "total_hours": 32,
            "course_objectives": "理解机器学习基础，并完成一个小型项目。",
            "key_topics": ["过拟合", "正则化", "梯度下降"],
            "additional_requirements": "使用简洁中文 Markdown。",
            "use_knowledge_base": False,
            "top_k": 3,
        }
        artifact = data_of(
            client.request("POST", "/teacher/course-designs/generate", token=teacher_token, payload=course_payload)
        )
        ids["teacher_artifact_id"] = artifact.get("artifact_id")
        recorder.pass_(
            "teacher sync generation",
            f"artifact_id={ids['teacher_artifact_id']} {quality_summary(artifact.get('quality_analysis'))}",
        )

        if maybe_async(skip_async=args.skip_async, recorder=recorder, skipped_step="teacher async generation"):
            task = data_of(
                client.request(
                    "POST",
                    "/teacher/course-designs/generate-async",
                    token=teacher_token,
                    payload=course_payload,
                )
            )
            ids["teacher_task_id"] = task["task_id"]
            recorder.pass_("teacher async submit", f"task_id={task['task_id']}")
            poll_task(
                client,
                recorder,
                task_id=task["task_id"],
                token=teacher_token,
                step="teacher async execution",
                timeout_seconds=args.task_timeout,
            )

        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tmp:
            tmp.write("# Smoke Knowledge\nOverfitting reduces generalization. Regularization can help.\n")
            teacher_doc_path = Path(tmp.name)
        upload = data_of(client.upload_file(teacher_doc_path, teacher_token))
        ids["teacher_file_id"] = upload["id"]
        recorder.pass_("teacher file upload", f"file_id={upload['id']}")
        doc = data_of(
            client.request(
                "POST",
                "/knowledge/documents",
                token=teacher_token,
                payload={
                    "file_id": upload["id"],
                    "title": f"Smoke Knowledge {suffix}",
                    "source_type": "upload",
                },
            )
        )
        ids["teacher_document_id"] = doc["id"]
        recorder.pass_("teacher knowledge document", f"document_id={doc['id']}")
        ingest = data_of(client.request("POST", f"/knowledge/documents/{doc['id']}/ingest", token=teacher_token))
        recorder.pass_("teacher knowledge sync ingest", f"chunks={ingest.get('chunk_count')}")
        retrieved = data_of(
            client.request(
                "POST",
                "/knowledge/retrieve",
                token=teacher_token,
                payload={"query": "overfitting", "document_id": doc["id"], "top_k": 3},
            )
        )
        recorder.pass_("teacher knowledge retrieve", f"results={len(retrieved.get('results', []))}")

        if maybe_async(skip_async=args.skip_async, recorder=recorder, skipped_step="knowledge async ingest"):
            task = data_of(client.request("POST", f"/knowledge/documents/{doc['id']}/ingest-async", token=teacher_token))
            ids["knowledge_task_id"] = task["task_id"]
            recorder.pass_("knowledge async submit", f"task_id={task['task_id']}")
            poll_task(
                client,
                recorder,
                task_id=task["task_id"],
                token=teacher_token,
                step="knowledge async execution",
                timeout_seconds=args.task_timeout,
            )

        profile = data_of(
            client.request(
                "POST",
                "/student/profile",
                token=student_token,
                payload={
                    "major": "计算机科学与技术",
                    "grade": "大二",
                    "learning_goal": "提升人工智能课程学习效果",
                    "current_level": "具备一定 Python 基础，机器学习基础一般",
                    "preferred_style": "案例驱动和项目实践",
                    "available_time_per_week": 8,
                    "exam_pressure": "medium",
                    "practice_experience": "做过简单 Web 项目",
                    "weaknesses": ["数学基础", "模型原理"],
                    "interests": ["AI 应用", "数据分析"],
                },
            )
        )
        ids["profile_id"] = profile["id"]
        recorder.pass_("student profile", f"profile_id={profile['id']}")

        tutoring = data_of(
            client.request(
                "POST",
                "/student/tutoring/ask",
                token=student_token,
                payload={
                    "question": "什么是梯度下降？",
                    "use_knowledge_base": False,
                    "top_k": 3,
                    "response_format": "markdown",
                    "difficulty": "normal",
                },
            )
        )
        ids["tutoring_session_id"] = tutoring["session_id"]
        recorder.pass_("student tutoring", f"session_id={tutoring['session_id']}")

        resource = data_of(
            client.request(
                "POST",
                "/student/resources/generate",
                token=student_token,
                payload={
                    "topic": "梯度下降与学习率",
                    "resource_types": ["concept_explanation"],
                    "difficulty": "normal",
                    "knowledge_points": ["梯度下降", "学习率"],
                    "use_profile": True,
                    "use_knowledge_base": False,
                    "top_k": 3,
                },
            )
        )["resources"][0]
        ids["resource_id"] = resource["id"]
        recorder.pass_("student resource sync generation", f"resource_id={resource['id']}")

        personal_exercise = data_of(
            client.request(
                "POST",
                "/student/exercises",
                token=student_token,
                payload={
                    "title": f"Smoke personal exercise {suffix}",
                    "description": "Smoke test personal practice item.",
                    "content": "Explain how FastAPI dependency injection supports one route handler.",
                    "answer": "FastAPI dependency injection route handler",
                    "explanation": "A complete answer should mention dependency injection, route handler, and reusable services.",
                    "difficulty": "medium",
                    "category": "Personal practice",
                    "tags": ["FastAPI", "dependency", "route"],
                    "total_score": 100,
                },
            )
        )
        ids["personal_exercise_id"] = personal_exercise["id"]
        recorder.pass_("student exercise create", f"exercise_id={personal_exercise['id']}")
        exercise_list = data_of(client.request("GET", "/student/exercises?page=1&page_size=20", token=student_token))
        if any(item.get("id") == personal_exercise["id"] for item in exercise_list.get("items", [])):
            recorder.pass_("student exercise list", f"total={exercise_list.get('total')}")
        else:
            recorder.fail("student exercise list", "created exercise not found")
        started_exercise = data_of(
            client.request("POST", f"/student/exercises/{personal_exercise['id']}/start", token=student_token)
        )
        recorder.pass_("student exercise start", f"status={started_exercise['exercise']['status']}")
        submitted_exercise = data_of(
            client.request(
                "POST",
                f"/student/exercises/{personal_exercise['id']}/submit",
                token=student_token,
                payload={"answers": {"q1": "FastAPI dependency injection can pass services into a route handler."}},
            )
        )
        recorder.pass_(
            "student exercise submit",
            f"score={submitted_exercise.get('score')} {quality_summary(submitted_exercise.get('quality_analysis'))}",
        )
        favorited_exercise = data_of(
            client.request("POST", f"/student/exercises/{personal_exercise['id']}/favorite", token=student_token)
        )
        recorder.pass_("student exercise favorite", f"is_favorite={favorited_exercise.get('is_favorite')}")
        completed_exercise = data_of(
            client.request("POST", f"/student/exercises/{personal_exercise['id']}/complete", token=student_token)
        )
        recorder.pass_("student exercise complete", f"status={completed_exercise.get('status')}")
        deleted_exercise = data_of(
            client.request("DELETE", f"/student/exercises/{personal_exercise['id']}", token=student_token)
        )
        recorder.pass_("student exercise delete", f"deleted={deleted_exercise.get('deleted')}")

        if maybe_async(skip_async=args.skip_async, recorder=recorder, skipped_step="student resource async generation"):
            task = data_of(
                client.request(
                    "POST",
                    "/student/resources/generate-async",
                    token=student_token,
                    payload={
                        "topic": "过拟合与正则化",
                        "resource_types": ["summary_notes"],
                        "difficulty": "normal",
                        "knowledge_points": ["过拟合", "正则化"],
                        "use_profile": True,
                        "use_knowledge_base": False,
                        "top_k": 3,
                    },
                )
            )
            ids["resource_task_id"] = task["task_id"]
            recorder.pass_("student resource async submit", f"task_id={task['task_id']}")
            poll_task(
                client,
                recorder,
                task_id=task["task_id"],
                token=student_token,
                step="student resource async execution",
                timeout_seconds=args.task_timeout,
            )

        path = data_of(
            client.request(
                "POST",
                "/student/learning-paths",
                token=student_token,
                payload={
                    "title": "Smoke 学习路径",
                    "topic": "机器学习基础",
                    "target_goal": "掌握梯度下降和过拟合的核心概念",
                    "knowledge_points": ["梯度下降", "过拟合"],
                    "duration_days": 7,
                    "daily_minutes": 45,
                    "difficulty": "normal",
                    "resource_ids": [resource["id"]],
                    "use_profile": True,
                    "use_existing_resources": True,
                },
            )
        )
        ids["path_id"] = path["id"]
        recorder.pass_("student learning path", f"path_id={path['id']} steps={len(path.get('path_steps', []))}")
        quiz = data_of(
            client.request(
                "POST",
                f"/student/learning-paths/{path['id']}/quiz",
                token=student_token,
                payload={"step_index": 0, "question_count": 3, "difficulty": "normal"},
            )
        )
        recorder.pass_("student learning path quiz", f"questions={len(quiz.get('questions', []))}")
        advance = data_of(
            client.request(
                "POST",
                f"/student/learning-paths/{path['id']}/advance",
                token=student_token,
                payload={"completed_step_index": 0, "reflection": "已理解本步骤核心概念", "time_spent_minutes": 40},
            )
        )
        recorder.pass_("student learning path advance", f"completion={advance.get('completion_rate')}")

        test = data_of(
            client.request(
                "POST",
                "/student/tests/generate",
                token=student_token,
                payload={
                    "topic": "Python 函数",
                    "difficulty": "medium",
                    "question_count": 4,
                    "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
                    "knowledge_points": ["函数"],
                    "use_question_bank": True,
                },
            )
        )
        ids["test_id"] = test["test_id"]
        recorder.pass_("student test generate", f"test_id={test['test_id']}")
        detail_before = data_of(client.request("GET", f"/student/tests/{test['test_id']}", token=student_token))
        if detail_before.get("answers") is None:
            recorder.pass_("test answers hidden before submit", "answers=null")
        else:
            recorder.fail("test answers hidden before submit", "answers exposed")
        client.request("POST", f"/student/tests/{test['test_id']}/start", token=student_token)
        answers: dict[str, Any] = {}
        for question in detail_before.get("questions", []):
            question_id = question["id"]
            question_type = question["question_type"]
            if question_type == "multiple_choice":
                answers[question_id] = ["A"]
            elif question_type == "true_false":
                answers[question_id] = True
            elif question_type == "short_answer":
                answers[question_id] = "函数 定义 示例 可复用代码"
            else:
                answers[question_id] = "A"
        submitted = data_of(
            client.request(
                "POST",
                f"/student/tests/{test['test_id']}/submit",
                token=student_token,
                payload={"user_answers": answers},
            )
        )
        recorder.pass_("student test submit", f"score={submitted.get('score')} {quality_summary(submitted.get('quality_analysis'))}")

        assessment = data_of(
            client.request(
                "POST",
                "/student/assessments",
                token=student_token,
                payload={
                    "assessment_type": "topic",
                    "topic": "机器学习基础",
                    "score": 82,
                    "correct_topics": ["梯度下降"],
                    "incorrect_topics": ["正则化"],
                    "learning_evidence": {"self_reflection": "需要继续复习正则化的适用场景。"},
                },
            )
        )
        ids["assessment_id"] = assessment["id"]
        recorder.pass_(
            "student assessment create",
            f"assessment_id={assessment['id']} {quality_summary(assessment.get('quality_analysis'))}",
        )
        assessment_detail = data_of(client.request("GET", f"/student/assessments/{assessment['id']}", token=student_token))
        recorder.pass_(
            "student assessment detail",
            f"assessment_id={assessment_detail.get('assessment_id')} level={assessment_detail.get('level')}",
        )
        assessment_submit = data_of(
            client.request(
                "POST",
                f"/student/assessments/{assessment['id']}/submit",
                token=student_token,
                payload={
                    "answers": {"strengths": ["梯度下降"], "weak_topics": ["正则化"]},
                    "reflection": "Smoke 提交评估反馈，确认详情和提交接口可用。",
                    "self_rating": 84,
                    "feedback": "继续加强正则化的场景化练习。",
                },
            )
        )
        recorder.pass_(
            "student assessment submit",
            f"assessment_id={assessment_submit.get('assessment_id')} score={assessment_submit.get('score')} {quality_summary(assessment_submit.get('quality_analysis'))}",
        )
        summary = data_of(client.request("GET", "/student/assessments/summary", token=student_token))
        recorder.pass_("student assessment summary", f"total={summary.get('total_assessments')}")
        recs = data_of(client.request("GET", "/student/assessments/recommendations?top_k=3", token=student_token))
        recorder.pass_("student assessment recommendations", f"items={len(recs.get('recommendations', []))}")
        dashboard = data_of(client.request("GET", "/student/dashboard/summary", token=student_token))
        recorder.pass_(
            "student dashboard summary",
            f"courses={dashboard.get('courses', {}).get('total')} assessments={dashboard.get('assessments', {}).get('total')}",
        )

        teacher_tasks = data_of(client.request("GET", "/tasks?page=1&page_size=10", token=teacher_token))
        student_tasks = data_of(client.request("GET", "/tasks?page=1&page_size=10", token=student_token))
        recorder.pass_("teacher tasks list", f"total={teacher_tasks.get('total')}")
        recorder.pass_("student tasks list", f"total={student_tasks.get('total')}")

    except Exception as exc:
        recorder.fail("unexpected exception", f"{exc.__class__.__name__}: {exc}")

    summary = recorder.summary()
    print("\n=== Smoke Summary ===")
    print(json.dumps({"summary": summary, "ids": ids}, ensure_ascii=False, indent=2))
    return 1 if summary["failed"] else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run PrismMind API smoke tests without deleting data.")
    parser.add_argument("--api-base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000/api/v1"))
    parser.add_argument("--student-username", default=os.getenv("SMOKE_STUDENT_USERNAME"))
    parser.add_argument("--student-password", default=os.getenv("SMOKE_STUDENT_PASSWORD"))
    parser.add_argument("--teacher-username", default=os.getenv("SMOKE_TEACHER_USERNAME"))
    parser.add_argument("--teacher-password", default=os.getenv("SMOKE_TEACHER_PASSWORD"))
    parser.add_argument("--skip-async", action="store_true", help="Skip Celery-backed async task checks.")
    parser.add_argument("--task-timeout", type=int, default=60, help="Seconds to wait for each async task.")
    return parser


def main() -> int:
    return run_smoke(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
