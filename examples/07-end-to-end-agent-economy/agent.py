"""
07 — Buyer agent (Python)

Same flow as agent.ts, driven from Python via ergo-agent-server (the local
HTTP daemon) and the BridgeClient. Demonstrates that Python agents are
first-class participants — same Notes, same predicate, same audit story.

Run:
    BRIDGE_URL=http://127.0.0.1:3737 \
    BUYER_ADDRESS=9X... \
    SELLER_ADDRESS=9Y... \
    RESERVE_BOX_ID=abc... \
    API_URL=http://localhost:3000 \
    python3 agent.py

Pre-flight: start the daemon in another terminal:
    npx ergo-agent-server --address $BUYER_ADDRESS --network testnet
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

from ergo_agent_pay import BridgeClient, ErgoAgentPayError


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"environment variable {name} is required")
    return v


BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://127.0.0.1:3737")
BUYER_ADDRESS = env("BUYER_ADDRESS")
SELLER_ADDRESS = env("SELLER_ADDRESS")
RESERVE_BOX_ID = env("RESERVE_BOX_ID")
API_URL = os.environ.get("API_URL", "http://localhost:3000")
NOTE_BOX_ID_OVERRIDE = os.environ.get("NOTE_BOX_ID")

bridge = BridgeClient(BRIDGE_URL, api_key=os.environ.get("ERGO_API_KEY"))

# ── Pre-flight: discover the seller's expected predicate ────────────────────
# The seller advertises its accepted predicate trees on /well-known/ergo-agent.
# A real agent looks this up; the demo just trusts whichever tree the seller
# returns, but verifies the bytes against ergo-agent-scripts before using it.

print(f"discovering seller at {API_URL}...")
with urllib.request.urlopen(f"{API_URL}/well-known/ergo-agent") as resp:
    discovery = json.loads(resp.read().decode())

task_hash_tree = discovery["accepted_predicates"]["task_hash_v0"]
print(f"seller advertises task_hash_v0 tree: {task_hash_tree[:32]}...")

# ── Compute the task hash ───────────────────────────────────────────────────
# The Python BridgeClient delegates the hash to the daemon (which uses
# the same @noble/hashes BLAKE2b-256 the SDK uses). This keeps Python out of
# the cross-language hash-drift business — exactly what the BridgeClient
# was designed for.

expected_output = '{"sentiment":"neutral","word_count":4}'
task_hash = bridge.task_hash(text=expected_output)
print(f"task_hash (BLAKE2b-256): {task_hash}")

# ── Issue the Note ──────────────────────────────────────────────────────────
print("issuing Note...")
try:
    issue = bridge.issue_note(
        recipient=SELLER_ADDRESS,
        value="0.001 ERG",
        reserve_box_id=RESERVE_BOX_ID,
        deadline="+100 blocks",
        task_hash=task_hash,
        script_ergo_tree=task_hash_tree,
    )
except ErgoAgentPayError as exc:
    sys.exit(f"daemon refused to issue: [{exc.code}] {exc}")

if not issue.get("submitted"):
    sys.exit(
        "daemon built the Note transaction but did not submit (no signer "
        "configured). Set up the daemon with --api-key and a signing flow, "
        "or sign and submit issue['unsigned_tx'] yourself."
    )

# In production, watch the node for the confirming TX and read the output
# boxId from there. NOTE_BOX_ID lets you bypass that for the demo.
note_box_id = NOTE_BOX_ID_OVERRIDE
if not note_box_id:
    sys.exit(
        "NOTE_BOX_ID not set — the unsigned-tx flow doesn't tell us the "
        "boxId. Submit issue['unsigned_tx'], wait for confirmation, then "
        "re-run with NOTE_BOX_ID=<that box's boxId>."
    )

print(f"issued boxId={note_box_id}")

# ── Call the API ────────────────────────────────────────────────────────────

print(f"calling {API_URL}/api/analyze...")
req = urllib.request.Request(
    f"{API_URL}/api/analyze",
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-Note-Box-Id": note_box_id,
        "X-Task-Output": expected_output,
    },
    data=json.dumps({"text": "the answer is 42"}).encode(),
)
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())

print("paid request succeeded:")
print(json.dumps(body, indent=2))
