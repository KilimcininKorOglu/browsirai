/**
 * browser_tabs tool — Lists open browser tabs via WebDriver BiDi browsingContext.getTree.
 *
 * Filters to top-level contexts only, with optional URL pattern matching.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface TabInfo {
  id: string;
  title: string;
  url: string;
}

export interface BrowserTabsParams {
  /** Glob-style URL filter pattern (e.g. "*github.com*") */
  filter?: string;
}

export interface BrowserTabsResult {
  tabs: TabInfo[];
}

/**
 * Converts a simple glob pattern (with `*` wildcards) to a RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`, "i");
}

/**
 * Lists all open browser tabs (top-level browsing contexts).
 *
 * @param bidi - BiDi connection
 * @param params - Optional filter parameters
 * @returns List of tabs with id, title, and url
 */
export async function browserTabs(
  bidi: BiDiConnection,
  params: BrowserTabsParams = {},
): Promise<BrowserTabsResult> {
  const response = (await bidi.send("browsingContext.getTree", {})) as {
    contexts: Array<{
      context: string;
      url: string;
      children: Array<unknown>;
    }>;
  };

  let contexts = response.contexts.filter(
    (ctx) => !ctx.url.startsWith("about:"),
  );

  if (params.filter) {
    const regex = globToRegExp(params.filter);
    contexts = contexts.filter((ctx) => regex.test(ctx.url));
  }

  // Get titles via script.evaluate for each context
  const tabs: TabInfo[] = [];
  for (const ctx of contexts) {
    let title = "";
    try {
      const titleResult = (await bidi.send("script.evaluate", {
        expression: "document.title",
        target: { context: ctx.context },
        awaitPromise: false,
        resultOwnership: "none",
      })) as { result: { value?: string } };
      title = titleResult.result?.value ?? "";
    } catch {
      // Context may not be ready
    }

    tabs.push({
      id: ctx.context,
      title,
      url: ctx.url,
    });
  }

  return { tabs };
}
