// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-api — replay-protection store
//
// Purpose: prevent the same Note boxId from being charged twice by this
// middleware. The on-chain redemption itself is the ultimate replay barrier
// (a spent UTxO cannot be spent again), but waiting for confirmation is too
// slow for an inline 402 flow. The store gives us atomic single-instance
// claim semantics in front of redemption.
//
// The default `InMemoryReplayStore` is correct for a single Node process. For
// a fleet of API servers behind a load balancer, plug in a Redis/Postgres
// store that exposes the same `tryClaim` contract.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReplayStore } from "./types.js";

export class InMemoryReplayStore implements ReplayStore {
  private readonly claimed = new Set<string>();

  /** Optional cap on the number of remembered boxIds. Oldest are evicted. */
  private readonly capacity: number | undefined;
  private readonly order: string[] = [];

  constructor(opts: { capacity?: number } = {}) {
    this.capacity = opts.capacity;
  }

  tryClaim(boxId: string): boolean {
    if (this.claimed.has(boxId)) return false;
    this.claimed.add(boxId);
    if (this.capacity !== undefined) {
      this.order.push(boxId);
      while (this.order.length > this.capacity) {
        const evicted = this.order.shift();
        if (evicted) this.claimed.delete(evicted);
      }
    }
    return true;
  }

  release(boxId: string): void {
    this.claimed.delete(boxId);
    const idx = this.order.indexOf(boxId);
    if (idx >= 0) this.order.splice(idx, 1);
  }

  /** Test/inspection helper. Not part of the ReplayStore contract. */
  has(boxId: string): boolean {
    return this.claimed.has(boxId);
  }

  /** Test/inspection helper. */
  get size(): number {
    return this.claimed.size;
  }
}
