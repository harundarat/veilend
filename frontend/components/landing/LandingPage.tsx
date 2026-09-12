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
    title: "Borrow without unwinding LP inventory",
    body: "Your Uniswap v4 LP position serves as locked collateral. Keep earning active swap fee yield and avoid taxable unwinding or slippage.",
  },
  {
    n: "02",
    title: "Confidential risk scoring in TEE",
    body: "Credit inputs are computed privately inside Chainlink CRE hardware enclaves. Proven track records unlock higher LTV and lower APR without leaking history on-chain.",
  },
  {
    n: "03",
    title: "Autonomous v4 hook collateral protection",
    body: "Enforced at the pool level by CollateralLockHook. Any liquidity reduction is programmatically reverted on-chain while the loan remains active.",
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Lock the LP NFT",
    body: "Approve and transfer your demo pool LP NFT into the LendingVault. Your ownership is registered on-chain while collateral is safely held.",
  },
  {
    n: "02",
    title: "Private CRE evaluation",
    body: "A trusted relayer triggers a Chainlink CRE confidential workflow (handlerInTee), generating verifiable terms (LTV, APR, expiry) within the enclave.",
  },
  {
    n: "03",
    title: "Automatic vdUSD disbursement",
    body: "The vault values collateral on-chain and automatically transfers loan principal in vdUSD directly to your wallet upon report submission.",
  },
  {
    n: "04",
    title: "Repay or liquidate",
    body: "Repay principal plus flat interest before the deadline to automatically unlock and reclaim your NFT. If defaulted, anyone can liquidate.",
  },
];

const SCORING_TIERS = [
  {
    tier: "Tier A — Prime",
    profile: "Long LP age & 100% on-time repayments",
    ltv: "70% LTV",
    apr: "5.0% APR",
    privacy: "Confidential TEE Enclave",
    color: "var(--color-ok)",
  },
  {
    tier: "Tier B — Standard",
    profile: "Average history & regular pool activity",
    ltv: "55% LTV",
    apr: "8.0% APR",
    privacy: "Confidential TEE Enclave",
    color: "var(--color-acid)",
  },
  {
    tier: "Tier C — High Risk",
    profile: "New wallet or volatile risk indicators",
    ltv: "20% LTV",
    apr: "18.0% APR",
    privacy: "Confidential TEE Enclave",
    color: "var(--color-warn)",
  },
];

