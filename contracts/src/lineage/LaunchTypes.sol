// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// The parts of Uniswap's Liquidity Launcher (v3.1.0, 873cbb23) and Continuous Clearing Auction
// (v2.1.0, 7d7602d2) that a world launch touches — the versions deployed on Sepolia. The structs are
// copied field for field: LBPStrategy and the CCA factory abi-decode these exact layouts, so a
// reordered field would start a different auction than the one the registry asked for.

struct PoolParameters {
    uint24 fee;
    int24 tickSpacing;
    address hook;
}

struct MigratorParameters {
    address token;
    address currency;
    uint64 migrationBlock;
    uint128 reservedTokenAmountForLP;
    address recipient;
    address positionRecipient;
    PoolParameters poolParameters;
    bytes positionDefinitions;
    bytes lpAllocationSchedule;
}

struct LiquidityAllocationBracket {
    uint128 lowerThreshold;
    uint24 rate;
}

/// An empty PositionDefinition[] makes LBPStrategy mint one full-range position.
struct PositionDefinition {
    int24 offsetLower;
    int24 offsetUpper;
    uint24 weight;
    address overridePositionRecipient;
}

struct AuctionParameters {
    address currency;
    address tokensRecipient;
    address fundsRecipient;
    uint64 startBlock;
    uint64 endBlock;
    uint64 claimBlock;
    uint256 tickSpacing;
    address validationHook;
    uint256 floorPrice;
    uint128 requiredCurrencyRaised;
    bytes auctionStepsData;
}

interface ILBPStrategy {
    function initializeDistribution(address token, uint256 totalSupply, bytes calldata configData, bytes32 salt)
        external;

    function migrate(address initializer) external;
}

interface IDistributorFactory {
    function getAddress(address token, uint256 amount, bytes calldata configData, bytes32 salt, address sender)
        external
        view
        returns (address);
}

/// LBPStrategy only migrates into a pool whose hook passes ERC-165 for this interface and names the
/// strategy as `authorized` (liquidity-launcher src/interfaces/IInitializerHook.sol).
interface IInitializerHook is IERC165 {
    function authorized() external view returns (address);
}
