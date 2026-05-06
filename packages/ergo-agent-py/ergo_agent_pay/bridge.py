"""
ergo_agent_pay.bridge — client for the local ergo-agent-server HTTP daemon.

Closes the TS↔Python gap: the Python SDK is read-side only because Python has
no Fleet SDK equivalent for transaction building. The bridge client talks to
a small TypeScript daemon (`ergo-agent-server`) that *does* have Fleet SDK,
so Python users get the same operations — pay, issueNote, redeemNote,
createReserve, deployTracker, settleBatch — without rewriting Fleet in Python.

Pure standard library: urllib + json. Drop into any Python environment from
3.10 onward, no extra deps.

Usage:
    from ergo_agent_pay.bridge import BridgeClient

    bridge = BridgeClient("http://127.0.0.1:3737", api_key="secret")
    print(bridge.balance())              # {'nano_ergs': '...', 'ergs': '...'}
    print(bridge.task_hash("the answer is 42"))
    note = bridge.issue_note(
        recipient="9X...",
        value="0.005 ERG",
        reserve_box_id="abc...",
        deadline="+100 blocks",
        task_output="the answer is 42",
    )

The daemon defaults to listening on 127.0.0.1:3737 — see the
ergo-agent-server README for how to run it.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from .types import ErgoAgentPayError


@dataclass
class BridgeResponse:
    """Decoded JSON response plus HTTP status, for tests / debugging."""

    status: int
    body: dict[str, Any]


class BridgeClient:
    """
    HTTP client for the ergo-agent-server bridge.

    All methods raise ``ErgoAgentPayError`` on non-2xx responses, with the
    ``code`` field copied from the daemon. Network failures are wrapped as
    ``NETWORK_ERROR``.
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3737",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    # ── Read endpoints ─────────────────────────────────────────────────────

    def health(self) -> dict[str, Any]:
        return self._get("/health")

    def balance(self) -> dict[str, Any]:
        return self._get("/balance")

    def height(self) -> int:
        body = self._get("/height")
        return int(body["height"])

    def check_note(self, box_id: str) -> dict[str, Any]:
        return self._get(f"/notes/{box_id}")

    def task_hash(self, *, text: Optional[str] = None, hex: Optional[str] = None) -> str:
        if (text is None) == (hex is None):
            raise ValueError("task_hash takes exactly one of: text, hex")
        body: dict[str, Any] = {}
        if text is not None:
            body["text"] = text
        else:
            body["hex"] = hex
        result = self._post("/task-hash", body)
        return str(result["task_hash"])

    # ── Write endpoints ────────────────────────────────────────────────────

    def pay(self, *, to: str, amount: str | int, memo: Optional[str] = None) -> dict[str, Any]:
        body: dict[str, Any] = {"to": to, "amount": amount}
        if memo is not None:
            body["memo"] = memo
        return self._post("/pay", body)

    def issue_note(
        self,
        *,
        recipient: str,
        value: str | int,
        reserve_box_id: str,
        deadline: str | int,
        task_hash: Optional[str] = None,
        task_output: Optional[str] = None,
        credential_key: Optional[str] = None,
        script_ergo_tree: Optional[str] = None,
    ) -> dict[str, Any]:
        if task_hash is not None and task_output is not None:
            raise ValueError("Pass either task_hash or task_output, not both")
        if task_output is not None:
            task_hash = self.task_hash(text=task_output)

        body: dict[str, Any] = {
            "recipient": recipient,
            "value": value,
            "reserve_box_id": reserve_box_id,
            "deadline": deadline,
        }
        if task_hash is not None:
            body["task_hash"] = task_hash
        if credential_key is not None:
            body["credential_key"] = credential_key
        if script_ergo_tree is not None:
            body["script_ergo_tree"] = script_ergo_tree
        return self._post("/notes", body)

    def redeem_note(
        self,
        box_id: str,
        *,
        task_output: Optional[str] = None,
        receiver_address: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if task_output is not None:
            body["task_output"] = task_output
        if receiver_address is not None:
            body["receiver_address"] = receiver_address
        return self._post(f"/notes/{box_id}/redeem", body)

    def create_reserve(
        self,
        *,
        collateral: str | int,
        script_ergo_tree: Optional[str] = None,
        memo: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"collateral": collateral}
        if script_ergo_tree is not None:
            body["script_ergo_tree"] = script_ergo_tree
        if memo is not None:
            body["memo"] = memo
        return self._post("/reserves", body)

    def deploy_tracker(self, *, script_ergo_tree: str) -> dict[str, Any]:
        return self._post("/trackers", {"script_ergo_tree": script_ergo_tree})

    def settle_batch(
        self,
        *,
        note_box_ids: list[str],
        task_outputs: Optional[Mapping[str, str]] = None,
        receiver_address: Optional[str] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"note_box_ids": list(note_box_ids)}
        if task_outputs is not None:
            body["task_outputs"] = dict(task_outputs)
        if receiver_address is not None:
            body["receiver_address"] = receiver_address
        return self._post("/settle", body)

    # ── HTTP plumbing ──────────────────────────────────────────────────────

    def _get(self, path: str) -> dict[str, Any]:
        return self._request("GET", path, None)

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", path, body)

    def _request(self, method: str, path: str, body: Optional[dict[str, Any]]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {"Accept": "application/json"}
        data: Optional[bytes] = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.api_key is not None:
            headers["X-API-Key"] = self.api_key

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = resp.read().decode("utf-8")
                return json.loads(payload) if payload else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8") if exc.fp else ""
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {}
            code = str(parsed.get("code", "NETWORK_ERROR"))
            message = str(parsed.get("error", f"HTTP {exc.code} from {url}"))
            raise ErgoAgentPayError(message, code) from exc
        except urllib.error.URLError as exc:
            raise ErgoAgentPayError(
                f"Could not reach ergo-agent-server at {self.base_url}: {exc.reason}",
                "NETWORK_ERROR",
            ) from exc
