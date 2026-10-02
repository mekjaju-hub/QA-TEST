# Customer Activity Monitoring (Demo) — Automation (CAM)

Generated from APPROVED test cases: TC-CAM-RULE3-001, TC-CAM-RULE3-002, TC-CAM-RULE3-003, TC-CAM-RULE3-004, TC-CAM-RULE3-005, TC-CAM-RULE3-006, TC-CAM-RULE3-007, TC-CAM-RULE3-008, TC-CAM-RULE3-009, TC-CAM-RULE3-010, TC-CAM-RULE4-001, TC-CAM-RULE4-002, TC-CAM-RULE4-003, TC-CAM-RULE4-004, TC-CAM-RULE4-005, TC-CAM-RULE4-006, TC-CAM-RULE5-001, TC-CAM-RULE5-002, TC-CAM-RULE5-003, TC-CAM-RULE5-004, TC-CAM-RULE5-005, TC-CAM-RULE6-001, TC-CAM-RULE6-002, TC-CAM-RULE6-003

## Run

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env
pytest
```

Reports: reports/report.html, reports/junit.xml (import back into the platform: Test Runs → Import JUnit XML).
