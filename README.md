# HQCA — Hybrid Quantum-Classical Drug Discovery

**MVP version:** 1.1 | **Status:** Runnable (API + Dashboard + DB)

A hybrid quantum-classical simulator system for predicting the binding of drug molecules to a target protein.

---

## Quick Run (Live Dashboard)

```powershell
pip install -r requirements.txt
python run_dashboard.py
```

| Service | Address |
|--------|------|
| **Dashboard (UI + API)** | http://127.0.0.1:18080/ |
| **API Swagger** | http://127.0.0.1:18080/docs |
| **Health check** | http://127.0.0.1:18080/health |

**Default login:** `admin` / `admin12345`

> Default API port on Windows: `18080` (changeable with `HQCA_PORT`)

### Dashboard Pages
| Page | Content |
|------|--------|
| Drug example | Complete ibuprofen → COX-2 process (7 steps + 3D) |
| Dashboard | Virtual screening, SMILES and protein sequence, score chart |
| Results and 3D | Prediction history and viewer |
| New prediction | SMILES + FASTA simulation |
| Data generation | Synthetic dataset (1–5000 samples) |

## Project Structure

```
api.py              FastAPI + RBAC + Swagger
data.py             quantum core (VQC, VQE, COBYLA)
database.py         PostgreSQL / SQLite
showcase.py         end-to-end drug example
screening.py        virtual molecule screening
molecular_catalog.py  SMILES + protein sequence catalog
frontend/           web dashboard (served from the API)
run_dashboard.py    one-step API + browser launch
docker-compose.yml  PostgreSQL + MinIO + nginx
tests/              API integration tests
evaluation.py       acceptance criteria AC-01 .. AC-05
```

## Testing and Deployment

```powershell
python -m pytest tests/ -q
python evaluation.py
docker compose up --build
```

Documentation: [docs/INSTALLATION.md](docs/INSTALLATION.md) | [docs/API.md](docs/API.md)

---

Below, a complete **SRS (Software Requirements Specification)** has been prepared for the product "Hybrid Quantum-Classical Simulator System for Designing and Optimizing Drug Molecules". This document is written based on the IEEE 830 standard, taking into account patent filing and commercialization needs in Iran.

---

# Software Requirements Specification (SRS)
## Hybrid Quantum-Classical Simulator System (HQCA)
**Version:** 1.1
**Date:** 1405/03/19 (SRS) — MVP: 1405/04/08
**Product:** HQCA (Hybrid Quantum-Classical Assistant for Drug Discovery)

---

## 1. Introduction

### 1.1 Purpose
This document defines the functional and non-functional requirements of the **HQCA** system, a system that, by combining quantum computing and classical machine learning, predicts the binding of drug molecules to target proteins with high accuracy and optimized computational cost.

### 1.2 Scope
The system is able to:
- Receive the drug molecule SMILES string and the target protein sequence
- Generate synthetic data when real data is scarce
- Simulate binding free energy using the VQE algorithm on a quantum simulator or real hardware
- Output: binding score (Binding Affinity) in the range 0 to 100 and success probability

### 1.3 Definitions and Acronyms
| Term | Definition |
|-------|-------|
| QML | Quantum machine learning |
| VQE | Variational Quantum Eigensolver |
| HQCA | The proposed hybrid system |
| SMILES | String representation of molecular structure |
| PDB | Protein structure database |
| Angle Embedding | Mapping data to qubit rotation angles |

### 1.4 References
- IEEE 830-1998 standard
- Iranian patent law (approved 1386 and amendments)
- Reference papers: PocketGen (2025), ChemBFN (2025), Q-BAFNet (2025)

---

## 2. Overall Description

### 2.1 Product Vision
HQCA is a software system delivered as SaaS (Software as a Service) that enables pharmaceutical companies, universities and research centers to perform virtual molecule screening at 20 times the speed of classical methods and with accuracy above 85%.

### 2.2 Key Features
| No. | Feature |
|-------|-------|
| F1 | Generation of synthetic protein pocket and drug molecule data |
| F2 | Calculation of classical descriptors (MW, LogP, HBA, HBD, etc.) |
| F3 | Quantum encoding with Angle Embedding |
| F4 | Variational quantum circuit (VQC) with a binary-tree entanglement pattern |
| F5 | Classical COBYLA optimizer |
| F6 | Binding score prediction and graphical display of the binding pocket |
| F7 | Storing and retrieving results (database) |
| F8 | Reporting for patent filing and laboratory documentation |

