/**
 * browser_network_requests tool — captures network requests via CDP events.
 *
 * Uses Network.requestWillBeSent and Network.responseReceived CDP events to
 * capture requests server-side into a bounded EventBuffer. Captures method,
 * status code, headers — data not available via the Performance API.
 *
 * Supports:
 *  - URL filtering via substring match
 *  - Static resource filtering (Image, Stylesheet, Font, Script)
 *  - Result limiting
 *  - Secret redaction (JWT/Bearer tokens in URLs)
 *
 * @module browser-network-requests
 */
import { EventBuffer } from "../event-buffer.js";
import { redactInlineSecrets, redactHeaders } from "../redactor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetworkRequestsParams {
  /** Substring filter to match against request URLs. */
  filter?: string;
  /** Maximum number of requests to return. */
  limit?: number;
  /** Whether to include response headers. */
  includeHeaders?: boolean;
  /** Whether to include static resources (images, stylesheets, fonts, scripts). */
  includeStatic?: boolean;
}

export interface NetworkRequest {
  /** 1-based index for use with browser_network_request. */
  id: string;
  /** The request URL. */
  url: string;
  /** HTTP method (GET, POST, etc.). */
  method: string;
  /** HTTP status code. */
  status?: number;
  /** Resource type (e.g. "Fetch", "XHR", "Script", "Image"). */
  type?: string;
}

export interface NetworkRequestsResult {
  /** List of captured network requests. */
  requests: NetworkRequest[];
}

// ---------------------------------------------------------------------------
// Static resource types (CDP uses PascalCase)
// ---------------------------------------------------------------------------

const STATIC_TYPES = new Set([
  "Image",
  "Stylesheet",
  "Font",
  "Script",
  "Media",
]);

// ---------------------------------------------------------------------------
// Internal buffer entry (mutable — response enriches it)
// ---------------------------------------------------------------------------

interface BufferEntry {
  requestId: string;
  url: string;
  method: string;
  type: string;
  status?: number;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const networkBuffer = new EventBuffer<BufferEntry>(500);

/** Map requestId → buffer index for response correlation */
const pendingRequests = new Map<string, BufferEntry>();

// ---------------------------------------------------------------------------
// Setup & Reset
// ---------------------------------------------------------------------------

interface CDPEventSource {
  on(event: string, handler: (params: unknown) => void): void;
}

/**
 * Register CDP event listeners for Network.requestWillBeSent and
 * Network.responseReceived. Call once after Network.enable.
 */
export function setupNetworkCapture(bidi: CDPEventSource): void {
  // BiDi network events
  bidi.on("network.beforeRequestSent", (params: unknown) => {
    const p = params as {
      request: { request: string; url: string; method: string; headers?: Array<{ name: string; value: { type: string; value: string } }> };
      navigation?: string;
      timestamp?: number;
    };

    const reqHeaders: Record<string, string> = {};
    if (Array.isArray(p.request.headers)) {
      for (const h of p.request.headers) {
        reqHeaders[h.name] = h.value?.value ?? "";
      }
    }

    const entry: BufferEntry = {
      requestId: p.request.request,
      url: p.request.url,
      method: p.request.method,
      type: "Fetch",
      requestHeaders: reqHeaders,
      timestamp: p.timestamp ? Math.floor(p.timestamp) : Date.now(),
    };

    pendingRequests.set(p.request.request, entry);
    networkBuffer.push(entry);
  });

  bidi.on("network.responseCompleted", (params: unknown) => {
    const p = params as {
      request: { request: string };
      response: { url: string; status: number; headers?: Array<{ name: string; value: { type: string; value: string } }> };
    };

    const entry = pendingRequests.get(p.request.request);
    if (entry) {
      entry.status = p.response.status;
      if (Array.isArray(p.response.headers)) {
        const respHeaders: Record<string, string> = {};
        for (const h of p.response.headers) {
          respHeaders[h.name] = h.value?.value ?? "";
        }
        entry.responseHeaders = respHeaders;
      }
      pendingRequests.delete(p.request.request);
    }
  });
}

/** Clear the network buffer (call on reconnection). */
export function resetNetworkBuffer(): void {
  networkBuffer.clear();
  pendingRequests.clear();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Read network requests from the EventBuffer.
 *
 * @param _cdp - CDP connection (unused — buffer is populated by setupNetworkCapture).
 * @param params - Filter and limit parameters.
 * @returns List of network requests.
 */
export async function browserNetworkRequests(
  _cdp: unknown,
  params: NetworkRequestsParams,
): Promise<NetworkRequestsResult> {
  let entries = networkBuffer.last();

  // Filter static resources unless includeStatic is true
  if (!params.includeStatic) {
    entries = entries.filter((e) => !STATIC_TYPES.has(e.type));
  }

  // Filter by URL (strip glob wildcards for substring match)
  if (params.filter) {
    const stripped = params.filter.replace(/\*/g, "").toLowerCase();
    if (stripped) {
      entries = entries.filter((e) => e.url.toLowerCase().includes(stripped));
    }
  }

  // Apply limit
  const limit = params.limit ?? 100;
  entries = entries.slice(0, limit);

  // Map to NetworkRequest format — redact secrets from URLs
  const requests: NetworkRequest[] = entries.map((e, i) => ({
    id: String(i + 1),
    url: redactInlineSecrets(e.url),
    method: e.method,
    status: e.status,
    type: e.type,
  }));

  return { requests };
}

// ---------------------------------------------------------------------------
// Single request detail
// ---------------------------------------------------------------------------

export interface NetworkRequestDetailParams {
  index: number;
}

export interface NetworkRequestDetail {
  url: string;
  method: string;
  status?: number;
  type: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export async function browserNetworkRequest(
  _cdp: unknown,
  params: NetworkRequestDetailParams,
): Promise<NetworkRequestDetail> {
  const entries = networkBuffer.last();
  const nonStatic = entries.filter((e) => !STATIC_TYPES.has(e.type));
  const idx = params.index - 1;

  if (idx < 0 || idx >= nonStatic.length) {
    throw new Error(`Request index ${params.index} out of range (1-${nonStatic.length})`);
  }

  const entry = nonStatic[idx]!;
  return {
    url: redactInlineSecrets(entry.url),
    method: entry.method,
    status: entry.status,
    type: entry.type,
    requestHeaders: entry.requestHeaders ? redactHeaders(entry.requestHeaders) : undefined,
    responseHeaders: entry.responseHeaders ? redactHeaders(entry.responseHeaders) : undefined,
  };
}
