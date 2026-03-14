/**
 * wait-ready.ts — Polls `document.readyState` via BiDi `script.evaluate`
 * until it equals `"complete"` or a timeout is reached.
 *
 * @module
 */

/** Minimal BiDi session interface required by this module. */
export interface BiDiSendable {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** Options accepted as the second positional argument (object form). */
export interface WaitReadyOptions {
  /** Browsing context ID to evaluate in. */
  context?: string;
  timeout?: number;
}

/** Default polling interval in milliseconds. */
const POLL_INTERVAL_MS = 200;

/** Default timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Polls `document.readyState` via `script.evaluate` until it equals
 * `"complete"`, or rejects with a timeout error.
 *
 * Supports two calling conventions:
 *
 * ```ts
 * // Positional
 * waitForDocumentReady(bidi, contextId, timeoutMs)
 *
 * // Options object
 * waitForDocumentReady(bidi, { timeout, context })
 * ```
 */
export async function waitForDocumentReady(
  bidi: BiDiSendable,
  contextOrOpts?: string | WaitReadyOptions,
  timeoutMs?: number,
): Promise<void> {
  let context: string | undefined;
  let timeout: number;

  if (typeof contextOrOpts === "string") {
    context = contextOrOpts;
    timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  } else if (contextOrOpts != null && typeof contextOrOpts === "object") {
    context = contextOrOpts.context;
    timeout = contextOrOpts.timeout ?? DEFAULT_TIMEOUT_MS;
  } else {
    context = undefined;
    timeout = DEFAULT_TIMEOUT_MS;
  }

  const deadline = Date.now() + timeout;
  let lastReadyState = "unknown";

  for (;;) {
    if (Date.now() >= deadline) break;

    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const params: Record<string, unknown> = {
        expression: "document.readyState",
        awaitPromise: false,
        target: context ? { context } : undefined,
      };

      const response = await bidi.send("script.evaluate", params);

      const result = (response as { result?: { type?: string; value?: string } })?.result;
      if (result?.value) {
        lastReadyState = result.value;
      }

      if (lastReadyState === "complete") {
        return;
      }
    } catch {
      // script.evaluate can fail transiently during navigation. Retry on next poll.
    }
  }

  throw new Error(
    `waitForDocumentReady timeout after ${timeout}ms — last readyState: "${lastReadyState}"`,
  );
}
