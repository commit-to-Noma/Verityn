"""Pytest bootstrap: make backend/ and src/ importable from anywhere."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # backend/ (app)
sys.path.insert(0, str(HERE.parent / "src"))  # src/ (verityn package)
