/**
 * browser_tab_new / browser_window_new — Create new browser tabs/windows via BiDi.
 *
 * Uses browsingContext.create to open new tabs or windows.
 */
import type { BiDiConnection } from "../bidi/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabNewParams {
  /** URL to open in the new tab. Defaults to "about:blank". */
  url?: string;
}

export interface TabNewResult {
  /** The context ID of the newly created tab. */
  targetId: string;
}

export interface WindowNewParams {
  /** URL to open in the new window. Defaults to "about:blank". */
  url?: string;
}

export interface WindowNewResult {
  /** The context ID of the newly created window. */
  targetId: string;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Creates a new browser tab and activates it.
 */
export async function browserTabNew(
  bidi: BiDiConnection,
  params: TabNewParams,
): Promise<TabNewResult> {
  const url = params.url ?? "about:blank";

  const createResult = (await bidi.send("browsingContext.create", {
    type: "tab",
  })) as { context: string };

  if (url !== "about:blank") {
    await bidi.send("browsingContext.navigate", {
      context: createResult.context,
      url,
      wait: "complete",
    });
  }

  await bidi.send("browsingContext.activate", {
    context: createResult.context,
  });

  return { targetId: createResult.context };
}

/**
 * Creates a new browser window and activates it.
 */
export async function browserWindowNew(
  bidi: BiDiConnection,
  params: WindowNewParams,
): Promise<WindowNewResult> {
  const url = params.url ?? "about:blank";

  const createResult = (await bidi.send("browsingContext.create", {
    type: "window",
  })) as { context: string };

  if (url !== "about:blank") {
    await bidi.send("browsingContext.navigate", {
      context: createResult.context,
      url,
      wait: "complete",
    });
  }

  await bidi.send("browsingContext.activate", {
    context: createResult.context,
  });

  return { targetId: createResult.context };
}
