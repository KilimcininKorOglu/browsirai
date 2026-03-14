/**
 * browser_navigate tool — navigates to a URL via WebDriver BiDi browsingContext.navigate.
 *
 * Handles:
 *  - Navigation with configurable wait conditions
 *  - Error responses from BiDi
 *  - Navigation timeout (default 30 s)
 */
import type { BiDiConnection } from "../bidi/connection.js";

interface NavigateParams {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
}

interface NavigateResult {
  url: string;
  title: string;
}

const POLL_INTERVAL_MS = 100;

export async function browserNavigate(
  bidi: BiDiConnection,
  params: NavigateParams,
): Promise<NavigateResult> {
  const { url, timeout = 8 } = params;
  const timeoutMs = timeout * 1000;
  const ac = new AbortController();

  try {
    const result = await Promise.race([
      performNavigation(bidi, url, params.waitUntil, ac.signal),
      createTimeout(timeoutMs, ac.signal),
    ]);
    return result;
  } finally {
    ac.abort();
  }
}

async function performNavigation(
  bidi: BiDiConnection,
  url: string,
  waitUntil?: string,
  signal?: AbortSignal,
): Promise<NavigateResult> {
  const wait = waitUntil === "domcontentloaded" ? "interactive" : "complete";

  const navResponse = (await bidi.send("browsingContext.navigate", {
    url,
    wait,
  })) as {
    navigation?: string;
    url?: string;
  };

  if (!navResponse.navigation && !navResponse.url) {
    return getPageInfo(bidi);
  }

  await waitForLoadCompletion(bidi, waitUntil, signal);

  return getPageInfo(bidi);
}

function waitForLoadCompletion(
  bidi: BiDiConnection,
  waitUntil?: string,
  signal?: AbortSignal,
): Promise<void> {
  const eventName =
    waitUntil === "domcontentloaded"
      ? "browsingContext.domContentLoaded"
      : "browsingContext.load";

  return new Promise<void>((resolve) => {
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      bidi.off(eventName, handler as (params: unknown) => void);
      resolve();
    };

    const handler = () => { settle(); };
    bidi.on(eventName, handler as (params: unknown) => void);

    if (signal) {
      signal.addEventListener("abort", settle, { once: true });
    }

    const poll = async () => {
      while (!settled) {
        if (signal?.aborted) return;

        try {
          const response = (await bidi.send("script.evaluate", {
            expression: "document.readyState",
            awaitPromise: false,
            resultOwnership: "none",
          })) as { result: { type?: string; value?: string } };

          const readyState = response.result?.value;

          const isLoadingState =
            readyState === "loading" || readyState === "interactive";
          if (readyState === "complete" || !isLoadingState) {
            settle();
            return;
          }
        } catch {
          // script.evaluate can fail transiently during navigation — retry
        }

        if (!settled) {
          await delay(POLL_INTERVAL_MS);
        }
      }
    };

    poll();
  });
}

async function getPageInfo(bidi: BiDiConnection): Promise<NavigateResult> {
  const [titleResponse, urlResponse] = await Promise.all([
    bidi.send("script.evaluate", {
      expression: "document.title",
      awaitPromise: false,
      resultOwnership: "none",
    }) as Promise<{ result: { value?: string } }>,
    bidi.send("script.evaluate", {
      expression: "location.href",
      awaitPromise: false,
      resultOwnership: "none",
    }) as Promise<{ result: { value?: string } }>,
  ]);

  return {
    title: titleResponse.result?.value ?? "",
    url: urlResponse.result?.value ?? "",
  };
}

function createTimeout(ms: number, signal?: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Navigation timeout after ${ms}ms`));
    }, ms);

    if (signal) {
      signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
