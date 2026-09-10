import { createConfig, http } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const supportedChains = [sepolia, foundry] as const;

export const config = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
    [foundry.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export function isSupportedChainId(chainId: number) {
  return chainId === sepolia.id || chainId === foundry.id;
}
