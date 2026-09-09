import { bytesToBase64, cre, json, ok, type TeeRuntime } from '@chainlink/cre-sdk'
import {
	decodeFunctionResult,
	encodeFunctionData,
	numberToHex,
	pad,
	parseAbi,
	toEventHash,
	zeroAddress,
} from 'viem'
import { CAP_LIQUIDITY } from './scoring'

type RpcConfig = {
	rpcUrl: string
	positionManager: string
	logsFromBlock: string
}

const LOG_CHUNK_BLOCKS = 40_000n

const POSITION_ABI = parseAbi([
	'function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)',
])

const TRANSFER_TOPIC = toEventHash('Transfer(address,address,uint256)')
const ZERO_TOPIC = pad(zeroAddress, { size: 32 })

type JsonRpcResponse = {
	result?: unknown
	error?: { message?: string }
}

type LogEntry = {
	blockNumber?: string
}

function jsonRpc(runtime: TeeRuntime<RpcConfig>, method: string, params: unknown[]): unknown {
	const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: runtime.config.rpcUrl,
			method: 'POST',
			multiHeaders: {
				'Content-Type': { values: ['application/json'] },
			},
			body: bytesToBase64(new TextEncoder().encode(payload)),
			cacheSettings: { store: false },
		})
		.result()

	if (!ok(response)) {
		throw new Error(`rpc http ${response.statusCode}`)
	}

	const parsed = json(response) as JsonRpcResponse
	if (parsed.error) {
		throw new Error(parsed.error.message ?? 'rpc error')
	}
	return parsed.result
}

function toHexBlock(block: bigint): `0x${string}` {
	return `0x${block.toString(16)}`
}

function readMintLogs(runtime: TeeRuntime<RpcConfig>, tokenId: bigint): LogEntry[] {
	const fromBlock = BigInt(runtime.config.logsFromBlock)
	const latestRaw = jsonRpc(runtime, 'eth_blockNumber', [])
	if (typeof latestRaw !== 'string') {
		throw new Error('latest block missing')
	}
	const latestBlock = BigInt(latestRaw)
	const topic3 = pad(numberToHex(tokenId), { size: 32 })

	for (let start = fromBlock; start <= latestBlock; start += LOG_CHUNK_BLOCKS) {
		let end = start + LOG_CHUNK_BLOCKS - 1n
		if (end > latestBlock) {
			end = latestBlock
		}
		const logs = jsonRpc(runtime, 'eth_getLogs', [
			{
				address: runtime.config.positionManager,
				fromBlock: toHexBlock(start),
				toBlock: toHexBlock(end),
				topics: [TRANSFER_TOPIC, ZERO_TOPIC, null, topic3],
			},
		])
		if (Array.isArray(logs) && logs.length > 0) {
			return logs as LogEntry[]
		}
	}
	throw new Error('mint log not found')
}

function liquidityToScoreInput(liquidity: bigint): number {
	if (liquidity >= BigInt(CAP_LIQUIDITY)) {
		return CAP_LIQUIDITY
	}
	return Number(liquidity)
}

export function readOnchainPosition(
	runtime: TeeRuntime<RpcConfig>,
	positionId: string,
	nowSec: number,
): { liquidity: number; positionAgeDays: number } {
	const tokenId = BigInt(positionId)
	const callData = encodeFunctionData({
		abi: POSITION_ABI,
		functionName: 'getPositionLiquidity',
		args: [tokenId],
	})

	const callResult = jsonRpc(runtime, 'eth_call', [
		{ to: runtime.config.positionManager, data: callData },
		'latest',
	])
	if (typeof callResult !== 'string' || callResult === '0x') {
		throw new Error('empty liquidity result')
	}

	const decoded = decodeFunctionResult({
		abi: POSITION_ABI,
		functionName: 'getPositionLiquidity',
		data: callResult as `0x${string}`,
	})

	const logs = readMintLogs(runtime, tokenId)
	const mintLog = logs[0]
	if (!mintLog.blockNumber) {
		throw new Error('mint log missing block')
	}

	const block = jsonRpc(runtime, 'eth_getBlockByNumber', [mintLog.blockNumber, false]) as {
		timestamp?: string
	} | null
	if (!block?.timestamp) {
		throw new Error('block timestamp missing')
	}

	const mintTimestamp = Number(BigInt(block.timestamp))
	return {
		liquidity: liquidityToScoreInput(decoded),
		positionAgeDays: (nowSec - mintTimestamp) / 86400,
	}
}
