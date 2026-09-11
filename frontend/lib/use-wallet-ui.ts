"use client";

import { useSyncExternalStore } from "react";
import { sepolia } from "wagmi/chains";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { isSupportedChainId } from "./wagmi";

const emptySubscribe = () => () => {};

export type WalletUiState = "disconnected" | "connected" | "wrong-network";
export type ChainName = "Sepolia";

export function useWalletUi() {
  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const connected = ready && isConnected && Boolean(address);
  const supported = chainId !== undefined && isSupportedChainId(chainId);
  const state: WalletUiState = !connected
    ? "disconnected"
    : supported
      ? "connected"
      : "wrong-network";
  const chain: ChainName = "Sepolia";
  const connector = connectors[0];

  return {
    ready,
    state,
    address: connected ? address : undefined,
    chain,
    isPending,
    isSwitching,
    error: error?.message,
    connect: () => {
      if (!connector) return;
      connect({ connector, chainId: sepolia.id });
    },
    disconnect,
    switchNetwork: () => switchChain({ chainId: sepolia.id }),
  };
}
