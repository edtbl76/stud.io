"""
HTTP security header assertions.

Verifies that the Next.js server sends the required security headers on every
page response. Requires the production stack to be running.

Run via: ./scripts/test-scan.sh --headers
         BASE_URL=https://localhost:2112 python -m pytest tests/security/
"""
import os
import pytest
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = os.environ.get("SCAN_BASE_URL", "https://localhost:2112")

REQUIRED_HEADERS = {
    "X-Frame-Options":        "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy":        "strict-origin-when-cross-origin",
    "Permissions-Policy":     "camera=(), microphone=(), geolocation=()",
}

PAGES = [
    "/login",
    "/catalog/brands",
    "/catalog/models",
    "/session/effects",
    "/session/instruments",
    "/session/libraries",
    "/session/workstations",
]


@pytest.mark.parametrize("path", PAGES)
def test_security_headers_present(path):
    response = requests.get(
        f"{BASE_URL}{path}",
        verify=False,
        allow_redirects=True,
        timeout=10,
    )
    for header, expected in REQUIRED_HEADERS.items():
        assert header in response.headers, (
            f"Missing '{header}' on {path}"
        )
        assert response.headers[header] == expected, (
            f"'{header}' on {path}: expected {expected!r}, got {response.headers[header]!r}"
        )
