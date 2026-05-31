"""
Validate KVA sub-agent API settings from .env without printing secrets.

Checks:
- OneAgent Claude via /v1/messages
- Ark DeepSeek via /chat/completions
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_ONEAGENT_MODEL = "claude-opus-4-7"
DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro-260425"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config(env_file: Path | None) -> dict[str, str]:
    candidate = env_file or repo_root() / ".env"
    config = parse_env_file(candidate)

    # Real process env wins over file values.
    for key, value in os.environ.items():
        if key.startswith(("ONEAGENT_", "ARK_")):
            config[key] = value

    config.setdefault("ONEAGENT_MODEL", DEFAULT_ONEAGENT_MODEL)
    config.setdefault("ARK_BASE_URL", DEFAULT_ARK_BASE_URL)
    config.setdefault("ARK_MODEL_DEEPSEEK", DEFAULT_DEEPSEEK_MODEL)
    config["_ENV_FILE"] = str(candidate)
    return config


def is_placeholder(value: str | None) -> bool:
    if not value:
        return True
    normalized = value.strip().lower()
    return normalized.startswith("<") or "your-" in normalized or normalized in {"changeme", "todo"}


def require(config: dict[str, str], keys: list[str]) -> list[str]:
    return [key for key in keys if is_placeholder(config.get(key))]


def post_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: float) -> tuple[int | None, str]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001 - diagnostics script should report any connection failure.
        return None, f"{type(exc).__name__}: {exc}"


def short_body(body: str, limit: int = 500) -> str:
    body = body.replace("\r", "\\r").replace("\n", "\\n")
    return body[:limit]


def test_oneagent(config: dict[str, str], prompt: str, timeout: float) -> bool:
    required = ["ONEAGENT_BASE_URL", "ONEAGENT_API_KEY", "ONEAGENT_MODEL"]
    missing = require(config, required)
    model = config.get("ONEAGENT_MODEL", DEFAULT_ONEAGENT_MODEL)
    if missing:
        print(f"[SKIP] OneAgent Claude ({model}): missing_or_placeholder={','.join(missing)}")
        return False

    base_url = config["ONEAGENT_BASE_URL"].rstrip("/")
    status, payload = post_json(
        f"{base_url}/v1/messages",
        {
            "x-api-key": config["ONEAGENT_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        {
            "model": model,
            "max_tokens": 64,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout,
    )

    if status == 200:
        try:
            data = json.loads(payload)
            reply = data.get("content", [{}])[0].get("text", "")
        except Exception:  # noqa: BLE001
            reply = payload
        print(f"[OK] OneAgent Claude ({model}): HTTP 200, reply={reply[:80]!r}")
        return True

    print(f"[FAIL] OneAgent Claude ({model}): HTTP {status}, body={short_body(payload)!r}")
    return False


def test_deepseek(config: dict[str, str], prompt: str, timeout: float) -> bool:
    required = ["ARK_BASE_URL", "ARK_API_KEY", "ARK_MODEL_DEEPSEEK"]
    missing = require(config, required)
    model = config.get("ARK_MODEL_DEEPSEEK", DEFAULT_DEEPSEEK_MODEL)
    if missing:
        print(f"[SKIP] Ark DeepSeek ({model}): missing_or_placeholder={','.join(missing)}")
        return False

    base_url = config["ARK_BASE_URL"].rstrip("/")
    status, payload = post_json(
        f"{base_url}/chat/completions",
        {
            "Authorization": f"Bearer {config['ARK_API_KEY']}",
            "Content-Type": "application/json",
        },
        {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 64,
        },
        timeout,
    )

    if status == 200:
        try:
            data = json.loads(payload)
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        except Exception:  # noqa: BLE001
            reply = payload
        print(f"[OK] Ark DeepSeek ({model}): HTTP 200, reply={reply[:80]!r}")
        return True

    print(f"[FAIL] Ark DeepSeek ({model}): HTTP {status}, body={short_body(payload)!r}")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate KVA .env API settings for Claude and DeepSeek sub-agents.")
    parser.add_argument("--env-file", type=Path, default=None, help="Path to .env. Defaults to repository root .env.")
    parser.add_argument("--timeout", type=float, default=45.0, help="HTTP timeout in seconds.")
    parser.add_argument("--prompt", default="请只回复 OK", help="Minimal prompt used for API checks.")
    parser.add_argument("--skip-oneagent", action="store_true", help="Skip OneAgent Claude check.")
    parser.add_argument("--skip-deepseek", action="store_true", help="Skip Ark DeepSeek check.")
    args = parser.parse_args()

    config = load_config(args.env_file)
    env_file = Path(config["_ENV_FILE"])

    print(f"env_file={env_file}")
    print("secret_values_printed=0")
    print(f"oneagent_model={config.get('ONEAGENT_MODEL', DEFAULT_ONEAGENT_MODEL)}")
    print(f"ark_deepseek_model={config.get('ARK_MODEL_DEEPSEEK', DEFAULT_DEEPSEEK_MODEL)}")
    print("-" * 60)

    results: list[bool] = []
    if not args.skip_oneagent:
        results.append(test_oneagent(config, args.prompt, args.timeout))
    if not args.skip_deepseek:
        results.append(test_deepseek(config, args.prompt, args.timeout))

    return 0 if results and all(results) else 1


if __name__ == "__main__":
    sys.exit(main())

