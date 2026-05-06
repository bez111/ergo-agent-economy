"""
ErgoPaidCrewTool — a CrewAI BaseTool whose `_run` is paywalled by an
Ergo Note. Each invocation:

  1. asks `PaymentPolicy.check_before` whether the budget allows the call
  2. issues a Note via BridgeClient (which proxies to the local
     ergo-agent-server daemon, i.e. the TS SDK)
  3. POSTs to the seller's API with the Note's boxId in
     `X-Note-Box-Id` and the expected output in `X-Task-Output`
  4. returns the response body to the crew

The tool is constructed from a `ToolConfig` so it can be tested with
stub bridges + stub HTTP transports without ever importing CrewAI.

Differs from the LangChain example only in the BaseTool import path;
the wire shape is identical.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Optional

try:  # pragma: no cover — only required at runtime
    from crewai.tools import BaseTool
    from pydantic import BaseModel, Field
except ImportError:  # pragma: no cover
    BaseTool = object  # type: ignore[assignment,misc]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(*_args: Any, **_kwargs: Any) -> Any:  # type: ignore[no-redef]
        return None


from ergo_agent_pay import BridgeClient, ErgoAgentPayError

from pricing_policy import PaymentPolicy


@dataclass
class ToolConfig:
    """Static configuration injected into the tool at construction."""

    seller_api_url: str
    seller_address: str
    reserve_box_id: str
    bridge: BridgeClient
    policy: PaymentPolicy
    price_nano_erg: int
    deadline_blocks: str = "+100 blocks"
    note_header: str = "X-Note-Box-Id"
    task_output_header: str = "X-Task-Output"
    http_call: Optional[Callable[[str, str, bytes, dict[str, str]], dict]] = None


class ErgoPaidCrewToolInput(BaseModel):
    text: str = Field(default="", description="Text to send to the paid endpoint.")


class ErgoPaidCrewTool(BaseTool):
    """CrewAI tool whose execution is paywalled by an Ergo Note."""

    name: str = "ergo_paid_summarise"
    description: str = (
        "Pay for a summarisation of the supplied text. Each call issues a "
        "Note from the agent's reserve. The seller's API verifies the Note "
        "on-chain before serving the request."
    )
    args_schema: type[BaseModel] = ErgoPaidCrewToolInput

    _config: Optional[ToolConfig] = None

    def bind_config(self, config: ToolConfig) -> "ErgoPaidCrewTool":
        self._config = config
        return self

    def _run(self, text: str) -> str:  # type: ignore[override]
        cfg = self._config
        if cfg is None:
            raise RuntimeError(
                "ErgoPaidCrewTool not bound — call bind_config(...) first"
            )

        decision = cfg.policy.check_before(cfg.seller_address, cfg.price_nano_erg)
        if not decision.allowed:
            return json.dumps({"error": "policy", "reason": decision.reason})

        expected = build_expected_output(text)

        try:
            issued = cfg.bridge.issue_note(
                recipient=cfg.seller_address,
                value=cfg.price_nano_erg,
                reserve_box_id=cfg.reserve_box_id,
                deadline=cfg.deadline_blocks,
                task_output=expected,
            )
        except ErgoAgentPayError as exc:
            return json.dumps({"error": exc.code, "message": str(exc)})

        note_box_id = os.environ.get("NOTE_BOX_ID")
        if not note_box_id:
            return json.dumps({
                "error": "NOTE_BOX_ID_PENDING",
                "message": "Submit issued.unsigned_tx, wait for confirmation, "
                           "then set NOTE_BOX_ID and retry.",
                "issued": issued,
            })

        body = json.dumps({"text": text}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            cfg.note_header: note_box_id,
            cfg.task_output_header: expected,
        }
        url = f"{cfg.seller_api_url.rstrip('/')}/api/run"
        try:
            response = (cfg.http_call or _default_http_call)(
                "POST", url, body, headers
            )
        except urllib.error.HTTPError as exc:  # pragma: no cover
            return json.dumps({"error": "http", "status": exc.code})

        cfg.policy.record_after(cfg.seller_address, cfg.price_nano_erg)
        return json.dumps(response)


def _default_http_call(
    method: str, url: str, body: bytes, headers: dict[str, str]
) -> dict:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_expected_output(text: str) -> str:
    """
    Pre-commit to what the seller will produce. The seller's handler
    must emit exactly this string (modulo trailing newlines) for the
    Note to be redeemable.
    """
    word_count = len([w for w in text.split() if w])
    return json.dumps({"word_count": word_count}, separators=(",", ":"))
