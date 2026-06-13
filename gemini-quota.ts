// gemini-quota.ts
//
// FIX 8 (KNOWN_ISSUES §6 item 7): Gemini suggested replies failed across the
// board from ~21:34Z Jun 12. Every 15-min repair sweep, attempt 1 failed
// instantly and the shared gemini circuit breaker opened, and the sweep kept
// re-burning it — the pattern of a daily free-tier quota exhaustion.
//
// Two pure helpers used by server.ts:
//
//   - describeLLMError: pulls the ACTUAL error detail out of a Gemini SDK
//     error so the failure mode is visible in Railway logs (status,
//     statusText, errorDetails) instead of just a generic message string.
//     This is step 1 of the fix — confirm the failure mode, don't guess it.
//
//   - isQuotaExhaustedError: true only for a genuine quota / 429 /
//     RESOURCE_EXHAUSTED error (NOT a transient 503 "high demand", which the
//     existing short-backoff retry already handles). server.ts uses this to
//     enter a cooldown and stop re-burning the quota on every sweep.
//
// Deliberately distinct from server.ts's isRetryableLLMError: that function
// treats a 429/"resource exhausted" as retryable-with-short-backoff, which is
// exactly what burns a daily quota three times per ticket. A quota error is
// "try again much later", not "try again in a second".

export interface LLMErrorDetail {
  message: string;
  status?: string | number;
  statusText?: string;
  errorDetails?: unknown;
}

// Extracts whatever structured detail the Gemini SDK (and Node fetch errors)
// expose. GoogleGenerativeAIFetchError carries .status (HTTP numeric),
// .statusText, and .errorDetails; some errors bury status under .response.
export function describeLLMError(e: any): LLMErrorDetail {
  const detail: LLMErrorDetail = {
    message: String(e?.message ?? e ?? ""),
  };
  const status = e?.status ?? e?.code ?? e?.response?.status;
  if (status !== undefined && status !== null) detail.status = status;
  const statusText = e?.statusText ?? e?.response?.statusText;
  if (statusText) detail.statusText = statusText;
  if (e?.errorDetails !== undefined) detail.errorDetails = e.errorDetails;
  return detail;
}

// True for a quota / rate-limit exhaustion that will NOT clear on a short
// backoff (daily free-tier cap, RESOURCE_EXHAUSTED, "exceeded your current
// quota"). A transient 503/overload is deliberately NOT matched here — it is
// handled by the existing retry-with-backoff in generateSuggestedReply.
export function isQuotaExhaustedError(e: any): boolean {
  const status = e?.status ?? e?.code ?? e?.response?.status;
  if (status === 429) return true;
  const haystack = [
    e?.message,
    e?.status,
    e?.statusText,
    typeof e?.errorDetails === "string"
      ? e.errorDetails
      : JSON.stringify(e?.errorDetails ?? ""),
  ]
    .map((x) => String(x ?? ""))
    .join(" ");
  return /\b429\b|resource[_\s-]?exhausted|quota|exceeded your current quota|too many requests/i.test(
    haystack,
  );
}
