import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseTerms } from "../src/parse-terms"

const fixture = readFileSync(
  resolve(import.meta.dir, "../../docs/cre-simulation/wallet-a.log"),
  "utf8",
)

describe("parseTerms", () => {
  test("reads ltvBps, aprBps, expiry from Workflow Simulation Result", () => {
    const terms = parseTerms(fixture)
    expect(terms.ltvBps).toBe(7000n)
    expect(terms.aprBps).toBe(500n)
    expect(terms.expiry).toBe(1788924365n)
  })

  test("does not use the USER LOG line as terms", () => {
    const terms = parseTerms(`
2026-09-09T09:26:06Z [USER LOG] terms computed ltvBps=1 aprBps=2 expiry=3 dataSource=config
✓ Workflow Simulation Result:
{
  "aprBps": 500,
  "expiry": 1788924365,
  "ltvBps": 7000
}
`)
    expect(terms).toEqual({ ltvBps: 7000n, aprBps: 500n, expiry: 1788924365n })
  })

  test("throws when the simulation result is missing", () => {
    expect(() => parseTerms("[USER LOG] terms computed ltvBps=7000 aprBps=500 expiry=1")).toThrow(
      /Workflow Simulation Result/,
    )
  })

  test("throws when creditScore is present", () => {
    expect(() =>
      parseTerms(`Workflow Simulation Result:
{"ltvBps":7000,"aprBps":500,"expiry":1,"creditScore":91}`),
    ).toThrow(/creditScore/)
  })
})
