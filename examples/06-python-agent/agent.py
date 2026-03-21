"""
Example 06 — Python AI Agent with Ergo Payments (LangChain)

A LangChain agent that autonomously pays for API calls using Ergo Notes.
Demonstrates the Python-side of the ergo-agent-pay pattern:

  1. Agent receives a task
  2. Agent uses the ErgoPayTool to pay the API server (example 05)
  3. API server verifies the Note on-chain and returns the result
  4. Agent uses the result to complete the task

Architecture:
  Python LangChain agent
    └── ErgoPayTool (custom LangChain tool)
          └── POST /api/analyze with X-Note-Box-Id header
                └── Example 05 server (Node.js)

Requirements:
  pip install langchain langchain-openai requests

Or minimal (no LangChain — plain Python):
  pip install requests

Environment:
  export OPENAI_API_KEY="sk-..."       # for LangChain agent
  export ERGO_NOTE_BOX_ID="<boxId>"   # Note to spend as payment
  export ERGO_API_SERVER="http://localhost:3000"

Run:
  python agent.py
"""

import os
import json
import hashlib
import requests
from typing import Optional

# ── Ergo node config ──────────────────────────────────────────────────────────
TESTNET_API  = "https://api-testnet.ergoplatform.com"
API_SERVER   = os.getenv("ERGO_API_SERVER", "http://localhost:3000")
NOTE_BOX_ID  = os.getenv("ERGO_NOTE_BOX_ID", "a" * 64)  # placeholder

# ── Ergo helper functions (no Node.js required) ───────────────────────────────

def get_block_height() -> int:
    """Fetch current Ergo testnet block height."""
    res = requests.get(f"{TESTNET_API}/api/v1/info", timeout=10)
    res.raise_for_status()
    return res.json()["fullHeight"]


def get_unspent_boxes(address: str) -> list[dict]:
    """Fetch unspent UTxOs for an address."""
    res = requests.get(
        f"{TESTNET_API}/api/v1/boxes/unspent/byAddress/{address}",
        params={"limit": 50, "sortDirection": "desc"},
        timeout=10,
    )
    res.raise_for_status()
    return res.json().get("items", [])


def get_note_info(box_id: str) -> Optional[dict]:
    """
    Fetch a Note box and decode its registers.
    Returns: dict with value, expiryBlock, reserveBoxId, taskHash, isExpired
    """
    res = requests.get(f"{TESTNET_API}/api/v1/boxes/{box_id}", timeout=10)
    if not res.ok:
        return None

    box = res.json()
    registers = box.get("additionalRegisters", {})
    height = get_block_height()

    # Decode R5 (expiry) — SInt: 04 prefix + zigzag encoded integer
    expiry_block = 0
    r5 = registers.get("R5", "")
    if len(r5) >= 4:
        zigzag = int(r5[2:], 16)
        expiry_block = (zigzag >> 1) ^ -(zigzag & 1)

    # Decode R6 (task hash) — SColl[SByte]: 0e + length + bytes
    task_hash = None
    r6 = registers.get("R6", "")
    if len(r6) > 4:
        task_hash = r6[4:]  # skip 0e + length byte

    return {
        "boxId":        box_id,
        "value":        int(box.get("value", 0)),
        "valueErg":     int(box.get("value", 0)) / 1e9,
        "expiryBlock":  expiry_block,
        "currentBlock": height,
        "isExpired":    height >= expiry_block if expiry_block > 0 else False,
        "taskHash":     task_hash,
        "raw":          box,
    }


def compute_task_hash(task_output: str) -> str:
    """Compute sha256 of task output (use blake2b-256 on-chain; sha256 here for demo)."""
    return hashlib.sha256(task_output.encode()).hexdigest()


# ── Ergo Pay Tool (direct API call, no LangChain required) ────────────────────

