// ─────────────────────────────────────────────────────────────────────────────
// ergo-agent-pay — Network Client
// ─────────────────────────────────────────────────────────────────────────────

import type { Network, EIP12UnsignedTx, SignedTx, ErgoAgentPayErrorCode } from "./types.js";
import { ErgoAgentPayError } from "./types.js";

const NODE_URLS: Record<Network, string> = {
  mainnet: "https://api.ergoplatform.com",
  testnet: "https://api-testnet.ergoplatform.com",
};

export class NetworkClient {
  private readonly baseUrl: string;

  constructor(network: Network, customUrl?: string) {
    this.baseUrl = customUrl ?? NODE_URLS[network];
  }

  async getHeight(): Promise<number> {
    const data = await this.get<{ fullHeight: number }>("/api/v1/info");
    return data.fullHeight;
  }

  async getUnspentBoxes(address: string): Promise<unknown[]> {
    const data = await this.get<{ items: unknown[]; total: number }>(
      `/api/v1/boxes/unspent/byAddress/${address}?limit=100&sortDirection=desc`
    );
    return data.items ?? [];
  }

  async getAddressBalance(address: string): Promise<{ nanoErgs: bigint }> {
    const data = await this.get<{ confirmed: { nanoErgs: string } }>(
      `/api/v1/addresses/${address}/balance/confirmed`
    );
    return { nanoErgs: BigInt(data.confirmed?.nanoErgs ?? 0) };
  }

  async submitTransaction(signedTx: SignedTx): Promise<string> {
    const txId = await this.post<string>("/api/v1/transactions", signedTx);
    return txId;
  }

  async getBox(boxId: string): Promise<unknown> {
    return this.get<unknown>(`/api/v1/boxes/${boxId}`);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw new ErgoAgentPayError(
        `Network request failed: ${path}`,
        "NETWORK_ERROR",
        err
      );
    }

    if (!res.ok) {
      throw new ErgoAgentPayError(
        `API error ${res.status} at ${path}`,
        "NETWORK_ERROR"
      );
    }

    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ErgoAgentPayError(
        `Network POST failed: ${path}`,
        "NETWORK_ERROR",
        err
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ErgoAgentPayError(
        `Submission failed (${res.status}): ${text}`,
        "SUBMISSION_FAILED"
      );
    }

    return res.json() as Promise<T>;
  }
}
