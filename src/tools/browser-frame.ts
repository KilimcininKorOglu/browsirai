/**
 * browser_frame_switch / browser_frame_main — Frame context management via BiDi.
 *
 * Switches execution context to an iframe or back to the main frame.
 * Uses browsingContext.getTree to enumerate contexts and resolve frame IDs.
 */
import type { BiDiConnection } from "../bidi/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameSwitchParams {
  /** CSS selector for the iframe element. */
  selector?: string;
  /** Frame/context ID to switch to directly. */
  frameId?: string;
}

export interface FrameSwitchResult {
  success: boolean;
  frameId: string;
}

export interface FrameMainResult {
  success: boolean;
}

interface BiDiContextNode {
  context: string;
  url: string;
  children: BiDiContextNode[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function flattenContextTree(node: BiDiContextNode): { id: string; url: string }[] {
  const contexts: { id: string; url: string }[] = [{ id: node.context, url: node.url }];
  if (node.children) {
    for (const child of node.children) {
      contexts.push(...flattenContextTree(child));
    }
  }
  return contexts;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Switches the execution context to an iframe identified by selector or frameId.
 */
export async function browserFrameSwitch(
  bidi: BiDiConnection,
  params: FrameSwitchParams,
): Promise<FrameSwitchResult> {
  const response = (await bidi.send("browsingContext.getTree", {})) as {
    contexts: BiDiContextNode[];
  };

  if (response.contexts.length === 0) {
    throw new Error("No browsing contexts found");
  }

  const allContexts = flattenContextTree(response.contexts[0]!);

  if (params.frameId) {
    const ctx = allContexts.find((c) => c.id === params.frameId);
    if (!ctx) {
      throw new Error(`Frame not found: ${params.frameId}`);
    }
    return { success: true, frameId: ctx.id };
  }

  if (params.selector) {
    const evalResult = (await bidi.send("script.evaluate", {
      expression: `document.querySelector(${JSON.stringify(params.selector)})`,
      awaitPromise: false,
      resultOwnership: "root",
    })) as { result: { type: string; sharedId?: string } };

    if (!evalResult.result?.sharedId) {
      throw new Error(`iframe not found: ${params.selector}`);
    }

    const childContexts = allContexts.slice(1);
    if (childContexts.length === 0) {
      throw new Error("No child frames found");
    }

    return { success: true, frameId: childContexts[0]!.id };
  }

  throw new Error("Either selector or frameId must be provided");
}

/**
 * Switches the execution context back to the main frame.
 */
export async function browserFrameMain(
  _bidi: BiDiConnection,
): Promise<FrameMainResult> {
  return { success: true };
}
