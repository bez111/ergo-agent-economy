"""
ergo-agent-pay Python SDK — Network Client
Wraps the Ergo node REST API.
"""

from __future__ import annotations
from typing import Any
import urllib.request
import urllib.error
import json

from .types import ErgoAgentPayError

NODE_URLS = {
    "mainnet": "https://api.ergoplatform.com",
    "testnet": "https://api-testnet.ergoplatform.com",
}


class NetworkClient:
    """Minimal HTTP client for the Ergo node API. No external dependencies."""

    def __init__(self, network: str = "mainnet", node_url: str | None = None):
        self.base_url = node_url or NODE_URLS.get(network, NODE_URLS["mainnet"])

    # ── Public methods ─────────────────────────────────────────────────────────

    def get_height(self) -> int:
        data = self._get("/api/v1/info")
        return int(data["fullHeight"])

    def get_unspent_boxes(self, address: str, limit: int = 100) -> list[dict]:
        data = self._get(f"/api/v1/boxes/unspent/byAddress/{address}?limit={limit}&sortDirection=desc")
        return data.get("items", [])

    def get_address_balance(self, address: str) -> dict:
        data = self._get(f"/api/v1/addresses/{address}/balance/confirmed")
        nano_ergs = int(data.get("confirmed", {}).get("nanoErgs", 0))
        return {"nano_ergs": nano_ergs, "ergs": nano_ergs / 1e9}

    def get_box(self, box_id: str) -> dict:
        return self._get(f"/api/v1/boxes/{box_id}")

    def submit_transaction(self, signed_tx: dict) -> str:
        return self._post("/api/v1/transactions", signed_tx)

    # ── Private helpers ────────────────────────────────────────────────────────

    def _get(self, path: str) -> Any:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            raise ErgoAgentPayError(
                f"API error {e.code} at {path}",
                "NETWORK_ERROR",
                e,
            ) from e
        except Exception as e:
            raise ErgoAgentPayError(
                f"Network request failed: {path}",
                "NETWORK_ERROR",
                e,
            ) from e

    def _post(self, path: str, body: dict) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body_text = e.read().decode(errors="ignore")
            raise ErgoAgentPayError(
                f"Submission failed ({e.code}): {body_text}",
                "SUBMISSION_FAILED",
                e,
            ) from e
        except Exception as e:
            raise ErgoAgentPayError(
                f"Network POST failed: {path}",
                "NETWORK_ERROR",
                e,
            ) from e
