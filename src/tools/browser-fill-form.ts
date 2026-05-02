/**
 * browser_fill_form tool — fills form fields by ref or CSS selector via BiDi.
 *
 * Supports field types:
 *   - textbox: focus -> clear -> type key events -> dispatch events
 *   - checkbox/radio: click to toggle
 *   - combobox/slider: set value via script.callFunction
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface FillFormField {
  name: string;
  type: string;
  ref?: string;
  selector?: string;
  value: string;
}

export interface FillFormParams {
  fields: FillFormField[];
}

export interface FillFormError {
  field: string;
  error: string;
}

export interface FillFormResult {
  success: boolean;
  filledCount: number;
  errors?: FillFormError[];
}

const ENTER_KEY = "";

function toKeyValue(char: string): string {
  if (char === "\n" || char === "\r") return ENTER_KEY;
  return char;
}

function resolveElementScript(field: FillFormField): string {
  if (field.ref) {
    const match = field.ref.match(/^@?e(\d+)$/);
    if (!match) throw new Error(`Invalid ref format: ${field.ref}`);
    const nodeId = match[1];
    return `(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let count = 0; let node = walker.currentNode;
      while (node) { count++; if (count === ${nodeId}) return node; node = walker.nextNode(); if(!node) break; }
      return null;
    })()`;
  }
  if (field.selector) {
    return `document.querySelector(${JSON.stringify(field.selector)})`;
  }
  throw new Error(`Field "${field.name}" has neither ref nor selector`);
}

async function fillTextbox(bidi: BiDiConnection, field: FillFormField): Promise<void> {
  const elScript = resolveElementScript(field);

  // Focus the element
  await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = ${elScript};
      if (!el) throw new Error('Element not found');
      if (el.readOnly || el.disabled) throw new Error('Cannot fill readonly or disabled field');
      el.focus();
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  });

  // Select all existing text with Ctrl+A, then delete with Backspace
  const ctrlKey = process.platform === "darwin" ? "" : "";
  await bidi.send("input.performActions", {
    actions: [{
      type: "key",
      id: "keyboard",
      actions: [
        { type: "keyDown", value: ctrlKey },
        { type: "keyDown", value: "a" },
        { type: "keyUp", value: "a" },
        { type: "keyUp", value: ctrlKey },
        { type: "keyDown", value: "" },
        { type: "keyUp", value: "" },
      ],
    }],
  });

  // Type new value via real key events in chunks
  const CHUNK_SIZE = 100;
  for (let offset = 0; offset < field.value.length; offset += CHUNK_SIZE) {
    const chunk = field.value.slice(offset, offset + CHUNK_SIZE);
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
    if (offset + CHUNK_SIZE < field.value.length) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  // Verify value was set — fallback for React-controlled inputs
  const escaped = JSON.stringify(field.value);
  await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = document.activeElement;
      if (!el || el.value === ${escaped}) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, ${escaped});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  });
}

async function clickField(bidi: BiDiConnection, field: FillFormField): Promise<void> {
  const elScript = resolveElementScript(field);

  const response = (await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = ${elScript};
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height};
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  })) as { result: { value?: { x: number; y: number; w: number; h: number } } };

  const coords = response.result?.value;
  if (!coords) throw new Error(`Element not found for field: ${field.name}`);
  if (coords.w === 0 && coords.h === 0) throw new Error(`Element is not visible: zero-size box model.`);

  await bidi.send("input.performActions", {
    actions: [{
      type: "pointer",
      id: "mouse",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", x: coords.x, y: coords.y, duration: 0 },
        { type: "pointerDown", button: 0 },
        { type: "pointerUp", button: 0 },
      ],
    }],
  });
}

async function fillComboboxOrSlider(bidi: BiDiConnection, field: FillFormField): Promise<void> {
  const elScript = resolveElementScript(field);
  const escaped = JSON.stringify(field.value);

  await bidi.send("script.evaluate", {
    expression: `(() => {
      const el = ${elScript};
      if (!el) throw new Error('Element not found');
      el.value = ${escaped};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    awaitPromise: false,
    resultOwnership: "none",
  });
}

export async function browserFillForm(
  bidi: BiDiConnection,
  params: FillFormParams,
): Promise<FillFormResult> {
  let filledCount = 0;
  const errors: FillFormError[] = [];

  for (const field of params.fields) {
    try {
      switch (field.type) {
        case "textbox":
          await fillTextbox(bidi, field);
          filledCount++;
          break;
        case "checkbox":
        case "radio":
          await clickField(bidi, field);
          filledCount++;
          break;
        case "combobox":
        case "slider":
          await fillComboboxOrSlider(bidi, field);
          filledCount++;
          break;
        default:
          await fillTextbox(bidi, field);
          filledCount++;
          break;
      }
    } catch (err) {
      errors.push({
        field: field.name,
        error: err instanceof Error ? err.message : `Unknown error filling ${field.name}`,
      });
    }
  }

  return {
    success: errors.length === 0,
    filledCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}
