"""
Bot Detection API — FastAPI backend
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
from .ml_model import predict
from .network_analysis import network_score
from .schemas import AnalyzeRequest, AnalyzeResponse, PaginatedVisits, VisitOut
from .scoring import behavior_score, browser_score, final_probability, verdict

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB bootstrap
# ---------------------------------------------------------------------------
models.Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Simple in-memory rate limiter for the demo endpoint
# ---------------------------------------------------------------------------
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 5        # max requests
RATE_WINDOW = 10.0    # per N seconds


def check_rate_limit(ip: str) -> tuple[bool, int, int]:
    """Returns (allowed, remaining, retry_after_seconds)."""
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
    version="2.0.0",
    description="Multi-signal bot detection API with browser fingerprinting, behavioral analysis, and ML.",
)

# CORS — allow Next.js dev server and production origin
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


# ---------------------------------------------------------------------------
# Helper: resolve real client IP (proxy-aware)
# ---------------------------------------------------------------------------
def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse, tags=["Detection"])
async def analyze(
    body: AnalyzeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    ip = get_client_ip(request)
    logger.info("Analyze request from %s", ip)

    # --- Network ---
    net_score, asn = network_score(ip)

    # --- Browser ---
    b_score = browser_score(body.model_dump())

    # --- Behavior ---
    beh_score = behavior_score(body.model_dump())

    # --- ML ---
    try:
        ml = predict(
            mouse_entropy=float(body.mouse_entropy or 0),
            typing_delay=float(body.typing_delay or 0),
            webdriver=bool(body.webdriver),
            plugins_count=int(body.plugins_count or 0),
            scroll_events=int(body.scroll_events or 0),
            time_on_page=float(body.time_on_page or 0),
        )
    except Exception as exc:
        logger.warning("ML prediction failed: %s", exc)
        ml = 0.0

    prob = final_probability(b_score, net_score, beh_score, ml)
    v = verdict(prob)

    # --- Persist ---
    visit = models.Visit(
        ip=ip,
        asn=asn,
        name=body.name,
        email=body.email,
        reason=body.reason,
        user_agent=body.user_agent,
        platform=body.platform,
        language=body.language,
        timezone=body.timezone,
        screen_width=body.screen_width,
        screen_height=body.screen_height,
        color_depth=body.color_depth,
        hardware_concurrency=body.hardware_concurrency,
        device_memory=body.device_memory,
        touch_support=body.touch_support,
        cookie_enabled=body.cookie_enabled,
        do_not_track=body.do_not_track,
        gpu_vendor=body.gpu_vendor,
        gpu_renderer=body.gpu_renderer,
        webdriver=body.webdriver,
        canvas_hash=body.canvas_hash,
        plugins_count=body.plugins_count,
        mouse_entropy=body.mouse_entropy,
        typing_delay=body.typing_delay,
        scroll_events=body.scroll_events,
        time_on_page=body.time_on_page,
        browser_score=b_score,
        behavior_score=beh_score,
        network_score=net_score,
        ml_probability=round(ml * 100, 2),
        bot_probability=prob,
        verdict=v,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    logger.info("Visit %d: verdict=%s prob=%.1f%%", visit.id, v, prob)

    return AnalyzeResponse(
        visit_id=visit.id,
        verdict=v,
        bot_probability=prob,
        browser_score=b_score,
        behavior_score=beh_score,
        network_score=net_score,
        ml_probability=round(ml * 100, 2),
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
        total=total,
        page=page,
        page_size=page_size,
        items=[VisitOut.model_validate(i) for i in items],
    )


@app.get("/visits/{visit_id}", response_model=VisitOut, tags=["Dashboard"])
def get_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(models.Visit).filter(models.Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return VisitOut.model_validate(visit)


# ---------------------------------------------------------------------------
# Lab demo endpoints
# ---------------------------------------------------------------------------

@app.get("/demo/rate-limit", tags=["Lab"])
async def demo_rate_limit(request: Request):
    """
    Rate-limit demo — allows 5 requests per 10 seconds per IP.
    Used by the Attack Simulation module to demonstrate rate limiting live.
    """
    ip = get_client_ip(request)
    allowed, remaining, retry_after = check_rate_limit(ip)

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )

    return {
        "status": "ok",
        "message": "Request allowed",
        "remaining": remaining,
        "limit": RATE_LIMIT,
        "window_seconds": RATE_WINDOW,
    }


@app.post("/demo/honeypot", tags=["Lab"])
async def demo_honeypot(request: Request):
    """
    Honeypot field demo — if the hidden field is filled, it's a bot.
    """
    body = await request.json()
    honeypot_value = body.get("_hp", "")
    if honeypot_value:
        return {
            "caught": True,
            "reason": "Honeypot field was filled",
            "value": honeypot_value[:50],
        }
    return {"caught": False, "reason": "Honeypot field is empty — looks human"}


@app.get("/demo/echo", tags=["Lab"])
async def demo_echo(request: Request):
    """Returns request headers — useful for inspecting what the browser sends."""
    return {
        "ip": get_client_ip(request),
        "headers": dict(request.headers),
    }
