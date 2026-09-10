"use client";

import { useSyncExternalStore } from "react";
import { sepolia } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { isSupportedChainId } from "./wagmi";

const emptySubscribe = () => () => {};

export type WalletUiState = "disconnected" | "connected" | "wrong-network";
export type ChainName = "Sepolia" | "Anvil";

export function useWalletUi() {
  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const connected = ready && isConnected && Boolean(address);
  const supported = isSupportedChainId(chainId);
  const state: WalletUiState = !connected
    ? "disconnected"
    : supported
      ? "connected"
      : "wrong-network";
  const chain: ChainName = chainId === 31337 ? "Anvil" : "Sepolia";
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
      connect({ connector });
    },
    disconnect,
    switchNetwork: () => switchChain({ chainId: sepolia.id }),
  };
}
