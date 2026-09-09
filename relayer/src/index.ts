import { readFileSync } from "node:fs"
import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { lendingVaultAbi } from "./abi"
import { loadConfig, parseCliArgs, type CliArgs, type RelayerConfig } from "./config"
import { parseTerms } from "./parse-terms"
import { PendingQueue, type HandleOutcome } from "./queue"
import { runCreSimulate } from "./simulate"
import { loanIsActive, submitCreditReport } from "./submit"
import {
  fetchPositionLocked,
  rpcUsesWebSocket,
  toPositionLockedEvent,
  type PositionLockedEvent,
} from "./watch"

type RelayerContext = {
  config: RelayerConfig
  args: CliArgs
  publicClient: PublicClient
  walletClient: WalletClient<Transport, Chain, Account>
  account: Account
  queue: PendingQueue
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

async function handlePositionLocked(event: PositionLockedEvent, ctx: RelayerContext): Promise<HandleOutcome> {
  const positionId = event.positionId.toString()
  try {
    log("PositionLocked", {
      borrower: event.borrower,
      positionId,
      timestamp: event.timestamp.toString(),
      tx: event.transactionHash,
      block: event.blockNumber.toString(),
    })
    if (await loanIsActive({ client: ctx.publicClient, vault: ctx.config.vaultAddress, positionId: event.positionId })) {
      log("skip already reported position", { positionId })
      return "done"
    }
    const stdout = await loadTermsStdout(event, ctx)
    const terms = parseTerms(stdout)
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
    return "done"
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("failed to process PositionLocked; will retry", { positionId, error: message })
    return "retry"
  }
}

async function enqueueRange(ctx: RelayerContext, fromBlock: bigint, toBlock: bigint): Promise<void> {
  const events = await fetchPositionLocked({
    client: ctx.publicClient,
    vault: ctx.config.vaultAddress,
    fromBlock,
    toBlock,
  })
  for (const event of events) {
    ctx.queue.enqueue(event)
  }
}

function startWatch(ctx: RelayerContext): () => void {
  return ctx.publicClient.watchContractEvent({
    address: ctx.config.vaultAddress,
    abi: lendingVaultAbi,
    eventName: "PositionLocked",
    onLogs: (logs) => {
      for (const item of logs) {
        ctx.queue.enqueue(toPositionLockedEvent(item))
      }
      void ctx.queue.drain((event) => handlePositionLocked(event, ctx)).then((remaining) => {
        if (remaining > 0) {
          log("pending PositionLocked after watch drain", { remaining })
        }
      })
    },
    onError: (error) => {
      console.error("PositionLocked watch error; getLogs poll continues", {
        error: error instanceof Error ? error.message : String(error),
      })
    },
  })
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
  const ctx: RelayerContext = {
    config,
    args,
    publicClient,
    walletClient,
    account,
    queue: new PendingQueue(),
  }
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

  let unwatch: (() => void) | undefined
  if (!args.once && rpcUsesWebSocket(config.rpcUrl)) {
    unwatch = startWatch(ctx)
    log("watching PositionLocked via WebSocket; getLogs poll is the backstop")
  }

  await enqueueRange(ctx, fromBlock, await publicClient.getBlockNumber())
  let remaining = await ctx.queue.drain((event) => handlePositionLocked(event, ctx))
  let cursor = ctx.queue.cursor(await publicClient.getBlockNumber())

  if (args.once) {
    if (remaining > 0) {
      throw new Error(`unprocessed PositionLocked: ${remaining}`)
    }
    return
  }

  log("polling PositionLocked", { intervalMs: config.pollIntervalMs, cursor: cursor.toString() })
  try {
    for (;;) {
      await Bun.sleep(config.pollIntervalMs)
      const head = await publicClient.getBlockNumber()
      if (head > cursor) {
        await enqueueRange(ctx, cursor + 1n, head)
      }
      remaining = await ctx.queue.drain((event) => handlePositionLocked(event, ctx))
      cursor = ctx.queue.cursor(head)
      if (remaining > 0) {
        log("pending PositionLocked", { remaining, cursor: cursor.toString() })
      }
    }
  } finally {
    unwatch?.()
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
