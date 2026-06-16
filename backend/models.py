from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Index
from sqlalchemy.sql import func
from .database import Base


class Visit(Base):
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Identity
    ip = Column(String, nullable=True, index=True)
    asn = Column(String, nullable=True)
    name = Column(String, nullable=True)
    email = Column(String, nullable=True, index=True)
    reason = Column(String, nullable=True)

    # Browser fingerprint
    user_agent = Column(String, nullable=True)
    platform = Column(String, nullable=True)
    language = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    screen_width = Column(Integer, nullable=True)
    screen_height = Column(Integer, nullable=True)
    color_depth = Column(Integer, nullable=True)
    hardware_concurrency = Column(Integer, nullable=True)
    device_memory = Column(Float, nullable=True)
    touch_support = Column(Boolean, nullable=True)
    cookie_enabled = Column(Boolean, nullable=True)
    do_not_track = Column(String, nullable=True)

    # GPU
    gpu_vendor = Column(String, nullable=True)
    gpu_renderer = Column(String, nullable=True)

    # Bot signals
    webdriver = Column(Boolean, nullable=True)
    canvas_hash = Column(String, nullable=True)
    plugins_count = Column(Integer, nullable=True)

    # Advanced fingerprint signals
    audio_hash = Column(String, nullable=True)
    audio_available = Column(Boolean, nullable=True)
    webrtc_available = Column(Boolean, nullable=True)
    font_count = Column(Integer, nullable=True)
    chrome_obj_missing = Column(Boolean, nullable=True)
    stealth_detected = Column(Boolean, nullable=True)
    battery_available = Column(Boolean, nullable=True)
    # Consistency signals (v4)
    gpu_consistency = Column(Integer, nullable=True)      # 1=ok 0=mismatch
    timezone_consistency = Column(Integer, nullable=True) # 1=ok 0=mismatch

    # Behavioral
    mouse_entropy = Column(Float, nullable=True)
    typing_delay = Column(Float, nullable=True)
    scroll_events = Column(Integer, nullable=True)
    time_on_page = Column(Float, nullable=True)
    click_variance = Column(Float, nullable=True)
    click_count = Column(Integer, nullable=True)

    # Scores
    browser_score = Column(Float, nullable=True)
    behavior_score = Column(Float, nullable=True)
    network_score = Column(Float, nullable=True)
    ml_probability = Column(Float, nullable=True)
    bot_probability = Column(Float, nullable=True)
    verdict = Column(String, nullable=True, index=True)


# Composite index for dashboard queries
Index("ix_visits_verdict_created", Visit.verdict, Visit.created_at)
