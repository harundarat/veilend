export const CAP_LIQUIDITY = 1_000_000
export const AGE_CAP_DAYS = 90
export const MIN_LOANS_FOR_FULL_TRUST = 3
export const W_POSITION = 0.4
export const W_HISTORY = 0.6
export const QUOTE_TTL_SEC = 3600

export const UNKNOWN_HISTORY: HistoryProfile = {
  pastLoansCount: 0,
  onTimeRepaymentRate: 0.75,
}

export type HistoryProfile = {
  pastLoansCount: number
  onTimeRepaymentRate: number
}

export type ScoreInputs = {
  liquidity: number
  positionAgeDays: number
  pastLoansCount: number
  onTimeRepaymentRate: number
  nowSec: number
}

export type CreditTerms = {
  ltvBps: number
  aprBps: number
  expiry: number
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase()
}

export function lookupHistory(
  borrower: string,
  wallets: Record<string, HistoryProfile>,
): HistoryProfile {
  const needle = normalizeAddress(borrower)
  for (const [address, profile] of Object.entries(wallets)) {
    if (normalizeAddress(address) === needle) {
      return profile
    }
  }
  return { ...UNKNOWN_HISTORY }
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }
  return value
}

function mapTier(creditScore: number): { ltvBps: number; aprBps: number } {
  if (creditScore >= 80) {
    return { ltvBps: 7000, aprBps: 500 }
  }
  if (creditScore >= 60) {
    return { ltvBps: 5500, aprBps: 800 }
  }
  if (creditScore >= 40) {
    return { ltvBps: 4000, aprBps: 1200 }
  }
  return { ltvBps: 2000, aprBps: 1800 }
}

export function scoreToTerms(input: ScoreInputs): CreditTerms {
  const liquidity = clampNonNegative(input.liquidity)
  const positionAgeDays = clampNonNegative(input.positionAgeDays)

  const sizeScore = Math.min(liquidity / CAP_LIQUIDITY, 1) * 100
  const ageScore = Math.min(positionAgeDays / AGE_CAP_DAYS, 1) * 100
  const positionScore = 0.5 * sizeScore + 0.5 * ageScore

  let riskHistoryScore = input.onTimeRepaymentRate * 100
  if (input.pastLoansCount < MIN_LOANS_FOR_FULL_TRUST) {
    riskHistoryScore = Math.min(riskHistoryScore, 70)
  }

  const creditScore = W_POSITION * positionScore + W_HISTORY * riskHistoryScore
  const { ltvBps, aprBps } = mapTier(creditScore)
  const expiry = Math.floor(input.nowSec) + QUOTE_TTL_SEC

  return { ltvBps, aprBps, expiry }
}
