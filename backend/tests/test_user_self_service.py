from test_course_flow import auth, client, register_and_login  # noqa: F401


def test_user_can_view_and_update_own_basic_profile(client):
    token = register_and_login(client, "self_profile_student", "student")

    profile = client.get("/api/v1/users/me", headers=auth(token))
    assert profile.status_code == 200, profile.text
    original = profile.json()["data"]
    assert original["username"] == "self_profile_student"
    assert original["email"] == "self_profile_student@example.com"
    assert original["role"] == "student"
    assert original["created_at"]

    updated = client.patch(
        "/api/v1/users/me/profile",
        headers=auth(token),
        json={"full_name": "  新的学生姓名  "},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["full_name"] == "新的学生姓名"

    refreshed = client.get("/api/v1/auth/me", headers=auth(token))
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["data"]["full_name"] == "新的学生姓名"


def test_user_can_change_password_only_with_current_password(client):
    token = register_and_login(client, "self_password_teacher", "teacher")
    endpoint = "/api/v1/users/me/password"

    wrong_current = client.post(
        endpoint,
        headers=auth(token),
        json={
            "current_password": "WrongPassword123!",
            "new_password": "NewCourseFlow456!",
            "confirm_password": "NewCourseFlow456!",
        },
    )
    assert wrong_current.status_code == 400, wrong_current.text
    assert wrong_current.json()["message"] == "当前密码不正确"

    mismatch = client.post(
        endpoint,
        headers=auth(token),
        json={
            "current_password": "CourseFlow123!",
            "new_password": "NewCourseFlow456!",
            "confirm_password": "AnotherPassword789!",
        },
    )
    assert mismatch.status_code == 400, mismatch.text

    changed = client.post(
        endpoint,
        headers=auth(token),
        json={
            "current_password": "CourseFlow123!",
            "new_password": "NewCourseFlow456!",
            "confirm_password": "NewCourseFlow456!",
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"] == {"updated": True}

    old_login = client.post(
        "/api/v1/auth/login",
        json={"username": "self_password_teacher", "password": "CourseFlow123!"},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"username": "self_password_teacher", "password": "NewCourseFlow456!"},
    )
    assert new_login.status_code == 200, new_login.text