### 2.3 Users
| Role | Description |
|------|-------|
| Pharmaceutical researcher | Enter molecule and protein, receive prediction |
| System administrator | Install, configure, monitor quantum processing |
| QML developer | Tune the variational circuit and optimizer parameters |

### 2.4 Constraints
- No physical quantum hardware in Iran → in the first phase, classical simulators (Qiskit Aer, PennyLane) are used instead.
- A maximum of 30 simulated qubits on machines with 64 GB of RAM.
- Response time for each drug-protein pair of at most 5 minutes (in simulator mode).

---

## 3. Functional Requirements

### 3.1 Data Input and Validation Module
| ID | Requirement |
|-------|----------|
| FR-01 | The system must be able to receive the drug molecule SMILES string (maximum 200 characters). |
| FR-02 | The system must be able to receive the protein sequence as an amino acid string (FASTA format). |
| FR-03 | The system must validate the SMILES using the RDKit library and report an error for invalid input. |

### 3.2 Synthetic Data Generation Module
| ID | Requirement |
|-------|----------|
| FR-04 | When "synthetic" mode is enabled, the system must generate 5 diverse protein pockets per drug using the PocketGen model (or an equivalent implementation). |
| FR-05 | The system must generate at least 1000 new drug molecules structurally similar to the original input using the ChemBFN model (or RNN+RL). |
| FR-06 | The system must provide the ability to specify the number of synthetic samples (e.g., 500, 1000, 5000) through the user interface. |

### 3.3 Descriptor Calculation Module
| ID | Requirement |
|-------|----------|
| FR-07 | For each SMILES molecule, the following 7 descriptors must be calculated: MW, LogP, HBD, HBA, Rotatable Bonds, Aromatic Rings, TPSA. |
| FR-08 | The descriptors must be normalized (scale 0 to 1) and sent to the quantum module. |

### 3.4 Quantum Encoding Module (Angle Embedding)
| ID | Requirement |
|-------|----------|
| FR-09 | Each descriptor must be converted to a qubit rotation angle with the formula θ_i = arctan(normalized_value_i). |
| FR-10 | The number of qubits must be 7 (the number of descriptors). |

### 3.5 Variational Quantum Circuit (VQC) Module
| ID | Requirement |
|-------|----------|
| FR-11 | The circuit must consist of three consecutive layers: a layer of single-qubit RX gates with learnable parameters, a binary-tree entanglement layer (CNOT between qubit i and i+1 and then i and i+2), and a data-dependent RY rotation layer (the input data is applied again) |
| FR-12 | The circuit depth (number of sequential gates) must be at most 20 gates so that it runs on existing simulators. |
| FR-13 | The system must support backend selection: `qiskit_aer_simulator` (default), `braket_local` or `quantum_device` (optional). |

### 3.6 Measurement and Optimization Module
| ID | Requirement |
|-------|----------|
| FR-14 | After running the circuit, measurement is performed in the Z basis and the expectation value ⟨Z⟩ is taken as the raw output. |
| FR-15 | Cost function = ∥⟨Z⟩_predicted − BindingAffinity_true∥ (for training) or the final output for prediction. |
| FR-16 | The COBYLA optimizer with a maximum of 200 iterations updates the variational parameters. |

### 3.7 Prediction and Output Module
| ID | Requirement |
|-------|----------|
| FR-17 | The system must display the final output numerically (binding score from 0 to 100). |
| FR-18 | Along with the output, a confidence level (e.g., 92%) and the suggested binding pocket region (with interactive 3D display) must be provided. |
| FR-19 | It must be possible to save the output in PDF (patent report) and CSV (raw data) formats. |

---

## 4. Non-Functional Requirements

### 4.1 Performance
| ID | Requirement |
|-------|----------|
| NFR-01 | Average prediction time for each drug-protein pair of at most 5 minutes (on a server with 16 cores, 64 GB RAM). |
| NFR-02 | Simultaneous support of at least 5 user requests without noticeable slowdown. |

### 4.2 Availability
| ID | Requirement |
|-------|----------|
| NFR-03 | The system must be accessible via a web browser (modern: Chrome, Firefox, Edge). |
| NFR-04 | System availability of 99% during working hours (8 AM to 8 PM, except for a 2-hour weekly maintenance window). |

### 4.3 Security
| ID | Requirement |
|-------|----------|
| NFR-05 | Input data (SMILES, protein sequence) must be encrypted in the database (AES-256). |
| NFR-06 | Role-based access (RBAC): regular users see only their own results; administrators have access to the system log and access settings. |

