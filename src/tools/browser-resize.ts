/**
 * browser_resize tool — Resizes the browser viewport via BiDi script.evaluate.
 *
 * Uses script.evaluate to call window.resizeTo for viewport resizing,
 * since BiDi does not have a direct Emulation.setDeviceMetricsOverride equivalent.
 */
import type { BiDiConnection } from "../bidi/connection.js";

const PRESETS: Record<string, { width: number; height: number }> = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  fullhd: { width: 1920, height: 1080 },
};

export interface ResizeParams {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  preset?: string;
}

export interface ResizeResult {
  success: boolean;
  width: number;
  height: number;
}

export async function browserResize(
  bidi: BiDiConnection,
  params: ResizeParams,
): Promise<ResizeResult> {
  let width: number;
  let height: number;

  if (params.preset?.toLowerCase() === "reset") {
    await bidi.send("script.evaluate", {
      expression: "window.resizeTo(screen.availWidth, screen.availHeight)",
      awaitPromise: false,
      resultOwnership: "none",
    });
    return { success: true, width: 0, height: 0 };
  }

  if (params.preset) {
    const preset = PRESETS[params.preset.toLowerCase()];
    if (!preset) {
      throw new Error(
        `Unknown preset "${params.preset}". Available: ${Object.keys(PRESETS).join(", ")}, reset`,
      );
    }
    width = preset.width;
    height = preset.height;
  } else {
    width = params.width ?? 1280;
    height = params.height ?? 720;
  }

  if (params.width !== undefined) width = params.width;
  if (params.height !== undefined) height = params.height;

  await bidi.send("script.evaluate", {
    expression: `window.resizeTo(${width}, ${height})`,
    awaitPromise: false,
    resultOwnership: "none",
  });

  return { success: true, width, height };
}
