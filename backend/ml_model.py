"""
ML model for bot detection — v5.

Architecture: Soft-Voting Ensemble (GradientBoosting + RandomForest).

Training strategy:
  1. First boot: train on a rich synthetic dataset (4 bot personas).
  2. Real-data retraining: when /admin/retrain is called and the feature
     store has ≥ MIN_SAMPLES_PER_CLASS samples per class, the model is
     retrained on a mix of synthetic + real data (synthetic acts as
     regularisation to prevent over-fitting on early real data).
  3. Version tag: bump _MODEL_VERSION to force retrain on next start.

Features used (21 total):
   0  mouse_entropy          — variance of 2-D velocity; humans ~3-12, bots ~0-1.5
   1  typing_delay           — avg ms between keystrokes; humans 80-450, bots 0-20
   2  webdriver              — 1 if navigator.webdriver is true
   3  plugins_count          — 0 in headless Chrome
   4  scroll_events          — 0 in most bots
   5  time_on_page           — seconds; bots submit in < 3 s
   6  font_count             — system fonts detected; headless = 0-4
   7  audio_available        — OfflineAudioContext works (1) or blocked (0)
   8  webrtc_available       — RTCPeerConnection works (1) or absent (0)
   9  click_variance         — std-dev of inter-click intervals; bots ≈ 0
  10  hardware_concurrency   — logical CPUs; headless often 0-2
  11  stealth_detected       — CDP/Playwright globals found (1) or not (0)
  12  battery_available      — Battery Status API accessible (1) or not (0)
  13  gpu_consistency        — 0 if GPU vendor/renderer mismatch UA
  14  timezone_consistency   — 0 if reported timezone is inconsistent
  15  playwright_detected    — Playwright framework detected (new v5)
  16  selenium_detected      — Selenium framework detected (new v5)
  17  audio_stability        — audio fingerprint stability 0-1 (new v5)
  18  webrtc_ip_leak         — local IP leaked via WebRTC (new v5)
  19  webrtc_stun_blocked    — STUN requests blocked (new v5)
  20  font_fp_empty          — font fingerprint hash empty (new v5)
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier

if TYPE_CHECKING:
    pass

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
    "font_count",
    "audio_available",
    "webrtc_available",
    "click_variance",
    "hardware_concurrency",
    "stealth_detected",
    "battery_available",
    "gpu_consistency",
    "timezone_consistency",
    "audio_stability",        # new in v5
    "audio_worklet",          # new in v5
    "webrtc_ip_leak",         # new in v5
    "webrtc_stun_blocked",    # new in v5
    "font_canvas_detected",   # new in v5
    "font_list_hash_present", # new in v5
    "playwright_detected",    # new in v5
    "playwright_artifacts",   # new in v5
    "selenium_detected",      # new in v5
    "selenium_artifacts",     # new in v5
    "webrtc_protocol_is_tcp",# new in v5
    "font_canvas_vs_css",    # new in v5
]

# Bump to force retrain on next start
_MODEL_VERSION = "v5"
_VERSION_PATH = MODEL_PATH + ".version"

# Synthetic data mix ratio when real data is available
_SYNTHETIC_WEIGHT = 0.30   # 30 % synthetic samples blended with real data


# ---------------------------------------------------------------------------
# Synthetic dataset — 4 bot personas for better coverage
# ---------------------------------------------------------------------------

def _build_synthetic_dataset(n: int = 400) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate a balanced synthetic dataset with 27 features.

    Bot personas:
      A. Naive bot      — obvious signals, no patches
      B. Stealth bot    — patches webdriver, leaves CDP, no battery/fonts
      C. Headless mobile bot — mobile UA spoof, no touch/battery
      D. API bot        — no browser at all (all zeros except maybe webdriver)
    """
    rng = np.random.default_rng(42)

    # ── Human samples ──────────────────────────────────────────────────────
    human = np.column_stack([
        rng.uniform(2.0, 12.0, n),               # mouse_entropy
        rng.uniform(80, 450, n),                  # typing_delay
        np.zeros(n),                              # webdriver
        rng.integers(2, 12, n).astype(float),    # plugins_count
        rng.integers(3, 25, n).astype(float),    # scroll_events
        rng.uniform(10, 180, n),                  # time_on_page
        rng.integers(30, 120, n).astype(float),  # font_count
        np.ones(n),                               # audio_available
        np.ones(n),                               # webrtc_available
        rng.uniform(50, 800, n),                  # click_variance
        rng.integers(4, 16, n).astype(float),    # hardware_concurrency
        np.zeros(n),                              # stealth_detected
        np.ones(n),                               # battery_available
        np.ones(n),                               # gpu_consistency
        np.ones(n),                               # timezone_consistency
        rng.uniform(0.85, 1.0, n),               # audio_stability
        np.ones(n),                               # audio_worklet
        np.ones(n),                               # webrtc_ip_leak
        np.zeros(n),                              # webrtc_stun_blocked
        rng.integers(30, 120, n).astype(float),  # font_canvas_detected
        np.ones(n),                               # font_list_hash_present
        np.zeros(n),                              # playwright_detected
        np.zeros(n),                              # playwright_artifacts
        np.zeros(n),                              # selenium_detected
        np.zeros(n),                              # selenium_artifacts
        np.zeros(n),                              # webrtc_protocol_is_tcp
        rng.uniform(0, 5, n),                     # font_canvas_vs_css
    ])

    # ── Persona A: Naive bot (50 % of bots) ───────────────────────────────
    nA = int(n * 0.50)
    botA = np.column_stack([
        rng.uniform(0.0, 1.2, nA),
        rng.uniform(0, 15, nA),
        np.ones(nA),                              # webdriver=1
        np.zeros(nA),
        np.zeros(nA),
        rng.uniform(0, 3, nA),
        np.zeros(nA),                             # no fonts
        np.zeros(nA),
        np.zeros(nA),
        rng.uniform(0, 2, nA),
        rng.choice([0, 1], nA).astype(float),
        np.zeros(nA),
        np.zeros(nA),
        rng.choice([0, 1], nA, p=[0.7, 0.3]).astype(float),
        rng.choice([0, 1], nA, p=[0.6, 0.4]).astype(float),
        rng.uniform(0, 0.5, nA),                 # audio_stability low
        np.zeros(nA),                             # no audio_worklet
        np.zeros(nA),                             # no webrtc_ip_leak
        rng.choice([0, 1], nA, p=[0.5, 0.5]).astype(float),  # webrtc_stun_blocked
        np.zeros(nA),                             # no fonts via canvas
        np.zeros(nA),                             # no font_list_hash
        rng.choice([0, 1], nA, p=[0.4, 0.6]).astype(float),  # playwright_detected
        rng.integers(0, 5, nA).astype(float),    # playwright_artifacts
        rng.choice([0, 1], nA, p=[0.4, 0.6]).astype(float),  # selenium_detected
        rng.integers(0, 8, nA).astype(float),    # selenium_artifacts
        rng.choice([0, 1], nA, p=[0.7, 0.3]).astype(float),  # webrtc_tcp
        rng.uniform(15, 50, nA),                 # font_canvas_vs_css large
    ])

    # ── Persona B: Stealth bot (25 % of bots) ─────────────────────────────
    nB = int(n * 0.25)
    botB = np.column_stack([
        rng.uniform(0.5, 2.0, nB),               # faked higher entropy
        rng.uniform(15, 70, nB),
        np.zeros(nB),                             # webdriver patched
        rng.integers(0, 3, nB).astype(float),
        rng.integers(0, 5, nB).astype(float),
        rng.uniform(2, 12, nB),
        rng.integers(0, 6, nB).astype(float),    # very few fonts
        rng.choice([0, 1], nB, p=[0.55, 0.45]).astype(float),
        rng.choice([0, 1], nB, p=[0.65, 0.35]).astype(float),
        rng.uniform(0, 10, nB),
        rng.integers(1, 4, nB).astype(float),
        np.ones(nB),                              # stealth_detected=1
        np.zeros(nB),
        rng.choice([0, 1], nB, p=[0.5, 0.5]).astype(float),
        rng.choice([0, 1], nB, p=[0.4, 0.6]).astype(float),
        rng.uniform(0.4, 0.9, nB),               # audio_stability medium
        rng.choice([0, 1], nB, p=[0.6, 0.4]).astype(float),
        rng.choice([0, 1], nB, p=[0.5, 0.5]).astype(float),
        rng.choice([0, 1], nB, p=[0.4, 0.6]).astype(float),
        rng.integers(0, 30, nB).astype(float),   # few canvas fonts
        rng.choice([0, 1], nB, p=[0.3, 0.7]).astype(float),
        rng.choice([0, 1], nB, p=[0.6, 0.4]).astype(float),  # playwright
        rng.integers(1, 8, nB).astype(float),    # more playwright artifacts
        rng.choice([0, 1], nB, p=[0.6, 0.4]).astype(float),  # selenium
        rng.integers(1, 10, nB).astype(float),   # more selenium artifacts
        rng.choice([0, 1], nB, p=[0.5, 0.5]).astype(float),
        rng.uniform(10, 40, nB),                 # font mismatch
    ])

    # ── Persona C: Headless mobile spoof (15 % of bots) ───────────────────
    nC = int(n * 0.15)
    botC = np.column_stack([
        rng.uniform(0.0, 1.5, nC),
        rng.uniform(0, 25, nC),
        rng.choice([0, 1], nC, p=[0.6, 0.4]).astype(float),
        np.zeros(nC),
        np.zeros(nC),
        rng.uniform(0, 5, nC),
        rng.integers(0, 3, nC).astype(float),
        np.zeros(nC),
        np.zeros(nC),
        rng.uniform(0, 4, nC),
        rng.integers(0, 2, nC).astype(float),
        rng.choice([0, 1], nC, p=[0.3, 0.7]).astype(float),
        np.zeros(nC),
        rng.choice([0, 1], nC, p=[0.6, 0.4]).astype(float),
        rng.choice([0, 1], nC, p=[0.5, 0.5]).astype(float),
        rng.uniform(0, 0.6, nC),                 # audio_stability low
        np.zeros(nC),
        np.zeros(nC),
        rng.choice([0, 1], nC, p=[0.4, 0.6]).astype(float),
        np.zeros(nC),
        np.zeros(nC),
        rng.choice([0, 1], nC, p=[0.5, 0.5]).astype(float),
        rng.integers(0, 3, nC).astype(float),
        rng.choice([0, 1], nC, p=[0.5, 0.5]).astype(float),
        rng.integers(0, 4, nC).astype(float),
        rng.choice([0, 1], nC, p=[0.6, 0.4]).astype(float),
        rng.uniform(20, 60, nC),
    ])

    # ── Persona D: API / curl bot (10 % of bots) ──────────────────────────
    nD = n - nA - nB - nC
    botD = np.column_stack([
        np.zeros(nD),                             # zero mouse entropy
        np.zeros(nD),                             # zero typing delay
        np.ones(nD),                              # webdriver=1
        np.zeros(nD),
        np.zeros(nD),
        rng.uniform(0, 1, nD),
        np.zeros(nD),
        np.zeros(nD),
        np.zeros(nD),
        np.zeros(nD),
        rng.integers(0, 2, nD).astype(float),
        np.zeros(nD),
        np.zeros(nD),
        np.zeros(nD),
        np.zeros(nD),
        np.zeros(nD),                             # audio_stability=0
        np.zeros(nD),
        np.zeros(nD),
        np.ones(nD),                              # stun blocked
        np.zeros(nD),
        np.zeros(nD),
        rng.choice([0, 1], nD, p=[0.3, 0.7]).astype(float),
        rng.integers(0, 3, nD).astype(float),
        rng.choice([0, 1], nD, p=[0.3, 0.7]).astype(float),
        rng.integers(0, 5, nD).astype(float),
        np.ones(nD),                              # TCP only
        rng.uniform(30, 80, nD),                 # large font mismatch
    ])

    bot = np.vstack([botA, botB, botC, botD])
    X = np.vstack([human, bot])
    y = np.array([0] * n + [1] * n)
    return X, y


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------

