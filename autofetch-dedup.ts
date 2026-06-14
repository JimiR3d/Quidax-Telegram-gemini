// autofetch-dedup.ts
//
// Pure helpers for the AutoFetch sweep's per-message pre-dedup.
//
// Background (2026-06-14): the live NewMessage listener does not deliver this
// supergroup's messages even after Fix 10 priming (priming succeeds and the
// account IS a member, but GramJS 2.26.x still never pushes the channel's
// updates — see dialog-priming.ts / KNOWN_ISSUES §6 item 1). AutoFetch is
// therefore the real ingestion path, so its sweep interval was shortened to cut
// ingest lag. But the sweep re-walks the newest N messages every time and used
// to run checkIsAdmin (a Telegram round-trip) AND a 2.1s Groq-spacing sleep on
// every message in the window — mostly already-ingested duplicates — which made
// a short interval wasteful (~42s of sleeping per sweep, N× the checkIsAdmin
// calls).
//
// These helpers let the sweep look up which ids are already ingested in ONE
// batched query and skip them BEFORE the expensive per-message work. The
// authoritative, idempotent dedup still lives at the top of
// processAndIngestMessage (eq telegram_message_id) — this only trims overhead,
// it is never the sole guard. Extracted as a pure module (like telegram-guards
// / listener-health / dialog-priming) so it is unit-testable without a live
// GramJS session.

export interface SweepCandidate {
  // GramJS message id (number) — compared as a string to match how
  // telegram_message_id is stored/queried everywhere else in the pipeline.
  id?: number | string | null;
  text?: string | null;
  // GramJS msg.date — unix SECONDS.
  date: number;
}

// A message is worth processing in a sweep only if it has text and is within the
// lookback window. Mirrors the original inline guards in runAutoFetch.
export function isSweepEligible(
  m: SweepCandidate | null | undefined,
  cutoffUnixSeconds: number,
): boolean {
  if (!m || !m.text) return false;
  if (m.date < cutoffUnixSeconds) return false;
  return true;
}

// The telegram ids (as strings) to check for prior ingestion — i.e. the eligible
// messages in this sweep window. Ids are stringified to match the String()
// convention used by the messages table insert/dedup.
export function sweepCandidateIds(
  messages: Array<SweepCandidate | null | undefined> | null | undefined,
  cutoffUnixSeconds: number,
): string[] {
  const ids: string[] = [];
  for (const m of messages || []) {
    if (isSweepEligible(m, cutoffUnixSeconds) && m!.id != null) {
      ids.push(String(m!.id));
    }
  }
  return ids;
}

// The messages a sweep should actually process: eligible AND not already in the
// DB. Order is preserved (callers reverse to oldest-first before calling, so a
// parent is still processed before its replies within a sweep).
export function selectMessagesToIngest<T extends SweepCandidate>(
  messages: Array<T | null | undefined> | null | undefined,
  alreadyIngestedIds: Set<string>,
  cutoffUnixSeconds: number,
): T[] {
  const out: T[] = [];
  for (const m of messages || []) {
    if (!isSweepEligible(m, cutoffUnixSeconds)) continue;
    if (m!.id != null && alreadyIngestedIds.has(String(m!.id))) continue;
    out.push(m as T);
  }
  return out;
}
