"""
ergo-agent-pay — Python SDK for autonomous AI agent payments on Ergo.

pip install ergo-agent-pay

Quick start:
    from ergo_agent_pay import ErgoAgentPay

    agent = ErgoAgentPay(address="YOUR_ADDRESS", network="testnet")
    utxos = agent.get_utxos()
    note_info = agent.check_note("boxId...")
"""

from .client import ErgoAgentPay
from .network import NetworkClient
from .types import (
    NoteInfo,
    PayResult,
    ErgoAgentPayError,
)

__version__ = "0.2.0"
__all__ = [
    "ErgoAgentPay",
    "NetworkClient",
    "NoteInfo",
    "PayResult",
    "ErgoAgentPayError",
]
