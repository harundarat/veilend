# Uniswap developer feedback (ETHOnline 2026)

This is feedback on **Uniswap v4 documentation and tooling**, from building a hook that locks liquidity on a PositionManager NFT. Veilend is a small lending demo (LP as collateral); the product itself is out of scope here.

## What we used

- Official [v4-template](https://github.com/uniswapfoundation/v4-template): Foundry layout, `BaseHook`, local `Deployers` / Anvil v4 stack, and the CREATE2 / flag-mining path.
- **HookMiner** (via the template / hookmate) to mine an address with `BEFORE_REMOVE_LIQUIDITY_FLAG` only.
- Uniswap v4 **PoolManager** and **PositionManager** on Ethereum Sepolia (`0xE03A1074…3543` / `0x429ba701…09b4`).
- A single hook permission: `beforeRemoveLiquidity`.
- PositionManager as an ERC-721: `approve(vault, tokenId)` at lock time, then `transferFrom` on default.

We replaced the template’s Counter `beforeSwap` / `afterSwap` example with `CollateralLockHook`. The rest of the harness (pool initialize, mint via PositionManager, `EasyPosm`) stayed.

## What helped

**The template is the right on-ramp.** `BaseHook`, `getHookPermissions()`, and “deploy to an address whose bits match the flags” are explained well enough that a first hook compiles. HookMiner + CREATE2 is tedious but the template makes it mechanical instead of mystical.

**`ModifyLiquidityParams.salt` is how a hook sees an NFT.** PositionManager sets `salt = bytes32(tokenId)` on `modifyLiquidity`. Once we knew that, the lock map is just `uint256(params.salt)`. That one fact is the difference between a working position lock and a hook that cannot tell *which* LP is being decreased.

**`liquidityDelta` distinguishes collect vs remove.** `liquidityDelta < 0` is a decrease; `liquidityDelta == 0` is collect-fees. One permission (`beforeRemoveLiquidity`) can block unwind and still let a locked position earn. That is a good hook-design affordance. It is not obvious from the Counter example, which never touches liquidity.

**Sepolia addresses in the template / docs were current enough** to initialize our own pool against the canonical PoolManager rather than a second local stack.

## What cost time

### 1. Hooks attach to pools, not to positions

This is in the v4 overview, but it is easy to miss until you try to lock “any Uniswap v4 LP.” A hook is a field on `PoolKey`. `beforeRemoveLiquidity` **never runs** for a position minted on a pool that was initialized without that hook. Existing Sepolia ETH/USDC (or any official pool) cannot be collateral for a third-party lock hook.

We spent a design day on whether `ISubscriber` on PositionManager could substitute. It cannot: it is a notifier, the user can `unsubscribe`, and `transferFrom` drops the subscriber. That distinction — **hook = enforcement, subscriber = callback** — should be a warning box on both the hooks and PositionManager pages.

Because of this, our MVP collateral is **only** a demo pool we `initialize` ourselves. That is a protocol limitation of v4, not an implementation bug, and it should be louder in hackathon / “build a hook” docs.

### 2. PositionManager does not store a mint timestamp

`PositionInfo` is a packed `poolId + ticks + subscriber flag`. There is no `createdAt`. Anything that needs position age (we did) must scan `Transfer(from=address(0))` logs and then `eth_getBlockByNumber` for the timestamp. That is a lot of RPC for a field many apps assume exists. A one-line note on the PositionManager / `PositionInfo` page would have saved the search.

### 3. The NFT ↔ hook mapping is under-documented

Once you know `salt = bytes32(tokenId)`, the design is clean. Until then, it is reasonable to look for `tokenId` on `ModifyLiquidityParams`, or to assume the hook sees the PositionManager caller and can query “which NFT?” It cannot. Docs for `beforeAddLiquidity` / `beforeRemoveLiquidity` should show a PositionManager mint, then a decrease, and print `params.salt`.

The template Counter never exercises liquidity hooks, so this mapping is not in the first file people copy.

### 4. Approval is not a lock

PositionManager NFTs behave like ordinary ERC-721: `approve` / `setApprovalForAll` / `transferFrom` work. That is good. There is no “approval that survives revoke for the life of a loan.” A borrower who `approve`s a vault can `approve(0)` later; a later `transferFrom` fails. If Uniswap wants hooks + PositionManager used as collateral rails, the docs should say so explicitly: **approval is not custody**, and **a hook cannot see ERC-721 approval changes**.

Related: because our lock is a flag (NFT stays with the borrower), any unwind path that does **not** go through `modifyLiquidity` on that pool is invisible to the hook. Peripheral routers / future position managers are a residual risk. A short “what a liquidity hook cannot see” section would be more useful than another `beforeSwap` tutorial.

### 5. Small docs/tooling nicks

- Local Anvil vs Sepolia: template scripts default to live addresses; swapping in locally deployed PoolManager/PositionManager is easy to get wrong if `test/utils/Deployers.sol` and `script/` drift.
- Hook address mining errors (wrong flags, wrong CREATE2 salt) surface as opaque revert data unless you already know to check `Hooks.validateHookPermissions`. A template comment next to `HookMiner.find` listing the usual failures would help.
- Collect-fee vs decrease is specified in core, but hackathon docs still lead with swap hooks. A second official example — “block remove, allow collect” — would match a lot of collateral / restaking / lending experiments.

## Suggestions for Uniswap docs

1. **Page or callout: “Hooks are on the pool, not the NFT.”** Include: you cannot retrofit a hook onto an existing pool; `ISubscriber` is not a lock; collateral products need their own `initialize`.
2. **Liquidity-hook example in the template** (even a 30-line `beforeRemoveLiquidity`) that mints via PositionManager and logs `params.salt` / `liquidityDelta`.
3. **`PositionInfo` field list** that states mint time is *not* stored, and points at the ERC-721 `Transfer` mint log if you need age.
4. **Collateral / custody note:** PositionManager `approve` + `transferFrom` are standard ERC-721; they are revocable; a hook does not observe approval.
5. Keep HookMiner + v4-template as the default path. That part is already good.

We would send reviewers to this file at the repo root: [`FEEDBACK.md`](FEEDBACK.md).
