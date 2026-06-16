"""
Feature Store — persists raw feature vectors for periodic model retraining.

Every time /analyze is called the feature vector + ground-truth label
(derived from the current verdict) is appended to a JSONL file.
A separate /admin/retrain endpoint trains a new model from the accumulated
real data and replaces the in-memory singleton.

Data format (one JSON object per line):
{
  "ts": "2024-01-01T00:00:00",
  "features": [f0, f1, ..., f12],
  "label": 0 | 1,          # 0=human, 1=bot
  "verdict": "HUMAN"|"SUSPICIOUS"|"BOT",
  "source": "real"
}
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
FEATURE_FILE = DATA_DIR / "feature_store.jsonl"

# Minimum samples per class before we attempt real-data retraining
MIN_SAMPLES_PER_CLASS = 50


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def append_sample(
    features: list[float],
    verdict: str,
    source: str = "real",
) -> None:
    """
    Append one feature vector to the JSONL store.

    label mapping:
      BOT        → 1
      SUSPICIOUS → 1  (treat as positive for training)
      HUMAN      → 0
    """
    _ensure_data_dir()
    label = 0 if verdict == "HUMAN" else 1
    record = {
        "ts": datetime.utcnow().isoformat(),
        "features": [round(float(f), 6) for f in features],
        "label": label,
        "verdict": verdict,
        "source": source,
    }
    try:
        with FEATURE_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
    except Exception as exc:
        logger.warning("feature_store: could not append sample: %s", exc)


def load_samples() -> tuple[list[list[float]], list[int]]:
    """Return (X, y) lists from the JSONL store."""
    X: list[list[float]] = []
    y: list[int] = []
    if not FEATURE_FILE.exists():
        return X, y
    with FEATURE_FILE.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                X.append(rec["features"])
                y.append(int(rec["label"]))
            except Exception:
                continue
    return X, y


def sample_counts() -> dict[str, int]:
    """Return {'human': N, 'bot': N, 'total': N}."""
    _, y = load_samples()
    bots = sum(y)
    humans = len(y) - bots
    return {"human": humans, "bot": bots, "total": len(y)}


def ready_to_retrain() -> bool:
    counts = sample_counts()
    return (
        counts["human"] >= MIN_SAMPLES_PER_CLASS
        and counts["bot"] >= MIN_SAMPLES_PER_CLASS
    )
