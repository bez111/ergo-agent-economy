"""
Tests for ErgoPaidCrewTool — exercise the wire-level contract without
spinning up the bridge daemon, the seller's API, or CrewAI.

Stubs:
  * BridgeClient subclass that records issue_note calls and returns
    a canned dict.
  * http_call seam that returns canned responses.
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ergo_agent_pay import BridgeClient, ErgoAgentPayError

from buyer_tool import ErgoPaidCrewTool, ToolConfig, build_expected_output  # noqa: E402
from pricing_policy import PaymentPolicy  # noqa: E402


class StubBridge(BridgeClient):
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.next_response: dict = {
            "submitted": False,
            "tx_id": None,
            "unsigned_tx": {"placeholder": True},
        }
        self.next_error: ErgoAgentPayError | None = None

    def issue_note(self, **kwargs) -> dict:  # type: ignore[override]
        self.calls.append(kwargs)
        if self.next_error:
            raise self.next_error
        return self.next_response


def make_config(
    bridge: BridgeClient,
    *,
    policy: PaymentPolicy | None = None,
    http_responses: list[dict] | None = None,
) -> tuple[ToolConfig, list[dict]]:
    captured: list[dict] = []
    responses = http_responses if http_responses is not None else [{"result": "ok"}]

    def fake_http(method: str, url: str, body: bytes, headers: dict[str, str]) -> dict:
        captured.append({"method": method, "url": url, "body": body, "headers": headers})
        idx = len(captured) - 1
        return responses[idx if idx < len(responses) else len(responses) - 1]

    config = ToolConfig(
        seller_api_url="http://seller.local",
        seller_address="9XSeller",
        reserve_box_id="abc123",
        bridge=bridge,
        policy=policy or PaymentPolicy(),
        price_nano_erg=1_000_000,
        http_call=fake_http,
    )
    return config, captured


class BuildExpectedOutputTest(unittest.TestCase):
    def test_word_count(self) -> None:
        self.assertEqual(build_expected_output("hello world"), '{"word_count":2}')

    def test_empty_string(self) -> None:
        self.assertEqual(build_expected_output(""), '{"word_count":0}')

    def test_collapses_whitespace(self) -> None:
        self.assertEqual(build_expected_output("a  b\tc\nd"), '{"word_count":4}')


class PolicyGateTest(unittest.TestCase):
    def test_blocked_recipient_short_circuits_before_bridge(self) -> None:
        bridge = StubBridge()
        policy = PaymentPolicy(recipient_blocklist={"9XSeller"})
        config, captured = make_config(bridge, policy=policy)
        tool = ErgoPaidCrewTool().bind_config(config)
        result = json.loads(tool._run("anything"))
        self.assertEqual(result["error"], "policy")
        self.assertEqual(bridge.calls, [])
        self.assertEqual(captured, [])

    def test_per_recipient_cap_blocks_call_above_limit(self) -> None:
        bridge = StubBridge()
        policy = PaymentPolicy(per_recipient_cap={"9XSeller": 100_000})
        config, _ = make_config(bridge, policy=policy)
        tool = ErgoPaidCrewTool().bind_config(config)
        result = json.loads(tool._run("anything"))
        self.assertEqual(result["error"], "policy")
        self.assertIn("cap", result["reason"])

    def test_session_spend_increments_only_on_success(self) -> None:
        bridge = StubBridge()
        policy = PaymentPolicy(max_session_spend=10_000_000)
        config, _ = make_config(bridge, policy=policy)
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {"NOTE_BOX_ID": "deadbeef"}):
            tool._run("hello world")
        self.assertEqual(policy.total_session_spend, 1_000_000)

    def test_session_spend_does_not_increment_on_pending(self) -> None:
        bridge = StubBridge()
        policy = PaymentPolicy(max_session_spend=10_000_000)
        config, _ = make_config(bridge, policy=policy)
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NOTE_BOX_ID", None)
            tool._run("hello world")
        self.assertEqual(policy.total_session_spend, 0)

    def test_shared_policy_caps_whole_crew(self) -> None:
        """Two tools sharing one policy can't blow past the session cap."""
        bridge_a = StubBridge()
        bridge_b = StubBridge()
        policy = PaymentPolicy(max_session_spend=1_500_000)
        cfg_a, _ = make_config(bridge_a, policy=policy)
        cfg_b, _ = make_config(bridge_b, policy=policy)
        tool_a = ErgoPaidCrewTool().bind_config(cfg_a)
        tool_b = ErgoPaidCrewTool().bind_config(cfg_b)
        with mock.patch.dict(os.environ, {"NOTE_BOX_ID": "deadbeef"}):
            first = json.loads(tool_a._run("hello world"))
            second = json.loads(tool_b._run("hello world"))
        self.assertEqual(first, {"result": "ok"})
        self.assertEqual(second["error"], "policy")
        self.assertEqual(policy.total_session_spend, 1_000_000)


class BridgeFlowTest(unittest.TestCase):
    def test_issue_note_called_with_pre_committed_output(self) -> None:
        bridge = StubBridge()
        config, _ = make_config(bridge)
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {"NOTE_BOX_ID": "deadbeef"}):
            tool._run("hello world")
        self.assertEqual(len(bridge.calls), 1)
        call = bridge.calls[0]
        self.assertEqual(call["recipient"], "9XSeller")
        self.assertEqual(call["value"], 1_000_000)
        self.assertEqual(call["task_output"], '{"word_count":2}')

    def test_bridge_error_surfaces_typed(self) -> None:
        bridge = StubBridge()
        bridge.next_error = ErgoAgentPayError("daemon offline", "NETWORK_ERROR")
        config, _ = make_config(bridge)
        tool = ErgoPaidCrewTool().bind_config(config)
        result = json.loads(tool._run("hello"))
        self.assertEqual(result["error"], "NETWORK_ERROR")
        self.assertIn("daemon offline", result["message"])

    def test_returns_pending_when_NOTE_BOX_ID_unset(self) -> None:
        bridge = StubBridge()
        config, captured = make_config(bridge)
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NOTE_BOX_ID", None)
            result = json.loads(tool._run("hello"))
        self.assertEqual(result["error"], "NOTE_BOX_ID_PENDING")
        self.assertEqual(captured, [], "no HTTP call should fire when boxId is unknown")


class HttpFlowTest(unittest.TestCase):
    def test_http_request_carries_note_headers(self) -> None:
        bridge = StubBridge()
        config, captured = make_config(bridge)
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {"NOTE_BOX_ID": "deadbeef"}):
            tool._run("hello")
        self.assertEqual(len(captured), 1)
        h = captured[0]["headers"]
        self.assertEqual(h["X-Note-Box-Id"], "deadbeef")
        self.assertEqual(h["X-Task-Output"], '{"word_count":1}')
        self.assertEqual(captured[0]["url"], "http://seller.local/api/run")

    def test_http_response_returned_as_string(self) -> None:
        bridge = StubBridge()
        config, _ = make_config(bridge, http_responses=[{"summary": "the answer"}])
        tool = ErgoPaidCrewTool().bind_config(config)
        with mock.patch.dict(os.environ, {"NOTE_BOX_ID": "deadbeef"}):
            result = tool._run("hello")
        self.assertEqual(result, '{"summary": "the answer"}')


class UnboundToolTest(unittest.TestCase):
    def test_unbound_tool_raises(self) -> None:
        tool = ErgoPaidCrewTool()
        with self.assertRaises(RuntimeError):
            tool._run("anything")


if __name__ == "__main__":
    unittest.main()
