"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWalletUi } from "@/lib/use-wallet-ui";
import { Logo } from "./icons";
import { WalletControl } from "./WalletControl";

type NavItem = {
  label: string;
  to: string;
};

const NAV: NavItem[] = [
  { label: "How it works", to: "/#how-it-works" },
  { label: "Borrow", to: "/app" },
  { label: "Loan", to: "/loan" },
  { label: "Liquidate", to: "/liquidate" },
  { label: "Positions", to: "/positions" },
  { label: "Faucet", to: "/faucet" },
];

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavItemLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = isActivePath(pathname, item.to);

  return (
    <Link
      href={item.to}
      className={`group relative px-1 py-1 font-mono text-[13px] tracking-tight transition-colors ${
        isActive
          ? "text-[var(--color-ink)]"
          : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
      }`}
    >
      {item.label}
      <span
        className={`absolute -bottom-[19px] left-0 h-px w-full transition-colors ${
          isActive
            ? "bg-[var(--color-acid)]"
            : "bg-transparent group-hover:bg-[var(--color-hairline-hi)]"
        }`}
      />
    </Link>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { state, chain } = useWalletUi();
  const netLabel = state === "wrong-network" ? "Wrong network" : chain;
  const netColor =
    state === "wrong-network"
      ? "var(--color-danger)"
      : state === "connected"
        ? "var(--color-ok)"
        : "var(--color-ink-faint)";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ground)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:gap-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 focus:outline-none">
          <Logo className="size-6 text-[var(--color-ink)]" />
          <span className="font-mono text-[15px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink)]">
            Veilend
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <WalletControl />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex size-9 shrink-0 items-center justify-center border border-[var(--color-hairline-hi)] text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-dim)] lg:hidden"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M4 4 L16 16 M16 4 L4 16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              ) : (
                <path
                  d="M3 6 H17 M3 10 H17 M3 14 H17"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-[var(--color-hairline)] bg-[var(--color-ground)] lg:hidden">
          <div className="mx-auto flex max-w-[1280px] flex-col px-4 py-2 sm:px-6">
            <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] py-3.5 sm:hidden">
              <span className="size-1.5 rounded-full" style={{ background: netColor }} />
              <span
                className="font-mono text-xs uppercase tracking-widest"
                style={{ color: netColor }}
              >
                {netLabel}
              </span>
            </div>
            {NAV.map((item) => {
              const isActive = isActivePath(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setOpen(false)}
                  className={`border-b border-[var(--color-hairline)] py-3.5 font-mono text-sm tracking-tight last:border-b-0 ${
                    isActive ? "text-[var(--color-acid)]" : "text-[var(--color-ink-dim)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
