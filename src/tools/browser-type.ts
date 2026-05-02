/**
 * browser_type tool — types text into a focused element or an element by ref/selector.
 *
 * Handles multi-line text by splitting into lines and sending Enter between them.
 * Each line is typed via key events in chunks (max 50 chars per BiDi call).
 * This ensures compatibility with contenteditable editors (Draft.js, ProseMirror, etc.)
 * without timeout or state sync issues.
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendKeys(bidi: BiDiConnection, keys: unknown[]): Promise<void> {
  await bidi.send("input.performActions", {
    actions: [{
      type: "key",
      id: "keyboard",
      actions: keys,
    }],
  });
}

async function sendEnter(bidi: BiDiConnection): Promise<void> {
  await sendKeys(bidi, [
    { type: "keyDown", value: ENTER_KEY },
    { type: "keyUp", value: ENTER_KEY },
  ]);
}

async function typeLineChunked(bidi: BiDiConnection, line: string): Promise<void> {
  if (line.length === 0) return;
  const CHUNK_SIZE = 50;
  for (let offset = 0; offset < line.length; offset += CHUNK_SIZE) {
    const chunk = line.slice(offset, offset + CHUNK_SIZE);
    const keyActions: unknown[] = [];
    for (const char of chunk) {
      keyActions.push(
        { type: "keyDown", value: char },
        { type: "keyUp", value: char },
      );
    }
    await sendKeys(bidi, keyActions);
  }
}

async function typeLineSlowly(bidi: BiDiConnection, line: string): Promise<void> {
  for (const char of line) {
    await sendKeys(bidi, [
      { type: "keyDown", value: char },
      { type: "keyUp", value: char },
    ]);
    await delay(50);
  }
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

  // Split text into lines and type each separately with Enter between them.
  // This ensures contenteditable editors (Draft.js, etc.) process each line correctly.
  const lines = params.text.split("\n");
  const typeLine = params.slowly ? typeLineSlowly : typeLineChunked;

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await sendEnter(bidi);
      await delay(30);
    }
    await typeLine(bidi, lines[i]!);
  }

  // Verify text was typed — fallback for React-controlled <input>/<textarea>
  const escaped = JSON.stringify(params.text);
  await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = document.activeElement;
      if (!el || !('value' in el) || el.value?.includes(${escaped})) return;
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
    await sendEnter(bidi);
  }

  return { success: true };
}
