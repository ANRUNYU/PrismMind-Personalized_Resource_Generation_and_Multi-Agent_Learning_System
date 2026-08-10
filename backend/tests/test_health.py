from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app, create_app


def test_health_endpoint():
    response = TestClient(app).get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["status"] == "ok"


def test_unhandled_errors_keep_cors_headers():
    test_app = create_app()

    @test_app.get("/_test/boom")
    def boom():
        raise RuntimeError("boom")

    response = TestClient(test_app, raise_server_exceptions=False).get(
        "/_test/boom",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.json()["message"] == "服务器内部错误"
