import { describe, expect } from 'bun:test'
import type { HTTPPayload, TeeRuntime } from '@chainlink/cre-sdk'
import { test } from '@chainlink/cre-sdk/test'
import { initWorkflow, onHttpTrigger, parseCreditRequest, type Config } from './workflow'

const API_TOKEN = 'test-token'
const NOW = new Date('2026-09-09T00:00:00.000Z')

const makeConfig = (): Config => ({
	authorizedKeys: [],
	secretId: 'API_TOKEN',
	wallets: {
		'0xB34a4eAECB848d573a0410bc305787d5B69328B8': {
			pastLoansCount: 8,
			onTimeRepaymentRate: 0.98,
		},
		'0x1111111111111111111111111111111111111111': {
			pastLoansCount: 4,
			onTimeRepaymentRate: 0.85,
		},
		'0x2222222222222222222222222222222222222222': {
			pastLoansCount: 5,
			onTimeRepaymentRate: 0.6,
		},
	},
	demoPositions: {
		'1000001': { liquidity: 1_000_000, mintTimestamp: 1_000_000_000 },
		'1000002': { liquidity: 500_000, mintTimestamp: 1_785_033_600 },
		'1000003': { liquidity: 100_000, mintTimestamp: 1_788_921_600 },
	},
})

const encodeInput = (body: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(body))

const makePayload = (body: unknown): HTTPPayload =>
	({
		input: encodeInput(body),
	}) as HTTPPayload

const makeFakeTeeRuntime = () => {
	let secretCalls = 0
	const logs: string[] = []

	const runtime = {
		config: makeConfig(),
		getSecret: (request: { id?: string }) => {
			secretCalls += 1
			return {
				result: () => ({ id: request.id, value: API_TOKEN }),
			}
		},
		now: () => NOW,
		log: (message: string) => logs.push(message),
	}

	return {
		runtime: runtime as unknown as TeeRuntime<Config>,
		logs,
		secretCalls: () => secretCalls,
	}
}

describe('parseCreditRequest', () => {
	test('normalizes positionId to a uint256 decimal string', () => {
		const request = parseCreditRequest(makePayload({ borrower: '0xAbc', positionId: '1000001' }))
		expect(request.borrower).toBe('0xAbc')
		expect(request.positionId).toBe('1000001')
	})
})

describe('onHttpTrigger', () => {
	test('returns terms only after fetching a secret', () => {
		const { runtime, logs, secretCalls } = makeFakeTeeRuntime()
		const terms = onHttpTrigger(
			runtime,
			makePayload({
				borrower: '0xB34a4eAECB848d573a0410bc305787d5B69328B8',
				positionId: '1000001',
			}),
		)

		expect(secretCalls()).toBe(1)
		expect(terms.ltvBps).toBe(7000)
		expect(terms.aprBps).toBe(500)
		expect(terms.expiry).toBe(Math.floor(NOW.getTime() / 1000) + 3600)
		expect('creditScore' in terms).toBe(false)
		expect(Object.keys(terms).sort()).toEqual(['aprBps', 'expiry', 'ltvBps'])
		expect(logs.join('\n')).toContain('terms computed')
		expect(logs.join('\n')).toContain('dataSource=config')
		expect(logs.join('\n')).not.toContain(API_TOKEN)
	})
})

describe('initWorkflow', () => {
	test('registers the HTTP handler with a Nitro TEE constraint', () => {
		const handlers = initWorkflow(makeConfig())

		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onHttpTrigger)
		expect(handlers[0].requirements).toBeDefined()
	})
})
