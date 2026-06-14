"""
ML model for bot detection.

On first run a synthetic training set is generated and the model is saved
to data/bot_model.joblib.  On subsequent runs the saved model is loaded.

Features used (6 total):
  0  mouse_entropy
  1  typing_delay
  2  webdriver        (1 = True)
  3  plugins_count
  4  scroll_events
  5  time_on_page
"""

from __future__ import annotations

import logging
import os

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "data", "bot_model.joblib")

FEATURE_NAMES = [
    "mouse_entropy",
    "typing_delay",
    "webdriver",
    "plugins_count",
    "scroll_events",
    "time_on_page",
]


def _build_synthetic_dataset() -> tuple[np.ndarray, np.ndarray]:
    """
    Generate a balanced synthetic training set.
    Human samples: high entropy, normal typing speed, no webdriver, plugins > 0,
                   some scrolling, reasonable time on page.
    Bot samples:   low entropy, very fast typing, webdriver flag, 0 plugins,
                   no scrolling, very fast submission.
    """
    rng = np.random.default_rng(42)

    n = 200  # samples per class

    # ----- Human samples -----
    human = np.column_stack([
        rng.uniform(2.0, 10.0, n),     # mouse_entropy
        rng.uniform(80, 400, n),        # typing_delay
        np.zeros(n),                   # webdriver = False
        rng.integers(2, 10, n).astype(float),  # plugins_count
        rng.integers(3, 20, n).astype(float),  # scroll_events
        rng.uniform(10, 120, n),        # time_on_page (seconds)
    ])

    # ----- Bot samples -----
    bot = np.column_stack([
        rng.uniform(0.0, 1.4, n),      # mouse_entropy (low)
        rng.uniform(0, 30, n),          # typing_delay (very fast)
        rng.choice([0, 1], n, p=[0.3, 0.7]).astype(float),  # webdriver
        rng.integers(0, 2, n).astype(float),   # plugins_count (0 or 1)
        rng.integers(0, 2, n).astype(float),   # scroll_events (0 or 1)
        rng.uniform(0, 5, n),           # time_on_page (very fast)
    ])

    X = np.vstack([human, bot])
    y = np.array([0] * n + [1] * n)
    return X, y


def _train_and_save() -> RandomForestClassifier:
    logger.info("Training bot detection model on synthetic dataset…")
    X, y = _build_synthetic_dataset()
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        random_state=42,
        class_weight="balanced",
    )
    clf.fit(X, y)
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    logger.info("Model saved to %s", MODEL_PATH)
    return clf


def _load_or_train() -> RandomForestClassifier:
    if os.path.exists(MODEL_PATH):
        try:
            clf = joblib.load(MODEL_PATH)
            logger.info("Loaded model from %s", MODEL_PATH)
            return clf
        except Exception as exc:
            logger.warning("Could not load model (%s) — retraining.", exc)
    return _train_and_save()


# Module-level singleton — loaded once at import time
_model: RandomForestClassifier = _load_or_train()


def predict(
    mouse_entropy: float,
    typing_delay: float,
    webdriver: bool,
    plugins_count: int,
    scroll_events: int,
    time_on_page: float,
) -> float:
    """Return bot probability in [0, 1]."""
    features = np.array([[
        mouse_entropy,
        typing_delay,
        float(webdriver),
        float(plugins_count),
        float(scroll_events),
        time_on_page,
    ]])
    proba: float = _model.predict_proba(features)[0][1]
    return float(proba)
