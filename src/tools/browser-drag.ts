/**
 * browser_drag tool — drags from a source to a target using BiDi input.performActions.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface DragParams {
  startRef?: string;
  startElement?: string;
  endRef?: string;
  endElement?: string;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

export interface DragResult {
  success: boolean;
}

const REF_PATTERN = /^@?e(\d+)$/;

async function resolveRefCoordinates(
  bidi: BiDiConnection,
  ref: string,
): Promise<{ x: number; y: number }> {
  const match = REF_PATTERN.exec(ref);
  if (!match) throw new Error(`Invalid ref format: ${ref}`);
  const nodeId = match[1];

  const response = (await bidi.send("script.evaluate", {
    expression: `(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let count = 0; let node = walker.currentNode;
      while (node) { count++; if (count === ${nodeId}) { node.scrollIntoView({block:'center',inline:'center'}); const r = node.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } node = walker.nextNode(); if(!node) break; }
      return null;
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { type: string; value?: { x: number; y: number } } };

  if (!response.result?.value) throw new Error(`Element not found for ref: ${ref}`);
  return response.result.value;
}

function interpolatePoints(
  startX: number, startY: number, endX: number, endY: number, steps = 8,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    points.push({
      x: Math.round(startX + (endX - startX) * t),
      y: Math.round(startY + (endY - startY) * t),
    });
  }
  return points;
}

export async function browserDrag(
  bidi: BiDiConnection,
  params: DragParams,
): Promise<DragResult> {
  let startX: number, startY: number;
  if (params.startX !== undefined && params.startY !== undefined) {
    startX = params.startX;
    startY = params.startY;
  } else if (params.startRef) {
    const c = await resolveRefCoordinates(bidi, params.startRef);
    startX = c.x; startY = c.y;
  } else {
    throw new Error("Either startRef or startX/startY must be provided");
  }

  let endX: number, endY: number;
  if (params.endX !== undefined && params.endY !== undefined) {
    endX = params.endX;
    endY = params.endY;
  } else if (params.endRef) {
    const c = await resolveRefCoordinates(bidi, params.endRef);
    endX = c.x; endY = c.y;
  } else {
    throw new Error("Either endRef or endX/endY must be provided");
  }

  const moveActions: unknown[] = [
    { type: "pointerMove", x: startX, y: startY, duration: 0 },
    { type: "pointerDown", button: 0 },
  ];

  for (const pt of interpolatePoints(startX, startY, endX, endY, 4)) {
    moveActions.push({ type: "pointerMove", x: pt.x, y: pt.y, duration: 10 });
  }

  moveActions.push(
    { type: "pointerMove", x: endX, y: endY, duration: 0 },
    { type: "pointerUp", button: 0 },
  );

  await bidi.send("input.performActions", {
    actions: [{
      type: "pointer",
      id: "mouse",
      parameters: { pointerType: "mouse" },
      actions: moveActions,
    }],
  });

  return { success: true };
}
