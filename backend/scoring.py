"""
Scoring module — all weights and thresholds are centrally defined here.
Each score component returns a value in [0, 100].
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Configurable weights (must sum to 1.0)
# ---------------------------------------------------------------------------
WEIGHTS = {
    "browser": 0.35,
    "network": 0.15,
    "behavior": 0.25,
    "ml": 0.25,
}

# Verdict thresholds
THRESHOLD_BOT = 65.0        # lowered from 70 — webdriver + all behavior signals = clear BOT
THRESHOLD_SUSPICIOUS = 40.0

# Behavior calibration
MOUSE_ENTROPY_HUMAN_MIN = 1.5   # below this → suspicious
TYPING_DELAY_HUMAN_MIN = 40.0   # ms; below this → suspicious


def browser_score(data: dict) -> float:
    """Score based on browser fingerprint signals. Higher = more bot-like."""
    score = 0.0

    ua = (data.get("user_agent") or "").lower()
    webdriver = data.get("webdriver")
    plugins = int(data.get("plugins_count") or data.get("plugins") or 0)

    # Strongest signal: webdriver flag — automation frameworks always set this.
    # A controlled browser is definitionally a bot, so this alone crosses the
    # BOT threshold when combined with any one other signal.
    if webdriver:
        score += 60  # raised from 45 → guarantees BOT when any other signal fires

    # Headless browser keywords in UA
    headless_keywords = ["headless", "selenium", "playwright", "puppeteer", "phantom", "pyppeteer"]
    if any(w in ua for w in headless_keywords):
        score += 30

    # No plugins (headless Chrome has 0)
    if plugins == 0:
        score += 15  # raised from 10 — zero plugins is a strong headless indicator

    # Missing GPU info (headless often has no WebGL)
    if not data.get("gpu_vendor"):
        score += 5
    if not data.get("gpu_renderer"):
        score += 5

    # Canvas hash — null or known headless hash
    if not data.get("canvas_hash"):
        score += 5

    return min(score, 100.0)


def behavior_score(data: dict) -> float:
    """Score based on behavioral signals. Higher = more bot-like."""
    score = 0.0

    mouse = float(data.get("mouse_entropy") or 0)
    typing = float(data.get("typing_delay") or 0)
    scroll = int(data.get("scroll_events") or 0)
    time_on_page = float(data.get("time_on_page") or 0)

    # Very low mouse entropy → likely no real mouse movement
    if mouse < MOUSE_ENTROPY_HUMAN_MIN:
        score += 30

    # Extremely fast typing → automated input
    if typing < TYPING_DELAY_HUMAN_MIN:
        score += 30

    # No scrolling at all
    if scroll == 0:
        score += 20

    # Submitted too fast (under 3 seconds on page)
    if 0 < time_on_page < 3:
        score += 20

    return min(score, 100.0)


def final_probability(
    browser: float,
    network: float,
    behavior: float,
    ml: float,
) -> float:
    """
    Weighted average of all signal components.
    All inputs must be in [0, 100].
    ml is passed as a fraction [0, 1] and scaled here.
    """
    prob = (
        browser * WEIGHTS["browser"]
        + network * WEIGHTS["network"]
        + behavior * WEIGHTS["behavior"]
        + (ml * 100) * WEIGHTS["ml"]
    )
    return round(min(prob, 100.0), 2)


def verdict(prob: float) -> str:
    if prob >= THRESHOLD_BOT:
        return "BOT"
    if prob >= THRESHOLD_SUSPICIOUS:
        return "SUSPICIOUS"
    return "HUMAN"
