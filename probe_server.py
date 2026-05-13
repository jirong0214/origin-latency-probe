#!/usr/bin/env python3
"""Standalone origin latency probe service.

The service is intentionally small and dependency-free so it can be deployed
next to any app and reached through the same reverse-proxy/CDN path as normal
business traffic.
"""

from __future__ import annotations

import json
import os
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


APP_NAME = os.getenv("PROBE_APP_NAME", "origin-latency-probe")
PROBE_HOST = os.getenv("PROBE_HOST", "0.0.0.0")
PROBE_PORT = int(os.getenv("PROBE_PORT", "12071"))
PROBE_PATH = os.getenv("PROBE_PATH", "/__origin_latency_probe")
HEALTH_PATH = os.getenv("HEALTH_PATH", "/healthz")


def json_bytes(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class ProbeRequestHandler(BaseHTTPRequestHandler):
    server_version = "OriginLatencyProbe/1.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == HEALTH_PATH:
            self.respond_json(HTTPStatus.OK, {"ok": True, "app": APP_NAME})
            return

        if parsed.path != PROBE_PATH:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        query = parse_qs(parsed.query)
        payload = {
            "ok": True,
            "app": APP_NAME,
            "probeVersion": 1,
            "serverTime": int(time.time() * 1000),
            "nonce": query.get("nonce", [""])[0],
            "clientTs": query.get("ts", [""])[0],
        }
        self.respond_json(HTTPStatus.OK, payload, no_store=True)

    def respond_json(
        self,
        status: HTTPStatus,
        payload: dict[str, object],
        no_store: bool = False,
    ) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if no_store:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((PROBE_HOST, PROBE_PORT), ProbeRequestHandler)
    print(f"Origin latency probe listening on http://{PROBE_HOST}:{PROBE_PORT}{PROBE_PATH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
