/**
 * browser_wait_for tool — waits for various conditions via BiDi script.evaluate polling.
 *
 * Supported strategies:
 *  - text: poll until text appears in page body
 *  - textGone: poll until text disappears from page body
 *  - selector: poll until a CSS selector matches an element
 *  - selector + visible: poll until element is visible
 *  - selector + state:"hidden": poll until element is hidden
 *  - time: simple delay (seconds)
 *  - networkIdle: poll until no pending network requests
 *  - load: poll until document.readyState === "complete"
 *  - url: poll until location.href matches a glob pattern
 *  - fn: poll until a JS expression evaluates to truthy
 *
 * Default timeout: 30 seconds. Poll interval: ~100ms.
 */
import type { BiDiConnection } from "../bidi/connection.js";

interface WaitForParams {
  text?: string;
  textGone?: string;
  selector?: string;
  visible?: boolean;
  state?: "hidden" | "visible";
  time?: number;
  networkIdle?: boolean;
  load?: boolean;
  loadState?: string;
  url?: string;
  fn?: string;
  timeout?: number;
}

interface WaitForResult {
  success: boolean;
  elapsed: number;
}

const DEFAULT_TIMEOUT_S = 30;
const POLL_INTERVAL_MS = 100;

function normalizeTimeoutMs(timeout: number): number {
  if (timeout > 60) return timeout;
  return timeout * 1000;
}

export async function browserWaitFor(
  bidi: BiDiConnection,
  params: WaitForParams,
): Promise<WaitForResult> {
  const timeoutMs = normalizeTimeoutMs(params.timeout ?? DEFAULT_TIMEOUT_S);
  const start = Date.now();

  if (params.time !== undefined) {
    await delay(params.time * 1000);
    return { success: true, elapsed: Date.now() - start };
  }

  const condition = buildCondition(params);

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Timeout after ${timeoutMs}ms waiting for condition: ${describeCondition(params)}`,
      );
    }

    let met = false;
    try {
      met = await evaluateCondition(bidi, condition);
    } catch {
      // Transient errors — retry on next poll
    }

    if (met) {
      return { success: true, elapsed: Date.now() - start };
    }

    await delay(POLL_INTERVAL_MS);
  }
}

interface Condition {
  kind: "text" | "textGone" | "selector" | "selectorVisible" | "selectorHidden" | "networkIdle" | "load" | "loadState" | "url" | "fn";
  expression: string;
}

function buildCondition(params: WaitForParams): Condition {
  if (params.url !== undefined) return { kind: "url", expression: params.url };
  if (params.fn !== undefined) return { kind: "fn", expression: `Boolean(${params.fn})` };

  if (params.selector !== undefined && params.state === "hidden") {
    return { kind: "selectorHidden", expression: buildVisibilityCheck(params.selector) };
  }
  if (params.selector !== undefined && params.visible) {
    return { kind: "selectorVisible", expression: buildVisibilityCheck(params.selector) };
  }
  if (params.selector !== undefined) {
    return { kind: "selector", expression: `document.querySelector(${JSON.stringify(params.selector)})` };
  }
  if (params.text !== undefined) {
    return { kind: "text", expression: `document.body && document.body.innerText.includes(${JSON.stringify(params.text)})` };
  }
  if (params.textGone !== undefined) {
    return { kind: "textGone", expression: `document.body && !document.body.innerText.includes(${JSON.stringify(params.textGone)})` };
  }
  if (params.networkIdle) return { kind: "networkIdle", expression: "true" };
  if (params.loadState !== undefined) return { kind: "loadState", expression: params.loadState };
  if (params.load) return { kind: "load", expression: "document.readyState" };

  throw new Error("browserWaitFor: no wait condition specified");
}

function buildVisibilityCheck(selector: string): string {
  const sel = JSON.stringify(selector);
  return `(function() {
    var el = document.querySelector(${sel});
    if (!el) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  })()`;
}

async function evaluateCondition(bidi: BiDiConnection, condition: Condition): Promise<boolean> {
  if (condition.kind === "url") return evaluateUrlCondition(bidi, condition.expression);
  if (condition.kind === "load") return evaluateLoadCondition(bidi, condition.expression);
  if (condition.kind === "loadState") return evaluateLoadStateCondition(bidi, condition.expression);

  if (condition.kind === "selectorHidden") {
    const response = (await bidi.send("script.evaluate", {
      expression: condition.expression,
      awaitPromise: false,
      resultOwnership: "none",
    })) as { result: { value: unknown } };
    return response.result.value === false;
  }

  if (condition.kind === "selector") {
    const response = (await bidi.send("script.evaluate", {
      expression: `!!${condition.expression}`,
      awaitPromise: false,
      resultOwnership: "none",
    })) as { result: { value: unknown } };
    return response.result.value === true;
  }

  const response = (await bidi.send("script.evaluate", {
    expression: condition.expression,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value: unknown } };
  return response.result.value === true;
}

async function evaluateLoadCondition(bidi: BiDiConnection, expression: string): Promise<boolean> {
  const response = (await bidi.send("script.evaluate", {
    expression,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { type: string; value: unknown } };

  if (response.result.type === "string") return response.result.value === "complete";
  return response.result.value === true;
}

async function evaluateLoadStateCondition(bidi: BiDiConnection, targetState: string): Promise<boolean> {
  const response = (await bidi.send("script.evaluate", {
    expression: "document.readyState",
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value: string } };

  const current = response.result.value;
  if (targetState === "complete") return current === "complete";
  if (targetState === "interactive") return current === "interactive" || current === "complete";
  return current === targetState;
}

async function evaluateUrlCondition(bidi: BiDiConnection, pattern: string): Promise<boolean> {
  const response = (await bidi.send("script.evaluate", {
    expression: "location.href",
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value: string } };
  return globMatch(pattern, response.result.value);
}

function globMatch(pattern: string, value: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(regexStr).test(value);
}

function describeCondition(params: WaitForParams): string {
  if (params.text) return `text "${params.text}" to appear`;
  if (params.textGone) return `text "${params.textGone}" to disappear`;
  if (params.selector && params.state === "hidden") return `selector "${params.selector}" to become hidden`;
  if (params.selector && params.visible) return `selector "${params.selector}" to become visible`;
  if (params.selector) return `selector "${params.selector}" to appear`;
  if (params.url) return `URL matching "${params.url}"`;
  if (params.fn) return `JS condition: ${params.fn}`;
  if (params.loadState) return `document.readyState === "${params.loadState}"`;
  if (params.networkIdle) return "network idle";
  if (params.load) return "page load complete";
  return "unknown condition";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
