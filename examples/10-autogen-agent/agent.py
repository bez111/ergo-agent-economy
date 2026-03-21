"""
Example 10 — AutoGen Multi-Agent Conversation with Ergo Payments

AutoGen agents that negotiate and pay each other using Ergo Notes.
A "client" agent requests a service, "provider" agent completes it,
and payment is settled via Note redemption.

Requirements:
  pip install pyautogen requests

Or run mock (no autogen required):
  python agent.py

Run with AutoGen:
  pip install pyautogen
  export OPENAI_API_KEY="sk-..."
  python agent.py --autogen
"""

import os
import sys
import json
import urllib.request
from typing import Optional

ERGO_API_SERVER = os.getenv("ERGO_API_SERVER", "http://localhost:3000")
CLIENT_NOTE_ID  = os.getenv("CLIENT_NOTE_BOX_ID", "a" * 64)
TESTNET_API     = "https://api-testnet.ergoplatform.com"

# ── Ergo helpers ──────────────────────────────────────────────────────────────

def ergo_pay_for_service(task_text: str, note_box_id: str) -> dict:
    """Pay an Ergo-powered service with a Note."""
    payload = json.dumps({"text": task_text}).encode()
    req = urllib.request.Request(
        f"{ERGO_API_SERVER}/api/analyze",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "X-Note-Box-Id": note_box_id},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {
            "success": False,
            "result": {"sentiment": "positive", "wordCount": 42, "summary": f"Mock result for: {task_text[:30]}"},
            "payment": {"noteBoxId": note_box_id, "valueErg": "0.001"},
            "error": str(e),
        }

def get_note_info(box_id: str) -> dict:
    """Fetch Note info from Ergo node."""
    try:
        req = urllib.request.Request(
            f"{TESTNET_API}/api/v1/boxes/{box_id}",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            box = json.loads(resp.read().decode())
            value = int(box.get("value", 0))
            return {"boxId": box_id, "value": value, "ergs": value / 1e9}
    except Exception:
        return {"boxId": box_id, "value": 1_000_000, "ergs": 0.001}


# ── Mock AutoGen conversation ─────────────────────────────────────────────────

class MockConversationAgent:
    """Simulates AutoGen agent message passing with Ergo payment integration."""

    def __init__(self, name: str, role: str):
        self.name = name
        self.role = role
        self.messages = []

    def send(self, recipient: "MockConversationAgent", message: str):
        print(f"\n[{self.name}] → [{recipient.name}]: {message[:80]}...")
        recipient.messages.append({"from": self.name, "content": message})
        return recipient.receive(self, message)

    def receive(self, sender: "MockConversationAgent", message: str) -> str:
        if "TASK:" in message:
            task = message.split("TASK:")[1].strip()
            result = ergo_pay_for_service(task, CLIENT_NOTE_ID)
            response = (
                f"COMPLETED. Analysis: {json.dumps(result.get('result', {}), indent=2)}. "
                f"Payment: {result.get('payment', {}).get('valueErg', '?')} ERG via Note."
            )
            print(f"[{self.name}] Processed task + collected payment")
            return response
        return f"[{self.name}] Acknowledged: {message[:50]}"


def run_mock():
    print("=== AutoGen Multi-Agent Ergo Payment Demo ===\n")

    client   = MockConversationAgent("ClientAgent",   "service requester")
    provider = MockConversationAgent("ProviderAgent", "service provider")

    print("Conversation flow:")
    print("  ClientAgent   → requests service + attaches Note as payment promise")
    print("  ProviderAgent → completes task + redeems Note")
    print()

    # Step 1: negotiation
    client.send(provider, "NEGOTIATE: I need sentiment analysis. My budget: 0.001 ERG Note. Accept?")

    # Step 2: task execution with payment
    result = client.send(
        provider,
        "TASK: Analyze the competitive landscape of AI agent payment systems. "
        "Note payment attached: " + CLIENT_NOTE_ID[:16] + "..."
    )

    print(f"\n[result] {result[:200]}")

    # Step 3: settlement confirmation
    note_info = get_note_info(CLIENT_NOTE_ID)
    print(f"\n[settlement] Note {CLIENT_NOTE_ID[:16]}... ({note_info['ergs']} ERG) redeemed by ProviderAgent")
    print("[settlement] ClientAgent receives task output. ProviderAgent receives ERG.")


# ── Real AutoGen integration ──────────────────────────────────────────────────

def run_autogen():
    try:
        import autogen
    except ImportError:
        print("pyautogen not installed. Run: pip install pyautogen")
        print("Falling back to mock...\n")
        run_mock()
        return

    config_list = [{"model": "gpt-4o-mini", "api_key": os.getenv("OPENAI_API_KEY", "")}]

    def ergo_pay_tool(task: str, note_box_id: str = CLIENT_NOTE_ID) -> str:
        """AutoGen function tool: pay for a service using an Ergo Note."""
        result = ergo_pay_for_service(task, note_box_id)
        return json.dumps(result)

    client_agent = autogen.ConversableAgent(
        name="ClientAgent",
        system_message=(
            "You are a client agent that requests analysis services. "
            "You pay for services using Ergo Notes. "
            "Use ergo_pay_tool to request and pay for analysis."
        ),
        llm_config={"config_list": config_list},
        human_input_mode="NEVER",
    )

    provider_agent = autogen.ConversableAgent(
        name="ProviderAgent",
        system_message=(
            "You are a provider agent that performs analysis tasks. "
            "You receive payment via Ergo Notes. "
            "Report your findings and confirm payment received."
        ),
        llm_config={"config_list": config_list},
        human_input_mode="NEVER",
    )

    autogen.register_function(
        ergo_pay_tool,
        caller=client_agent,
        executor=provider_agent,
        name="ergo_pay",
        description="Pay for analysis using an Ergo Note and get results",
    )

    client_agent.initiate_chat(
        provider_agent,
        message="Please analyze the competitive advantages of Ergo for AI agent payments. I'll pay with my Note.",
        max_turns=3,
    )


if __name__ == "__main__":
    if "--autogen" in sys.argv:
        run_autogen()
    else:
        run_mock()
        print("\nTip: run with --autogen for real AutoGen integration (requires: pip install pyautogen + OPENAI_API_KEY)")
