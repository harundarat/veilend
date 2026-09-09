export type CreditTerms = {
  ltvBps: bigint
  aprBps: bigint
  expiry: bigint
}

function extractJsonObject(source: string): string {
  const start = source.indexOf("{")
  if (start < 0) {
    throw new Error("no JSON object in CRE output")
  }
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === "\\") {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error("unterminated JSON object in CRE output")
}

export function parseTerms(stdout: string): CreditTerms {
  const marker = /Workflow Simulation Result:\s*/i
  const match = marker.exec(stdout)
  if (match === null || match.index === undefined) {
    throw new Error("no Workflow Simulation Result in CRE output")
  }
  const json = extractJsonObject(stdout.slice(match.index + match[0].length))
  const parsed: unknown = JSON.parse(json)
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workflow Simulation Result is not an object")
  }
  const record = parsed as Record<string, unknown>
  if ("creditScore" in record) {
    throw new Error("refusing CRE output that includes creditScore")
  }
  return {
    ltvBps: requiredUint(record, "ltvBps"),
    aprBps: requiredUint(record, "aprBps"),
    expiry: requiredUint(record, "expiry"),
  }
}

function requiredUint(record: Record<string, unknown>, key: string): bigint {
  const value = record[key]
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`invalid ${key}`)
    }
    return BigInt(value)
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = BigInt(value)
      if (parsed < 0n) throw new Error(`invalid ${key}`)
      return parsed
    } catch {
      throw new Error(`invalid ${key}`)
    }
  }
  throw new Error(`missing ${key}`)
}
