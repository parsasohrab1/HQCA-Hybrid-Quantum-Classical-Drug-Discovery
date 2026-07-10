"""Virtual molecular screening from synthetic datasets."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

import pandas as pd

from storage import object_storage

SCREENING_CRITERIA = {
    "binding_score_min": 45.0,
    "MW_max": 500.0,
    "LogP_max": 5.0,
    "HBD_max": 5,
    "HBA_max": 10,
}

CRITERIA_LABELS_FA = {
    "binding_score_min": "حداقل نمره اتصال",
    "MW_max": "حداکثر وزن مولکولی (Da)",
    "LogP_max": "حداکثر LogP",
    "HBD_max": "حداکثر دهنده H",
    "HBA_max": "حداکثر پذیرنده H",
}


def _object_key_from_url(url: str) -> str:
    path = url.split("/files/", 1)[-1] if "/files/" in url else url.lstrip("/")
    return unquote(path.replace("\\", "/"))


def load_dataset_csv(csv_url: str) -> Optional[pd.DataFrame]:
    """Load screening dataset from stored CSV path."""
    key = _object_key_from_url(csv_url)
    local = object_storage.resolve_local(key)
    if not local.exists():
        alt = Path("output/seed") / key.split("/")[-2] / "dataset.csv"
        if alt.exists():
            local = alt
        else:
            return None
    df = pd.read_csv(local)
    required = {"smiles", "binding_score", "MW", "LogP", "HBD", "HBA"}
    if not required.issubset(df.columns):
        return None
    return df


def _is_hit(row: pd.Series) -> bool:
    c = SCREENING_CRITERIA
    return bool(
        row["binding_score"] >= c["binding_score_min"]
        and float(row["MW"]) <= c["MW_max"]
        and float(row["LogP"]) <= c["LogP_max"]
        and int(row["HBD"]) <= c["HBD_max"]
        and int(row["HBA"]) <= c["HBA_max"]
    )


def _molecule_row(row: pd.Series, rank: int) -> Dict[str, Any]:
    protein = str(row.get("protein_sequence", ""))
    smiles = str(row["smiles"])
    return {
        "rank": rank,
        "smiles": smiles,
        "smiles_preview": smiles[:48] + ("..." if len(smiles) > 48 else ""),
        "protein_sequence": protein,
        "protein_preview": protein[:48] + ("..." if len(protein) > 48 else ""),
        "protein_length": len(protein),
        "binding_score": round(float(row["binding_score"]), 2),
        "binding_energy_kcal_mol": round(float(row.get("binding_energy_kcal_mol", 0)), 3),
        "MW": round(float(row["MW"]), 2),
        "LogP": round(float(row["LogP"]), 2),
        "HBD": int(row["HBD"]),
        "HBA": int(row["HBA"]),
        "TPSA": round(float(row.get("TPSA", 0)), 2),
        "is_hit": bool(row.get("is_hit", False)),
        "status_fa": "کاندید برتر" if row.get("is_hit") else "رد شده",
    }


def run_screening(df: pd.DataFrame, top_n: int = 15) -> Dict[str, Any]:
    """Rank molecules and apply virtual screening filters."""
    data = df.copy()
    data["is_hit"] = data.apply(_is_hit, axis=1)
    data = data.sort_values("binding_score", ascending=False).reset_index(drop=True)
    data["rank"] = range(1, len(data) + 1)

    hits = data[data["is_hit"]]
    top = data.head(top_n)

    buckets = [
        {"range": "0–25", "count": int(((data["binding_score"] >= 0) & (data["binding_score"] < 25)).sum())},
        {"range": "25–50", "count": int(((data["binding_score"] >= 25) & (data["binding_score"] < 50)).sum())},
        {"range": "50–75", "count": int(((data["binding_score"] >= 50) & (data["binding_score"] < 75)).sum())},
        {"range": "75–100", "count": int((data["binding_score"] >= 75).sum())},
    ]

    return {
        "criteria": SCREENING_CRITERIA,
        "criteria_labels_fa": CRITERIA_LABELS_FA,
        "summary": {
            "total_screened": len(data),
            "hits": int(hits.shape[0]),
            "rejected": int(len(data) - hits.shape[0]),
            "hit_rate_pct": round(100.0 * hits.shape[0] / max(len(data), 1), 1),
            "avg_binding_score": round(float(data["binding_score"].mean()), 2),
            "best_binding_score": round(float(data["binding_score"].max()), 2),
            "avg_MW": round(float(data["MW"].mean()), 2),
        },
        "hits": [_molecule_row(r, int(r["rank"])) for _, r in hits.head(top_n).iterrows()],
        "leaderboard": [_molecule_row(r, int(r["rank"])) for _, r in top.iterrows()],
        "score_distribution": buckets,
    }


def screening_from_csv_url(csv_url: Optional[str], top_n: int = 15) -> Dict[str, Any]:
    """Build screening payload from a dataset CSV URL."""
    empty = {
        "available": False,
        "message_fa": "دیتاست غربالگری موجود نیست. از بخش «تولید داده» یک مجموعه بسازید.",
        "criteria": SCREENING_CRITERIA,
        "criteria_labels_fa": CRITERIA_LABELS_FA,
        "summary": {
            "total_screened": 0,
            "hits": 0,
            "rejected": 0,
            "hit_rate_pct": 0.0,
            "avg_binding_score": 0.0,
            "best_binding_score": 0.0,
            "avg_MW": 0.0,
        },
        "hits": [],
        "leaderboard": [],
        "score_distribution": [],
    }
    if not csv_url:
        return empty

    df = load_dataset_csv(csv_url)
    if df is None or len(df) == 0:
        return {**empty, "message_fa": "فایل دیتاست یافت نشد یا ناقص است."}

    result = run_screening(df, top_n=top_n)
    result["available"] = True
    result["message_fa"] = None
    result["source_csv"] = csv_url
    if "protein_sequence" in df.columns and len(df) > 0:
        target = str(df.iloc[0]["protein_sequence"])
        result["target_protein"] = {
            "protein_sequence": target,
            "protein_length": len(target),
        }
    return result
