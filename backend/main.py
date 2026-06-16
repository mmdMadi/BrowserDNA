"""
Bot Detection API — FastAPI backend  v5
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models
from .database import engine, get_db
from .feature_store import append_sample, sample_counts, ready_to_retrain
from .ml_model import predict, retrain_from_store, FEATURE_NAMES
from .network_analysis import analyze_network, network_detail
from .schemas import AnalyzeRequest, AnalyzeResponse, PaginatedVisits, VisitOut
from .scoring import (
    behavior_score,
    behavior_score_detailed,
    browser_score,
    browser_score_detailed,
    dynamic_weights,
    final_probability,
    gpu_ua_consistency,
    select_weight_profile,
    timezone_screen_consistency,
    verdict,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

models.Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# In-memory rate limiter (demo endpoint)
# ---------------------------------------------------------------------------
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 5
RATE_WINDOW = 10.0


def check_rate_limit(ip: str) -> tuple[bool, int, int]:
    now = time.time()
    window_start = now - RATE_WINDOW
    hits = _rate_store[ip] = [t for t in _rate_store[ip] if t > window_start]
    if len(hits) >= RATE_LIMIT:
        retry_after = int(RATE_WINDOW - (now - hits[0])) + 1
        return False, 0, retry_after
    hits.append(now)
    return True, RATE_LIMIT - len(hits), 0


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Bot Detection Lab",
    version="5.0.0",
    description=(
        "Multi-signal bot detection: browser fingerprinting, behavioural analysis, "
        "multi-layer network scoring, rule engine, Bayesian weights, ML ensemble, "
        "and a real-data feature store for periodic retraining."
    ),
)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _build_feature_vector(body: AnalyzeRequest, gpu_cons: int, tz_cons: int) -> list[float]:
    return [
        float(body.mouse_entropy or 0),
        float(body.typing_delay or 0),
        float(body.webdriver or False),
        float(body.plugins_count or 0),
        float(body.scroll_events or 0),
        float(body.time_on_page or 0),
        float(body.font_count or 0),
        float(body.audio_available or False),
        float(body.webrtc_available or False),
        float(body.click_variance or 0),
        float(body.hardware_concurrency or 0),
        float(body.stealth_detected or False),
        float(body.battery_available or False),
        float(gpu_cons),
        float(tz_cons),
    ]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok", "version": "5.0.0"}


@app.post("/analyze", response_model=AnalyzeResponse, tags=["Detection"])
async def analyze(
    body: AnalyzeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    logger.info("Analyze request from %s", ip)

    data = body.model_dump()

    # ── Consistency checks ────────────────────────────────────────────────
    gpu_cons = gpu_ua_consistency(data)
    tz_cons = timezone_screen_consistency(data)
    if body.gpu_consistency is not None:
        gpu_cons = int(body.gpu_consistency)
    if body.timezone_consistency is not None:
        tz_cons = int(body.timezone_consistency)
    data["gpu_consistency"] = gpu_cons
    data["timezone_consistency"] = tz_cons

    # ── Multi-layer network analysis ──────────────────────────────────────
    net_result = analyze_network(ip, dict(request.headers))
    net_score = net_result.score
    net_tier = net_result.tier
    asn = net_result.asn

    # ── Browser score (rule engine) ───────────────────────────────────────
    b_score, b_rules = browser_score_detailed(data)

    # ── Behavior score (rule engine) ──────────────────────────────────────
    beh_score, beh_rules = behavior_score_detailed(data)

    # ── ML ────────────────────────────────────────────────────────────────
    try:
        ml = predict(
            mouse_entropy=float(body.mouse_entropy or 0),
            typing_delay=float(body.typing_delay or 0),
            webdriver=bool(body.webdriver),
            plugins_count=int(body.plugins_count or 0),
            scroll_events=int(body.scroll_events or 0),
            time_on_page=float(body.time_on_page or 0),
            font_count=int(body.font_count or 0),
            audio_available=bool(body.audio_available),
            webrtc_available=bool(body.webrtc_available),
            click_variance=float(body.click_variance or 0),
            hardware_concurrency=int(body.hardware_concurrency or 0),
            stealth_detected=bool(body.stealth_detected),
            battery_available=bool(body.battery_available),
            gpu_consistency=gpu_cons,
            timezone_consistency=tz_cons,
            audio_stability=float(body.audio_stability or 1.0),
            audio_worklet=bool(body.audio_worklet) if body.audio_worklet is not None else True,
            webrtc_ip_leak=bool(body.webrtc_ip_leak) if body.webrtc_ip_leak is not None else True,
            webrtc_stun_blocked=bool(body.webrtc_stun_blocked),
            font_canvas_detected=int(body.font_canvas_detected or 0),
            font_list_hash_present=bool(body.font_list_hash),
            playwright_detected=bool(body.playwright_detected),
            playwright_artifacts=len(body.playwright_artifacts.split(",")) if body.playwright_artifacts else 0,
            selenium_detected=bool(body.selenium_detected),
            selenium_artifacts=len(body.selenium_artifacts.split(",")) if body.selenium_artifacts else 0,
            webrtc_protocol_is_tcp=bool(body.webrtc_protocol == "tcp"),
            font_canvas_vs_css=abs(int(body.font_canvas_detected or 0) - int(body.font_count or 0)),
        )
    except Exception as exc:
        logger.warning("ML prediction failed: %s", exc)
        ml = 0.0

    # ── Bayesian final probability ─────────────────────────────────────────
    prob = final_probability(
        b_score, net_score, beh_score, ml,
        network_tier=net_tier,
        webdriver=bool(body.webdriver),
        stealth=bool(body.stealth_detected),
    )
    v = verdict(prob)

    # ── Select weight profile for response ────────────────────────────────
    profile_name, used_weights = select_weight_profile(
        net_tier, b_score, beh_score,
        bool(body.webdriver), bool(body.stealth_detected),
    )

    # ── Persist ───────────────────────────────────────────────────────────
    visit = models.Visit(
        ip=ip, asn=asn,
        name=body.name, email=body.email, reason=body.reason,
        user_agent=body.user_agent, platform=body.platform,
        language=body.language, timezone=body.timezone,
        screen_width=body.screen_width, screen_height=body.screen_height,
        color_depth=body.color_depth,
        hardware_concurrency=body.hardware_concurrency,
        device_memory=body.device_memory, touch_support=body.touch_support,
        cookie_enabled=body.cookie_enabled, do_not_track=body.do_not_track,
        gpu_vendor=body.gpu_vendor, gpu_renderer=body.gpu_renderer,
        webdriver=body.webdriver, canvas_hash=body.canvas_hash,
        plugins_count=body.plugins_count,
        audio_hash=body.audio_hash, audio_available=body.audio_available,
        webrtc_available=body.webrtc_available, font_count=body.font_count,
        chrome_obj_missing=body.chrome_obj_missing,
        stealth_detected=body.stealth_detected,
        battery_available=body.battery_available,
        gpu_consistency=gpu_cons, timezone_consistency=tz_cons,
        mouse_entropy=body.mouse_entropy, typing_delay=body.typing_delay,
        scroll_events=body.scroll_events, time_on_page=body.time_on_page,
        click_variance=body.click_variance, click_count=body.click_count,
        browser_score=b_score, behavior_score=beh_score,
        network_score=net_score,
        ml_probability=round(ml * 100, 2),
        bot_probability=prob, verdict=v,
        # Phase 2 fields
        audio_stability=body.audio_stability,
        audio_worklet=body.audio_worklet,
        audio_hash_2=body.audio_hash_2,
        webrtc_ip_leak=body.webrtc_ip_leak,
        webrtc_protocol=body.webrtc_protocol,
        webrtc_candidate_types=body.webrtc_candidate_types,
        webrtc_stun_blocked=body.webrtc_stun_blocked,
        font_fingerprint_hash=body.font_fingerprint_hash,
        font_list_hash=body.font_list_hash,
        font_canvas_detected=body.font_canvas_detected,
        playwright_detected=body.playwright_detected,
        playwright_artifacts=body.playwright_artifacts,
        playwright_version=body.playwright_version,
        selenium_detected=body.selenium_detected,
        selenium_artifacts=body.selenium_artifacts,
        selenium_driver_version=body.selenium_driver_version,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    append_sample(_build_feature_vector(body, gpu_cons, tz_cons), v, source="real")
    logger.info("Visit %d: verdict=%s prob=%.1f%% tier=%s profile=%s",
                visit.id, v, prob, net_tier, profile_name)

    return AnalyzeResponse(
        visit_id=visit.id,
        verdict=v,
        bot_probability=prob,
        browser_score=b_score,
        behavior_score=beh_score,
        network_score=net_score,
        ml_probability=round(ml * 100, 2),
        weights=used_weights,
        weight_profile=profile_name,
        network_tier=net_tier,
        network_reasons=net_result.reasons,
    )


@app.get("/visits", response_model=PaginatedVisits, tags=["Dashboard"])
def list_visits(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    verdict_filter: Optional[str] = Query(None, alias="verdict"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Visit)
    if verdict_filter:
        query = query.filter(models.Visit.verdict == verdict_filter.upper())
    total = query.count()
    items = (
        query.order_by(models.Visit.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedVisits(
        total=total, page=page, page_size=page_size,
        items=[VisitOut.model_validate(i) for i in items],
    )


@app.get("/visits/{visit_id}", response_model=VisitOut, tags=["Dashboard"])
def get_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(models.Visit).filter(models.Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return VisitOut.model_validate(visit)


# ---------------------------------------------------------------------------
# Network inspection endpoint
# ---------------------------------------------------------------------------

@app.get("/network/{ip}", tags=["Detection"])
async def inspect_network(ip: str, request: Request):
    """Inspect network classification for a given IP address."""
    return network_detail(ip, dict(request.headers))


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.post("/admin/retrain", tags=["Admin"])
async def admin_retrain():
    counts = sample_counts()
    if not ready_to_retrain():
        return {
            "status": "insufficient_data",
            "store_counts": counts,
            "required_per_class": 50,
            "message": (
                f"Need ≥50 samples per class. "
                f"Current: {counts['human']} human, {counts['bot']} bot."
            ),
        }
    result = retrain_from_store()
    result["store_counts"] = counts
    return result


@app.get("/admin/store-stats", tags=["Admin"])
async def store_stats():
    counts = sample_counts()
    return {
        "store_counts": counts,
        "ready_to_retrain": ready_to_retrain(),
        "feature_names": FEATURE_NAMES,
    }


# ---------------------------------------------------------------------------
# Lab demo
# ---------------------------------------------------------------------------

@app.get("/demo/rate-limit", tags=["Lab"])
async def demo_rate_limit(request: Request):
    ip = get_client_ip(request)
    allowed, remaining, retry_after = check_rate_limit(ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    return {"status": "ok", "message": "Request allowed",
            "remaining": remaining, "limit": RATE_LIMIT, "window_seconds": RATE_WINDOW}


@app.post("/demo/honeypot", tags=["Lab"])
async def demo_honeypot(request: Request):
    body = await request.json()
    hp = body.get("_hp", "")
    if hp:
        return {"caught": True, "reason": "Honeypot field was filled", "value": hp[:50]}
    return {"caught": False, "reason": "Honeypot field is empty — looks human"}


@app.get("/demo/echo", tags=["Lab"])
async def demo_echo(request: Request):
    return {"ip": get_client_ip(request), "headers": dict(request.headers)}
