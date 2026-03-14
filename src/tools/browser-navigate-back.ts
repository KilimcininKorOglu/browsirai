/**
 * browser_navigate_back — navigates back or forward in browser history.
 * Uses WebDriver BiDi browsingContext.traverseHistory.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface NavigateBackParams {
  direction?: "back" | "forward";
}

export interface NavigateBackResult {
  success: boolean;
  url?: string;
}

export async function browserNavigateBack(
  bidi: BiDiConnection,
  params: NavigateBackParams,
): Promise<NavigateBackResult> {
  const direction = params.direction ?? "back";
  const delta = direction === "back" ? -1 : 1;

  try {
    await bidi.send("browsingContext.traverseHistory", { delta });

    const response = (await bidi.send("script.evaluate", {
      expression: "location.href",
      awaitPromise: false,
      resultOwnership: "none",
    })) as { result: { value?: string } };

    return { success: true, url: response.result?.value };
  } catch {
    return { success: false };
  }
}
