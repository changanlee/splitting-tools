/**
 * Parse-job status polling — Story 1.3 (AC3). TanStack Query
 * (architecture-mandated). Polls every 2.5s while non-terminal, STOPS
 * at a terminal status (no idle spin), and does not poll while the tab
 * is backgrounded (NFR-P4 idle backoff).
 */
import { useQuery } from "@tanstack/react-query";

import {
  ParseStatusResponseSchema,
  isTerminalStatus,
  type ParseStatusResponse,
} from "@/features/parsing/schema";

const POLL_MS = 2500;

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
  return useQuery({
    queryKey: ["parse-status", linkId, jobId],
    queryFn: () => fetchStatus(linkId as string, jobId as string),
    enabled: Boolean(linkId) && Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalStatus(status) ? false : POLL_MS;
    },
    refetchIntervalInBackground: false, // NFR-P4 idle backoff
  });
}
