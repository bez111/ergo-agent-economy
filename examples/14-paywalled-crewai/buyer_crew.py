"""
Runnable CrewAI crew that uses the paywalled tool.

A 2-agent crew where each tool invocation costs a Note:
  * Researcher — gathers facts via the paywalled summariser.
  * Writer     — composes a final blurb from the research.

Required env:
  BUYER_ADDRESS       — Ergo address the agent operates from.
  SELLER_ADDRESS      — paywalled seller's address.
  RESERVE_BOX_ID      — boxId of the buyer's Reserve (created out of band).
  ERGO_BRIDGE_URL     — http://… (default 127.0.0.1:3737)
  ERGO_API_KEY        — bridge daemon API key.
  SELLER_API_URL      — http://… (the seller's API root).
  NOTE_BOX_ID         — (demo) boxId of the issued Note for the next call.
  OPENAI_API_KEY      — for the LLM driving the crew.
"""

from __future__ import annotations

import os
import sys

from ergo_agent_pay import BridgeClient

from buyer_tool import ErgoPaidCrewTool, ToolConfig
from pricing_policy import PaymentPolicy


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"environment variable {name} is required")
    return v


def build_crew(query: str) -> str:
    bridge = BridgeClient(
        os.environ.get("ERGO_BRIDGE_URL", "http://127.0.0.1:3737"),
        api_key=os.environ.get("ERGO_API_KEY"),
    )
    policy = PaymentPolicy(
        max_session_spend=10_000_000,
        per_recipient_cap={env("SELLER_ADDRESS"): 1_000_000},
    )
    config = ToolConfig(
        seller_api_url=env("SELLER_API_URL"),
        seller_address=env("SELLER_ADDRESS"),
        reserve_box_id=env("RESERVE_BOX_ID"),
        bridge=bridge,
        policy=policy,
        price_nano_erg=1_000_000,
    )
    paid_tool = ErgoPaidCrewTool().bind_config(config)

    # Lazy import — tests don't need crewai installed.
    from crewai import Agent, Crew, Process, Task

    researcher = Agent(
        role="Blockchain Researcher",
        goal="Use the paid tool to gather facts about the user's question.",
        backstory="An on-chain analyst who pays per query out of a budget.",
        tools=[paid_tool],
        verbose=True,
    )
    writer = Agent(
        role="Brief Writer",
        goal="Compose a one-paragraph answer from the researcher's findings.",
        backstory="Distils noisy research into clean, dense prose.",
        verbose=True,
    )

    research = Task(
        description=f"Research the user's question and return raw findings: {query}",
        agent=researcher,
        expected_output="A bullet list of facts pulled from the paid tool.",
    )
    writeup = Task(
        description="Write a one-paragraph answer to the user's question.",
        agent=writer,
        expected_output="A single short paragraph.",
        context=[research],
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research, writeup],
        process=Process.sequential,
        verbose=True,
    )
    return str(crew.kickoff())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python buyer_crew.py '<your question>'")
    print(build_crew(sys.argv[1]))
