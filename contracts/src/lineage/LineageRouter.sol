// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface ILineagePaths {
    function pathTo(address token) external view returns (address[] memory);
    function poolKeyOf(address token) external view returns (PoolKey memory);
    function rootCurrency() external view returns (address);
}

/**
 * Buys or sells a world along its family line in one unlock: buying `night` (a remix of `mushroom`,
 * a remix of `zelda`) swaps rootCurrency → zelda → mushroom → night, so every buy is also a buy of each
 * ancestor, and every hop pays LineageHook's royalty. Exact input only; the intermediate currencies
 * net to zero inside the PoolManager, so only the first input is paid and the last output taken.
 */
contract LineageRouter is IUnlockCallback {
    struct Route {
        address payer;
        address to;
        Currency input;
        uint256 amountIn;
        uint256 minOut;
        PoolKey[] hops;
    }

    IPoolManager public immutable poolManager;
    ILineagePaths public immutable registry;

    error NotPoolManager();
    error PartialFill(uint256 hop, uint256 spent, uint256 wanted);
    error TooLittleReceived(uint256 amountOut, uint256 minOut);

    constructor(IPoolManager manager, ILineagePaths registry_) {
        poolManager = manager;
        registry = registry_;
    }

    /// Pays `amountIn` of rootCurrency for as much of `world` as the line gives, at least `minOut`.
    function buy(address world, uint256 amountIn, uint256 minOut, address to) external returns (uint256) {
        address[] memory path = registry.pathTo(world);
        PoolKey[] memory hops = new PoolKey[](path.length);
        for (uint256 i; i < path.length; i++) {
            hops[i] = registry.poolKeyOf(path[i]);
        }
        Currency input = Currency.wrap(registry.rootCurrency());
        return _route(Route(msg.sender, to, input, amountIn, minOut, hops));
    }

    /// Sells `amountIn` of `world` back down the line into rootCurrency.
    function sell(address world, uint256 amountIn, uint256 minOut, address to) external returns (uint256) {
        address[] memory path = registry.pathTo(world);
        PoolKey[] memory hops = new PoolKey[](path.length);
        for (uint256 i; i < path.length; i++) {
            hops[i] = registry.poolKeyOf(path[path.length - 1 - i]);
        }
        return _route(Route(msg.sender, to, Currency.wrap(world), amountIn, minOut, hops));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Route memory r = abi.decode(data, (Route));
        Currency current = r.input;
        uint256 amount = r.amountIn;
        for (uint256 i; i < r.hops.length; i++) {
            PoolKey memory key = r.hops[i];
            bool zeroForOne = current == key.currency0;
            BalanceDelta delta = poolManager.swap(
                key,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amount),
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
            (int128 paid, int128 got) = zeroForOne ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
            // A hop that runs out of liquidity would leave the next hop's input unpaid.
            if (uint256(uint128(-paid)) != amount) revert PartialFill(i, uint256(uint128(-paid)), amount);
            amount = uint256(uint128(got));
            current = zeroForOne ? key.currency1 : key.currency0;
        }
        if (amount < r.minOut) revert TooLittleReceived(amount, r.minOut);
        poolManager.sync(r.input);
        IERC20(Currency.unwrap(r.input)).transferFrom(r.payer, address(poolManager), r.amountIn);
        poolManager.settle();
        poolManager.take(current, r.to, amount);
        return abi.encode(amount);
    }

    function _route(Route memory r) private returns (uint256) {
        return abi.decode(poolManager.unlock(abi.encode(r)), (uint256));
    }
}
