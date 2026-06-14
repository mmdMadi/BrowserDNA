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

    # Behavioural
    mouse_entropy: Optional[float] = Field(None, ge=0)
    typing_delay: Optional[float] = Field(None, ge=0)
    scroll_events: Optional[int] = Field(None, ge=0)
    time_on_page: Optional[float] = Field(None, ge=0)

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

    mouse_entropy: Optional[float]
    typing_delay: Optional[float]
    scroll_events: Optional[int]
    time_on_page: Optional[float]

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
