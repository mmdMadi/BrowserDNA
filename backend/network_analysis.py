"""
Network analysis — v5

Multi-layer network risk assessment:

Layer 1: ASN/WHOIS lookup (ipwhois RDAP) — keyword classification
Layer 2: Hardcoded high-confidence datacenter ASN list (top cloud providers)
Layer 3: Known Tor exit node prefix list (sampled, offline)
Layer 4: Request header analysis — X-Forwarded-For, Via, Proxy-* headers
Layer 5: Residential vs datacenter scoring composite

Score tiers (final):
  90  — confirmed Tor exit node (keyword OR known prefix)
  75  — VPN / anonymizer / proxy service
  55  — confirmed datacenter (known ASN) + header anomaly
  35  — datacenter / cloud provider (ASN keyword)
  15  — header-based proxy evidence only
   0  — residential / unknown

Returns a NetworkResult dataclass with score, tier, asn, reasons[]
for full explainability in the UI and Risk engine.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier 1 — Tor exit nodes (keyword-based, RDAP)
# ---------------------------------------------------------------------------
TOR_KEYWORDS = [
    "tor-exit", "torservers", "tor node", "tor project",
    "anonymizer", "anonymous proxy", "exit node", "torexit",
    "anonimizer", "torguard",
]

# ---------------------------------------------------------------------------
# Tier 2 — VPN / proxy / anonymizer services (keyword-based)
# ---------------------------------------------------------------------------
VPN_KEYWORDS = [
    "nordvpn", "expressvpn", "surfshark", "privateinternetaccess", "pia",
    "protonvpn", "mullvad", "ipvanish", "cyberghost", "tunnelbear",
    "windscribe", "hotspot shield", "perfect privacy", "ovpn", "purevpn",
    "atlasvpn", "vyprvpn", "ivacy", "hide.me", "strongvpn",
    "private internet access", "torguard", "airvpn", "trust.zone",
    "anonymous vpn", "vpn unlimited", "zenmate",
]

# Also treat explicit proxy/anonymizer ASN descriptions
PROXY_KEYWORDS = [
    "proxy", "anonymize", "socks", "squid", "privoxy",
    "transparent proxy", "open proxy", "elite proxy",
]

# ---------------------------------------------------------------------------
# Tier 3 — Datacenter / cloud / hosting (keyword-based)
# ---------------------------------------------------------------------------
DATACENTER_KEYWORDS = [
    # Hyperscalers
    "amazon", "aws", "google", "azure", "microsoft", "alibaba", "tencent",
    # IaaS
    "digitalocean", "linode", "akamai", "vultr", "ovh", "hetzner",
    "leaseweb", "packet", "choopa", "psychz", "buyvm", "path.net",
    "cogent", "colocrossing", "quadranet", "serverius", "reliablesite",
    "cloudflare", "fastly",
    # Generic descriptors
    "cloud", "hosting", "datacenter", "data center", "colocation",
    "dedicated server", "vps", "virtual private server", "iaas", "paas",
    "server farm", "internet exchange", "ix", "transit",
]

# ---------------------------------------------------------------------------
# Known datacenter ASN numbers (high-confidence, no keyword required)
# Source: well-known cloud provider ASNs
# ---------------------------------------------------------------------------
KNOWN_DATACENTER_ASNS: frozenset[str] = frozenset([
    # AWS
    "14618", "16509",
    # Google Cloud / GCP
    "15169", "396982",
    # Microsoft Azure
    "8075", "8070",
    # Cloudflare
    "13335",
    # DigitalOcean
    "14061",
    # Linode / Akamai
    "63949", "20940",
    # Vultr
    "20473",
    # OVH
    "16276",
    # Hetzner
    "24940",
    # Fastly
    "54113",
    # Leaseweb
    "28753",
    # Choopa / Vultr
    "20473",
    # Cogent
    "174",
    # CenturyLink / Lumen
    "3356",
    # Hurricane Electric
    "6939",
    # Zayo
    "6461",
])

# ---------------------------------------------------------------------------
# Known VPN provider ASNs
# ---------------------------------------------------------------------------
KNOWN_VPN_ASNS: frozenset[str] = frozenset([
    # Mullvad
    "39351",
    # ProtonVPN
    "62167",
    # NordVPN
    "212238",
    # ExpressVPN
    "136258",
    # Private Internet Access
    "10429",
    # TorGuard
    "46664",
])

# ---------------------------------------------------------------------------
# Sampled Tor exit node prefixes (offline list, top 20 by traffic)
# In production these would be fetched from https://check.torproject.org/torbulkexitlist
# ---------------------------------------------------------------------------
_TOR_EXIT_PREFIXES: list[str] = [
    "185.220.101.0/24",
    "185.220.102.0/24",
    "185.220.103.0/24",
    "199.249.230.0/24",
    "66.220.2.0/24",
    "162.247.72.0/24",
    "162.247.73.0/24",
    "162.247.74.0/24",
    "179.43.159.0/24",
    "104.244.76.0/22",
]
_TOR_NETWORKS = [ipaddress.ip_network(p) for p in _TOR_EXIT_PREFIXES]

# ---------------------------------------------------------------------------
# Request headers that indicate proxy / VPN / bot infra
# ---------------------------------------------------------------------------
PROXY_HEADERS = [
    "x-forwarded-for",
    "x-real-ip",
    "via",
    "proxy-connection",
    "forwarded",
    "x-cluster-client-ip",
    "x-client-ip",
    "x-originating-ip",
    "cf-connecting-ip",   # Cloudflare (may be legitimate)
    "x-envoy-external-address",
]

# Headers that suggest bot-infrastructure (curl, python-requests, etc.)
BOT_UA_KEYWORDS = [
    "curl", "wget", "python-requests", "python-httpx", "python-urllib",
    "go-http-client", "java/", "okhttp", "axios", "node-fetch",
    "libwww-perl", "scrapy", "httpclient", "restsharp",
]

# Human-readable tier labels
TIER_LABELS: dict[str, str] = {
    "tor": "Tor Exit Node",
    "vpn": "VPN / Anonymizer",
    "proxy": "Proxy / Anonymizer",
    "datacenter": "Datacenter / Cloud",
    "residential": "Residential / ISP",
    "unknown": "Unknown",
}


# ---------------------------------------------------------------------------
# Result dataclass — full explainability
# ---------------------------------------------------------------------------

@dataclass
class NetworkResult:
    score: float                          # 0–100 risk score
    tier: str                             # tor / vpn / proxy / datacenter / residential
    tier_label: str                       # human-readable
    asn: str                              # raw ASN description from RDAP
    asn_number: str                       # numeric ASN if available
    reasons: list[str] = field(default_factory=list)   # why this score
    header_flags: list[str] = field(default_factory=list)  # suspicious headers found
    is_private: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local
    except ValueError:
        return False


def _in_tor_prefix(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in net for net in _TOR_NETWORKS)
    except ValueError:
        return False


@lru_cache(maxsize=1024)
def _rdap_lookup(ip: str) -> tuple[str, str]:
    """Return (asn_description, asn_number). Cached."""
    try:
        from ipwhois import IPWhois
        obj = IPWhois(ip)
        res = obj.lookup_rdap(depth=1)
        description = (
            res.get("asn_description")
            or res.get("network", {}).get("name")
            or "UNKNOWN"
        )
        asn_num = str(res.get("asn") or "")
        return description, asn_num
    except Exception as exc:
        logger.warning("RDAP lookup failed for %s: %s", ip, exc)
        return "LOOKUP_FAILED", ""


def _classify_asn(asn_text: str, asn_num: str) -> tuple[str, list[str]]:
    """
    Return (tier, reasons[]).
    Priority: tor > vpn > proxy > datacenter > residential
    """
    text = asn_text.lower()
    reasons: list[str] = []

    # Check known VPN ASN numbers first (high confidence)
    if asn_num in KNOWN_VPN_ASNS:
        reasons.append(f"Known VPN provider ASN {asn_num}")
        return "vpn", reasons

    # Check known datacenter ASN numbers
    if asn_num in KNOWN_DATACENTER_ASNS:
        reasons.append(f"Known cloud/datacenter ASN {asn_num}")
        return "datacenter", reasons

    # Tor keywords
    if any(kw in text for kw in TOR_KEYWORDS):
        matched = [kw for kw in TOR_KEYWORDS if kw in text]
        reasons.append(f"ASN description contains Tor keyword(s): {matched}")
        return "tor", reasons

    # VPN keywords
    if any(kw in text for kw in VPN_KEYWORDS):
        matched = next(kw for kw in VPN_KEYWORDS if kw in text)
        reasons.append(f"ASN description matches VPN service: '{matched}'")
        return "vpn", reasons

    # Proxy keywords
    if any(kw in text for kw in PROXY_KEYWORDS):
        matched = next(kw for kw in PROXY_KEYWORDS if kw in text)
        reasons.append(f"ASN description matches proxy/anonymizer: '{matched}'")
        return "proxy", reasons

    # Datacenter keywords
    if any(kw in text for kw in DATACENTER_KEYWORDS):
        matched = next(kw for kw in DATACENTER_KEYWORDS if kw in text)
        reasons.append(f"ASN description matches datacenter: '{matched}'")
        return "datacenter", reasons

    return "residential", []


def _analyze_headers(headers: dict[str, str]) -> tuple[float, list[str]]:
    """
    Inspect HTTP request headers for proxy/bot indicators.
    Returns (extra_score 0-20, flags[]).
    """
    extra = 0.0
    flags: list[str] = []
    headers_lower = {k.lower(): v for k, v in headers.items()}

    # Proxy-chain headers
    for h in PROXY_HEADERS:
        if h in headers_lower:
            val = headers_lower[h]
            # Multiple IPs in X-Forwarded-For = proxy chain
            if h == "x-forwarded-for" and "," in val:
                flags.append(f"Proxy chain: {h}: {val[:60]}")
                extra += 10
            elif h in ("via", "proxy-connection"):
                flags.append(f"Proxy header: {h}: {val[:40]}")
                extra += 8
            elif h in ("x-real-ip", "forwarded"):
                flags.append(f"Forwarded header: {h}")
                extra += 5

    # Bot User-Agent in request headers
    ua = headers_lower.get("user-agent", "")
    if any(kw in ua.lower() for kw in BOT_UA_KEYWORDS):
        matched = next(kw for kw in BOT_UA_KEYWORDS if kw in ua.lower())
        flags.append(f"Bot-like User-Agent in request: '{matched}'")
        extra += 15

    # Missing Accept-Language (bots often don't set this)
    if "accept-language" not in headers_lower:
        flags.append("Missing Accept-Language header")
        extra += 5

    # Missing Accept-Encoding (bots often don't set this)
    if "accept-encoding" not in headers_lower:
        flags.append("Missing Accept-Encoding header")
        extra += 3

    return min(extra, 20.0), flags


# ---------------------------------------------------------------------------
# Main public interface
# ---------------------------------------------------------------------------

def analyze_network(ip: str, headers: Optional[dict[str, str]] = None) -> NetworkResult:
    """
    Full multi-layer network analysis.
    Returns a NetworkResult with score, tier, reasons, header_flags.
    """
    if not ip or ip in ("unknown", "localhost"):
        return NetworkResult(
            score=0.0, tier="unknown", tier_label="Unknown",
            asn="LOCAL", asn_number="", is_private=True,
            reasons=["IP address unknown"],
        )

    if _is_private_ip(ip):
        return NetworkResult(
            score=0.0, tier="residential", tier_label="Private / Local",
            asn="PRIVATE_OR_LOCAL", asn_number="", is_private=True,
            reasons=["Private/loopback IP — not scored"],
        )

    result = NetworkResult(
        score=0.0, tier="residential",
        tier_label=TIER_LABELS["residential"],
        asn="", asn_number="",
    )

    # ── Layer 1: Check known Tor prefixes (offline, fast) ─────────────────
    if _in_tor_prefix(ip):
        result.tier = "tor"
        result.tier_label = TIER_LABELS["tor"]
        result.reasons.append("IP matches known Tor exit node prefix list")
        result.score = 90.0

    # ── Layer 2: RDAP/ASN lookup ──────────────────────────────────────────
    asn_desc, asn_num = _rdap_lookup(ip)
    result.asn = asn_desc
    result.asn_number = asn_num

    if result.score == 0.0:
        # Not already classified by prefix list
        tier, reasons = _classify_asn(asn_desc, asn_num)
        result.tier = tier
        result.tier_label = TIER_LABELS.get(tier, tier)
        result.reasons.extend(reasons)

        tier_scores = {
            "tor": 90.0,
            "vpn": 75.0,
            "proxy": 65.0,
            "datacenter": 35.0,
            "residential": 0.0,
        }
        result.score = tier_scores.get(tier, 0.0)

    # ── Layer 3: Header analysis (incremental) ────────────────────────────
    if headers:
        extra, flags = _analyze_headers(headers)
        result.header_flags = flags
        if extra > 0:
            result.reasons.append(f"Header analysis: +{extra:.0f} pts ({len(flags)} flag(s))")
            # Header evidence can upgrade score but not tier label
            result.score = min(result.score + extra, 100.0)

    return result


def network_score(ip: str, headers: Optional[dict[str, str]] = None) -> tuple[float, str]:
    """
    Backward-compatible wrapper.
    Returns (score, asn_description).
    """
    r = analyze_network(ip, headers)
    return r.score, r.asn


def network_detail(ip: str, headers: Optional[dict[str, str]] = None) -> dict:
    """
    Return full analysis as a plain dict for JSON serialisation.
    """
    r = analyze_network(ip, headers)
    return {
        "score": r.score,
        "tier": r.tier,
        "tier_label": r.tier_label,
        "asn": r.asn,
        "asn_number": r.asn_number,
        "reasons": r.reasons,
        "header_flags": r.header_flags,
        "is_private": r.is_private,
    }
