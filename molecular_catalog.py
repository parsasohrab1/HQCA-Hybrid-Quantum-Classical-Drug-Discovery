"""Persisted molecular pairs (SMILES + protein sequence) for dashboard."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database import PredictionResult, utc_now
from security import decrypt_sensitive, encrypt_sensitive
from showcase import SHOWCASE_DRUG
from storage import object_storage
from validation import normalize_fasta

CATALOG_PATH = Path(os.getenv("HQCA_MOLECULAR_CATALOG", "output/molecular_catalog.json"))
SCREENING_TARGET_FASTA = (
    ">HQCA_screening_target\n"
    "ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY"
)


def protein_from_row(row: PredictionResult) -> str:
    if getattr(row, "encrypted_protein_sequence", None):
        stored = decrypt_sensitive(row.encrypted_protein_sequence)
        if stored:
            return stored
    fasta_raw = decrypt_sensitive(row.encrypted_fasta)
    try:
        return normalize_fasta(fasta_raw) if fasta_raw else ""
    except ValueError:
        return fasta_raw.replace(">", "").strip()


def pair_from_prediction(row: PredictionResult, label: Optional[str] = None) -> Dict[str, Any]:
    smiles = decrypt_sensitive(row.encrypted_smiles)
    fasta = decrypt_sensitive(row.encrypted_fasta)
    protein = protein_from_row(row)
    return {
        "id": row.request_id,
        "label": label or row.request_id[:12],
        "smiles": smiles,
        "fasta": fasta,
        "protein_sequence": protein,
        "protein_length": len(protein),
        "binding_score": row.binding_score,
        "confidence": row.confidence,
        "source": "prediction",
        "created_at": row.created_at,
    }


def showcase_pair() -> Dict[str, Any]:
    fasta = SHOWCASE_DRUG["fasta"]
    protein = normalize_fasta(fasta)
    return {
        "id": SHOWCASE_DRUG["id"],
        "label": SHOWCASE_DRUG["name_fa"],
        "smiles": SHOWCASE_DRUG["smiles"],
        "fasta": fasta,
        "protein_sequence": protein,
        "protein_length": len(protein),
        "binding_score": None,
        "confidence": None,
        "source": "showcase",
        "created_at": None,
    }


def save_molecular_catalog(entries: List[Dict[str, Any]]) -> str:
    """Write catalog JSON to disk and object storage."""
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": utc_now(),
        "screening_target_fasta": SCREENING_TARGET_FASTA,
        "screening_target_sequence": normalize_fasta(SCREENING_TARGET_FASTA),
        "pairs": entries,
    }
    CATALOG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    catalog_url = object_storage.put_file(str(CATALOG_PATH), "molecular/catalog.json")
    payload["catalog_url"] = catalog_url
    CATALOG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return catalog_url


def refresh_molecular_catalog(db: Session) -> Dict[str, Any]:
    """Rebuild catalog from DB predictions + showcase reference."""
    for row in db.query(PredictionResult).all():
        if not row.encrypted_protein_sequence:
            row.encrypted_protein_sequence = encrypt_protein_sequence(protein_from_row(row))
    db.flush()

    entries: List[Dict[str, Any]] = [showcase_pair()]
    seen = {SHOWCASE_DRUG["smiles"]}

    showcase_row = db.get(PredictionResult, SHOWCASE_DRUG["id"])
    if showcase_row:
        pair = pair_from_prediction(showcase_row, label=SHOWCASE_DRUG["name_fa"])
        entries[0]["binding_score"] = pair["binding_score"]
        entries[0]["confidence"] = pair["confidence"]
        entries[0]["created_at"] = pair["created_at"]

    rows = (
        db.query(PredictionResult)
        .order_by(PredictionResult.created_at.desc())
        .limit(20)
        .all()
    )
    for row in rows:
        if row.request_id == SHOWCASE_DRUG["id"]:
            continue
        pair = pair_from_prediction(row)
        entries.append(pair)
        seen.add(pair["smiles"])

    catalog_url = save_molecular_catalog(entries)
    db.commit()
    return {
        "catalog_url": catalog_url,
        "pair_count": len(entries),
        "updated_at": utc_now(),
    }


def load_molecular_catalog() -> Optional[Dict[str, Any]]:
    if CATALOG_PATH.exists():
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return None


def dashboard_molecular_data(db: Session, latest: Optional[PredictionResult]) -> Dict[str, Any]:
    """Primary pair + stored catalog for dashboard."""
    catalog = load_molecular_catalog()
    primary = showcase_pair()

    if latest is not None:
        primary = pair_from_prediction(latest, label="آخرین پیش‌بینی")
    elif showcase_row := db.get(PredictionResult, SHOWCASE_DRUG["id"]):
        primary = pair_from_prediction(showcase_row, label=SHOWCASE_DRUG["name_fa"])

    pairs = catalog.get("pairs", []) if catalog else []
    if not pairs:
        rows = db.query(PredictionResult).order_by(PredictionResult.created_at.desc()).limit(10).all()
        pairs = [pair_from_prediction(r) for r in rows]
        if not any(p["id"] == showcase_pair()["id"] for p in pairs):
            pairs.insert(0, showcase_pair())

    target_seq = catalog.get("screening_target_sequence") if catalog else normalize_fasta(SCREENING_TARGET_FASTA)
    target_fasta = catalog.get("screening_target_fasta") if catalog else SCREENING_TARGET_FASTA

    return {
        "primary": primary,
        "pairs": pairs,
        "screening_target": {
            "fasta": target_fasta,
            "protein_sequence": target_seq,
            "protein_length": len(target_seq),
        },
        "catalog_url": (catalog or {}).get("catalog_url"),
        "stored_count": len(pairs),
    }


def encrypt_protein_sequence(sequence: str) -> str:
    return encrypt_sensitive(sequence)
