/**
 * browser_type tool — types text into a focused element or an element by ref/selector.
 *
 * Fast mode (default): sends key events in 100-char chunks with 30ms pauses.
 * Slow mode: dispatches individual key actions per character with 50ms delay.
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

const ENTER_KEY = "";

function toKeyValue(char: string): string {
  if (char === "\n" || char === "\r") return ENTER_KEY;
  return char;
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
      const keyValue = toKeyValue(params.text[i]!);
      await bidi.send("input.performActions", {
        actions: [{
          type: "key",
          id: "keyboard",
          actions: [
            { type: "keyDown", value: keyValue },
            { type: "keyUp", value: keyValue },
          ],
        }],
      });
      if (i < params.text.length - 1) {
        await delay(50);
      }
    }
  } else {
    // Fast mode: send key actions in chunks to allow framework state sync
    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < params.text.length; offset += CHUNK_SIZE) {
      const chunk = params.text.slice(offset, offset + CHUNK_SIZE);
      const keyActions: unknown[] = [];
      for (const char of chunk) {
        keyActions.push(
          { type: "keyDown", value: toKeyValue(char) },
          { type: "keyUp", value: toKeyValue(char) },
        );
      }
      await bidi.send("input.performActions", {
        actions: [{
          type: "key",
          id: "keyboard",
          actions: keyActions,
        }],
      });
      if (offset + CHUNK_SIZE < params.text.length) {
        await delay(30);
      }
    }
  }

  // Verify text was typed — fallback for React-controlled inputs
  const escaped = JSON.stringify(params.text);
  await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = document.activeElement;
      if (!el || el.value?.includes(${escaped})) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, (el.value || '') + ${escaped});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  });

  // Submit: press Enter
  if (params.submit) {
    await bidi.send("input.performActions", {
      actions: [{
        type: "key",
        id: "keyboard",
        actions: [
          { type: "keyDown", value: ENTER_KEY },
          { type: "keyUp", value: ENTER_KEY },
        ],
      }],
    });
  }

  return { success: true };
}