def _build_ensemble() -> VotingClassifier:
    gbm = GradientBoostingClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.04,
        subsample=0.8,
        min_samples_leaf=5,
        random_state=42,
    )
    rf = RandomForestClassifier(
        n_estimators=250,
        max_depth=9,
        min_samples_leaf=3,
        random_state=42,
    )
    return VotingClassifier(
        estimators=[("gbm", gbm), ("rf", rf)],
        voting="soft",
        weights=[2, 1],
    )


def _train_on_data(X: np.ndarray, y: np.ndarray) -> VotingClassifier:
    clf = _build_ensemble()
    clf.fit(X, y)
    return clf


def _train_synthetic() -> VotingClassifier:
    logger.info("Training on synthetic data (v4, 15 features, 4 bot personas)…")
    X, y = _build_synthetic_dataset()
    clf = _train_on_data(X, y)
    _save(clf)
    return clf


def _save(clf: VotingClassifier) -> None:
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    with open(_VERSION_PATH, "w") as f:
        f.write(_MODEL_VERSION)
    logger.info("Model saved → %s", MODEL_PATH)


def _load_or_train() -> VotingClassifier:
    if os.path.exists(MODEL_PATH) and os.path.exists(_VERSION_PATH):
        try:
            with open(_VERSION_PATH) as f:
                saved_version = f.read().strip()
            if saved_version == _MODEL_VERSION:
                clf = joblib.load(MODEL_PATH)
                logger.info("Loaded model %s from %s", _MODEL_VERSION, MODEL_PATH)
                return clf
            logger.info("Version mismatch (%s vs %s) — retraining.", saved_version, _MODEL_VERSION)
        except Exception as exc:
            logger.warning("Cannot load model (%s) — retraining.", exc)
    return _train_synthetic()


