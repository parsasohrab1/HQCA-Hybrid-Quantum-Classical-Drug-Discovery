"""Full pipeline showcase for a sample drug (Ibuprofen)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from data import (
    MolecularDescriptors,
    PredictionResult,
    QuantumVQESimulator,
    SyntheticPocketGenerator,
    normalize_descriptors,
    predict_binding,
)
from storage import object_storage
from validation import normalize_fasta, validate_smiles

SHOWCASE_DRUG = {
    "id": "showcase-ibuprofen",
    "name_fa": "Ibuprofen",
    "name_en": "Ibuprofen",
    "smiles": "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
    "fasta": (
        ">PTGS2|COX-2|Homo_sapiens\n"
        "MLARALLLCAVLALSARASPGPRTQCEQAREQFFINDVELAAYMTLARLARPGPLTHAASAVDITEVE"
        "CHLPPGPLDMITDVLNRKGFVFTLTVHDGECVETITVEYSSLRSLRPSLFGGLLQASVGQETLNVT"
    ),
    "description": "NSAID — complete HQCA process example from input to final report",
    "target_protein": {
        "name": "COX-2",
        "name_fa": "Cyclooxygenase-2",
        "gene": "PTGS2",
        "uniprot": "P35354",
        "role_fa": "Inhibition of inflammatory prostaglandin (PGE₂) synthesis",
    },
    "tissue": {
        "name_fa": "Synovial membrane of the joint and inflamed connective tissue",
        "name_en": "Inflamed synovial membrane / connective tissue",
        "indication_fa": "Joint inflammation, rheumatoid arthritis, osteoarthritis, musculoskeletal pain",
    },
    "dose": {
        "amount": 400,
        "unit": "mg",
        "unit_fa": "milligram",
        "route_fa": "Oral (tablet)",
        "frequency_fa": "Every 6 to 8 hours",
        "max_daily_mg": 1200,
        "note_fa": "Usual over-the-counter dose for mild to moderate pain and inflammation",
    },
}

CACHE_PATH = Path("output/showcase/pipeline.json")


def drug_public_metadata() -> Dict[str, Any]:
    d = SHOWCASE_DRUG
    tp = d["target_protein"]
    ti = d["tissue"]
    dose = d["dose"]
    return {
        "id": d["id"],
        "name_fa": d["name_fa"],
        "name_en": d["name_en"],
        "smiles": d["smiles"],
        "description": d["description"],
        "target_protein": tp,
        "tissue": ti,
        "dose": dose,
        "target_protein_label": f"{tp['name_fa']} ({tp['name']}) — gene {tp['gene']}",
        "tissue_label": ti["name_fa"],
        "dose_label": f"{dose['amount']} {dose['unit_fa']} {dose['route_fa']} — {dose['frequency_fa']}",
    }


def enrich_showcase_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure cached payloads include latest drug metadata."""
    meta = drug_public_metadata()
    payload["drug"] = {**payload.get("drug", {}), **meta}
    for step in payload.get("pipeline", []):
        if step.get("key") == "input" and step.get("data"):
            step["data"].update(_input_clinical_fields())
    return payload


def _input_clinical_fields() -> Dict[str, Any]:
    d = SHOWCASE_DRUG
    tp, ti, dose = d["target_protein"], d["tissue"], d["dose"]
    return {
        "target_protein": tp["name_fa"],
        "target_protein_gene": tp["gene"],
        "target_protein_uniprot": tp["uniprot"],
        "tissue": ti["name_fa"],
        "tissue_indication": ti["indication_fa"],
        "dose_amount": f"{dose['amount']} {dose['unit_fa']}",
        "dose_route": dose["route_fa"],
        "dose_frequency": dose["frequency_fa"],
        "dose_max_daily": f"{dose['max_daily_mg']} {dose['unit_fa']}",
    }


PIPELINE_STEPS = [
    {"step": 1, "key": "input", "title": "Input and validation", "icon": "📥"},
    {"step": 2, "key": "descriptors", "title": "Molecular descriptors", "icon": "🧪"},
    {"step": 3, "key": "quantum", "title": "Quantum encoding + VQC", "icon": "⚛"},
    {"step": 4, "key": "simulation", "title": "Binding simulation (VQE)", "icon": "🔬"},
    {"step": 5, "key": "pockets", "title": "Protein pocket generation", "icon": "🧬"},
    {"step": 6, "key": "prediction", "title": "Binding score prediction", "icon": "📊"},
    {"step": 7, "key": "output", "title": "Report and 3D display", "icon": "📄"},
]

