/**
 * browser_frames — List all frames in the current page via BiDi.
 *
 * Uses browsingContext.getTree to enumerate all contexts (main + iframes),
 * including cross-origin detection based on URL origins.
 */
import type { BiDiConnection } from "../bidi/connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameInfo {
  /** Browsing context ID. */
  id: string;
  /** URL of the frame. */
  url: string;
  /** Optional name of the frame. */
  name?: string;
  /** Security origin of the frame. */
  securityOrigin?: string;
  /** Whether this frame is cross-origin relative to the main frame. */
  crossOrigin: boolean;
}

interface BiDiContextNode {
  context: string;
  url: string;
  children: BiDiContextNode[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function flattenContextTree(
  node: BiDiContextNode,
  mainOrigin: string,
): FrameInfo[] {
  const origin = extractOrigin(node.url);
  const frames: FrameInfo[] = [
    {
      id: node.context,
      url: node.url,
      securityOrigin: origin,
      crossOrigin: origin !== mainOrigin,
    },
  ];

  if (node.children) {
    for (const child of node.children) {
      frames.push(...flattenContextTree(child, mainOrigin));
    }
  }

  return frames;
}

function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Lists all frames (main frame and iframes) in the current page.
 */
export async function listFrames(
  bidi: BiDiConnection,
): Promise<FrameInfo[]> {
  const response = (await bidi.send("browsingContext.getTree", {})) as {
    contexts: BiDiContextNode[];
  };

  if (response.contexts.length === 0) {
    return [];
  }

  const mainContext = response.contexts[0]!;
  const mainOrigin = extractOrigin(mainContext.url);

  return flattenContextTree(mainContext, mainOrigin);
}
