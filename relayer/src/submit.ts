import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  decodeEventLog,
} from "viem"
import { lendingVaultAbi } from "./abi"
import type { CreditTerms } from "./parse-terms"

export type SubmitResult = {
  txHash: Hex
  ltvBps: bigint
  aprBps: bigint
  expiry: bigint
  principal: bigint | undefined
}

export async function loanIsActive(params: {
  client: PublicClient
  vault: Address
  positionId: bigint
}): Promise<boolean> {
  const loan = await params.client.readContract({
    address: params.vault,
    abi: lendingVaultAbi,
    functionName: "getLoan",
    args: [params.positionId],
  })
  return loan.active
}

export async function submitCreditReport(params: {
  publicClient: PublicClient
  walletClient: WalletClient<Transport, Chain, Account>
  vault: Address
  borrower: Address
  positionId: bigint
  terms: CreditTerms
}): Promise<SubmitResult> {
  const hash = await params.walletClient.writeContract({
    address: params.vault,
    abi: lendingVaultAbi,
    functionName: "submitCreditReport",
    args: [
      params.borrower,
      params.positionId,
      params.terms.ltvBps,
      params.terms.aprBps,
      params.terms.expiry,
    ],
  })
  const receipt = await params.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`submitCreditReport reverted (${hash})`)
  }
  let principal: bigint | undefined
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== params.vault.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: lendingVaultAbi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === "CreditReportSubmitted") {
        principal = decoded.args.principal
        break
      }
    } catch {
      continue
    }
  }
  return {
    txHash: hash,
    ltvBps: params.terms.ltvBps,
    aprBps: params.terms.aprBps,
    expiry: params.terms.expiry,
    principal,
  }
}
