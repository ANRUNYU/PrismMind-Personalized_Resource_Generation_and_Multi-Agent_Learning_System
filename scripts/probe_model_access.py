#!/usr/bin/env python3
"""Explicit, low-token model access probe. Running this script may incur cost."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import Settings  # noqa: E402
from app.services.llm.model_registry import ModelRegistry  # noqa: E402


def probe(settings: Settings) -> list[dict[str, object]]:
    registry = ModelRegistry(settings)
    key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    base_url = os.getenv("DASHSCOPE_BASE_URL", settings.dashscope_base_url).rstrip("/")
    results: list[dict[str, object]] = []
    for registration in registry.all():
        started = time.perf_counter()
        result: dict[str, object] = {
            "role": registration.role.value,
            "configured_model": registration.model_id,
            "reachable": False,
            "status_code": None,
            "latency_ms": 0,
            "supports_stream": registration.capabilities.supports_stream,
            "supports_tools": registration.capabilities.supports_tools,
            "error_type": None,
        }
        if not key:
            result["error_type"] = "missing_api_key"
            results.append(result)
            continue
        payload = json.dumps({
            "model": registration.model_id,
            "messages": [{"role": "user", "content": "Reply OK."}],
            "max_tokens": 2,
            "temperature": 0,
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{base_url}/chat/completions", data=payload, method="POST",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=settings.llm_request_timeout_seconds) as response:
                result["status_code"] = response.status
                result["reachable"] = 200 <= response.status < 300
        except urllib.error.HTTPError as exc:
            result["status_code"] = exc.code
            result["error_type"] = "http_error"
        except urllib.error.URLError:
            result["error_type"] = "connection_error"
        except TimeoutError:
            result["error_type"] = "timeout"
        finally:
            result["latency_ms"] = round((time.perf_counter() - started) * 1000)
        results.append(result)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()
    results = probe(Settings())
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            print(" ".join(f"{key}={value}" for key, value in item.items()))
    return 0 if all(item["reachable"] for item in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
