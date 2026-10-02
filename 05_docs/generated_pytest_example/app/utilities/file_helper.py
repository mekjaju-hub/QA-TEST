from pathlib import Path

REPORT_DIR = Path(__file__).resolve().parents[2] / "reports"


def ensure_report_dir() -> Path:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    return REPORT_DIR
