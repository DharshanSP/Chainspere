import type { MessageEnvelope, MessageStatus } from "@chainsphere/shared";
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS } from "@chainsphere/shared";

export interface QueuedMessage {
  envelope: MessageEnvelope;
  peer: string;
  attempt: number;
  nextAttemptAt: number;
  status: MessageStatus;
  cid?: string;
}

export interface DeliveryQueueOptions {
  maxAttempts?: number;
  /** Return true when delivered (ack received), false to retry. */
  deliver: (peer: string, envelope: MessageEnvelope) => Promise<boolean>;
  onStatus?: (envelope: MessageEnvelope, status: MessageStatus) => void;
  onError?: (envelope: MessageEnvelope, error: Error) => void;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  tickIntervalMs?: number;
}

/**
 * Retry queue with bounded exponential backoff for messages that fail direct delivery.
 * Offline recipients: message stays queued; caller may upload CID to IPFS as fallback path.
 */
export class DeliveryQueue {
  private queue = new Map<string, QueuedMessage>();
  private timer?: ReturnType<typeof setInterval>;
  readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  constructor(private opts: DeliveryQueueOptions) {
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.backoffBaseMs = opts.backoffBaseMs ?? RECONNECT_BASE_MS;
    this.backoffMaxMs = opts.backoffMaxMs ?? RECONNECT_MAX_MS;
    this.timer = setInterval(() => void this.tick(), opts.tickIntervalMs ?? 500);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  enqueue(peer: string, envelope: MessageEnvelope): void {
    this.queue.set(envelope.id, {
      envelope, peer, attempt: 0, nextAttemptAt: Date.now(), status: "sending", cid: undefined,
    });
    this.opts.onStatus?.(envelope, "sending");
    void this.tick();
  }

  markSentDirect(envelope: MessageEnvelope): void {
    const q = this.queue.get(envelope.id);
    if (q) { q.status = "sent"; this.queue.set(envelope.id, q); }
    this.opts.onStatus?.(envelope, "sent");
  }

  markFailed(envelope: MessageEnvelope, cid?: string): void {
    const q = this.queue.get(envelope.id);
    if (q) { q.status = "failed"; q.cid = cid; }
    this.opts.onStatus?.(envelope, "failed");
    this.opts.onError?.(envelope, new Error("Direct delivery failed; fallback required"));
  }

  /** Retry a failed message explicitly (user-triggered). */
  retry(envelope: MessageEnvelope): void {
    const q = this.queue.get(envelope.id);
    if (!q) return;
    q.attempt = 0; q.nextAttemptAt = Date.now(); q.status = "sending";
    void this.tick();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    for (const [id, q] of this.queue) {
      if (q.status !== "sending" || q.nextAttemptAt > now || q.attempt >= this.maxAttempts) continue;
      q.attempt += 1;
      try {
        const ok = await this.opts.deliver(q.peer, q.envelope);
        if (ok) { q.status = "sent"; this.queue.delete(id); this.opts.onStatus?.(q.envelope, "sent"); continue; }
      } catch (e) {
        this.opts.onError?.(q.envelope, e as Error);
      }
      if (q.attempt >= this.maxAttempts) {
        this.markFailed(q.envelope, q.cid);
        this.queue.delete(id);
      } else {
        const backoff = Math.min(this.backoffBaseMs * 2 ** (q.attempt - 1), this.backoffMaxMs);
        q.nextAttemptAt = Date.now() + backoff;
      }
    }
  }

  size(): number { return this.queue.size; }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
