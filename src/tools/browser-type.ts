/**
 * browser_type tool — types text into a focused element or an element by ref/selector.
 *
 * Fast mode (default): uses script.callFunction with execCommand('insertText').
 * Slow mode: dispatches individual key actions per character.
 * submit=true: presses Enter after typing.
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface TypeParams {
  text: string;
  ref?: string;
  selector?: string;
  slowly?: boolean;
  submit?: boolean;
}

export interface TypeResult {
  success: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function browserType(
  bidi: BiDiConnection,
  params: TypeParams,
): Promise<TypeResult> {
  // Focus the target element if ref is provided
  if (params.ref) {
    const match = params.ref.match(/^@?e(\d+)$/);
    if (!match) throw new Error(`Invalid ref format: ${params.ref}`);
    const nodeId = match[1];
    await bidi.send("script.evaluate", {
      expression: `(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let count = 0; let node = walker.currentNode;
        while (node) { count++; if (count === ${nodeId}) { node.focus(); return true; } node = walker.nextNode(); if(!node) break; }
        return false;
      })()`,
      awaitPromise: false,
      resultOwnership: "none",
    });
  }

  // Focus by selector
  if (!params.ref && params.selector) {
    await bidi.send("script.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(params.selector)}); if (el) { el.focus(); return true; } return false; })()`,
      awaitPromise: false,
      resultOwnership: "none",
    });
  }

  if (params.slowly) {
    for (let i = 0; i < params.text.length; i++) {
      const char = params.text[i]!;
      await bidi.send("input.performActions", {
        actions: [{
          type: "key",
          id: "keyboard",
          actions: [
            { type: "keyDown", value: char },
            { type: "keyUp", value: char },
          ],
        }],
      });
      if (i < params.text.length - 1) {
        await delay(50);
      }
    }
  } else {
    // Fast mode: batch key actions without per-character delay
    const keyActions: unknown[] = [];
    for (const char of params.text) {
      keyActions.push(
        { type: "keyDown", value: char },
        { type: "keyUp", value: char },
      );
    }
    await bidi.send("input.performActions", {
      actions: [{
        type: "key",
        id: "keyboard",
        actions: keyActions,
      }],
    });
  }

  // Submit: press Enter
  if (params.submit) {
    await bidi.send("input.performActions", {
      actions: [{
        type: "key",
        id: "keyboard",
        actions: [
          { type: "keyDown", value: "\uE006" },
          { type: "keyUp", value: "\uE006" },
        ],
      }],
    });
  }

  return { success: true };
}
