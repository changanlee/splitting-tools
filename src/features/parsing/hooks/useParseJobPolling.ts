/**
 * Parse-job status polling — Story 1.3 (AC3). TanStack Query
 * (architecture-mandated). Polls every 2.5s while non-terminal, STOPS
 * at a terminal status (no idle spin), and does not poll while the tab
 * is backgrounded (NFR-P4 idle backoff).
 */
import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  ParseStatusResponseSchema,
  isTerminalStatus,
  type ParseStatusResponse,
} from "@/features/parsing/schema";

const POLL_MS = 2500;
/** Hard ceiling — never poll forever (NFR-R2: never deadlock the payer,
 *  esp. before the Story 1.4 consumer exists). */
const MAX_POLL_MS = 180_000;

async function fetchStatus(
  linkId: string,
  jobId: string,
): Promise<ParseStatusResponse> {
  const res = await fetch(
    `/api/splits/${encodeURIComponent(linkId)}/parse-jobs/${encodeURIComponent(jobId)}`,
  );
  if (!res.ok) throw new Error("status fetch failed");
  // Zod-validate the response (shared contract, AC4).
  return ParseStatusResponseSchema.parse(await res.json());
}

export function useParseJobPolling(
  linkId: string | null,
  jobId: string | null,
) {
  // Poll-ceiling as an effect-driven timer. Render stays pure (no
  // Date.now()/ref reads) AND the effect does NO synchronous setState
  // (cascading-render rule): state is set ONLY inside the async
  // setTimeout callback, keyed to the job, so a job change resets by
  // derivation (no explicit reset call needed).
  const jobKey = linkId && jobId ? `${linkId}:${jobId}` : null;
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);
  useEffect(() => {
    if (!jobKey) return;
    const id = setTimeout(() => setTimedOutKey(jobKey), MAX_POLL_MS);
    return () => clearTimeout(id);
  }, [jobKey]);
  const timedOut = jobKey !== null && timedOutKey === jobKey;

  const query = useQuery({
    queryKey: ["parse-status", linkId, jobId],
    queryFn: () => fetchStatus(linkId as string, jobId as string),
    enabled: Boolean(linkId) && Boolean(jobId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && isTerminalStatus(status)) return false;
      if (timedOut) return false; // captured state — pure, no ref/Date
      return POLL_MS;
    },
    refetchIntervalInBackground: false, // NFR-P4 idle backoff
  });

  const status = query.data?.status;
  const effectiveTimedOut =
    timedOut && !(status && isTerminalStatus(status));

  return { ...query, timedOut: effectiveTimedOut };
}
