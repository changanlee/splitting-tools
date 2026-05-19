import { CaptureFlow } from "@/features/parsing/components/CaptureFlow";

// Server Component (Next 16 default) rendering the client capture flow.
// Story 1.2 keeps the home page minimal — a focused "拍收據" entry only;
// full home/brand/nav is out of scope (later stories).
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="px-4 pt-8 pb-2">
        <h1 className="text-xl font-semibold tracking-tight">分帳小工具</h1>
      </header>
      <CaptureFlow />
    </main>
  );
}
