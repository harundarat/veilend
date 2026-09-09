import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Address, Hex } from "viem"

const relayerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = resolve(relayerDir, "..")

export type RelayerConfig = {
  rpcUrl: string
  relayerPrivateKey: Hex
  vaultAddress: Address
  creWorkflowDir: string
  creWorkflowName: string
  creTarget: string
  creTriggerIndex: number
  pollIntervalMs: number
}

export type CliArgs = {
  once: boolean
  fromBlock: bigint | undefined
  termsFile: string | undefined
}

export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, "utf8")
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function loadRelayerEnv(): void {
  loadEnvFile(resolve(relayerDir, ".env"))
}

export function parseCliArgs(argv: string[]): CliArgs {
  let once = false
  let fromBlock: bigint | undefined
  let termsFile: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--once") {
      once = true
      continue
    }
    if (arg === "--from-block") {
      const value = argv[++i]
      if (value === undefined) throw new Error("--from-block requires a number")
      fromBlock = BigInt(value)
      continue
    }
    if (arg.startsWith("--from-block=")) {
      fromBlock = BigInt(arg.slice("--from-block=".length))
      continue
    }
    if (arg === "--terms-file") {
      const value = argv[++i]
      if (value === undefined) throw new Error("--terms-file requires a path")
      termsFile = value
      continue
    }
    if (arg.startsWith("--terms-file=")) {
      termsFile = arg.slice("--terms-file=".length)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }
  if (termsFile !== undefined && !isAbsolute(termsFile)) {
    termsFile = resolve(process.cwd(), termsFile)
  }
  return { once, fromBlock, termsFile }
}

export function loadConfig(): RelayerConfig {
  loadRelayerEnv()
  const rpcUrl = required("RPC_URL")
  const relayerPrivateKey = required("RELAYER_PRIVATE_KEY") as Hex
  if (!relayerPrivateKey.startsWith("0x") || relayerPrivateKey.length !== 66) {
    throw new Error("RELAYER_PRIVATE_KEY must be a 32-byte 0x-prefixed hex key")
  }
  const vaultAddress = required("VAULT_ADDRESS") as Address
  const creWorkflowDir = resolvePath(optional("CRE_WORKFLOW_DIR", resolve(repoRoot, "cre-workflow")))
  const creWorkflowName = optional("CRE_WORKFLOW_NAME", "credit-scoring-workflow")
  const creTarget = optional("CRE_TARGET", "staging-settings")
  const creTriggerIndex = Number(optional("CRE_TRIGGER_INDEX", "0"))
  const pollIntervalMs = Number(optional("POLL_INTERVAL_MS", "6000"))
  if (!Number.isInteger(creTriggerIndex) || creTriggerIndex < 0) {
    throw new Error("CRE_TRIGGER_INDEX must be a non-negative integer")
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 4000 || pollIntervalMs > 8000) {
    throw new Error("POLL_INTERVAL_MS must be between 4000 and 8000")
  }
  return {
    rpcUrl,
    relayerPrivateKey,
    vaultAddress,
    creWorkflowDir,
    creWorkflowName,
    creTarget,
    creTriggerIndex,
    pollIntervalMs,
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`missing env ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) return fallback
  return value
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(relayerDir, path)
}
