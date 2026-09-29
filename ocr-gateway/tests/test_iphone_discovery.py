from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from iphone_discovery import IOSOCRLocator


class IOSOCRLocatorTests(unittest.TestCase):
    def test_probe_accepts_upstream_ocr_server_root_page(self) -> None:
        locator = IOSOCRLocator("http://192.168.100.29:8000")
        response = Mock()
        response.status_code = 200
        response.text = "<html><title>OCR Server</title><form action='/upload'></form></html>"
        with patch("iphone_discovery.requests.get", return_value=response):
            self.assertTrue(locator.probe("http://192.168.100.29:8000"))

    def test_probe_rejects_unrelated_service_on_port_8000(self) -> None:
        locator = IOSOCRLocator("http://192.168.100.29:8000")
        response = Mock()
        response.status_code = 200
        response.text = "<html><title>Another Server</title></html>"
        with patch("iphone_discovery.requests.get", return_value=response):
            self.assertFalse(locator.probe("http://192.168.100.20:8000"))

    def test_resolve_keeps_configured_url_when_healthy(self) -> None:
        locator = IOSOCRLocator("http://192.168.100.29:8000")
        with patch.object(locator, "probe", return_value=True), patch.object(
            locator, "_discover"
        ) as discover:
            url, discovered = locator.resolve()
        self.assertEqual(url, "http://192.168.100.29:8000")
        self.assertFalse(discovered)
        discover.assert_not_called()

    def test_resolve_switches_to_discovered_iphone(self) -> None:
        locator = IOSOCRLocator(
            "http://192.168.100.29:8000",
            cooldown_seconds=0,
        )
        with patch.object(locator, "probe", return_value=False), patch.object(
            locator, "_discover", return_value="http://192.168.100.77:8000"
        ):
            url, discovered = locator.resolve()
        self.assertEqual(url, "http://192.168.100.77:8000")
        self.assertTrue(discovered)
        self.assertTrue(locator.status().discovered)

    def test_candidate_networks_include_configured_and_local_private_subnets(self) -> None:
        locator = IOSOCRLocator("http://192.168.100.29:8000")
        with patch.object(locator, "_local_private_ipv4s", return_value=["192.168.50.10"]):
            networks = [str(network) for network in locator._candidate_networks()]
        self.assertIn("192.168.100.0/24", networks)
        self.assertIn("192.168.50.0/24", networks)


if __name__ == "__main__":
    unittest.main()
