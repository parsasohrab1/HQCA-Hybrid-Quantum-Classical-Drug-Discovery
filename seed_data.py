"""Seed demo predictions and synthetic dataset for dashboard display."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from data import SyntheticDataPipeline, predict_binding
from database import PredictionResult, ProcessingTask, User, utc_now
from molecular_catalog import SCREENING_TARGET_FASTA, encrypt_protein_sequence, refresh_molecular_catalog
from showcase import SHOWCASE_DRUG, build_showcase_payload
from logging_config import LOGGER
from reporting import generate_pdf_report
from security import encrypt_sensitive, hash_password
from storage import object_storage

DEMO_PREDICTIONS = [
    {
        "smiles": "CCO",
        "fasta": "ACDEFGHIKLMNPQRSTVWY",
        "label": "Ethanol",
    },
    {
        "smiles": "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
        "fasta": "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWSTPSELGHRAQLTKL",
        "label": "Ibuprofen",
    },
    {
        "smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
        "fasta": "ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY",
        "label": "Caffeine",
    },
    {
        "smiles": "CC(C)(C)NC(=O)C1=CC=CC=C1C(=O)NC2=CC=C(C=C2)C(F)(F)F",
        "fasta": "GLYVALALALEUPHEMETTRPTYR",
        "label": "Atorvastatin",
    },
    {
        "smiles": "CN1CCN(CC1)C2=CC=C(C=C2)C3=NC4=CC=CC=C4S3",
        "fasta": "ACDEFGHIKLMNPQRSTVWY",
        "label": "Quetiapine",
    },
]

SEED_SMILES = [
    "CCO",
    "CC(C)O",
    "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
    "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
]


def _save_prediction(
    db: Session,
    user_id: int,
    smiles: str,
    fasta: str,
    output_root: Path,
    request_id: Optional[str] = None,
) -> PredictionResult:
    request_id = request_id or uuid.uuid4().hex
    out_dir = output_root / request_id
    result = predict_binding(smiles, fasta=fasta, output_dir=str(out_dir), backend="auto")

    csv_path = out_dir / "prediction.csv"
    pd.DataFrame([result.to_dict()]).to_csv(csv_path, index=False)
    pdf_path = out_dir / "report.pdf"
    generate_pdf_report(result.to_dict(), str(pdf_path))

    csv_url = object_storage.put_file(str(csv_path), f"predictions/{request_id}/prediction.csv")
    pdf_url = object_storage.put_file(str(pdf_path), f"predictions/{request_id}/report.pdf")
    pdb_url = object_storage.put_file(result.pdb_path, f"predictions/{request_id}/pocket.pdb")
    viewer_url = object_storage.put_file(result.viewer_html_path, f"predictions/{request_id}/viewer.html")

    center = result.pocket.get("center", (0, 0, 0))
    record = PredictionResult(
        request_id=request_id,
        user_id=user_id,
        encrypted_smiles=encrypt_sensitive(smiles),
        encrypted_fasta=encrypt_sensitive(fasta),
        encrypted_protein_sequence=encrypt_protein_sequence(result.protein_sequence),
        binding_score=result.binding_score,
        binding_energy_kcal_mol=result.binding_energy_kcal_mol,
        confidence=result.confidence_pct,
        pocket_center_json=json.dumps({"x": center[0], "y": center[1], "z": center[2]}),
        report_csv_object=csv_url,
        report_pdf_object=pdf_url,
        pocket_pdb_object=pdb_url,
        viewer_html_object=viewer_url,
        backend=result.backend,
    )
    db.add(record)
    db.flush()
    return record


def _seed_synthetic_task(db: Session, user_id: int, num_samples: int = 50) -> ProcessingTask:
    task_id = "demo-dataset-001"
    existing = db.get(ProcessingTask, task_id)
    if existing and existing.status == "completed":
        return existing

    output_dir = Path("output/seed") / task_id
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "dataset.csv"
    json_path = output_dir / "dataset.json"
    pdf_path = output_dir / "report.pdf"

    pipeline = SyntheticDataPipeline(SEED_SMILES, random_state=2025)
    df = pipeline.generate_dataset(
        num_pairs=num_samples,
        output_csv=str(csv_path),
        output_json=str(json_path),
        output_pdf=str(pdf_path),
        fasta=SCREENING_TARGET_FASTA,
    )

    csv_url = object_storage.put_file(str(csv_path), f"seed/{task_id}/dataset.csv")
    json_url = object_storage.put_file(str(json_path), f"seed/{task_id}/dataset.json")
    pdf_url = object_storage.put_file(str(pdf_path), f"seed/{task_id}/report.pdf")

    if existing:
        existing.status = "completed"
        existing.records_generated = len(df)
        existing.records_failed = max(0, num_samples - len(df))
        existing.output_csv_object = csv_url
        existing.output_json_object = json_url
        existing.output_pdf_object = pdf_url
        existing.updated_at = utc_now()
        existing.error = None
        db.flush()
        return existing

    task = ProcessingTask(
        task_id=task_id,
        user_id=user_id,
        status="completed",
        num_samples=num_samples,
        records_generated=len(df),
        records_failed=max(0, num_samples - len(df)),
        output_csv_object=csv_url,
        output_json_object=json_url,
        output_pdf_object=pdf_url,
    )
    db.add(task)
    db.flush()
    return task


def _seed_showcase_prediction(db: Session, user_id: int, output_root: Path) -> Optional[PredictionResult]:
    """Fixed-ID showcase drug with full pipeline artifacts."""
    request_id = SHOWCASE_DRUG["id"]
    if db.get(PredictionResult, request_id):
        return db.get(PredictionResult, request_id)

    smiles = SHOWCASE_DRUG["smiles"]
    fasta = SHOWCASE_DRUG["fasta"]
    out_dir = output_root / request_id
    result = predict_binding(smiles, fasta=fasta, output_dir=str(out_dir), backend="auto", num_pockets=5)

    csv_path = out_dir / "prediction.csv"
    pd.DataFrame([result.to_dict()]).to_csv(csv_path, index=False)
    pdf_path = out_dir / "report.pdf"
    generate_pdf_report(result.to_dict(), str(pdf_path))

    csv_url = object_storage.put_file(str(csv_path), f"predictions/{request_id}/prediction.csv")
    pdf_url = object_storage.put_file(str(pdf_path), f"predictions/{request_id}/report.pdf")
    pdb_url = object_storage.put_file(result.pdb_path, f"predictions/{request_id}/pocket.pdb")
    viewer_url = object_storage.put_file(result.viewer_html_path, f"predictions/{request_id}/viewer.html")

    center = result.pocket.get("center", (0, 0, 0))
    record = PredictionResult(
        request_id=request_id,
        user_id=user_id,
        encrypted_smiles=encrypt_sensitive(smiles),
        encrypted_fasta=encrypt_sensitive(fasta),
        encrypted_protein_sequence=encrypt_protein_sequence(result.protein_sequence),
        binding_score=result.binding_score,
        binding_energy_kcal_mol=result.binding_energy_kcal_mol,
        confidence=result.confidence_pct,
        pocket_center_json=json.dumps({"x": center[0], "y": center[1], "z": center[2]}),
        report_csv_object=csv_url,
        report_pdf_object=pdf_url,
        pocket_pdb_object=pdb_url,
        viewer_html_object=viewer_url,
        backend=result.backend,
    )
    db.add(record)
    db.flush()
    build_showcase_payload(
        result,
        smiles=smiles,
        fasta=fasta,
        urls={
            "viewer_html_url": viewer_url,
            "report_pdf_url": pdf_url,
            "report_csv_url": csv_url,
            "pocket_pdb_url": pdb_url,
        },
    )
    LOGGER.info("Showcase drug seeded", extra={"hqca_event": "seed_showcase", "hqca_request_id": request_id})
    return record


def ensure_admin(db: Session) -> User:
    admin = db.query(User).filter(User.username == "admin").first()
    if admin:
        return admin
    admin = User(
        username="admin",
        password_hash=hash_password(os.getenv("HQCA_ADMIN_PASSWORD", "admin12345")),
        role="admin",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def seed_demo_data(db: Session, force: bool = False) -> dict:
    """Create demo predictions and synthetic dataset if missing."""
    admin = ensure_admin(db)
    output_root = Path(os.getenv("HQCA_API_OUTPUT_DIR", "output/api"))

    pred_count = db.query(PredictionResult).count()
    if pred_count == 0 or force:
        if force and pred_count > 0:
            db.query(PredictionResult).delete()
            db.commit()
        LOGGER.info("Seeding demo predictions", extra={"hqca_event": "seed_predictions"})
        for item in DEMO_PREDICTIONS:
            _save_prediction(db, admin.id, item["smiles"], item["fasta"], output_root)
        db.commit()

    _seed_showcase_prediction(db, admin.id, output_root)
    task = _seed_synthetic_task(db, admin.id, num_samples=50)
    db.commit()

    catalog = refresh_molecular_catalog(db)

    predictions = (
        db.query(PredictionResult)
        .order_by(PredictionResult.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "predictions": len(predictions),
        "datasets": 1 if task.status == "completed" else 0,
        "predictions_seeded": len(predictions),
        "dataset_task_id": task.task_id,
        "dataset_records": task.records_generated,
        "dataset_status": task.status,
        "molecular_catalog": catalog,
    }


if __name__ == "__main__":
    from database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        summary = seed_demo_data(db, force="--force" in __import__("sys").argv)
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    finally:
        db.close()
