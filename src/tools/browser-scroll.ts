/**
 * browser_scroll tool — Scrolls the page or a specific element via BiDi.
 */
import type { BiDiConnection } from "../bidi/connection.js";

interface ScrollParams {
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  selector?: string;
}

interface ScrollResult {
  success: boolean;
}

const DEFAULT_SCROLL_AMOUNT = 300;

export async function browserScroll(
  bidi: BiDiConnection,
  params: ScrollParams,
): Promise<ScrollResult> {
  const { direction, selector } = params;
  const amount = params.amount ?? DEFAULT_SCROLL_AMOUNT;

  if (selector && !direction) {
    // Scroll element into view
    await bidi.send("script.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ${selector}');
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      })()`,
      awaitPromise: false,
      resultOwnership: "none",
    });
    return { success: true };
  }

  if (selector && direction) {
    // Scroll within a specific container
    const scrollX = direction === "left" ? -amount : direction === "right" ? amount : 0;
    const scrollY = direction === "up" ? -amount : direction === "down" ? amount : 0;

    await bidi.send("script.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Element not found: ${selector}');
        el.scrollBy(${scrollX}, ${scrollY});
      })()`,
      awaitPromise: false,
      resultOwnership: "none",
    });
    return { success: true };
  }

  // Scroll the page viewport
  const scrollX = direction === "left" ? -amount : direction === "right" ? amount : 0;
  const scrollY = direction === "up" ? -amount : direction === "down" ? amount : 0;

  await bidi.send("script.evaluate", {
    expression: `window.scrollBy(${scrollX}, ${scrollY})`,
    awaitPromise: false,
    resultOwnership: "none",
  });

  return { success: true };
}
