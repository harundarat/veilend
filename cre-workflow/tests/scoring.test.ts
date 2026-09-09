import { describe, expect, test } from "bun:test"
import {
  CAP_LIQUIDITY,
  lookupHistory,
  scoreToTerms,
  type HistoryProfile,
} from "../scoring"

const NOW_SEC = 1_788_921_600

const WALLET_A = "0xB34a4eAECB848d573a0410bc305787d5B69328B8"
const WALLET_C = "0x2222222222222222222222222222222222222222"
const UNKNOWN = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

const wallets: Record<string, HistoryProfile> = {
  [WALLET_A]: { pastLoansCount: 8, onTimeRepaymentRate: 0.98 },
  "0x1111111111111111111111111111111111111111": {
    pastLoansCount: 4,
    onTimeRepaymentRate: 0.85,
  },
  [WALLET_C]: { pastLoansCount: 5, onTimeRepaymentRate: 0.6 },
}

describe("scoreToTerms", () => {
  test("Wallet A at CAP liquidity and age >= 90 maps to tier 1", () => {
    const history = lookupHistory(WALLET_A, wallets)
    const terms = scoreToTerms({
      liquidity: CAP_LIQUIDITY,
      positionAgeDays: 90,
      pastLoansCount: history.pastLoansCount,
      onTimeRepaymentRate: history.onTimeRepaymentRate,
      nowSec: NOW_SEC,
    })
    expect(terms.ltvBps).toBe(7000)
    expect(terms.aprBps).toBe(500)
    expect(terms.expiry).toBe(NOW_SEC + 3600)
  })

  test("Wallet C with small liquidity and age 0 maps to tier 4", () => {
    const history = lookupHistory(WALLET_C, wallets)
    const terms = scoreToTerms({
      liquidity: 100_000,
      positionAgeDays: 0,
      pastLoansCount: history.pastLoansCount,
      onTimeRepaymentRate: history.onTimeRepaymentRate,
      nowSec: NOW_SEC,
    })
    expect(terms.ltvBps).toBe(2000)
    expect(terms.aprBps).toBe(1800)
  })

  test("unknown wallet history is capped at 70", () => {
    const history = lookupHistory(UNKNOWN, wallets)
    expect(history.pastLoansCount).toBe(0)
    expect(history.onTimeRepaymentRate).toBe(0.75)

    const terms = scoreToTerms({
      liquidity: CAP_LIQUIDITY,
      positionAgeDays: 90,
      pastLoansCount: history.pastLoansCount,
      onTimeRepaymentRate: history.onTimeRepaymentRate,
      nowSec: NOW_SEC,
    })
    // positionScore=100, riskHistoryScore=min(75,70)=70, creditScore=82 → tier 1
    expect(terms.ltvBps).toBe(7000)
    expect(terms.aprBps).toBe(500)
  })

  test("liquidity 0 does not throw and scores size as 0", () => {
    expect(() =>
      scoreToTerms({
        liquidity: 0,
        positionAgeDays: 90,
        pastLoansCount: 8,
        onTimeRepaymentRate: 0.98,
        nowSec: NOW_SEC,
      }),
    ).not.toThrow()
  })

  test("terms object has no creditScore field", () => {
    const terms = scoreToTerms({
      liquidity: CAP_LIQUIDITY,
      positionAgeDays: 90,
      pastLoansCount: 8,
      onTimeRepaymentRate: 0.98,
      nowSec: NOW_SEC,
    })
    expect("creditScore" in terms).toBe(false)
    expect(Object.keys(terms).sort()).toEqual(["aprBps", "expiry", "ltvBps"])
  })

  test("unknown wallet with liquidity 0 and age 0 maps to 4000/1200", () => {
    const history = lookupHistory(UNKNOWN, wallets)
    const terms = scoreToTerms({
      liquidity: 0,
      positionAgeDays: 0,
      pastLoansCount: history.pastLoansCount,
      onTimeRepaymentRate: history.onTimeRepaymentRate,
      nowSec: NOW_SEC,
    })
    expect(terms.ltvBps).toBe(4000)
    expect(terms.aprBps).toBe(1200)
  })
})
