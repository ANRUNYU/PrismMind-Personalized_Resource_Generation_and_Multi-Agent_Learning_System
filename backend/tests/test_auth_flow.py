from __future__ import annotations

import os

import pytest


@pytest.mark.integration
def test_auth_flow_requires_test_database_url():
    if not os.getenv("TEST_DATABASE_URL"):
        pytest.skip("Set TEST_DATABASE_URL to run auth integration tests without using dev data")

    pytest.skip("Auth integration flow is reserved for a disposable test database fixture")
