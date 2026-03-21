"""
ergo-agent-pay Python SDK — ErgoAgentPay Client

Main entry point for AI agent payment operations.

Note on transaction building:
  Python does not have a Fleet SDK equivalent with full UTXO selection and
  ErgoTree encoding. This client covers the read-side operations (checking notes,
  balances, UTxOs) and delegates transaction signing/submission to either:
    a) The TypeScript SDK running as a local server (recommended)
    b) External signing tools (Nautilus, AppKit)

  For full transaction building in Python, use:
    - ergpy (https://github.com/mgpai22/ergpy) — AppKit wrapper
    - sigma-rust Python bindings (https://github.com/ergoplatform/sigma-rust)
"""

from __future__ import annotations
import hashlib
from typing import Optional, Callable, Any

from .network import NetworkClient
from .types import NoteInfo, ErgoAgentPayError
from .registers import decode_register_int, decode_register_bytes


class ErgoAgentPay:
    """
    Python client for Ergo agent payment operations.

    Covers:
    - Balance and UTxO queries
    - Note inspection (checkNote)
    - Task hash computation
    - LangChain tool adapter
    - OpenAI function definition

    For transaction building + submission, use the TypeScript SDK or
    the ErgoPayServerClient to delegate to a running ergo-agent-pay server.
    """

    def __init__(
        self,
        address: str,
        network: str = "mainnet",
        node_url: Optional[str] = None,
        signer: Optional[Callable] = None,
        policy: Optional[dict] = None,
    ):
        self.address = address
        self.network = network
        self.signer = signer
        self.policy = policy or {}
        self._client = NetworkClient(network=network, node_url=node_url)
        self._session_spend: int = 0

    # ── Balance & UTxOs ────────────────────────────────────────────────────────

    def get_balance(self) -> dict:
        """Return confirmed balance: {'nano_ergs': int, 'ergs': float}."""
        return self._client.get_address_balance(self.address)

    def get_utxos(self, limit: int = 100) -> list[dict]:
        """Return unspent UTxOs for the agent address."""
        return self._client.get_unspent_boxes(self.address, limit=limit)

    def get_height(self) -> int:
        """Return current block height."""
        return self._client.get_height()

    # ── Note inspection ────────────────────────────────────────────────────────

    def check_note(self, note_box_id: str) -> NoteInfo:
        """
        Fetch a Note from the blockchain and decode its registers.

        Returns NoteInfo with:
          - value, value_erg
          - expiry_block, current_block, is_expired
          - reserve_box_id (R4), task_hash (R6), credential_key (R7)
        """
        try:
            box = self._client.get_box(note_box_id)
        except ErgoAgentPayError as e:
            if e.code == "NETWORK_ERROR":
                raise ErgoAgentPayError(
                    f"Note not found: {note_box_id}",
                    "BOX_NOT_FOUND",
                    e,
                ) from e
            raise

        height = self._client.get_height()
        registers = box.get("additionalRegisters", {})

        expiry_block = decode_register_int(registers.get("R5", ""))
        reserve_box_id = decode_register_bytes(registers.get("R4", "")) or None
        task_hash = decode_register_bytes(registers.get("R6", "")) or None
        credential_key = decode_register_bytes(registers.get("R7", "")) or None

        value = int(box.get("value", 0))
        is_expired = height >= expiry_block if expiry_block > 0 else False

        return NoteInfo(
            box_id=note_box_id,
            value=value,
            value_erg=value / 1e9,
            expiry_block=expiry_block,
            current_block=height,
            is_expired=is_expired,
            reserve_box_id=reserve_box_id,
            task_hash=task_hash,
            credential_key=credential_key,
            raw=box,
        )

    # ── Task hash helpers ──────────────────────────────────────────────────────

    @staticmethod
    def compute_task_hash(task_output: str | bytes) -> str:
        """
        Compute a task hash for an acceptance predicate.

        Uses SHA-256 (Python standard library).
        For production on-chain verification, use blake2b-256:
          pip install pyblake2
          import pyblake2
          h = pyblake2.blake2b(data, digest_size=32).hexdigest()

        Or via cryptography package:
          from cryptography.hazmat.primitives import hashes
          from cryptography.hazmat.backends import default_backend
          h = hashes.Hash(hashes.BLAKE2b(64), backend=default_backend())
          ...
        """
        if isinstance(task_output, str):
            task_output = task_output.encode()
        return hashlib.sha256(task_output).hexdigest()

    # ── LangChain adapter ──────────────────────────────────────────────────────

    def as_langchain_tool(self, server_url: str = "http://localhost:3000"):
        """
        Return a LangChain StructuredTool that calls a running ergo-agent-pay server.

        Requires: pip install langchain
        The server (example 05) must be running at server_url.

        Usage:
            from langchain.agents import AgentExecutor
            tools = [agent.as_langchain_tool()]
        """
        try:
            from langchain.tools import StructuredTool
            from pydantic import BaseModel, Field
        except ImportError as e:
            raise ImportError("pip install langchain pydantic") from e

        agent_ref = self

        class PayInput(BaseModel):
            to: str = Field(description="Receiver Ergo address")
            amount_erg: float = Field(description="Amount in ERG (e.g. 0.005)")
            memo: str = Field(default="", description="Optional payment memo")

        def pay_fn(to: str, amount_erg: float, memo: str = "") -> str:
            import urllib.request
            import json
            payload = json.dumps({
                "to": to,
                "amount": str(int(amount_erg * 1e9)),
                "from": agent_ref.address,
                "memo": memo,
            }).encode()
            req = urllib.request.Request(
                f"{server_url}/api/pay",
                data=payload,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
                    return f"Payment submitted. TX: {data.get('txId', 'pending')}"
            except Exception as exc:
                return f"Payment failed: {exc}"

        return StructuredTool.from_function(
            func=pay_fn,
            name="ergo_pay",
            description=(
                "Send ERG payment on the Ergo blockchain. "
                "Use this when you need to pay for services or reward agents."
            ),
            args_schema=PayInput,
        )

    # ── OpenAI function definition ─────────────────────────────────────────────

    def as_openai_function(self) -> dict:
        """
        Return an OpenAI function definition dict for function calling.

        Usage:
            definition = agent.as_openai_function()
            response = openai.chat.completions.create(
                model="gpt-4o",
                messages=[...],
                tools=[{"type": "function", "function": definition}],
            )
        """
        return {
            "name": "ergo_pay",
            "description": (
                "Send ERG payment on the Ergo blockchain to a receiver address. "
                "Returns unsigned transaction or submission result."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "Receiver Ergo address",
                    },
                    "amount": {
                        "type": "string",
                        "description": "Amount in ERG or nanoERG (e.g. '0.005 ERG' or '5000000')",
                    },
                    "memo": {
                        "type": "string",
                        "description": "Optional memo stored in R4",
                    },
                },
                "required": ["to", "amount"],
            },
        }

    def __repr__(self) -> str:
        balance = self.get_balance()
        return (
            f"ErgoAgentPay(address={self.address[:12]}..., "
            f"network={self.network}, "
            f"balance={balance['ergs']:.6f} ERG)"
        )
