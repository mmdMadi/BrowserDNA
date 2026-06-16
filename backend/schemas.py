"""Pydantic schemas for request/response validation."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# Inbound — sent by the browser fingerprint collector
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    # Form fields
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    reason: str = Field(..., pattern="^(research|testing|normal|automation)$")

    # Browser / navigator signals
    user_agent: Optional[str] = Field(None, max_length=1024)
    platform: Optional[str] = Field(None, max_length=64)
    language: Optional[str] = Field(None, max_length=32)
    timezone: Optional[str] = Field(None, max_length=64)
    screen_width: Optional[int] = Field(None, ge=0, le=10000)
    screen_height: Optional[int] = Field(None, ge=0, le=10000)
    color_depth: Optional[int] = Field(None, ge=0, le=64)
    hardware_concurrency: Optional[int] = Field(None, ge=0, le=256)
    device_memory: Optional[float] = Field(None, ge=0)
    touch_support: Optional[bool] = None
    cookie_enabled: Optional[bool] = None
    do_not_track: Optional[str] = Field(None, max_length=32)

    # GPU
    gpu_vendor: Optional[str] = Field(None, max_length=256)
    gpu_renderer: Optional[str] = Field(None, max_length=512)

    # Bot signals
    webdriver: Optional[bool] = None
    canvas_hash: Optional[str] = Field(None, max_length=64)
    plugins_count: Optional[int] = Field(None, ge=0)

    # Advanced fingerprint signals
    audio_hash: Optional[str] = Field(None, max_length=64)
    audio_available: Optional[bool] = None
    webrtc_available: Optional[bool] = None
    font_count: Optional[int] = Field(None, ge=0)
    chrome_obj_missing: Optional[bool] = None
    stealth_detected: Optional[bool] = None
    battery_available: Optional[bool] = None
    # Consistency signals
    gpu_consistency: Optional[int] = Field(None, ge=0, le=1)
    timezone_consistency: Optional[int] = Field(None, ge=0, le=1)

    # Phase 2: Audio Fingerprint
    audio_stability: Optional[float] = Field(None, ge=0, le=1)
    audio_worklet: Optional[bool] = None
    audio_hash_2: Optional[str] = Field(None, max_length=64)

    # Phase 2: WebRTC Fingerprint
    webrtc_ip_leak: Optional[bool] = None
    webrtc_protocol: Optional[str] = Field(None, max_length=16)
    webrtc_candidate_types: Optional[str] = Field(None, max_length=512)
    webrtc_stun_blocked: Optional[bool] = None

    # Phase 2: Font Fingerprint
    font_fingerprint_hash: Optional[str] = Field(None, max_length=512)
    font_list_hash: Optional[str] = Field(None, max_length=512)
    font_canvas_detected: Optional[int] = Field(None, ge=0)

    # Phase 2: Playwright Detection
    playwright_detected: Optional[bool] = None
    playwright_artifacts: Optional[str] = Field(None, max_length=512)
    playwright_version: Optional[str] = Field(None, max_length=64)

    # Phase 2: Selenium Detection
    selenium_detected: Optional[bool] = None
    selenium_artifacts: Optional[str] = Field(None, max_length=512)
    selenium_driver_version: Optional[str] = Field(None, max_length=64)

    # Behavioural
    mouse_entropy: Optional[float] = Field(None, ge=0)
    typing_delay: Optional[float] = Field(None, ge=0)
    scroll_events: Optional[int] = Field(None, ge=0)
    time_on_page: Optional[float] = Field(None, ge=0)
    click_variance: Optional[float] = Field(None, ge=0)
    click_count: Optional[int] = Field(None, ge=0)

    @field_validator("name", "reason", mode="before")
    @classmethod
    def strip_strings(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------------------
# Outbound — returned to the caller after analysis
# ---------------------------------------------------------------------------

class AnalyzeResponse(BaseModel):
    visit_id: int
    verdict: str
    bot_probability: float
    browser_score: float
    behavior_score: float
    network_score: float
    ml_probability: float
    # Dynamic weights used for this request (for explainability UI)
    weights: dict[str, float]
    # v5 additions — network & weight explainability
    weight_profile: Optional[str] = None      # e.g. "automation", "datacenter", "base"
    network_tier: Optional[str] = None        # tor / vpn / proxy / datacenter / residential
    network_reasons: list[str] = []           # why this network score was assigned


# ---------------------------------------------------------------------------
# Visit list response (for the dashboard)
# ---------------------------------------------------------------------------

class VisitOut(BaseModel):
    id: int
    created_at: datetime
    ip: Optional[str]
    asn: Optional[str]
    name: Optional[str]
    email: Optional[str]
    reason: Optional[str]

    user_agent: Optional[str]
    platform: Optional[str]
    language: Optional[str]
    timezone: Optional[str]
    screen_width: Optional[int]
    screen_height: Optional[int]
    color_depth: Optional[int]
    hardware_concurrency: Optional[int]
    device_memory: Optional[float]
    touch_support: Optional[bool]
    cookie_enabled: Optional[bool]
    do_not_track: Optional[str]

    gpu_vendor: Optional[str]
    gpu_renderer: Optional[str]

    webdriver: Optional[bool]
    canvas_hash: Optional[str]
    plugins_count: Optional[int]

    # Advanced fingerprint signals
    audio_hash: Optional[str]
    audio_available: Optional[bool]
    webrtc_available: Optional[bool]
    font_count: Optional[int]
    chrome_obj_missing: Optional[bool]
    stealth_detected: Optional[bool]
    battery_available: Optional[bool]
    gpu_consistency: Optional[int]
    timezone_consistency: Optional[int]

    # Phase 2: Audio
    audio_stability: Optional[float]
    audio_worklet: Optional[bool]
    audio_hash_2: Optional[str]

    # Phase 2: WebRTC
    webrtc_ip_leak: Optional[bool]
    webrtc_protocol: Optional[str]
    webrtc_candidate_types: Optional[str]
    webrtc_stun_blocked: Optional[bool]

    # Phase 2: Font
    font_fingerprint_hash: Optional[str]
    font_list_hash: Optional[str]
    font_canvas_detected: Optional[int]

    # Phase 2: Playwright
    playwright_detected: Optional[bool]
    playwright_artifacts: Optional[str]
    playwright_version: Optional[str]

    # Phase 2: Selenium
    selenium_detected: Optional[bool]
    selenium_artifacts: Optional[str]
    selenium_driver_version: Optional[str]

    mouse_entropy: Optional[float]
    typing_delay: Optional[float]
    scroll_events: Optional[int]
    time_on_page: Optional[float]
    click_variance: Optional[float]
    click_count: Optional[int]

    browser_score: Optional[float]
    behavior_score: Optional[float]
    network_score: Optional[float]
    ml_probability: Optional[float]
    bot_probability: Optional[float]
    verdict: Optional[str]

    model_config = {"from_attributes": True}


class PaginatedVisits(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[VisitOut]
