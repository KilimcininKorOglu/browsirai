/**
 * DOM helper functions for WebDriver BiDi.
 *
 * Replaces CDP's DOM domain by using `script.callFunction` to
 * execute JavaScript in the browser context.
 *
 * @module
 */

import type { BiDiConnection } from "./connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from script.callFunction or script.evaluate. */
interface ScriptResult {
  result?: {
    type: string;
    value?: unknown;
    handle?: string;
    sharedId?: string;
  };
}

/** Box model dimensions. */
export interface BoxModel {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolved element reference for BiDi. */
export interface ElementRef {
  sharedId: string;
  handle?: string;
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

/**
 * Get the active browsing context from the BiDi connection.
 * Tools must set this before calling DOM helpers.
 */
let activeContext: string | undefined;

export function setActiveContext(contextId: string): void {
  activeContext = contextId;
}

export function getActiveContext(): string | undefined {
  return activeContext;
}

function getTarget(context?: string): { context: string } {
  const ctx = context ?? activeContext;
  if (!ctx) throw new Error("No active browsing context set");
  return { context: ctx };
}

// ---------------------------------------------------------------------------
// script.evaluate wrapper
// ---------------------------------------------------------------------------

export async function evaluate(
  bidi: BiDiConnection,
  expression: string,
  context?: string,
): Promise<unknown> {
  const response = await bidi.send("script.evaluate", {
    expression,
    target: getTarget(context),
    awaitPromise: true,
    resultOwnership: "root",
  }) as ScriptResult;

  return response.result?.value;
}

// ---------------------------------------------------------------------------
// script.callFunction wrapper
// ---------------------------------------------------------------------------

export async function callFunction(
  bidi: BiDiConnection,
  functionDeclaration: string,
  args: unknown[] = [],
  context?: string,
): Promise<unknown> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration,
    arguments: args,
    target: getTarget(context),
    awaitPromise: true,
    resultOwnership: "root",
  }) as ScriptResult;

  return response.result;
}

// ---------------------------------------------------------------------------
// DOM operations (replacing CDP DOM domain)
// ---------------------------------------------------------------------------

/**
 * Query a single element by CSS selector.
 * Returns a BiDi SharedReference for the element.
 */
export async function querySelector(
  bidi: BiDiConnection,
  selector: string,
  context?: string,
): Promise<ElementRef | null> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration: "(selector) => document.querySelector(selector)",
    arguments: [{ type: "string", value: selector }],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
  }) as ScriptResult;

  if (!response.result || response.result.type === "null") {
    return null;
  }

  return {
    sharedId: response.result.sharedId ?? "",
    handle: response.result.handle,
  };
}

/**
 * Get the bounding box of an element (replacing DOM.getBoxModel).
 */
export async function getBoxModel(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  context?: string,
): Promise<BoxModel> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration: `(el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }`,
    arguments: [{ type: "node", sharedId: elementRef.sharedId }],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
    serializationOptions: { maxDomDepth: 0 },
  }) as ScriptResult;

  const value = response.result?.value as BoxModel | undefined;
  if (!value) throw new Error("Failed to get box model");
  return value;
}

/**
 * Scroll an element into view (replacing DOM.scrollIntoViewIfNeeded).
 */
export async function scrollIntoView(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  context?: string,
): Promise<void> {
  await bidi.send("script.callFunction", {
    functionDeclaration: "(el) => el.scrollIntoView({ block: 'center', inline: 'center' })",
    arguments: [{ type: "node", sharedId: elementRef.sharedId }],
    target: getTarget(context),
    awaitPromise: false,
  });
}

/**
 * Focus an element (replacing DOM.focus).
 */
export async function focusElement(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  context?: string,
): Promise<void> {
  await bidi.send("script.callFunction", {
    functionDeclaration: "(el) => el.focus()",
    arguments: [{ type: "node", sharedId: elementRef.sharedId }],
    target: getTarget(context),
    awaitPromise: false,
  });
}

/**
 * Get the outer HTML of an element (replacing DOM.getOuterHTML).
 */
export async function getOuterHTML(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  context?: string,
): Promise<string> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration: "(el) => el.outerHTML",
    arguments: [{ type: "node", sharedId: elementRef.sharedId }],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
  }) as ScriptResult;

  return (response.result?.value as string) ?? "";
}

/**
 * Get the document element reference.
 */
export async function getDocument(
  bidi: BiDiConnection,
  context?: string,
): Promise<ElementRef> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration: "() => document.documentElement",
    arguments: [],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
  }) as ScriptResult;

  if (!response.result || response.result.type === "null") {
    throw new Error("Failed to get document element");
  }

  return {
    sharedId: response.result.sharedId ?? "",
    handle: response.result.handle,
  };
}

/**
 * Resolve a ref string (e.g. "@e123") to an element reference.
 * In BiDi, refs are sharedIds directly.
 */
export async function resolveRef(
  bidi: BiDiConnection,
  ref: string,
  context?: string,
): Promise<ElementRef> {
  const backendNodeId = ref.replace("@e", "");

  const response = await bidi.send("script.callFunction", {
    functionDeclaration: `(id) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      let count = 0;
      let node = walker.currentNode;
      const targetId = parseInt(id, 10);
      while (node) {
        count++;
        if (count === targetId) return node;
        node = walker.nextNode();
        if (!node) break;
      }
      return null;
    }`,
    arguments: [{ type: "string", value: backendNodeId }],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
  }) as ScriptResult;

  if (!response.result || response.result.type === "null") {
    throw new Error(`Element not found for ref: ${ref}`);
  }

  return {
    sharedId: response.result.sharedId ?? "",
    handle: response.result.handle,
  };
}

/**
 * Describe a node (replacing DOM.describeNode).
 */
export async function describeNode(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  context?: string,
): Promise<{ tagName: string; attributes: Record<string, string> }> {
  const response = await bidi.send("script.callFunction", {
    functionDeclaration: `(el) => {
      const attrs = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return { tagName: el.tagName.toLowerCase(), attributes: attrs };
    }`,
    arguments: [{ type: "node", sharedId: elementRef.sharedId }],
    target: getTarget(context),
    awaitPromise: false,
    resultOwnership: "root",
    serializationOptions: { maxDomDepth: 0 },
  }) as ScriptResult;

  const value = response.result?.value as { tagName: string; attributes: Record<string, string> } | undefined;
  if (!value) throw new Error("Failed to describe node");
  return value;
}

/**
 * Set files on a file input element (replacing DOM.setFileInputFiles).
 */
export async function setFileInputFiles(
  bidi: BiDiConnection,
  elementRef: ElementRef,
  files: string[],
  context?: string,
): Promise<void> {
  // BiDi doesn't have a direct equivalent to DOM.setFileInputFiles.
  // We use input.setFiles if available, otherwise fall back to script.
  try {
    await bidi.send("input.setFiles", {
      context: getTarget(context).context,
      element: { sharedId: elementRef.sharedId },
      files,
    });
  } catch {
    // Fallback: dispatch change event (limited, can't actually set files via JS)
    await bidi.send("script.callFunction", {
      functionDeclaration: "(el) => el.dispatchEvent(new Event('change', { bubbles: true }))",
      arguments: [{ type: "node", sharedId: elementRef.sharedId }],
      target: getTarget(context),
      awaitPromise: false,
    });
  }
}
