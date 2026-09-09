import { createPublicClient, http, webSocket, type PublicClient } from "viem"
import { loadConfig, parseCliArgs, type RelayerConfig } from "./config"
import { runCreSimulate } from "./simulate"
import { fetchPositionLocked, rpcUsesWebSocket, type PositionLockedEvent } from "./watch"

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

async function handlePositionLocked(
  event: PositionLockedEvent,
  config: RelayerConfig,
): Promise<void> {
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
    const result = await runCreSimulate({
      borrower: event.borrower,
      positionId: event.positionId,
      creWorkflowDir: config.creWorkflowDir,
      creWorkflowName: config.creWorkflowName,
      creTarget: config.creTarget,
      creTriggerIndex: config.creTriggerIndex,
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
    seen.add(key)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("failed to simulate credit terms", { positionId: key, error: message })
  } finally {
    inFlight.delete(key)
  }
}

async function processRange(params: {
  client: PublicClient
  config: RelayerConfig
  fromBlock: bigint
  toBlock: bigint
}): Promise<bigint> {
  const events = await fetchPositionLocked({
    client: params.client,
    vault: params.config.vaultAddress,
    fromBlock: params.fromBlock,
    toBlock: params.toBlock,
  })
  for (const event of events) {
    await handlePositionLocked(event, params.config)
  }
  return params.toBlock
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))
  const config = loadConfig()
  const transport = rpcUsesWebSocket(config.rpcUrl) ? webSocket(config.rpcUrl) : http(config.rpcUrl)
  const client = createPublicClient({ transport })
  const latest = await client.getBlockNumber()
  const fromBlock = args.fromBlock ?? latest

  log("relayer starting", {
    vault: config.vaultAddress,
    rpc: config.rpcUrl,
    once: args.once,
    fromBlock: fromBlock.toString(),
    ws: rpcUsesWebSocket(config.rpcUrl),
  })

  if (args.once) {
    await processRange({ client, config, fromBlock, toBlock: latest })
    return
  }

  let cursor = fromBlock > 0n ? fromBlock - 1n : 0n
  if (rpcUsesWebSocket(config.rpcUrl)) {
    await processRange({ client, config, fromBlock, toBlock: latest })
    cursor = latest
    client.watchContractEvent({
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
                borrower: logItem.args.borrower as `0x${string}`,
                positionId: logItem.args.positionId as bigint,
                timestamp: logItem.args.timestamp as bigint,
                blockNumber: logItem.blockNumber ?? 0n,
                transactionHash: logItem.transactionHash ?? "0x",
                logIndex: logItem.logIndex ?? 0,
              },
              config,
            )
          }
        })()
      },
    })
    log("watching PositionLocked via WebSocket")
    await new Promise(() => undefined)
  }

  log("polling PositionLocked", { intervalMs: config.pollIntervalMs })
  cursor = await processRange({ client, config, fromBlock, toBlock: latest })
  for (;;) {
    await Bun.sleep(config.pollIntervalMs)
    const head = await client.getBlockNumber()
    if (head <= cursor) continue
    cursor = await processRange({
      client,
      config,
      fromBlock: cursor + 1n,
      toBlock: head,
    })
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