# ---------------------------------------------------------------------------
# Public retrain API — called by /admin/retrain
# ---------------------------------------------------------------------------

def retrain_from_store() -> dict:
    """
    Mix real feature-store data with synthetic samples and retrain.
    Returns a summary dict.
    """
    from .feature_store import load_samples, ready_to_retrain, MIN_SAMPLES_PER_CLASS

    if not ready_to_retrain():
        counts_msg = "Not enough real samples yet."
        logger.info("retrain_from_store: %s", counts_msg)
        return {"status": "skipped", "reason": counts_msg}

    Xr, yr = load_samples()
    Xr_np = np.array(Xr, dtype=float)
    yr_np = np.array(yr, dtype=int)

    # Pad or truncate features to match FEATURE_NAMES length
    expected = len(FEATURE_NAMES)
    if Xr_np.shape[1] < expected:
        pad = np.zeros((Xr_np.shape[0], expected - Xr_np.shape[1]))
        Xr_np = np.hstack([Xr_np, pad])
    elif Xr_np.shape[1] > expected:
        Xr_np = Xr_np[:, :expected]

    # Blend with synthetic to prevent overfitting on small real sets
    n_synth = max(MIN_SAMPLES_PER_CLASS, int(len(yr) * _SYNTHETIC_WEIGHT))
    Xs, ys = _build_synthetic_dataset(n=n_synth)
    X_all = np.vstack([Xr_np, Xs])
    y_all = np.concatenate([yr_np, ys])

    logger.info(
        "Retraining: %d real + %d synthetic = %d total",
        len(yr), len(ys), len(y_all),
    )
    clf = _train_on_data(X_all, y_all)
    _save(clf)

    global _model
    _model = clf

    return {
        "status": "ok",
        "real_samples": len(yr),
        "synthetic_samples": len(ys),
        "total": len(y_all),
    }


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_model: VotingClassifier = _load_or_train()


