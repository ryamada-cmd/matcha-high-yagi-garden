from __future__ import annotations

import ipaddress
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from urllib.parse import urlparse

import requests


@dataclass
class DiscoveryStatus:
    configured_url: str
    current_url: str
    auto_discovery: bool
    discovered: bool = False
    last_discovery_at: float = 0.0
    last_error: str = ""


class IOSOCRLocator:
    """Locate iOS-OCR-Server on the local LAN.

    The configured URL is always tried first. Discovery is only attempted when
    that URL is unavailable, and only scans private /24 networks on TCP 8000
    (or the configured port). A candidate is accepted only when the root page
    identifies itself as the upstream OCR Server.
    """

    def __init__(
        self,
        configured_url: str,
        *,
        auto_discovery: bool = True,
        discovery_timeout: float = 0.35,
        probe_timeout: float = 1.0,
        max_workers: int = 48,
        cooldown_seconds: float = 20.0,
    ) -> None:
        self.configured_url = configured_url.rstrip("/")
        self.current_url = self.configured_url
        self.auto_discovery = auto_discovery
        self.discovery_timeout = max(0.1, discovery_timeout)
        self.probe_timeout = max(0.2, probe_timeout)
        self.max_workers = max(4, min(max_workers, 96))
        self.cooldown_seconds = max(0.0, cooldown_seconds)
        self._lock = threading.Lock()
        self._last_discovery_at = 0.0
        self._last_error = ""

    @staticmethod
    def _is_private_ipv4(value: str) -> bool:
        try:
            ip = ipaddress.ip_address(value)
            return isinstance(ip, ipaddress.IPv4Address) and ip.is_private
        except ValueError:
            return False

    @staticmethod
    def _port_from_url(url: str) -> int:
        parsed = urlparse(url)
        return parsed.port or 8000

    @staticmethod
    def _looks_like_ios_ocr_server(response: requests.Response) -> bool:
        if response.status_code != 200:
            return False
        body = (response.text or "").lower()
        return "<title>ocr server</title>" in body and "/upload" in body

    def probe(self, base_url: str, timeout: float | None = None) -> bool:
        try:
            response = requests.get(
                base_url.rstrip("/") + "/",
                timeout=timeout or self.probe_timeout,
                headers={"Accept": "text/html"},
            )
            return self._looks_like_ios_ocr_server(response)
        except requests.RequestException as exc:
            self._last_error = str(exc)
            return False

    def _local_private_ipv4s(self) -> list[str]:
        found: list[str] = []
        try:
            hostname = socket.gethostname()
            for item in socket.getaddrinfo(hostname, None, socket.AF_INET):
                ip = item[4][0]
                if self._is_private_ipv4(ip) and ip not in found:
                    found.append(ip)
        except OSError:
            pass
        return found

    def _candidate_networks(self) -> list[ipaddress.IPv4Network]:
        networks: list[ipaddress.IPv4Network] = []

        def add_ip(value: str) -> None:
            if not self._is_private_ipv4(value):
                return
            network = ipaddress.ip_network(f"{value}/24", strict=False)
            if network not in networks:
                networks.append(network)

        for url in (self.current_url, self.configured_url):
            host = urlparse(url).hostname or ""
            add_ip(host)

        for ip in self._local_private_ipv4s():
            add_ip(ip)

        return networks[:3]

    def _discover(self) -> str | None:
        port = self._port_from_url(self.configured_url)
        current_host = urlparse(self.current_url).hostname or ""
        configured_host = urlparse(self.configured_url).hostname or ""

        candidates: list[str] = []
        for network in self._candidate_networks():
            hosts = [str(host) for host in network.hosts()]
            # Keep previous/configured addresses at the front when they belong
            # to this subnet, then scan the rest.
            prioritized = [h for h in (current_host, configured_host) if h in hosts]
            for host in prioritized + hosts:
                url = f"http://{host}:{port}"
                if url not in candidates:
                    candidates.append(url)

        if not candidates:
            self._last_error = "No private IPv4 subnet available for discovery"
            return None

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            future_map = {
                pool.submit(self.probe, url, self.discovery_timeout): url
                for url in candidates
            }
            for future in as_completed(future_map):
                url = future_map[future]
                try:
                    if future.result():
                        return url
                except Exception:
                    continue
        return None

    def resolve(self, *, force_discovery: bool = False) -> tuple[str, bool]:
        """Return (base_url, discovered_now).

        Normal calls first probe the current URL. If it is down, discovery runs
        once under a lock. A short cooldown prevents repeated full-LAN scans when
        the iPhone app is intentionally offline.
        """
        if not force_discovery and self.probe(self.current_url):
            return self.current_url, False

        if not self.auto_discovery:
            return self.current_url, False

        with self._lock:
            if not force_discovery and self.probe(self.current_url):
                return self.current_url, False

            now = time.monotonic()
            if (
                self._last_discovery_at
                and now - self._last_discovery_at < self.cooldown_seconds
            ):
                return self.current_url, False

            self._last_discovery_at = now
            found = self._discover()
            if found:
                changed = found != self.current_url
                self.current_url = found
                self._last_error = ""
                return self.current_url, changed

            return self.current_url, False

    def status(self) -> DiscoveryStatus:
        return DiscoveryStatus(
            configured_url=self.configured_url,
            current_url=self.current_url,
            auto_discovery=self.auto_discovery,
            discovered=self.current_url != self.configured_url,
            last_discovery_at=self._last_discovery_at,
            last_error=self._last_error,
        )
