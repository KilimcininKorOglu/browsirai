/**
 * browser_close tool — closes browser tabs/contexts via BiDi.
 *
 * Supports:
 *  - Close all browsing contexts (closeAll)
 *  - Close a specific context by targetId
 *  - Close the current active tab (default)
 *
 * Returns the count of closed contexts.
 */
import type { BiDiConnection } from "../bidi/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloseParams {
  /** Specific context ID to close. */
  targetId?: string;
  /** Whether to force close (skip beforeunload). */
  force?: boolean;
  /** Close all browsing contexts. */
  closeAll?: boolean;
}

export interface CloseResult {
  success: boolean;
  closedTargets: number;
}

// ---------------------------------------------------------------------------
// Main implementation
// ---------------------------------------------------------------------------

/**
 * Closes browser tabs/contexts.
 */
export async function browserClose(
  bidi: BiDiConnection,
  params: CloseParams,
): Promise<CloseResult> {
  let closedCount = 0;

  if (params.closeAll) {
    const treeResponse = (await bidi.send("browsingContext.getTree", {})) as {
      contexts: Array<{ context: string; url: string }>;
    };

    for (const ctx of treeResponse.contexts) {
      try {
        await bidi.send("browsingContext.close", {
          context: ctx.context,
          promptUnload: !params.force,
        });
        closedCount++;
      } catch {
        // Context may already be closed — ignore
      }
    }
  } else if (params.targetId) {
    await bidi.send("browsingContext.close", {
      context: params.targetId,
      promptUnload: !params.force,
    });
    closedCount = 1;
  } else {
    const treeResponse = (await bidi.send("browsingContext.getTree", {})) as {
      contexts: Array<{ context: string; url: string }>;
    };

    const contexts = treeResponse.contexts.filter(
      (ctx) => !ctx.url.startsWith("about:"),
    );

    if (contexts.length === 0) {
      throw new Error("No browsing contexts found to close");
    }

    const activeContext = contexts[0]!;

    await bidi.send("browsingContext.close", {
      context: activeContext.context,
      promptUnload: !params.force,
    });
    closedCount = 1;
  }

  return {
    success: true,
    closedTargets: closedCount,
  };
}
