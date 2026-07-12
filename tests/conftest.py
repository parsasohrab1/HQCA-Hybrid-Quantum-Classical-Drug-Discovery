import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Fixed keys and isolated DB must be set before importing app modules.
os.environ["HQCA_DATABASE_URL"] = "sqlite:///output/test_api.db"
os.environ["HQCA_USE_MINIO"] = "false"
os.environ["HQCA_SEED_DEMO"] = "true"
os.environ["HQCA_ENCRYPTION_KEY"] = "hqca-test-encryption-key"
os.environ["HQCA_SECRET_KEY"] = "hqca-test-secret-key"

_test_db = Path(__file__).resolve().parent.parent / "output" / "test_api.db"
if _test_db.exists():
    _test_db.unlink()

from api import app  # noqa: E402
from database import init_db  # noqa: E402


@pytest.fixture()
def client():
    init_db()
    with TestClient(app) as c:
        yield c
