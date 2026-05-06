"""
Runnable LangChain ReAct agent that uses the paywalled tool.

Required env:
  BUYER_ADDRESS       — Ergo address the agent operates from.
  SELLER_ADDRESS      — paywalled seller's address.
  RESERVE_BOX_ID      — boxId of the buyer's Reserve (created out of band).
  ERGO_BRIDGE_URL     — http://… (default 127.0.0.1:3737)
  ERGO_API_KEY        — bridge daemon API key.
  SELLER_API_URL      — http://… (the seller's API root).
  NOTE_BOX_ID         — (demo) boxId of the issued Note for the next call.
  OPENAI_API_KEY      — for the LLM driving the agent loop.
"""

from __future__ import annotations

import os
import sys

from ergo_agent_pay import BridgeClient

from buyer_tool import ErgoPaidTool, ToolConfig
from pricing_policy import PaymentPolicy


def env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.exit(f"environment variable {name} is required")
    return v


def build_agent_executor(query: str) -> str:
    bridge = BridgeClient(
        os.environ.get("ERGO_BRIDGE_URL", "http://127.0.0.1:3737"),
        api_key=os.environ.get("ERGO_API_KEY"),
    )
    policy = PaymentPolicy(
        max_session_spend=10_000_000,            # 0.01 ERG total per session
        per_recipient_cap={env("SELLER_ADDRESS"): 1_000_000},
    )
    config = ToolConfig(
        seller_api_url=env("SELLER_API_URL"),
        seller_address=env("SELLER_ADDRESS"),
        reserve_box_id=env("RESERVE_BOX_ID"),
        bridge=bridge,
        policy=policy,
        price_nano_erg=1_000_000,                # 0.001 ERG per call
    )
    paid_tool = ErgoPaidTool().bind_config(config)

    # LangChain ReAct executor wiring. Done lazily so tests don't import
    # langchain just to verify the tool's wire shape.
    from langchain.agents import AgentExecutor, create_react_agent
    from langchain.prompts import PromptTemplate
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = PromptTemplate.from_template(
        "Answer the user's question using the available tools.\n"
        "If the tool returns a payment-required error, surface it verbatim.\n"
        "Question: {input}\n"
        "{agent_scratchpad}"
    )
    agent = create_react_agent(llm, [paid_tool], prompt)
    executor = AgentExecutor(agent=agent, tools=[paid_tool], verbose=True)
    result = executor.invoke({"input": query})
    return str(result.get("output", result))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python buyer_agent.py '<your question>'")
    print(build_agent_executor(sys.argv[1]))
