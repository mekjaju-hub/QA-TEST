import os
import requests

# NEEDS_CONFIGURATION: set BASE_URL and AUTH_TYPE in .env (never commit .env)
BASE_URL = os.getenv("BASE_URL", "")
TIMEOUT = float(os.getenv("API_TIMEOUT", "30"))


def build_headers() -> dict:
    headers = {"Content-Type": "application/json"}
    token = os.getenv("API_TOKEN")
    if os.getenv("AUTH_TYPE", "none") == "bearer" and token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get(path: str, **params):
    if not BASE_URL:
        raise RuntimeError("NEEDS_CONFIGURATION: BASE_URL is empty")
    return requests.get(f"{BASE_URL}{path}", headers=build_headers(), params=params, timeout=TIMEOUT)
