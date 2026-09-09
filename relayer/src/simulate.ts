import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import type { Address } from "viem"

export type SimulateInput = {
  borrower: Address
  positionId: bigint
  creWorkflowDir: string
  creWorkflowName: string
  creTarget: string
  creTriggerIndex: number
}

export type SimulateResult = {
  stdout: string
  stderr: string
  exitCode: number
  command: string[]
}

function creBinary(): string {
  const fromEnv = process.env.CRE_BIN
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const homeBin = resolve(homedir(), ".cre/bin/cre")
  if (existsSync(homeBin)) return homeBin
  return "cre"
}

export async function runCreSimulate(input: SimulateInput): Promise<SimulateResult> {
  const payload = JSON.stringify({
    borrower: input.borrower,
    positionId: input.positionId.toString(),
  })
  const command = [
    creBinary(),
    "workflow",
    "simulate",
    input.creWorkflowName,
    "--target",
    input.creTarget,
    "--non-interactive",
    "--trigger-index",
    String(input.creTriggerIndex),
    "--http-payload",
    payload,
  ]
  const proc = Bun.spawn(command, {
    cwd: input.creWorkflowDir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode, command }
}
