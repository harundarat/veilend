import { cre, decodeJson, type HTTPPayload, type TeeRuntime } from '@chainlink/cre-sdk'
import { z } from 'zod'
import {
	CAP_LIQUIDITY,
	lookupHistory,
	scoreToTerms,
	type CreditTerms,
	type HistoryProfile,
} from './scoring'

export const configSchema = z.object({
	authorizedKeys: z.array(
		z.object({
			type: z.string(),
			publicKey: z.string(),
		}),
	),
	secretId: z.string(),
})
export type Config = z.infer<typeof configSchema>

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

	const wallets: Record<string, HistoryProfile> = {}
	const history = lookupHistory(request.borrower, wallets)
	const nowSec = Math.floor(runtime.now().getTime() / 1000)
	const terms = scoreToTerms({
		liquidity: CAP_LIQUIDITY / 2,
		positionAgeDays: 30,
		pastLoansCount: history.pastLoansCount,
		onTimeRepaymentRate: history.onTimeRepaymentRate,
		nowSec,
	})

	runtime.log(`terms computed ltvBps=${terms.ltvBps} aprBps=${terms.aprBps} expiry=${terms.expiry}`)
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
