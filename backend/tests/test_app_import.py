from __future__ import annotations


def test_app_main_imports():
    from app.main import app

    assert app.title == "棱镜智教-PrismMind"
