from __future__ import annotations

import os
import re

import uvicorn


def configured_port(raw: str | None = None) -> int:
    value = os.getenv("PORT", "8000") if raw is None else raw
    if re.fullmatch(r"[0-9]{1,5}", value) is None:
        raise ValueError("PORT must be an integer from 1 through 65535")
    port = int(value)
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be an integer from 1 through 65535")
    return port


def main() -> None:
    package = __package__ or "app"
    uvicorn.run(
        f"{package}.main:app",
        host="0.0.0.0",
        port=configured_port(),
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
