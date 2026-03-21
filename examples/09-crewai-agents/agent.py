"""
Example 09 — CrewAI Multi-Agent System with Ergo Payments

A 3-agent crew where:
  - Researcher: finds information, gets paid per research task
  - Analyst: analyzes findings, pays the Researcher from its budget
  - Writer: produces final output, pays the Analyst

Each payment is an Ergo Note. The Writer's orchestrator (human/system)
issued the initial budget Note to the Writer, who delegates sub-budgets.

Architecture:
  Orchestrator
    └── Writer (has budget Note)
          ├── pays Analyst Note for analysis
          └── Analyst pays Researcher Note for research

Requirements:
  pip install crewai requests
  # Start ergo-agent-pay server: cd ../../examples/05-api-payment-server && node server.js

Run:
  python agent.py
  python agent.py --mock  (no live network, no crewai required)
"""

import os
import sys
import json
import hashlib
import urllib.request
from typing import Optional

ERGO_API_SERVER = os.getenv("ERGO_API_SERVER", "http://localhost:3000")
WRITER_NOTE_ID  = os.getenv("WRITER_NOTE_BOX_ID", "a" * 64)
TESTNET_API     = "https://api-testnet.ergoplatform.com"

# ── Ergo payment helper (reused from example 06) ──────────────────────────────

def call_api_with_note(text: str, note_box_id: str) -> dict:
    """Call the ergo-agent-pay API server with a Note payment."""
    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        f"{ERGO_API_SERVER}/api/analyze",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Note-Box-Id": note_box_id,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e), "result": {"sentiment": "unknown", "wordCount": 0, "summary": "API unavailable"}}

def compute_task_hash(task: str) -> str:
    return hashlib.sha256(task.encode()).hexdigest()

# ── Mock crew (no crewai dependency) ─────────────────────────────────────────

class MockAgent:
    def __init__(self, role: str, note_budget: str):
        self.role = role
        self.note_budget = note_budget
        self.tasks_completed = 0

    def execute(self, task: str) -> str:
        self.tasks_completed += 1
        print(f"\n[{self.role}] Executing: {task[:60]}...")
        result = call_api_with_note(task, self.note_budget)
        output = result.get("result", {})
        return json.dumps({
            "agent": self.role,
            "task": task[:50],
            "sentiment": output.get("sentiment", "unknown"),
            "wordCount": output.get("wordCount", 0),
            "paid_note": self.note_budget[:16] + "...",
        })


def run_mock_crew():
    """Run without crewai — shows the payment delegation pattern."""
    print("=== CrewAI Multi-Agent Ergo Payment Demo (mock) ===\n")

    researcher = MockAgent("Researcher", "c" * 64)
    analyst    = MockAgent("Analyst",    "b" * 64)
    writer     = MockAgent("Writer",     WRITER_NOTE_ID)

    print("Crew configuration:")
    print(f"  Writer    → Note: {writer.note_budget[:16]}...")
    print(f"  Analyst   → Note: {analyst.note_budget[:16]}...")
    print(f"  Researcher→ Note: {researcher.note_budget[:16]}...")

    # Step 1: Researcher gathers data (paid by Analyst's sub-budget)
    research_result = researcher.execute(
        "Research current state of AI agent payment systems on blockchain. "
        "Focus on acceptance predicates and bearer instruments."
    )

    # Step 2: Analyst processes the research (paid by Writer's sub-budget)
    analyst_result = analyst.execute(
        f"Analyze this research and identify key insights: {research_result}"
    )

    # Step 3: Writer produces final output (paid by orchestrator's budget)
    final_result = writer.execute(
        f"Write executive summary based on: {analyst_result}"
    )

    print("\n=== Final Output ===")
    print(json.dumps(json.loads(final_result), indent=2))

    print("\n=== Payment Flow ===")
    print("Orchestrator issued Note → Writer")
    print("Writer delegated Note    → Analyst (sub-budget)")
    print("Analyst delegated Note   → Researcher (sub-budget)")
    print("Each Note has acceptance predicate: task hash must match output")

    task_hash = compute_task_hash(final_result)
    print(f"\nFinal task hash: {task_hash[:32]}...")
    print("This hash would be in R6 of the Writer's Note — payment only releases when output matches.")


# ── Real CrewAI integration ───────────────────────────────────────────────────

def run_crewai():
    try:
        from crewai import Agent, Task, Crew, Process
        from crewai.tools import BaseTool
        from pydantic import BaseModel, Field
    except ImportError:
        print("crewai not installed. Run: pip install crewai")
        print("Falling back to mock demo...\n")
        run_mock_crew()
        return

    print("=== CrewAI Multi-Agent Ergo Payment Demo ===\n")

    class ErgoAnalyzeInput(BaseModel):
        text: str = Field(description="Text to analyze")
        note_box_id: str = Field(description="Ergo Note box ID for payment", default=WRITER_NOTE_ID)

    class ErgoAnalyzeTool(BaseTool):
        name: str = "ergo_analyze"
        description: str = "Analyze text and pay for analysis using an Ergo Note"
        args_schema: type[BaseModel] = ErgoAnalyzeInput

        def _run(self, text: str, note_box_id: str = WRITER_NOTE_ID) -> str:
            result = call_api_with_note(text, note_box_id)
            return json.dumps(result.get("result", {}))

    ergo_tool = ErgoAnalyzeTool()

    researcher = Agent(
        role="Blockchain Researcher",
        goal="Research AI agent payment systems on blockchain",
        backstory="Expert in DeFi and agent economy primitives",
        tools=[ergo_tool],
        verbose=True,
    )

    analyst = Agent(
        role="Financial Analyst",
        goal="Analyze research findings and identify opportunities",
        backstory="Expert in blockchain economics and agent workflows",
        tools=[ergo_tool],
        verbose=True,
    )

    research_task = Task(
        description="Research Ergo blockchain agent payment primitives: Note, Reserve, Tracker, Acceptance Predicate",
        agent=researcher,
        expected_output="Structured research report with key findings",
    )

    analysis_task = Task(
        description="Analyze the research findings and produce investment thesis",
        agent=analyst,
        expected_output="Executive summary with actionable insights",
        context=[research_task],
    )

    crew = Crew(
        agents=[researcher, analyst],
        tasks=[research_task, analysis_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()
    print("\n=== Crew Result ===")
    print(result)


if __name__ == "__main__":
    if "--mock" in sys.argv or True:  # default to mock since crewai requires pip install
        run_mock_crew()
    else:
        run_crewai()
