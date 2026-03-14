/**
 * browser_keyboard tool — low-level keyboard control via BiDi input.performActions.
 *
 * Actions:
 *   - "type"       → key actions per character
 *   - "inserttext" → script.callFunction with execCommand
 *   - "keydown"    → single keyDown action
 *   - "keyup"      → single keyUp action
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface KeyboardParams {
  action: "type" | "inserttext" | "keydown" | "keyup";
  text?: string;
  key?: string;
}

export interface KeyboardResult {
  success: boolean;
}

export async function browserKeyboard(
  bidi: BiDiConnection,
  params: KeyboardParams,
): Promise<KeyboardResult> {
  switch (params.action) {
    case "type": {
      const text = params.text ?? "";
      const keyActions: unknown[] = [];
      for (const char of text) {
        keyActions.push(
          { type: "keyDown", value: char },
          { type: "keyUp", value: char },
        );
      }
      if (keyActions.length > 0) {
        await bidi.send("input.performActions", {
          actions: [{
            type: "key",
            id: "keyboard",
            actions: keyActions,
          }],
        });
      }
      break;
    }

    case "inserttext": {
      const text = params.text ?? "";
      await bidi.send("script.callFunction", {
        functionDeclaration: `(t) => document.execCommand('insertText', false, t)`,
        arguments: [{ type: "string", value: text }],
        awaitPromise: false,
        resultOwnership: "none",
      });
      break;
    }

    case "keydown": {
      const key = params.key ?? "";
      await bidi.send("input.performActions", {
        actions: [{
          type: "key",
          id: "keyboard",
          actions: [{ type: "keyDown", value: key }],
        }],
      });
      break;
    }

    case "keyup": {
      const key = params.key ?? "";
      await bidi.send("input.performActions", {
        actions: [{
          type: "key",
          id: "keyboard",
          actions: [{ type: "keyUp", value: key }],
        }],
      });
      break;
    }

    default:
      throw new Error(`Unknown keyboard action: ${params.action as string}`);
  }

  return { success: true };
}
