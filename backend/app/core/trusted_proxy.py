"""Trusted proxy resolution and client IP extraction adhering to right-to-left traversal."""

import ipaddress
from functools import lru_cache

from fastapi import Request

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger("windiq.core.trusted_proxy")


@lru_cache(maxsize=32)
def parse_trusted_networks(cidrs_tuple: tuple[str, ...]) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    """Parse CIDR strings into IP network objects with caching."""
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    for cidr in cidrs_tuple:
        try:
            networks.append(ipaddress.ip_network(cidr.strip(), strict=False))
        except ValueError as exc:
            logger.error("Invalid CIDR in trusted proxies list: %s (%s)", cidr, exc)
    return networks


def is_ip_trusted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address, networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network]) -> bool:
    """Check if an IP address belongs to any of the configured trusted networks."""
    return any(ip in net for net in networks)


def get_trusted_client_ip(
    request: Request,
    trusted_proxies: list[str] | None = None,
) -> str:
    """Resolve the genuine client IP address through configured upstream trusted proxies.

    Security Rules:
    1. Direct peer IP (request.client.host) is inspected first.
    2. If the direct peer is NOT inside configured TRUSTED_PROXIES, all client-supplied
       forwarding headers (X-Forwarded-For, X-Real-IP) are rejected and direct IP is returned.
    3. If the direct peer IS trusted, X-Forwarded-For is parsed right-to-left (reverse order)
       to locate the first non-trusted IP address in the proxy chain.
    """
    settings = get_settings()
    configured_proxies = trusted_proxies if trusted_proxies is not None else settings.TRUSTED_PROXIES
    networks = parse_trusted_networks(tuple(configured_proxies))

    direct_host = request.client.host if request.client and request.client.host else "127.0.0.1"

    try:
        direct_ip = ipaddress.ip_address(direct_host)
    except ValueError:
        # Unparseable direct host string
        return direct_host

    # Rule 1 & 2: If direct peer is not trusted, ignore forwarded headers completely
    if not is_ip_trusted(direct_ip, networks):
        return str(direct_ip)

    # Rule 3: Peer is trusted; parse X-Forwarded-For right-to-left
    xff_header = request.headers.get("X-Forwarded-For")
    if not xff_header or not xff_header.strip():
        # Fallback to X-Real-IP if present and valid
        x_real_ip = request.headers.get("X-Real-IP")
        if x_real_ip:
            try:
                real_ip = ipaddress.ip_address(x_real_ip.strip())
                return str(real_ip)
            except ValueError:
                pass
        return str(direct_ip)

    # Split and clean forwarded IP list
    raw_hops = [hop.strip() for hop in xff_header.split(",") if hop.strip()]
    if not raw_hops:
        return str(direct_ip)

    # Traverse right-to-left (from most recent proxy towards client)
    for hop_str in reversed(raw_hops):
        try:
            hop_ip = ipaddress.ip_address(hop_str)
        except ValueError:
            # Skip invalid IP strings inserted in forwarded chain
            continue

        if not is_ip_trusted(hop_ip, networks):
            # First untrusted IP encountered is the authentic client
            return str(hop_ip)

    # If every single hop in the chain is in trusted networks, return the leftmost hop
    return raw_hops[0]

