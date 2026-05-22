import { redirect } from "next/navigation";

import { CaptureFlow } from "@/features/parsing/components/CaptureFlow";
import { hasValidAccess } from "@/features/access/server/accessGate";

// Server Component (Next 16 default) rendering the client capture flow.
// Epic 7: the upload entry is invite-gated — without a redeemed access
// code the visitor is sent to /unlock. Claim/review/settle stay open
// (link-based; friends trigger no LLM cost).
export default async function Home() {
  if (!(await hasValidAccess())) redirect("/unlock");
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-4 pt-8 pb-2">
        <h1 className="text-xl font-semibold tracking-tight">分帳小工具</h1>
      </header>
      <CaptureFlow />
    </main>
  );
}
