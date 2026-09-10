import Link from "next/link";

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
      <path
        d="M3 8 H12.5 M8.5 4 L13 8 L8.5 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
    </svg>
  );
}

const VALUE_CARDS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Borrow without unwinding the LP",
    body: "A Uniswap v4 LP position is the collateral. You draw cash against it instead of withdrawing liquidity and giving up the position.",
  },
  {
    n: "02",
    title: "Better LTV — scored privately, not publicly",
    body: "Your position is evaluated inside a secure enclave. You get better terms based on your actual risk profile — without the scoring inputs ever touching the public chain.",
  },
  {
    n: "03",
    title: "A v4 hook holds the position for the term",
    body: "A Uniswap v4 hook locks withdrawals for the life of the loan. Removing liquidity is blocked on-chain — the collateral stays intact, enforced by the pool itself, not just a promise.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Lock the LP NFT",
    body: "Deposit your LP NFT into the vault. You stay on record as the borrower — the position is locked for the loan term, not transferred permanently.",
  },
  {
    n: "02",
    title: "Score privately in CRE",
    body: "A confidential handler (handlerInTee) computes LTV, APR, and expiry. Intermediate scores stay in the enclave.",
  },
  {
    n: "03",
    title: "Draw principal",
    body: "The vault values the position and disburses principal = collateral × LTV. You keep the LP as collateral while the loan is open.",
  },
  {
    n: "04",
    title: "Repay or liquidate",
    body: "Repay principal plus flat interest to unlock and get the NFT back. After the deadline, anyone can liquidate the locked position.",
  },
];

const WHY: { title: string; body: string }[] = [
  {
    title: "Cash without closing the LP",
    body: "Uniswap v4 LPs usually unwind to get liquid capital. Veilend treats the position as a credit line so the inventory can stay on.",
  },
  {
    title: "A credit signal that does not go public",
    body: "Risk is scored where the inputs already are: inside the confidential workflow. Observers see terms, not the data that produced them.",
  },
  {
    title: "Enforcement on the pool, not a promise",
    body: "Collateral protection isn't a contract clause — it's enforced on-chain by the pool's own hook. The position cannot be drained while the loan is open.",
  },
];

function SectionLabel({ index, children }: { index: string; children: string }) {
  return (
    <div className="mb-8 flex items-baseline gap-3 border-b border-[var(--color-hairline)] pb-3">
      <span className="font-mono text-xs tracking-[0.35em] text-[var(--color-acid)]">{index}</span>
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink-dim)]">
        {children}
      </span>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="pb-24">
      <section className="relative border-b border-[var(--color-hairline)] py-20 md:py-28">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--color-hairline) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 80% 60% at 30% 0%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 30% 0%, black, transparent)",
          }}
        />
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-1.5">
              <span className="size-1.5 rounded-full bg-[var(--color-acid)]" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                Uniswap v4 · Chainlink CRE
              </span>
            </div>
            <h1 className="font-mono text-[clamp(2.75rem,7vw,5.5rem)] font-extrabold leading-[0.95] tracking-tight text-[var(--color-ink)]">
              Veilend
            </h1>
            <p className="mt-4 font-mono text-lg font-semibold tracking-tight text-[var(--color-ink-dim)] md:text-xl">
              Keep the yield. Unlock the cash.
            </p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--color-ink-dim)] md:text-xl">
              Borrow against your Uniswap v4 LP — without unwinding it. Your
              risk is scored privately inside a secure enclave, so you get a
              better{" "}
              <span className="text-[var(--color-ink)]">LTV</span> without
              exposing your data on-chain.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="group inline-flex items-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-6 py-3 font-mono text-sm font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-acid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ground)]"
              >
                Launch app
                <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 border border-[var(--color-hairline-hi)] px-6 py-3 font-mono text-sm uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-dim)] hover:bg-[var(--color-panel-hi)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink-dim)]"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
              Loan loop
            </span>
            <div className="mt-5 flex flex-col gap-3 font-mono text-xs">
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-3">
                <span className="text-[var(--color-ink-dim)]">lock</span>
                <span className="text-[var(--color-ink)]">LP NFT</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-acid)]" />
                <span className="text-[var(--color-ink)]">Vault</span>
              </div>
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-3">
                <span className="text-[var(--color-ink-dim)]">score</span>
                <span className="text-[var(--color-ink)]">CRE TEE</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-acid)]" />
                <span className="text-[var(--color-ink)]">LTV / APR</span>
              </div>
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-3">
                <span className="text-[var(--color-ink-dim)]">draw</span>
                <span className="text-[var(--color-ink)]">Vault</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-ok)]" />
                <span className="text-[var(--color-ink)]">Principal</span>
              </div>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-[var(--color-ink-dim)]">
              The chain only receives terms. On repay, the NFT returns to the borrower.
            </p>
          </div>
        </div>
      </section>

      <section className="pt-16">
        <SectionLabel index="01">What Veilend does</SectionLabel>
        <div className="grid gap-px overflow-hidden border border-[var(--color-hairline)] bg-[var(--color-hairline)] md:grid-cols-3">
          {VALUE_CARDS.map((card) => (
            <div
              key={card.n}
              className="group flex flex-col bg-[var(--color-panel)] p-7 transition-colors hover:bg-[var(--color-panel-hi)]"
            >
              <span className="font-mono text-sm text-[var(--color-acid)]">{card.n}</span>
              <h3 className="mt-5 font-mono text-lg font-bold leading-snug tracking-tight text-[var(--color-ink)]">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 pt-16">
        <SectionLabel index="02">How it works</SectionLabel>
        <div className="grid gap-px overflow-hidden border border-[var(--color-hairline)] bg-[var(--color-hairline)] md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="flex flex-col bg-[var(--color-panel)] p-7 transition-colors hover:bg-[var(--color-panel-hi)]"
            >
              <span className="font-mono text-sm text-[var(--color-acid)]">{step.n}</span>
              <h3 className="mt-5 font-mono text-lg font-bold leading-snug tracking-tight text-[var(--color-ink)]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-16">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 border-y border-[var(--color-hairline)] py-6">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Built with
          </span>
          <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-ink-dim)]">
            Uniswap v4 hooks
          </span>
          <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-ink-dim)]">
            Chainlink CRE confidential workflows
          </span>
        </div>
      </section>

      <section className="pt-16">
        <SectionLabel index="03">Why Veilend</SectionLabel>
        <div className="grid gap-6 md:grid-cols-3">
          {WHY.map((item) => (
            <div key={item.title} className="border-l-2 border-[var(--color-acid)] pl-5">
              <h3 className="font-mono text-base font-bold tracking-tight text-[var(--color-ink)]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-dim)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <div className="flex flex-col items-start justify-between gap-6 border border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-8 md:flex-row md:items-center md:p-10">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-tight text-[var(--color-ink)] md:text-3xl">
              Your LP is working capital.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--color-ink-dim)]">
              Lock a Uniswap v4 position, get your terms from the enclave, and
              draw principal — without closing the LP.
            </p>
          </div>
          <Link
            href="/app"
            className="group inline-flex shrink-0 items-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-6 py-3 font-mono text-sm font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-acid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ground)]"
          >
            Launch app
            <ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
