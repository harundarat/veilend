import { type Address, parseAbi } from "viem";

export const ADDRESSES = {
  vault: "0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D" as Address,
  hook: "0xc727Bf24715514A5C574A001AaC0d7c0eC7EC200" as Address,
  positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4" as Address,
  vusd: "0x5a88a2E133251E2F92734e721b13CA6C60De6f09" as Address,
  veur: "0xFbc717e1d5536699afD569860B09aC39C6f16862" as Address,
  vdusd: "0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e" as Address,
} as const;

export const CONTRACTS = [
  {
    label: "Vault",
    address: ADDRESSES.vault,
  },
  {
    label: "Hook",
    address: ADDRESSES.hook,
  },
  {
    label: "PositionManager",
    address: ADDRESSES.positionManager,
  },
  {
    label: "Pool",
    address: "0x8ca493510350e7ae46e05d9d04db161f2d3f0df33ee9f3fdfaf1601477c82042",
  },
] as const;

export const REPO_URL = "https://github.com/harundarat/veilend";
export const README_URL =
  "https://github.com/harundarat/veilend/blob/main/README.md";

export const SAMPLE_POSITION_ID = "39014";
export const FAUCET_AMOUNT = BigInt(1000) * BigInt(10) ** BigInt(18);
export const RELAYER_TIMEOUT_MS = 60_000;
export const LOAN_TOKEN_SYMBOL = "vdUSD";
export const LOAN_TOKEN_DECIMALS = 18;

export const erc721Abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function mint(address to, uint256 amount)",
]);

export const positionManagerAbi = parseAbi([
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)",
]);

export const vaultAbi = parseAbi([
  "function lockPosition(uint256 positionId)",
  "function repayLoan(uint256 positionId)",
  "function getLoan(uint256 positionId) view returns ((address borrower, uint256 positionId, uint256 ltvBps, uint256 aprBps, uint256 expiry, uint256 defaultDeadline, uint256 collateralValue, uint256 principal, bool active, bool locked, bool repaid, bool liquidated))",
]);

export type VaultLoan = {
  borrower: Address;
  positionId: bigint;
  ltvBps: bigint;
  aprBps: bigint;
  expiry: bigint;
  defaultDeadline: bigint;
  collateralValue: bigint;
  principal: bigint;
  active: boolean;
  locked: boolean;
  repaid: boolean;
  liquidated: boolean;
};

export type PoolKeyResult = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export function isDemoPool(poolKey: PoolKeyResult) {
  const tokens = new Set([
    poolKey.currency0.toLowerCase(),
    poolKey.currency1.toLowerCase(),
  ]);
  return (
    poolKey.hooks.toLowerCase() === ADDRESSES.hook.toLowerCase() &&
    tokens.has(ADDRESSES.vusd.toLowerCase()) &&
    tokens.has(ADDRESSES.veur.toLowerCase())
  );
}

export function repayAmountOf(loan: Pick<VaultLoan, "principal" | "aprBps">) {
  return loan.principal + (loan.principal * loan.aprBps) / BigInt(10_000);
}
