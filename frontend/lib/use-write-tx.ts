"use client";

import type { Abi, Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { useToast } from "@/components/shell/ToastProvider";

export type WriteTxRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export function useWriteTx() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push, update } = useToast();

  return async function runTx(title: string, request: WriteTxRequest) {
    const toastId = push({
      status: "pending",
      title,
      message: "Transaction pending…",
    });
    try {
      if (!publicClient) throw new Error("No public client");
      const hash = await writeContractAsync({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("Transaction reverted.");
      }
      update(toastId, {
        status: "success",
        title: `${title} confirmed`,
        message: undefined,
        txHash: hash,
      });
      return hash;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction reverted.";
      const rejected = /user rejected|denied|rejected the request/i.test(message);
      update(toastId, {
        status: "reverted",
        title: `${title} failed`,
        message: rejected ? "Rejected in wallet." : "Transaction reverted.",
      });
      throw error;
    }
  };
}
