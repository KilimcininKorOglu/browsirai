/**
 * browser_hover tool — hovers over an element by ref or CSS selector.
 *
 * Uses BiDi input.performActions with a single pointerMove action.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface HoverParams {
  ref?: string;
  selector?: string;
  element?: string;
}

export interface HoverResult {
  success: boolean;
}

const REF_PATTERN = /^@?e(\d+)$/;

async function resolveElementCoordinates(
  bidi: BiDiConnection,
  params: HoverParams,
): Promise<{ x: number; y: number }> {
  let jsExpression: string;

  if (params.ref) {
    const match = REF_PATTERN.exec(params.ref);
    if (!match) throw new Error(`Invalid ref format: ${params.ref}`);
    const nodeId = match[1];
    jsExpression = `(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let count = 0; let node = walker.currentNode;
      while (node) { count++; if (count === ${nodeId}) { node.scrollIntoView({block:'center',inline:'center'}); const r = node.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height}; } node = walker.nextNode(); if(!node) break; }
      return null;
    })()`;
  } else if (params.selector) {
    const sel = JSON.stringify(params.selector);
    jsExpression = `(() => {
      const el = document.querySelector(${sel});
      if (!el) return null;
      el.scrollIntoView({block:'center',inline:'center'});
      const r = el.getBoundingClientRect();
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height};
    })()`;
  } else {
    throw new Error("Either ref or selector must be provided");
  }

  const response = (await bidi.send("script.evaluate", {
    expression: jsExpression,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { type: string; value?: { x: number; y: number; w: number; h: number } } };

  const val = response.result?.value;
  if (!val) throw new Error(params.ref ? `Element not found for ref: ${params.ref}` : `Element not found: no element matches selector "${params.selector}"`);
  if (val.w === 0 && val.h === 0) throw new Error("Element is not visible: zero-size box model.");

  return val;
}

export async function browserHover(
  bidi: BiDiConnection,
  params: HoverParams,
): Promise<HoverResult> {
  const { x, y } = await resolveElementCoordinates(bidi, params);

  await bidi.send("input.performActions", {
    actions: [{
      type: "pointer",
      id: "mouse",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", x, y, duration: 0 },
      ],
    }],
  });

  return { success: true };
}
