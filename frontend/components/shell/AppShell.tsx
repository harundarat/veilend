import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { NetworkBanner } from "./NetworkBanner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-[var(--color-ground)]">
      <Header />
      <NetworkBanner />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6">{children}</main>
      <Footer />
    </div>
  );
}
