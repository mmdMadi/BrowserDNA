"""
Network analysis — ASN/datacenter detection with in-process LRU cache
to avoid hammering the RDAP API on every request.
"""

from __future__ import annotations

import ipaddress
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Extended datacenter / cloud / VPN keyword list
DATACENTER_KEYWORDS = [
    "amazon", "aws", "google", "azure", "microsoft",
    "digitalocean", "linode", "akamai", "vultr", "ovh",
    "hetzner", "cloudflare", "fastly", "leaseweb", "packet",
    "choopa", "psychz", "buyvm", "path.net", "cogent",
    "cloud", "hosting", "datacenter", "data center",
    "colocrossing", "quadranet", "serverius", "reliablesite",
    "tor-exit", "anonymizer", "vpn", "proxy",
]


def _is_private_ip(ip: str) -> bool:
    """Return True for loopback, link-local, and RFC-1918 addresses."""
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local
    except ValueError:
        return False


@lru_cache(maxsize=512)
def check_asn(ip: str) -> str:
    """
    Look up ASN description for an IP via RDAP.
    Results are cached in-process (LRU, 512 entries).
    Returns a human-readable string or a sentinel value.
    """
    if not ip or ip in ("unknown", "localhost") or _is_private_ip(ip):
        return "PRIVATE_OR_LOCAL"

    try:
        from ipwhois import IPWhois  # lazy import — not always needed

        obj = IPWhois(ip)
        res = obj.lookup_rdap(depth=1)
        description = res.get("asn_description") or res.get("network", {}).get("name") or "UNKNOWN"
        return description
    except Exception as exc:
        logger.warning("ASN lookup failed for %s: %s", ip, exc)
        return "LOOKUP_FAILED"


def is_datacenter(asn_text: str) -> bool:
    """Return True if the ASN description matches known datacenter/cloud/VPN keywords."""
    if not asn_text:
        return False
    text = asn_text.lower()
    return any(kw in text for kw in DATACENTER_KEYWORDS)


def network_score(ip: str) -> tuple[float, str]:
    """
    Return (score 0-100, asn_description).
    Score is 30 for datacenter IPs, 0 otherwise.
    Extendable: could add IP reputation tiers (70 for known malicious, etc.)
    """
    asn = check_asn(ip)
    if is_datacenter(asn):
        return 30.0, asn
    return 0.0, asn
