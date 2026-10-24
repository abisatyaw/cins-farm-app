import pytest
from app.config import Settings
from app.main import create_app
from app.security import _attempts
from fastapi.testclient import TestClient

TEST_PASSWORD = "test-only-bootstrap-password"
NEW_PASSWORD = "test-only-changed-password"


@pytest.fixture
def fresh(tmp_path):
    _attempts.clear()
    app = create_app(
        Settings(
            database_url=f"sqlite:///{tmp_path / 'farm.sqlite3'}",
            initial_admin_password=TEST_PASSWORD,
        )
    )
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client(fresh):
    response = fresh.post("/api/auth/login", json={"username": "admin", "password": TEST_PASSWORD})
    assert response.status_code == 200
    fresh.headers["x-csrf-token"] = fresh.cookies["farm_csrf"]
    response = fresh.post(
        "/api/auth/password", json={"current_password": TEST_PASSWORD, "new_password": NEW_PASSWORD}
    )
    assert response.status_code == 200
    return fresh


@pytest.fixture
def options(client):
    return client.get("/api/records/options").json()["items"]


@pytest.fixture
def opt(options):
    def find(role=None, kind=None):
        return next(
            o["id"]
            for o in options
            if (role is None or o["role"] == role) and (kind is None or o["kind"] == kind)
        )

    return find
