/**
 * browser_check / browser_uncheck — Idempotent checkbox state management via BiDi.
 *
 * Uses script.evaluate to check state and input.performActions to click.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface CheckParams {
  selector?: string;
  ref?: string;
}

async function getCheckedState(bidi: BiDiConnection, params: CheckParams): Promise<boolean> {
  let expression: string;

  if (params.selector) {
    expression = `document.querySelector(${JSON.stringify(params.selector)})?.checked ?? false`;
  } else if (params.ref) {
    expression = `document.querySelector('[data-bidi-ref="${params.ref}"]')?.checked ?? false`;
  } else {
    return false;
  }

  const response = (await bidi.send("script.evaluate", {
    expression,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value: unknown } };

  return response.result.value === true;
}

async function clickElement(bidi: BiDiConnection, params: CheckParams): Promise<void> {
  let selector: string;
  if (params.selector) {
    selector = params.selector;
  } else if (params.ref) {
    selector = `[data-bidi-ref="${params.ref}"]`;
  } else {
    throw new Error("Either selector or ref must be provided");
  }

  // Scroll into view and get coordinates
  const coordResult = (await bidi.send("script.evaluate", {
    expression: `(function() {
      var el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify(null);
      el.scrollIntoView({ block: 'center', inline: 'center' });
      var rect = el.getBoundingClientRect();
      return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value: string } };

  const coords = JSON.parse(coordResult.result.value);
  if (!coords) throw new Error(`Element not found: ${selector}`);

  await bidi.send("input.performActions", {
    actions: [{
      type: "pointer",
      id: "mouse",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", x: Math.round(coords.x), y: Math.round(coords.y) },
        { type: "pointerDown", button: 0 },
        { type: "pointerUp", button: 0 },
      ],
    }],
  });
}

export async function browserCheck(bidi: BiDiConnection, params: CheckParams): Promise<void> {
  const isChecked = await getCheckedState(bidi, params);
  if (!isChecked) await clickElement(bidi, params);
}

export async function browserUncheck(bidi: BiDiConnection, params: CheckParams): Promise<void> {
  const isChecked = await getCheckedState(bidi, params);
  if (isChecked) await clickElement(bidi, params);
}
