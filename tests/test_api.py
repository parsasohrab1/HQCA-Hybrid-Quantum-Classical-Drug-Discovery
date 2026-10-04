"""API integration tests."""


def _auth_headers(client):
    login = client.post("/auth/login", json={"username": "admin", "password": "admin12345"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert "backends" in res.json()


def test_login_and_predict(client):
    headers = _auth_headers(client)
    res = client.post(
        "/predict",
        headers=headers,
        json={"smiles": "CCO", "fasta": "ACDEFGHIKLMNPQRSTVWY", "backend": "auto"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["smiles"] == "CCO"
    assert body["protein_sequence"]
    assert 0 <= body["binding_score"] <= 100
    assert body["confidence"] >= 50
    assert body["viewer_html_url"].startswith("/files/")


def test_demo_showcase(client):
    res = client.get("/demo/showcase", headers=_auth_headers(client))
    assert res.status_code == 200
    body = res.json()
    assert body["drug"]["name_fa"] == "Ibuprofen"
    assert len(body["pipeline"]) == 7
    assert body["drug"]["target_protein"]["gene"] == "PTGS2"


def test_dashboard_molecular_and_screening(client):
    res = client.get("/dashboard", headers=_auth_headers(client))
    assert res.status_code == 200
    body = res.json()
    mol = body["molecular_data"]
    assert mol["primary"]["smiles"]
    assert mol["primary"]["protein_sequence"]
    assert mol["stored_count"] >= 1
    screening = body["molecular_screening"]
    assert "summary" in screening
    assert "leaderboard" in screening


def test_dashboard_molecules_endpoint(client):
    res = client.get("/dashboard/molecules", headers=_auth_headers(client))
    assert res.status_code == 200
    body = res.json()
    assert body["pairs"]
    assert body["screening_target"]["protein_sequence"]


def test_generate_synthetic(client):
    res = client.post(
        "/generate_synthetic",
        json={"num_samples": 3, "smiles_seed": ["CCO", "CC(C)O"]},
    )
    assert res.status_code == 200
    task_id = res.json()["task_id"]
    status = client.get(f"/status/{task_id}")
    assert status.status_code == 200


def test_cobyla_optimize():
    import numpy as np
    from data import QuantumVQESimulator

    sim = QuantumVQESimulator(backend="auto")
    energy, depth = sim.predict_affinity(np.ones(7) * 0.5, optimize=True)
    assert -15.0 <= energy <= -0.1
    assert depth >= 0
