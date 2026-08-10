from __future__ import annotations

from test_course_flow import client as _course_flow_client  # noqa: F401


def register_user(api_client, username: str, role: str) -> None:
    response = api_client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "RoleLogin123!",
            "role": role,
        },
    )
    assert response.status_code == 200, response.text


def login(api_client, username: str, role: str | None = None):
    payload = {"username": username, "password": "RoleLogin123!"}
    if role is not None:
        payload["role"] = role
    return api_client.post("/api/v1/auth/login", json=payload)


def test_login_role_selector_rejects_mismatched_teacher_and_student(request):
    api_client = request.getfixturevalue("_course_flow_client")
    register_user(api_client, "role_login_teacher", "teacher")
    register_user(api_client, "role_login_student", "student")

    teacher_as_student = login(api_client, "role_login_teacher", "student")
    assert teacher_as_student.status_code == 403
    assert teacher_as_student.json()["message"] == "所选登录身份与账号角色不匹配"

    student_as_teacher = login(api_client, "role_login_student", "teacher")
    assert student_as_teacher.status_code == 403
    assert student_as_teacher.json()["message"] == "所选登录身份与账号角色不匹配"


def test_login_role_selector_accepts_matching_role_and_keeps_legacy_clients_compatible(request):
    api_client = request.getfixturevalue("_course_flow_client")
    register_user(api_client, "role_login_matching_teacher", "teacher")
    register_user(api_client, "role_login_legacy_student", "student")

    matching = login(api_client, "role_login_matching_teacher", "teacher")
    assert matching.status_code == 200, matching.text
    assert matching.json()["data"]["user"]["role"] == "teacher"

    legacy = login(api_client, "role_login_legacy_student")
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["data"]["user"]["role"] == "student"


def test_admin_login_is_not_blocked_by_teacher_student_portal_choice(request):
    api_client = request.getfixturevalue("_course_flow_client")
    register_user(api_client, "role_login_admin", "admin")

    response = login(api_client, "role_login_admin", "student")
    assert response.status_code == 200, response.text
    assert response.json()["data"]["user"]["role"] == "admin"
