"""
Scoring module — v5

Risk Engine architecture:
  1. Rule Engine    — named rules with fixed point values, fired independently
  2. Component scores — browser / behavior / network / ml (0-100 each)
  3. Bayesian weight selection — posterior weights conditioned on evidence
  4. Final probability — weighted average with confidence modifier
  5. Verdict — BOT / SUSPICIOUS / HUMAN with configurable thresholds

Key improvements over v4:
  - Rule engine: every triggered rule is named and exported for UI explainability
  - Bayesian posterior: 7 weight profiles conditioned on combined evidence
  - Confidence modifier: high-agreement signals boost final score
  - Network tier feeds directly into weight selection (not just score)
  - All score functions return (score, triggered_rules[]) for full transparency
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# Base (prior) weights — sum to 1.0
# ---------------------------------------------------------------------------
BASE_WEIGHTS = {
    "browser": 0.35,
    "network": 0.15,
    "behavior": 0.25,
    "ml": 0.25,
}

# Verdict thresholds
THRESHOLD_BOT = 65.0
THRESHOLD_SUSPICIOUS = 40.0

# Behavioral thresholds
MOUSE_ENTROPY_HUMAN_MIN = 1.5
TYPING_DELAY_HUMAN_MIN = 40.0

# GPU software rasterizer keywords
_SWRAST_KW = [
    "swiftshader", "llvmpipe", "softpipe", "mesa offscreen",
    "software rasterizer", "google swiftshader",
]
_MOBILE_UA_RE = re.compile(r"mobile|android|iphone|ipad", re.I)
_DESKTOP_GPU_RE = re.compile(
    r"nvidia|amd|radeon|intel|apple m\d|geforce|quadro|rtx|gtx", re.I
)


# ---------------------------------------------------------------------------
# Rule dataclass
# ---------------------------------------------------------------------------

@dataclass
class Rule:
    key: str            # machine-readable identifier
    label: str          # human-readable label for UI
    category: str       # browser / behavior / network / ml
    points: float       # score contribution (0–100 range)
    max_points: float   # maximum possible contribution
    triggered: bool     # did this rule fire?
    value: str          # observed value (for display)
    explanation: str    # why this is suspicious


# ---------------------------------------------------------------------------
# Bayesian weight profiles
# ---------------------------------------------------------------------------
# Profiles are selected based on the strongest available evidence.
# They represent the posterior P(bot | evidence) weight allocation.

_WEIGHT_PROFILES: dict[str, dict[str, float]] = {
    # Confirmed Tor / anonymizer
    "tor": {
        "browser": 0.28, "network": 0.07, "behavior": 0.38, "ml": 0.27,
    },
    # Known VPN / proxy
    "vpn": {
        "browser": 0.28, "network": 0.08, "behavior": 0.35, "ml": 0.29,
    },
    # Datacenter IP — bot may be hiding behind a clean browser
    "datacenter": {
        "browser": 0.28, "network": 0.10, "behavior": 0.34, "ml": 0.28,
    },
    # Automation confirmed (webdriver=true or stealth detected)
    "automation": {
        "browser": 0.45, "network": 0.10, "behavior": 0.25, "ml": 0.20,
    },
    # Strong behavioral evidence (no mouse movement + instant submit)
    "behavioral": {
        "browser": 0.30, "network": 0.12, "behavior": 0.38, "ml": 0.20,
    },
    # High browser score (rule-based confidence is high)
    "high_browser": {
        "browser": 0.42, "network": 0.12, "behavior": 0.25, "ml": 0.21,
    },
    # Default / balanced prior
    "base": BASE_WEIGHTS,
}


def select_weight_profile(
    network_tier: str,
    browser: float,
    behavior: float,
    webdriver: bool,
    stealth: bool,
) -> tuple[str, dict[str, float]]:
    """
    Select the posterior weight profile given observed evidence.
    Returns (profile_name, weights).

    Priority order:
      automation > tor > vpn > datacenter > behavioral > high_browser > base
    """
    if webdriver or stealth:
        return "automation", _WEIGHT_PROFILES["automation"]
    if network_tier == "tor":
        return "tor", _WEIGHT_PROFILES["tor"]
    if network_tier in ("vpn", "proxy"):
        return "vpn", _WEIGHT_PROFILES["vpn"]
    if network_tier == "datacenter":
        return "datacenter", _WEIGHT_PROFILES["datacenter"]
    if behavior >= 60:
        return "behavioral", _WEIGHT_PROFILES["behavioral"]
    if browser >= 70:
        return "high_browser", _WEIGHT_PROFILES["high_browser"]
    return "base", _WEIGHT_PROFILES["base"]


def dynamic_weights(
    network: float,
    browser: float = 0.0,
    network_tier: str = "residential",
    webdriver: bool = False,
    stealth: bool = False,
    behavior: float = 0.0,
) -> dict[str, float]:
    """Public wrapper — returns just the weights dict (backward-compatible)."""
    _, weights = select_weight_profile(network_tier, browser, behavior, webdriver, stealth)
    return weights


# ---------------------------------------------------------------------------
# Browser score — Rule Engine
# ---------------------------------------------------------------------------

def browser_score_detailed(data: dict) -> tuple[float, list[Rule]]:
    """
    Returns (score 0-100, list_of_triggered_rules).
    Every contributing signal is a named Rule for full UI explainability.
    """
    rules: list[Rule] = []
    ua = (data.get("user_agent") or "").lower()
    webdriver = data.get("webdriver")
    plugins = int(data.get("plugins_count") or data.get("plugins") or 0)
    gpu_renderer = (data.get("gpu_renderer") or "").lower()
    gpu_vendor = (data.get("gpu_vendor") or "").lower()
    is_mobile = bool(_MOBILE_UA_RE.search(ua))

    def rule(key, label, pts, max_pts, triggered, value, explanation):
        rules.append(Rule(key, label, "browser", pts if triggered else 0,
                          max_pts, triggered, value, explanation))

    rule("webdriver", "WebDriver Flag", 65, 65, bool(webdriver),
         str(webdriver),
         "navigator.webdriver = true — automation framework active")

    headless_kw = ["headless", "selenium", "playwright", "puppeteer",
                   "phantom", "pyppeteer", "browserless", "chromeless"]
    found_kw = [w for w in headless_kw if w in ua]
    rule("headless_ua", "Headless/Automation UA Keyword", 30, 30, bool(found_kw),
         found_kw[0] if found_kw else "clean",
         f"User-Agent contains '{found_kw[0]}'" if found_kw else "No automation keywords")

    rule("zero_plugins", "Zero Plugins", 15, 15, plugins == 0,
         f"{plugins} plugins",
         "Headless Chrome reports 0 plugins; real Chrome always has ≥1")

    rule("stealth_cdp", "Stealth / CDP Artifacts", 12, 12,
         data.get("stealth_detected") is True, "detected" if data.get("stealth_detected") else "clean",
         "CDP variable names or Playwright globals found — stealth mode detected")

    audio_ok = data.get("audio_available") is True or (
        data.get("audio_hash") and data.get("audio_hash") != "unavailable")
    rule("audio_missing", "Audio Fingerprint Blocked", 8, 8, not audio_ok,
         "blocked" if not audio_ok else "available",
         "OfflineAudioContext blocked — headless environments disable this API")

    webrtc_ok = data.get("webrtc_available") is True
    rule("webrtc_missing", "WebRTC Unavailable", 8, 8, not webrtc_ok,
         "absent" if not webrtc_ok else "present",
         "RTCPeerConnection stripped — sandboxed/headless browser")

    rule("audio_webrtc_compound", "Both Audio+WebRTC Missing", 5, 5,
         not audio_ok and not webrtc_ok,
         "both absent" if (not audio_ok and not webrtc_ok) else "ok",
         "Compound signal: both APIs absent = very high bot confidence")

    font_count = int(data.get("font_count") or 0)
    rule("zero_fonts", "Zero System Fonts", 7, 7, font_count == 0,
         f"{font_count} fonts",
         "No system fonts detected — running in a minimal container")
    rule("few_fonts", "Very Few Fonts (1-4)", 4, 4, 0 < font_count < 5,
         f"{font_count} fonts",
         f"{font_count} system fonts — near-headless environment")

    # GPU checks
    swrast = any(kw in gpu_renderer for kw in _SWRAST_KW)
    rule("swiftshader_gpu", "SwiftShader / Software GPU", 8, 8, swrast,
         gpu_renderer[:40] if gpu_renderer else "empty",
         "Software rasterizer (SwiftShader/llvmpipe) = headless Chromium")

    rule("missing_gpu_vendor", "Missing GPU Vendor", 5, 5, not data.get("gpu_vendor"),
         data.get("gpu_vendor") or "empty",
         "No WebGL vendor — WebGL debug extension missing or blocked")

    rule("missing_gpu_renderer", "Missing GPU Renderer", 5, 5,
         not data.get("gpu_renderer"),
         data.get("gpu_renderer") or "empty",
         "No WebGL renderer — headless environments lack GPU drivers")

    rule("canvas_missing", "Canvas Fingerprint Failed", 5, 5,
         not data.get("canvas_hash"),
         data.get("canvas_hash") or "empty",
         "Canvas API blocked or sandboxed — fingerprint unavailable")

    rule("chrome_obj_missing", "window.chrome Missing", 6, 6,
         data.get("chrome_obj_missing") is True,
         "missing" if data.get("chrome_obj_missing") else "present",
         "Real Chrome always exposes window.chrome — absence indicates non-standard environment")

    touch_support = data.get("touch_support")
    mobile_no_touch = is_mobile and touch_support is False
    rule("mobile_no_touch", "Mobile UA / No Touch", 6, 6, mobile_no_touch,
         "mobile UA + no touch" if mobile_no_touch else "ok",
         "Claims mobile User-Agent but has no touch support — spoofed UA")

    hw_conc = data.get("hardware_concurrency")
    rule("zero_hw_concurrency", "Zero CPU Threads", 6, 6,
         hw_conc is not None and int(hw_conc) == 0,
         f"{hw_conc} threads",
         "hardware_concurrency = 0 — headless container or CI environment")

    rule("no_device_memory", "Device Memory Unreported", 4, 4,
         data.get("device_memory") is None or data.get("device_memory") == 0,
         f"{data.get('device_memory')} GB" if data.get("device_memory") else "not reported",
         "navigator.deviceMemory absent — headless browsers rarely set this")

    rule("battery_absent", "Battery API Unavailable", 4, 4,
         data.get("battery_available") is False,
         "absent" if data.get("battery_available") is False else "available",
         "Battery Status API disabled — headless Chromium default")

    rule("tz_screen_mismatch", "Timezone/Screen Inconsistency", 6, 6,
         data.get("timezone_consistency") == 0,
         "suspicious" if data.get("timezone_consistency") == 0 else "normal",
         "Classic headless default resolution (800×600 or 1280×720) with no plugins")

    rule("gpu_ua_mismatch", "GPU/UA Consistency Fail", 8, 8,
         data.get("gpu_consistency") == 0,
         "mismatch" if data.get("gpu_consistency") == 0 else "consistent",
         "GPU renderer contradicts User-Agent (e.g. SwiftShader on desktop UA)")

    score = sum(r.points for r in rules)
    return min(score, 100.0), rules


def browser_score(data: dict) -> float:
    score, _ = browser_score_detailed(data)
    return score


# ---------------------------------------------------------------------------
# Behavior score — Rule Engine
# ---------------------------------------------------------------------------

def behavior_score_detailed(data: dict) -> tuple[float, list[Rule]]:
    rules: list[Rule] = []

    mouse = float(data.get("mouse_entropy") or 0)
    typing = float(data.get("typing_delay") or 0)
    scroll = int(data.get("scroll_events") or 0)
    top = float(data.get("time_on_page") or 0)
    click_var = float(data.get("click_variance") or 0)
    click_cnt = int(data.get("click_count") or 0)

    def rule(key, label, pts, max_pts, triggered, value, explanation):
        rules.append(Rule(key, label, "behavior", pts if triggered else 0,
                          max_pts, triggered, value, explanation))

    rule("low_mouse_entropy", "Low Mouse Entropy", 30, 30,
         mouse < MOUSE_ENTROPY_HUMAN_MIN,
         f"{mouse:.3f}",
         f"Mouse entropy {mouse:.2f} < {MOUSE_ENTROPY_HUMAN_MIN} — no natural movement")

    rule("fast_typing", "Automated Typing (<40ms avg)", 30, 30,
         typing < TYPING_DELAY_HUMAN_MIN,
         f"{typing:.0f}ms avg" if typing > 0 else "no input",
         "Average keystroke delay < 40ms — physically impossible for humans")

    rule("inhuman_typing", "Inhuman Typing Speed (<5ms)", 10, 10,
         0 < typing < 5,
         f"{typing:.1f}ms",
         "Sub-5ms keystroke delay — automated input driver detected")

    rule("no_scroll", "No Scroll Events", 20, 20, scroll == 0,
         f"{scroll} events",
         "Zero scroll events — bot navigated directly to submit without reading")

    rule("instant_submit", "Instant Submission (<3s)", 20, 20,
         0 < top < 3,
         f"{top:.1f}s",
         "Form submitted within 3 seconds of page load — bot pattern")

    rule("uniform_clicks", "Uniform Click Timing", 15, 15,
         click_cnt >= 3 and click_var < 5.0,
         f"±{click_var:.1f}ms variance" if click_cnt >= 3 else f"{click_cnt} clicks",
         "Machine-precision click intervals (std dev < 5ms) — automated clicking")

    rule("single_robotic_click", "Single Robotic Click", 8, 8,
         click_cnt == 1 and click_var == 0,
         "1 click, 0 variance",
         "Exactly 1 click with zero timing variance — programmatic click injection")

    score = sum(r.points for r in rules)
    return min(score, 100.0), rules


def behavior_score(data: dict) -> float:
    score, _ = behavior_score_detailed(data)
    return score


# ---------------------------------------------------------------------------
# Confidence modifier
# ---------------------------------------------------------------------------

def _confidence_modifier(
    browser: float, behavior: float, ml: float, network_tier: str
) -> float:
    """
    Bonus multiplier [1.0 – 1.15] when multiple independent signals agree.

    Rationale: if browser AND behavior AND ML all point to bot, the
    posterior probability is higher than any single score would suggest.
    """
    bot_signals = 0
    if browser >= 60:
        bot_signals += 1
    if behavior >= 50:
        bot_signals += 1
    if ml >= 0.6:
        bot_signals += 1
    if network_tier in ("tor", "vpn", "proxy"):
        bot_signals += 1

    if bot_signals >= 4:
        return 1.15
    if bot_signals >= 3:
        return 1.10
    if bot_signals >= 2:
        return 1.05
    return 1.0


# ---------------------------------------------------------------------------
# Consistency helpers
# ---------------------------------------------------------------------------

def gpu_ua_consistency(data: dict) -> int:
    ua = (data.get("user_agent") or "").lower()
    renderer = (data.get("gpu_renderer") or "").lower()
    vendor = (data.get("gpu_vendor") or "").lower()
    is_mobile = bool(_MOBILE_UA_RE.search(ua))
    if any(kw in renderer for kw in _SWRAST_KW):
        return 0
    if not is_mobile and _DESKTOP_GPU_RE.search(ua) and not renderer:
        return 0
    return 1


def timezone_screen_consistency(data: dict) -> int:
    sw = int(data.get("screen_width") or 0)
    sh = int(data.get("screen_height") or 0)
    plugins = int(data.get("plugins_count") or 0)
    if sw == 800 and sh == 600 and plugins == 0:
        return 0
    if sw == 1280 and sh == 720 and plugins == 0:
        return 0
    if sw == 1920 and sh == 1080 and plugins == 0 and not data.get("audio_available"):
        return 0
    return 1


# ---------------------------------------------------------------------------
# Final probability
# ---------------------------------------------------------------------------

def final_probability(
    browser: float,
    network: float,
    behavior: float,
    ml: float,
    network_tier: str = "residential",
    webdriver: bool = False,
    stealth: bool = False,
) -> float:
    """
    Compute final bot probability using Bayesian posterior weights
    and a confidence modifier.

    ml is in [0, 1] and is scaled to [0, 100] here.
    """
    profile_name, weights = select_weight_profile(
        network_tier, browser, behavior, webdriver, stealth
    )
    ml_scaled = ml * 100.0

    raw = (
        browser    * weights["browser"]
        + network  * weights["network"]
        + behavior * weights["behavior"]
        + ml_scaled * weights["ml"]
    )

    # Apply confidence modifier
    modifier = _confidence_modifier(browser, behavior, ml, network_tier)
    adjusted = raw * modifier

    return round(min(adjusted, 100.0), 2)


def verdict(prob: float) -> str:
    if prob >= THRESHOLD_BOT:
        return "BOT"
    if prob >= THRESHOLD_SUSPICIOUS:
        return "SUSPICIOUS"
    return "HUMAN"
