import { readFileSync } from "node:fs"
import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { loadConfig, parseCliArgs, type CliArgs, type RelayerConfig } from "./config"
import { parseTerms } from "./parse-terms"
import { runCreSimulate } from "./simulate"
import { loanIsActive, submitCreditReport } from "./submit"
import { fetchPositionLocked, rpcUsesWebSocket, type PositionLockedEvent } from "./watch"

type RelayerContext = {
  config: RelayerConfig
  args: CliArgs
  publicClient: PublicClient
  walletClient: WalletClient<Transport, Chain, Account>
  account: Account
}

const inFlight = new Set<string>()
const seen = new Set<string>()

function eventKey(event: PositionLockedEvent): string {
  return event.positionId.toString()
}

function log(message: string, extra?: Record<string, unknown>): void {
  if (extra === undefined) {
    console.log(message)
    return
  }
  console.log(message, extra)
}

function chainFromId(chainId: number, rpcUrl: string): Chain {
  const httpUrl = rpcUrl.startsWith("http") ? rpcUrl : "http://127.0.0.1:8545"
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [httpUrl], webSocket: rpcUsesWebSocket(rpcUrl) ? [rpcUrl] : undefined } },
  }
}

async function loadTermsStdout(event: PositionLockedEvent, ctx: RelayerContext): Promise<string> {
  if (ctx.args.termsFile !== undefined) {
    log("using --terms-file", { path: ctx.args.termsFile })
    return readFileSync(ctx.args.termsFile, "utf8")
  }
  const result = await runCreSimulate({
    borrower: event.borrower,
    positionId: event.positionId,
    creWorkflowDir: ctx.config.creWorkflowDir,
    creWorkflowName: ctx.config.creWorkflowName,
    creTarget: ctx.config.creTarget,
    creTriggerIndex: ctx.config.creTriggerIndex,
  })
  log("cre workflow simulate finished", {
    exitCode: result.exitCode,
    command: result.command.join(" "),
  })
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  if (result.exitCode !== 0) {
    throw new Error(`cre workflow simulate exited ${result.exitCode}`)
  }
  return result.stdout
}

async function handlePositionLocked(event: PositionLockedEvent, ctx: RelayerContext): Promise<void> {
  const key = eventKey(event)
  if (seen.has(key) || inFlight.has(key)) {
    log("skip duplicate PositionLocked", { positionId: key })
    return
  }
  inFlight.add(key)
  try {
    log("PositionLocked", {
      borrower: event.borrower,
      positionId: key,
      timestamp: event.timestamp.toString(),
      tx: event.transactionHash,
      block: event.blockNumber.toString(),
    })
    if (await loanIsActive({ client: ctx.publicClient, vault: ctx.config.vaultAddress, positionId: event.positionId })) {
      log("skip already reported position", { positionId: key })
      seen.add(key)
      return
    }
    let stdout: string
    try {
      stdout = await loadTermsStdout(event, ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("CRE simulate failed; not submitting", { positionId: key, error: message })
      return
    }
    let terms
    try {
      terms = parseTerms(stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("failed to parse CRE terms; not submitting", { positionId: key, error: message })
      return
    }
    log("parsed terms", {
      ltvBps: terms.ltvBps.toString(),
      aprBps: terms.aprBps.toString(),
      expiry: terms.expiry.toString(),
    })
    const submitted = await submitCreditReport({
      publicClient: ctx.publicClient,
      walletClient: ctx.walletClient,
      vault: ctx.config.vaultAddress,
      borrower: event.borrower,
      positionId: event.positionId,
      terms,
    })
    log("submitCreditReport", {
      tx: submitted.txHash,
      ltvBps: submitted.ltvBps.toString(),
      aprBps: submitted.aprBps.toString(),
      expiry: submitted.expiry.toString(),
      principal: submitted.principal?.toString(),
    })
    seen.add(key)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("failed to process PositionLocked", { positionId: key, error: message })
  } finally {
    inFlight.delete(key)
  }
}

async function processRange(ctx: RelayerContext, fromBlock: bigint, toBlock: bigint): Promise<bigint> {
  const events = await fetchPositionLocked({
    client: ctx.publicClient,
    vault: ctx.config.vaultAddress,
    fromBlock,
    toBlock,
  })
  for (const event of events) {
    await handlePositionLocked(event, ctx)
  }
  return toBlock
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  const config = loadConfig()
  const transport = rpcUsesWebSocket(config.rpcUrl) ? webSocket(config.rpcUrl) : http(config.rpcUrl)
  const publicClient = createPublicClient({ transport })
  const chainId = await publicClient.getChainId()
  const chain = chainFromId(chainId, config.rpcUrl)
  const account = privateKeyToAccount(config.relayerPrivateKey)
  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  })
  const ctx: RelayerContext = { config, args, publicClient, walletClient, account }
  const latest = await publicClient.getBlockNumber()
  const fromBlock = args.fromBlock ?? latest

  log("relayer starting", {
    vault: config.vaultAddress,
    relayer: account.address,
    rpc: config.rpcUrl,
    once: args.once,
    fromBlock: fromBlock.toString(),
    ws: rpcUsesWebSocket(config.rpcUrl),
    termsFile: args.termsFile,
  })

  if (args.once) {
    await processRange(ctx, fromBlock, latest)
    return
  }

  if (rpcUsesWebSocket(config.rpcUrl)) {
    await processRange(ctx, fromBlock, latest)
    publicClient.watchContractEvent({
      address: config.vaultAddress,
      abi: [
        {
          type: "event",
          name: "PositionLocked",
          inputs: [
            { name: "borrower", type: "address", indexed: true },
            { name: "positionId", type: "uint256", indexed: true },
            { name: "timestamp", type: "uint256", indexed: false },
          ],
        },
      ],
      eventName: "PositionLocked",
      onLogs: (logs) => {
        void (async () => {
          for (const logItem of logs) {
            await handlePositionLocked(
              {
                borrower: logItem.args.borrower as Hex,
                positionId: logItem.args.positionId as bigint,
                timestamp: logItem.args.timestamp as bigint,
                blockNumber: logItem.blockNumber ?? 0n,
                transactionHash: logItem.transactionHash ?? "0x",
                logIndex: logItem.logIndex ?? 0,
              },
              ctx,
            )
          }
        })()
      },
    })
    log("watching PositionLocked via WebSocket")
    await new Promise(() => undefined)
  }

  log("polling PositionLocked", { intervalMs: config.pollIntervalMs })
  let cursor = await processRange(ctx, fromBlock, latest)
  for (;;) {
    await Bun.sleep(config.pollIntervalMs)
    const head = await publicClient.getBlockNumber()
    if (head <= cursor) continue
    cursor = await processRange(ctx, cursor + 1n, head)
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
