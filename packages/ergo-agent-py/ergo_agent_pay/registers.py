"""
ergo-agent-pay Python SDK — Register Decode Helpers

Ergo API returns register values as sigma-serialized hex strings.
  SInt  : "04" prefix + zigzag-encoded integer
  SColl[SByte]: "0e" prefix + length byte + raw bytes
"""

from __future__ import annotations


def decode_register_int(hex_str: str) -> int:
    """Decode a SInt register value (04 prefix + zigzag encoding)."""
    if not hex_str or len(hex_str) < 4:
        return 0
    # strip 1-byte type prefix (04), parse remainder as zigzag int
    value_hex = hex_str[2:]
    zigzag = int(value_hex, 16)
    return (zigzag >> 1) ^ -(zigzag & 1)


def decode_register_bytes(hex_str: str) -> str:
    """
    Decode a SColl[SByte] register value.
    Returns the content bytes as a hex string (strips 0e + length prefix).
    """
    if not hex_str or len(hex_str) < 4:
        return ""
    # skip type byte (0e) + length byte = 4 hex chars
    return hex_str[4:]


def decode_register_bytes_raw(hex_str: str) -> bytes:
    """Decode a SColl[SByte] register to raw bytes."""
    content_hex = decode_register_bytes(hex_str)
    if not content_hex:
        return b""
    return bytes.fromhex(content_hex)
