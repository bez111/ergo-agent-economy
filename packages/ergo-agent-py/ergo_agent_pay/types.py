"""
ergo-agent-pay Python SDK — Type Definitions
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, Any


@dataclass
class NoteInfo:
    """Decoded Note box from the Ergo blockchain."""
    box_id: str
    value: int                      # nanoERG
    value_erg: float                # ERG (human readable)
    expiry_block: int               # R5 decoded
    current_block: int
    is_expired: bool
    reserve_box_id: Optional[str]   # R4 decoded (hex)
    task_hash: Optional[str]        # R6 decoded (hex, 32 bytes)
    credential_key: Optional[str]   # R7 decoded (hex)
    raw: Any = field(default=None, repr=False)


@dataclass
class PayResult:
    """Result of a payment operation."""
    unsigned_tx: dict               # EIP-12 unsigned transaction
    signed_tx: Optional[dict]
    tx_id: Optional[str]
    submitted: bool


class ErgoAgentPayError(Exception):
    """Raised when an ergo-agent-pay operation fails."""

    CODES = {
        "INSUFFICIENT_FUNDS",
        "POLICY_REJECTED",
        "NO_SIGNER",
        "NETWORK_ERROR",
        "INVALID_ADDRESS",
        "INVALID_AMOUNT",
        "SUBMISSION_FAILED",
        "BOX_NOT_FOUND",
        "NOTE_EXPIRED",
        "NOTE_INVALID",
    }

    def __init__(self, message: str, code: str, cause: Optional[Exception] = None):
        super().__init__(message)
        self.code = code
        self.cause = cause

    def __str__(self) -> str:
        return f"ErgoAgentPayError[{self.code}]: {self.args[0]}"
