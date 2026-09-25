// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IInitializerHook} from "./LaunchTypes.sol";

interface ILineageRegistry {
    function worldOfPool(PoolKey calldata key) external view returns (address);
    function parentOf(address token) external view returns (address);
    function ownerOf(address token) external view returns (address);
}

/**
 * The hook on every world's v4 pool. Two jobs:
 *
 * - beforeInitialize: only LBPStrategy (the graduation of a world's auction) may open a pool, and only
 *   for a pool the registry recognises as a world paired with its parent's token. Nobody can open a
 *   pool under this hook that fakes a lineage.
 * - afterSwap: takes a 1% royalty on the swap's unspecified side and splits it up the family line —
 *   half to the world, 30% to its parent, 20% to its grandparent (a missing ancestor's share stays
 *   with the world). Royalties accrue per world and are paid to whoever holds the world's ENS name
 *   when someone calls `claim`, so the name is the royalty right.
 *
 * The hook never needs to know who the trader is, so it ignores `sender` (a router, not a person).
 */
contract LineageHook is BaseHook, IInitializerHook {
    using PoolIdLibrary for PoolKey;

    /// Hundredths of a bip of the unspecified amount: 10_000 = 1%.
    uint256 public constant ROYALTY_PIPS = 10_000;
    uint256 private constant PIPS = 1_000_000;
    uint256 private constant PARENT_SHARE = 30;
    uint256 private constant GRANDPARENT_SHARE = 20;

    /// LBPStrategy: the only address that may initialize a pool under this hook.
    address public immutable authorized;
    ILineageRegistry public immutable registry;

    mapping(PoolId => address) public worldOf;
    mapping(address world => mapping(Currency => uint256)) public owed;

    event Royalty(address indexed world, Currency indexed currency, uint256 amount);
    event Claimed(address indexed world, Currency indexed currency, address indexed to, uint256 amount);

    error InvalidInitializer(address caller, address expected);
    error NotAWorldPool();
    error NoOwner(address world);

    constructor(IPoolManager manager, address strategy, ILineageRegistry registry_) BaseHook(manager) {
        authorized = strategy;
        registry = registry_;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// Pays a world's accrued royalty in `currency` to the current holder of its ENS name.
    function claim(address world, Currency currency) external returns (uint256 amount) {
        address to = registry.ownerOf(world);
        if (to == address(0)) revert NoOwner(world);
        amount = owed[world][currency];
        owed[world][currency] = 0;
        if (amount > 0) currency.transfer(to, amount);
        emit Claimed(world, currency, to, amount);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IInitializerHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal override returns (bytes4) {
        if (sender != authorized) revert InvalidInitializer(sender, authorized);
        address world = registry.worldOfPool(key);
        if (world == address(0)) revert NotAWorldPool();
        worldOf[key.toId()] = world;
        return IHooks.beforeInitialize.selector;
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        // The unspecified side: the output of an exact-input swap, the input of an exact-output one.
        bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        (Currency currency, int128 amount) =
            specifiedIs0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());
        if (amount < 0) amount = -amount;
        uint256 royalty = uint256(uint128(amount)) * ROYALTY_PIPS / PIPS;
        if (royalty == 0) return (IHooks.afterSwap.selector, 0);
        poolManager.take(currency, address(this), royalty);
        _split(worldOf[key.toId()], currency, royalty);
        // royalty < |amount| ≤ 2^127, so it fits the int128 the PoolManager expects.
        return (IHooks.afterSwap.selector, int128(int256(royalty)));
    }

    function _split(address world, Currency currency, uint256 royalty) private {
        address parent = registry.parentOf(world);
        address grandparent = parent == address(0) ? address(0) : registry.parentOf(parent);
        uint256 toParent = parent == address(0) ? 0 : royalty * PARENT_SHARE / 100;
        uint256 toGrandparent = grandparent == address(0) ? 0 : royalty * GRANDPARENT_SHARE / 100;
        _credit(parent, currency, toParent);
        _credit(grandparent, currency, toGrandparent);
        _credit(world, currency, royalty - toParent - toGrandparent);
    }

    function _credit(address world, Currency currency, uint256 amount) private {
        if (amount == 0) return;
        owed[world][currency] += amount;
        emit Royalty(world, currency, amount);
    }
}