### 4.4 Maintainability and Support
| ID | Requirement |
|-------|----------|
| NFR-07 | The system must have documented API (Swagger/OpenAPI) for integration with other systems. |
| NFR-08 | Error logs must be stored centrally (JSON format). |

---

## 5. System Architecture (Summary)

![Proposed architecture](Hypothetical image – a diagram would be placed here in the actual document)

Layers:
1. **Presentation layer (Frontend)** – React.js
2. **API layer** – FastAPI (Python)
3. **Business logic layer**:
   - Synthetic data generation (PocketGen, ChemBFN)
   - Descriptor calculation (RDKit)
   - Quantum orchestrator (managing VQC execution on the simulator)
4. **Storage layer** – PostgreSQL (user data, results) + MinIO (3D PDB files)

---

## 6. Data Requirements

### 6.1 Initial Training Data (for the prototype)
| Dataset | Estimated count | Generation method |
|-------------|--------------|------------|
| Drug-protein pairs | 10,000 | Combination of public real data (BindingDB subset) + synthetic with PocketGen |
| Binding energy labels | 1,000 | Computed with VQE on an 8-qubit simulator |
| Molecular descriptors | 40,000 (pre-training) | Computed from ChemBFN synthetic SMILES |

### 6.2 Estimated Storage Volume
- Each stored pair with PDB structure (compressed): ~50 MB × 10,000 = 500 GB
- Metadata database: ~10 GB

---

## 7. External Interfaces

### 7.1 User Interface (UI)
- Main page: SMILES and FASTA entry fields, "Simulate" button
- Results page: binding score bar chart, 3D pocket viewer (Three.js)
- Management page: tuning variational circuit parameters (number of layers, number of iterations, simulator selection)

### 7.2 Application Programming Interface (API)
- `POST /predict` → JSON input (smiles, fasta) → output {binding_score, confidence, pocket_pdb_url}
- `POST /generate_synthetic` → {num_samples, smiles_seed} → {task_id}
- `GET /status/{task_id}`

### 7.3 Hardware Interface (optional)
- When connected to real quantum hardware (IBM Q, D-Wave), the system must communicate through the Qiskit Runtime API.

---

## 8. Acceptance Criteria (for delivery)

| No. | Criterion |
|-------|-------|
| AC-01 | For 100 drug-protein pairs whose results are already known in public databases (PDBbind), the system can provide predictions with a mean absolute error (MAE) of less than 1.2 (kcal/mol). |
| AC-02 | The average response time for 80% of requests must be under 4 minutes. |
| AC-03 | All functional requirements (FR-01 to FR-19) must pass in integration tests. |
| AC-04 | API documentation and a complete user guide must be provided. |
| AC-05 | The system must be successfully deployed on a cloud server (e.g., Iran Server infrastructure or a domestic cloud) and run for 7 days without critical errors. |

---

## 9. Appendices (suggested)

### Appendix A – Sample VQC Module Pseudocode
```python
from qiskit import QuantumCircuit
import numpy as np

def angle_embedding(features, qc, qubits):
    for i, f in enumerate(features):
        qc.rx(np.arctan(f), qubits[i])

def tree_entanglement(qc, n_qubits):
    for layer in range(int(np.log2(n_qubits))):
        step = 2**layer
        for i in range(0, n_qubits, step*2):
            for j in range(step):
                if i+j+step < n_qubits:
                    qc.cx(i+j, i+j+step)

def variational_circuit(features, params):
    n = len(features)
    qc = QuantumCircuit(n)
    angle_embedding(features, qc, range(n))
    for p in params:
        for i in range(n):
            qc.ry(p[i], i)
        tree_entanglement(qc, n)
    return qc
```

### Appendix B – Sample JSON Output Format
```json
{
  "status": "success",
  "prediction": {
    "binding_score": 87.3,
    "confidence_interval": [84.1, 90.5],
    "units": "kcal/mol"
  },
  "visualization_url": "/static/pockets/pocket_abc123.pdb",
  "report_url": "/reports/20250319_134522.pdf"
}
```

---

## 10. Revision History

| Version | Date | Author | Changes |
|------|-------|---------|----------|
| 0.1 | 1405/03/10 | Analysis team | Initial draft |
| 1.0 | 1405/03/19 | Technical team | Final for patent filing |
| 1.1 | 1405/04/08 | Technical team | MVP: FastAPI, Dashboard, DB, COBYLA, PDF/3D |

---