# ---------------------------------------------------------------------------
# Predict
# ---------------------------------------------------------------------------

def predict(
    mouse_entropy: float,
    typing_delay: float,
    webdriver: bool,
    plugins_count: int,
    scroll_events: int,
    time_on_page: float,
    font_count: int = 0,
    audio_available: bool = False,
    webrtc_available: bool = False,
    click_variance: float = 0.0,
    hardware_concurrency: int = 0,
    stealth_detected: bool = False,
    battery_available: bool = False,
    gpu_consistency: int = 1,
    timezone_consistency: int = 1,
    audio_stability: float = 1.0,
    audio_worklet: bool = True,
    webrtc_ip_leak: bool = True,
    webrtc_stun_blocked: bool = False,
    font_canvas_detected: int = 0,
    font_list_hash_present: bool = True,
    playwright_detected: bool = False,
    playwright_artifacts: int = 0,
    selenium_detected: bool = False,
    selenium_artifacts: int = 0,
    webrtc_protocol_is_tcp: bool = False,
    font_canvas_vs_css: float = 0.0,
) -> float:
    """Return bot probability in [0, 1]."""
    features = np.array([[
        float(mouse_entropy),
        float(typing_delay),
        float(webdriver),
        float(plugins_count),
        float(scroll_events),
        float(time_on_page),
        float(font_count),
        float(audio_available),
        float(webrtc_available),
        float(click_variance),
        float(hardware_concurrency),
        float(stealth_detected),
        float(battery_available),
        float(gpu_consistency),
        float(timezone_consistency),
        float(audio_stability),
        float(audio_worklet),
        float(webrtc_ip_leak),
        float(webrtc_stun_blocked),
        float(font_canvas_detected),
        float(font_list_hash_present),
        float(playwright_detected),
        float(playwright_artifacts),
        float(selenium_detected),
        float(selenium_artifacts),
        float(webrtc_protocol_is_tcp),
        float(font_canvas_vs_css),
    ]])
    proba: float = _model.predict_proba(features)[0][1]
    return float(proba)
