"""
Budget gate for CrewAI agents — same surface as the LangChain example,
mirrors the v2 PolicyEngine in `ergo-agent-pay/src/policy.ts`.

Decision order in `check_before`:
  1. recipient_blocklist
  2. recipient_allowlist
  3. per_recipient_cap (or max_single_payment)
  4. max_session_spend
  5. daily_budget (UTC)
  6. before_pay hook
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Callable, Mapping, Optional


@dataclass
class PolicyDecision:
    allowed: bool
    reason: Optional[str] = None


@dataclass
class PaymentPolicy:
    max_single_payment: Optional[int] = None
    max_session_spend: Optional[int] = None
    per_recipient_cap: Mapping[str, int] = field(default_factory=dict)
    recipient_allowlist: Optional[set[str]] = None
    recipient_blocklist: set[str] = field(default_factory=set)
    daily_budget: Optional[int] = None
    before_pay: Optional[Callable[[str, int], bool]] = None

    _session_spend: int = 0
    _daily_spend: int = 0
    _daily_epoch_day: int = -1

    def check_before(self, recipient: str, value: int) -> PolicyDecision:
        if recipient in self.recipient_blocklist:
            return PolicyDecision(False, f"recipient {recipient} is on the blocklist")
        if (
            self.recipient_allowlist is not None
            and recipient not in self.recipient_allowlist
        ):
            return PolicyDecision(
                False, f"recipient {recipient} is not in the allowlist"
            )
        cap = self.per_recipient_cap.get(recipient, self.max_single_payment)
        if cap is not None and value > cap:
            scope = (
                "per-recipient"
                if recipient in self.per_recipient_cap
                else "single-payment"
            )
            return PolicyDecision(
                False, f"value {value} exceeds {scope} cap {cap}"
            )
        if (
            self.max_session_spend is not None
            and self._session_spend + value > self.max_session_spend
        ):
            return PolicyDecision(
                False,
                f"session spend would reach {self._session_spend + value}, "
                f"exceeding {self.max_session_spend}",
            )
        if self.daily_budget is not None:
            self._tick_day()
            if self._daily_spend + value > self.daily_budget:
                return PolicyDecision(
                    False,
                    f"daily spend would reach {self._daily_spend + value}, "
                    f"exceeding {self.daily_budget}",
                )
        if self.before_pay and not self.before_pay(recipient, value):
            return PolicyDecision(False, "before_pay hook rejected")
        return PolicyDecision(True)

    def record_after(self, recipient: str, value: int) -> None:
        del recipient
        self._session_spend += value
        self._tick_day()
        self._daily_spend += value

    @property
    def total_session_spend(self) -> int:
        return self._session_spend

    @property
    def total_daily_spend(self) -> int:
        self._tick_day()
        return self._daily_spend

    def reset_session(self) -> None:
        self._session_spend = 0

    def _tick_day(self) -> None:
        today = math.floor(time.time() / 86400)
        if self._daily_epoch_day != today:
            self._daily_epoch_day = today
            self._daily_spend = 0
