import { cre, decodeJson, type HTTPPayload, type TeeRuntime } from '@chainlink/cre-sdk'
import { z } from 'zod'
import {
	CAP_LIQUIDITY,
	lookupHistory,
	scoreToTerms,
	type CreditTerms,
	type HistoryProfile,
} from './scoring'

const historyProfileSchema = z.object({
	pastLoansCount: z.number(),
	onTimeRepaymentRate: z.number(),
})

const demoPositionSchema = z.object({
	liquidity: z.number(),
	mintTimestamp: z.number(),
})

export const configSchema = z.object({
	authorizedKeys: z.array(
		z.object({
			type: z.string(),
			publicKey: z.string(),
		}),
	),
	secretId: z.string(),
	wallets: z.record(historyProfileSchema),
	demoPositions: z.record(demoPositionSchema),
})
export type Config = z.infer<typeof configSchema>

export type LpInputs = {
	liquidity: number
	positionAgeDays: number
	dataSource: 'config' | 'default'
}

export function resolveLpInputs(config: Config, positionId: string, nowSec: number): LpInputs {
	const demo = config.demoPositions[positionId]
	if (demo) {
		return {
			liquidity: demo.liquidity,
			positionAgeDays: (nowSec - demo.mintTimestamp) / 86400,
			dataSource: 'config',
		}
	}
	return {
		liquidity: CAP_LIQUIDITY / 2,
		positionAgeDays: 30,
		dataSource: 'default',
	}
}

export type CreditRequest = {
	borrower: string
	positionId: string
}

export function parseCreditRequest(payload: HTTPPayload): CreditRequest {
	if (!payload.input || payload.input.length === 0) {
		throw new Error('empty HTTP payload')
	}
	const body = decodeJson(payload.input) as { borrower?: unknown; positionId?: unknown }
	if (typeof body.borrower !== 'string' || body.borrower.length === 0) {
		throw new Error('invalid borrower')
	}
	const rawId = body.positionId
	const idText = typeof rawId === 'number' ? String(rawId) : typeof rawId === 'string' ? rawId : ''
	if (idText.length === 0) {
		throw new Error('invalid positionId')
	}
	const positionId = BigInt(idText)
	if (positionId < 0n) {
		throw new Error('invalid positionId')
	}
	return { borrower: body.borrower, positionId: positionId.toString() }
}

export const onHttpTrigger = (runtime: TeeRuntime<Config>, payload: HTTPPayload): CreditTerms => {
	const request = parseCreditRequest(payload)
	runtime.getSecret({ id: runtime.config.secretId }).result().value

	const history = lookupHistory(request.borrower, runtime.config.wallets as Record<string, HistoryProfile>)
	const nowSec = Math.floor(runtime.now().getTime() / 1000)
	const lp = resolveLpInputs(runtime.config, request.positionId, nowSec)
	const terms = scoreToTerms({
		liquidity: lp.liquidity,
		positionAgeDays: lp.positionAgeDays,
		pastLoansCount: history.pastLoansCount,
		onTimeRepaymentRate: history.onTimeRepaymentRate,
		nowSec,
	})

	runtime.log(
		`terms computed ltvBps=${terms.ltvBps} aprBps=${terms.aprBps} expiry=${terms.expiry} dataSource=${lp.dataSource}`,
	)
	return terms
}

export function initWorkflow(config: Config) {
	const httpTrigger = new cre.capabilities.HTTPCapability()

	return [
		cre.handlerInTee(
			httpTrigger.trigger(
				config.authorizedKeys.length === 0
					? {}
					: {
							authorizedKeys: config.authorizedKeys.map((key) => ({
								type: 'KEY_TYPE_ECDSA_EVM' as const,
								publicKey: key.publicKey,
							})),
						},
			),
			onHttpTrigger,
			[{ tee: 'nitro', regions: ['us-west-2'] }],
		),
	]
}