def _steps_detail(
    smiles: str,
    fasta: str,
    result: PredictionResult,
    sim: QuantumVQESimulator,
) -> Dict[str, Any]:
    desc = MolecularDescriptors.compute(smiles)
    desc_norm = normalize_descriptors(desc.to_array())

    step_input = {
        "smiles": smiles,
        "fasta_length": len(fasta),
        "fasta_preview": fasta[:60] + ("..." if len(fasta) > 60 else ""),
        "status": "valid",
        **_input_clinical_fields(),
    }
    step_descriptors = {
        "MW": round(desc.MW, 2),
        "LogP": round(desc.LogP, 2),
        "HBD": desc.HBD,
        "HBA": desc.HBA,
        "RotatableBonds": desc.RotatableBonds,
        "AromaticRings": desc.AromaticRings,
        "TPSA": round(desc.TPSA, 2),
        "normalized": [round(float(v), 4) for v in desc_norm],
    }
    step_quantum = {
        "backend": result.backend,
        "n_qubits": 7,
        "embedding": "Angle Embedding — RX(arctan(θ))",
        "circuit": "VQC FR-11 — RX + CNOT + RY",
        "gate_depth": result.gate_depth,
    }
    step_simulation = {
        "algorithm": "VQE",
        "binding_energy_kcal_mol": round(result.binding_energy_kcal_mol, 4),
        "measurement": "⟨Z⟩ expectation",
    }
    pockets = result.pockets or []
    step_pockets = {
        "count": len(pockets),
        "pocket_lengths": [p["length"] for p in pockets],
        "centers": [
            {"x": round(p["center"][0], 2), "y": round(p["center"][1], 2), "z": round(p["center"][2], 2)}
            for p in pockets
        ],
    }
    step_prediction = {
        "binding_score": result.binding_score,
        "binding_energy_kcal_mol": result.binding_energy_kcal_mol,
        "confidence_pct": result.confidence_pct,
        "interpretation": "Moderate to good binding" if result.binding_score >= 45 else "Weak binding",
    }
    step_output = {
        "viewer_html": result.viewer_html_path,
        "pdb": result.pdb_path,
        "binding_score": result.binding_score,
        "confidence_pct": result.confidence_pct,
    }
    return {
        "input": step_input,
        "descriptors": step_descriptors,
        "quantum": step_quantum,
        "simulation": step_simulation,
        "pockets": step_pockets,
        "prediction": step_prediction,
        "output": step_output,
    }


def build_showcase_payload(
    result: PredictionResult,
    smiles: Optional[str] = None,
    fasta: Optional[str] = None,
    urls: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    drug = SHOWCASE_DRUG
    smiles = smiles or validate_smiles(drug["smiles"])
    fasta = fasta or normalize_fasta(drug["fasta"])
    sim = QuantumVQESimulator(backend=result.backend)
    steps_detail = _steps_detail(smiles, fasta, result, sim)

    pipeline: List[Dict[str, Any]] = []
    for meta in PIPELINE_STEPS:
        pipeline.append({**meta, "status": "completed", "data": steps_detail[meta["key"]]})

    payload = {
        "drug": drug_public_metadata(),
        "request_id": drug["id"],
        "pipeline": pipeline,
        "result": {
            "binding_score": result.binding_score,
            "binding_energy_kcal_mol": result.binding_energy_kcal_mol,
            "confidence_pct": result.confidence_pct,
            "backend": result.backend,
            "gate_depth": result.gate_depth,
            "protein_sequence_length": len(result.protein_sequence),
        },
        "paths": {
            "viewer_html": result.viewer_html_path,
            "pdb": result.pdb_path,
        },
    }
    if urls:
        payload["result"].update(urls)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def run_showcase_pipeline(output_dir: Optional[str] = None) -> Dict[str, Any]:
    """Execute full HQCA pipeline for the showcase drug."""
    drug = SHOWCASE_DRUG
    smiles = validate_smiles(drug["smiles"])
    fasta = normalize_fasta(drug["fasta"])
    out = output_dir or str(Path("output/showcase") / drug["id"])
    result = predict_binding(smiles, fasta=fasta, output_dir=out, backend="auto", num_pockets=5)
    payload = build_showcase_payload(result, smiles, fasta)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def build_showcase_from_row(row, decrypt_fn) -> Dict[str, Any]:
    """Rebuild showcase payload from a stored prediction (no full re-simulation)."""
    smiles = decrypt_fn(row.encrypted_smiles)
    fasta_raw = decrypt_fn(row.encrypted_fasta)
    fasta = normalize_fasta(fasta_raw) if ">" in fasta_raw or "\n" in fasta_raw else fasta_raw

    desc_norm = normalize_descriptors(MolecularDescriptors.compute(smiles).to_array())
    sim = QuantumVQESimulator(backend=row.backend or "auto")
    _, gate_depth = sim.predict_affinity(desc_norm, optimize=False)

    pocket_gen = SyntheticPocketGenerator(random_seed=42)
    pockets = pocket_gen.generate_pockets(sequence=fasta_raw, count=5, length=45)
    pocket = pockets[0]

    pdb_local = str(object_storage.resolve_local(row.pocket_pdb_object))
    viewer_local = str(object_storage.resolve_local(row.viewer_html_object))

    result = PredictionResult(
        smiles=smiles,
        protein_sequence=pocket["sequence"],
        binding_energy_kcal_mol=row.binding_energy_kcal_mol,
        binding_score=row.binding_score,
        confidence_pct=row.confidence,
        pocket=pocket,
        pockets=pockets,
        pdb_path=pdb_local,
        viewer_html_path=viewer_local,
        gate_depth=gate_depth,
        backend=row.backend or sim.backend,
    )
    return build_showcase_payload(
        result,
        smiles=smiles,
        fasta=fasta,
        urls={
            "viewer_html_url": row.viewer_html_object,
            "report_pdf_url": row.report_pdf_object,
            "report_csv_url": row.report_csv_object,
            "pocket_pdb_url": row.pocket_pdb_object,
        },
    )


def load_showcase_cache() -> Optional[Dict[str, Any]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return None
