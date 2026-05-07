// ─────────────────────────────────────────────────────────────────────────────
// @accord-protocol/gateway — in-memory replay store
//
// Default replay-protection backing for `accordGateway()`. Suitable for
// dev / tests / single-process demos. Production deployments SHOULD pass
// a Redis-backed store; the interface (`AccordReplayStore` in types.ts)
// is small on purpose.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccordReplayStore } from "./types.js";

interface Entry {
  expiresAtMs: number;
}

export class InMemoryReplayStore implements AccordReplayStore {
  private readonly map = new Map<string, Entry>();

  has(rail: string, paymentId: string): boolean {
    this.gc();
    return this.map.has(this.key(rail, paymentId));
  }

  put(rail: string, paymentId: string, expiresAtMs: number): void {
    this.map.set(this.key(rail, paymentId), { expiresAtMs });
  }

  /** Test helper: how many live entries are tracked right now. */
  size(): number {
    this.gc();
    return this.map.size;
  }

  /** Test helper: drop everything. */
  clear(): void {
    this.map.clear();
  }

  private key(rail: string, paymentId: string): string {
    return `${rail}::${paymentId}`;
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (v.expiresAtMs <= now) this.map.delete(k);
    }
  }
}
