/**
 * browser_press_key tool — dispatches a single key press or key combination
 * via BiDi input.performActions. Supports "Control+c", "Shift+Tab", etc.
 */
import type { BiDiConnection } from "../bidi/connection.js";

// Special key name -> Unicode key value mapping for BiDi
const SPECIAL_KEYS: Record<string, string> = {
  Enter: "\uE006",
  Tab: "\uE004",
  Escape: "\uE00C",
  Backspace: "\uE003",
  Delete: "\uE017",
  ArrowLeft: "\uE012",
  ArrowUp: "\uE013",
  ArrowRight: "\uE014",
  ArrowDown: "\uE015",
  Home: "\uE011",
  End: "\uE010",
  PageUp: "\uE00E",
  PageDown: "\uE00F",
  Insert: "\uE016",
  Space: " ",
  " ": " ",
  F1: "\uE031",
  F2: "\uE032",
  F3: "\uE033",
  F4: "\uE034",
  F5: "\uE035",
  F6: "\uE036",
  F7: "\uE037",
  F8: "\uE038",
  F9: "\uE039",
  F10: "\uE03A",
  F11: "\uE03B",
  F12: "\uE03C",
  Control: "\uE009",
  Shift: "\uE008",
  Alt: "\uE00A",
  Meta: "\uE03D",
};

function resolveKeyValue(key: string): string {
  return SPECIAL_KEYS[key] ?? key;
}

export interface PressKeyParams {
  key: string;
}

export interface PressKeyResult {
  success: boolean;
}

export async function browserPressKey(
  bidi: BiDiConnection,
  params: PressKeyParams,
): Promise<PressKeyResult> {
  const parts = params.key.split("+");
  const mainKey = parts[parts.length - 1]!;
  const modifierKeys = parts.slice(0, -1);

  const keyActions: unknown[] = [];

  // Press modifiers down
  for (const mod of modifierKeys) {
    keyActions.push({ type: "keyDown", value: resolveKeyValue(mod) });
  }

  // Press and release main key
  keyActions.push(
    { type: "keyDown", value: resolveKeyValue(mainKey) },
    { type: "keyUp", value: resolveKeyValue(mainKey) },
  );

  // Release modifiers in reverse
  for (let i = modifierKeys.length - 1; i >= 0; i--) {
    keyActions.push({ type: "keyUp", value: resolveKeyValue(modifierKeys[i]!) });
  }

  await bidi.send("input.performActions", {
    actions: [{
      type: "key",
      id: "keyboard",
      actions: keyActions,
    }],
  });

  return { success: true };
}