const COMPARISON = [
  {
    feature: "LP Position Status",
    traditional: "Must withdraw liquidity (forfeit trading fee yield)",
    veilend: "Position stays in pool — keeps accruing swap fees",
  },
  {
    feature: "Credit & Risk Assessment",
    traditional: "Rigid one-size-fits-all overcollateralization",
    veilend: "Personalized LTV & APR via Chainlink CRE enclaves",
  },
  {
    feature: "Borrower Data Privacy",
    traditional: "Public on-chain transaction history & scrutiny",
    veilend: "Confidential TEE — only terms are written on-chain",
  },
  {
    feature: "Collateral Enforcement",
    traditional: "Third-party custody or wrapper contracts",
    veilend: "Pool-level enforcement via Uniswap v4 Hook revert",
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
                Sepolia Testnet · Uniswap v4 Hook · Chainlink CRE (TEE)
              </span>
            </div>
            <h1 className="font-mono text-[clamp(2.75rem,7vw,5.5rem)] font-extrabold leading-[0.95] tracking-tight text-[var(--color-ink)]">
              Veilend
            </h1>
            <p className="mt-4 font-mono text-lg font-semibold tracking-tight text-[var(--color-ink-dim)] md:text-xl">
              Keep the yield. Unlock instant liquidity.
            </p>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--color-ink-dim)] md:text-xl">
              Borrow against your Uniswap v4 LP — without unwinding it. Your
              credit profile is scored confidentially in a Chainlink CRE hardware
              enclave, unlocking{" "}
              <span className="font-semibold text-[var(--color-ink)]">
                higher LTV and lower APR
              </span>{" "}
              without exposing your financial history on-chain.
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
                className="inline-flex items-center gap-2 px-4 py-3 font-mono text-sm uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-ink)] focus:outline-none"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Loan loop
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-acid)]">
                Complete Lifecycle
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 font-mono text-xs">
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-2.5">
                <span className="w-20 text-[var(--color-ink-dim)]">01 lock</span>
                <span className="text-[var(--color-ink)]">LP NFT</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-acid)]" />
                <span className="text-[var(--color-ink)]">Vault</span>
              </div>
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-2.5">
                <span className="w-20 text-[var(--color-ink-dim)]">02 score</span>
                <span className="text-[var(--color-ink)]">CRE TEE</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-acid)]" />
                <span className="text-[var(--color-ink)]">LTV / APR</span>
              </div>
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-2.5">
                <span className="w-20 text-[var(--color-ink-dim)]">03 disburse</span>
                <span className="text-[var(--color-ink)]">Vault</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-ok)]" />
                <span className="text-[var(--color-ink)]">vdUSD Principal</span>
              </div>
              <div className="flex items-center gap-3 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-2.5">
                <span className="w-20 text-[var(--color-ink-dim)]">04 repay</span>
                <span className="text-[var(--color-ink)]">Principal + Fee</span>
                <ArrowIcon className="ml-auto size-4 text-[var(--color-acid)]" />
                <span className="text-[var(--color-ink)]">Unlock NFT</span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-dim)]">
              The chain only receives verified terms. The position keeps accruing fees and is automatically returned upon repayment.
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
        <SectionLabel index="03">Confidential risk scoring in action</SectionLabel>
        <div className="grid gap-4 md:grid-cols-3">
          {SCORING_TIERS.map((tier) => (
            <div
              key={tier.tier}
              className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6 transition-colors hover:border-[var(--color-hairline-hi)]"
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-xs uppercase tracking-wider"
                  style={{ color: tier.color }}
                >
                  {tier.tier}
                </span>
                <span className="size-1.5 rounded-full" style={{ background: tier.color }} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                {tier.profile}
              </p>
              <div className="mt-6 flex items-baseline gap-4 border-t border-[var(--color-hairline)] pt-4 font-mono">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                    Max LTV
                  </span>
                  <p className="mt-1 text-xl font-extrabold text-[var(--color-ink)]">{tier.ltv}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                    Fixed APR
                  </span>
                  <p className="mt-1 text-xl font-extrabold text-[var(--color-acid)]">{tier.apr}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 font-mono text-[10px] tracking-wider text-[var(--color-ink-faint)]">
                <span>Enclave privacy:</span>
                <span className="text-[var(--color-ok)]">Zero data leak</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 overflow-hidden border border-[var(--color-hairline)] bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-hairline)] bg-[var(--color-panel-hi)] px-6 py-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]">
              Traditional DeFi Lending vs. Veilend
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-hairline)]">
            {COMPARISON.map((row) => (
              <div
                key={row.feature}
                className="grid gap-3 p-5 font-mono text-xs md:grid-cols-[1.2fr_1.4fr_1.4fr]"
              >
                <span className="font-semibold text-[var(--color-ink)]">{row.feature}</span>
                <div className="text-[var(--color-ink-dim)]">
                  <span className="mr-2 text-[var(--color-danger)]">✕</span>
                  {row.traditional}
                </div>
                <div className="text-[var(--color-ink)]">
                  <span className="mr-2 text-[var(--color-ok)]">✓</span>
                  {row.veilend}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-20">
        <div className="flex flex-col items-start justify-between gap-6 border border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-8 md:flex-row md:items-center md:p-10">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-[var(--color-acid)]" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                ETHOnline 2026 Submission Demo
              </span>
            </div>
            <h2 className="font-mono text-2xl font-bold tracking-tight text-[var(--color-ink)] md:text-3xl">
              Your LP is working capital.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
              Lock a Uniswap v4 demo position, get personalized terms computed in a Chainlink CRE enclave,
              and receive automatic vdUSD liquidity — with zero yield disruption.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs text-[var(--color-ink-dim)]">
              <Link href="/positions" className="underline transition-colors hover:text-[var(--color-acid)]">
                Explore Positions
              </Link>
              <span>·</span>
              <Link href="/liquidate" className="underline transition-colors hover:text-[var(--color-acid)]">
                Liquidate Monitor
              </Link>
            </div>
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