class ErgoPayTool:
    """
    Python tool for paying Ergo API servers with Notes.
    Wraps the HTTP call to an ergo-agent-pay powered server.
    """

    name = "ergo_pay"
    description = (
        "Pay an Ergo-powered API server with an on-chain Note and get analysis results. "
        "Input: JSON with 'text' field. Payment is automatic via Note in environment."
    )

    def __init__(self, note_box_id: str, server_url: str = API_SERVER):
        self.note_box_id = note_box_id
        self.server_url  = server_url

    def run(self, text: str) -> str:
        """Call the API server with Note payment, return result as string."""
        res = requests.post(
            f"{self.server_url}/api/analyze",
            headers={
                "Content-Type": "application/json",
                "X-Note-Box-Id": self.note_box_id,
            },
            json={"text": text},
            timeout=15,
        )

        if res.status_code == 402:
            return f"Payment required: {res.json().get('message', 'unknown error')}"

        if not res.ok:
            return f"API error {res.status_code}: {res.text}"

        data = res.json()
        result = data.get("result", {})
        payment = data.get("payment", {})
        return json.dumps({
            "sentiment":  result.get("sentiment"),
            "wordCount":  result.get("wordCount"),
            "summary":    result.get("summary"),
            "paid":       payment.get("valueErg"),
            "noteBoxId":  payment.get("noteBoxId", "")[:16] + "...",
        }, indent=2)


# ── Standalone demo (no LangChain) ────────────────────────────────────────────

def demo_standalone():
    """Minimal demo — Python agent pays for 3 API calls."""
    print("=== Ergo Python Agent Demo (standalone) ===\n")

    tool = ErgoPayTool(note_box_id=NOTE_BOX_ID)

    tasks = [
        "Q4 revenue exceeded expectations. Operating margin improved by 3.2 percentage points.",
        "The product launch was delayed due to supply chain issues. Customer demand remains strong.",
        "Team morale is high. Retention rates improved 15% after the new benefits package.",
    ]

    for i, task in enumerate(tasks, 1):
        print(f"Task {i}: {task[:60]}...")
        result = tool.run(task)
        print(f"Result: {result}\n")


# ── LangChain agent (requires langchain + openai) ─────────────────────────────

def demo_langchain():
    """
    LangChain agent that uses ErgoPayTool to pay for analysis.
    Requires: pip install langchain langchain-openai
    """
    try:
        from langchain.agents import AgentExecutor, create_openai_functions_agent
        from langchain_openai import ChatOpenAI
        from langchain.tools import BaseTool, StructuredTool
        from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
        from langchain.schema import SystemMessage
        from pydantic import BaseModel, Field
    except ImportError:
        print("LangChain not installed. Run: pip install langchain langchain-openai")
        print("Falling back to standalone demo...\n")
        demo_standalone()
        return

    print("=== Ergo Python LangChain Agent Demo ===\n")

    # Wrap ErgoPayTool as a LangChain StructuredTool
    ergo_tool_impl = ErgoPayTool(note_box_id=NOTE_BOX_ID)

    class AnalyzeInput(BaseModel):
        text: str = Field(description="Text to analyze for sentiment and summary")

    lc_tool = StructuredTool.from_function(
        func=ergo_tool_impl.run,
        name="ergo_analyze",
        description=ergo_tool_impl.description,
        args_schema=AnalyzeInput,
    )

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=(
            "You are a financial analysis agent. When given text to analyze, "
            "use the ergo_analyze tool to get paid analysis. "
            "Payment is automatic — just call the tool."
        )),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    agent = create_openai_functions_agent(llm=llm, tools=[lc_tool], prompt=prompt)
    executor = AgentExecutor(agent=agent, tools=[lc_tool], verbose=True)

    result = executor.invoke({
        "input": "Analyze this earnings call excerpt: "
                 "'Revenue grew 23% YoY to $2.1B. EPS beat consensus by $0.14. "
                 "Management raised full-year guidance by 5%.'"
    })

    print("\nFinal answer:", result["output"])


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if "--langchain" in sys.argv:
        demo_langchain()
    else:
        demo_standalone()
        print("\nTip: run with --langchain for the full LangChain agent demo")
        print("     (requires: pip install langchain langchain-openai + OPENAI_API_KEY)")
