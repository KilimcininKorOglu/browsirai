/**
 * browser_handle_dialog tool — accepts or dismisses a JavaScript dialog via BiDi.
 *
 * Uses browsingContext.handleUserPrompt to handle alert, confirm, prompt,
 * and beforeunload dialogs.
 *
 * @module browser-handle-dialog
 */
import type { BiDiConnection } from "../bidi/connection.js";

export interface HandleDialogParams {
  accept: boolean;
  promptText?: string;
}

export interface HandleDialogResult {
  success: boolean;
  error?: string;
}

export async function browserHandleDialog(
  bidi: BiDiConnection,
  params: HandleDialogParams,
): Promise<HandleDialogResult> {
  const dialogParams: Record<string, unknown> = {
    accept: params.accept,
  };

  if (params.promptText !== undefined) {
    dialogParams.userText = params.promptText;
  }

  try {
    await bidi.send("browsingContext.handleUserPrompt", dialogParams);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("no dialog") || message.includes("no user prompt")) {
      return {
        success: false,
        error: "No JavaScript dialog is currently pending. A dialog must be open before it can be handled.",
      };
    }

    return {
      success: false,
      error: `Failed to handle dialog: ${message}`,
    };
  }
}
