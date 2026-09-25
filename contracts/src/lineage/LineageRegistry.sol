// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {EnsRoles, Grant, IEnsRegistry, IEnsResolver, IVerifiableFactory} from "./EnsTypes.sol";
import {
    AuctionParameters,
    IDistributorFactory,
    ILBPStrategy,
    LiquidityAllocationBracket,
    MigratorParameters,
    PoolParameters,
    PositionDefinition
} from "./LaunchTypes.sol";
import {WorldToken} from "./WorldToken.sol";

/**
 * The lineage market's source of truth. Launching a world does three things in one transaction:
 *
 * - names it in ENSv2 under its parent world's name (`mushroom.zelda.<root>.eth`), so the name tree is
 *   the remix tree. Every registry in the tree is made by this contract, which keeps only the right to
 *   register new labels and set a registry's parent — no role that can repoint, take back or upgrade a
 *   name. So every world's name is an emancipated ENSv2 token: its holder can transfer it safely, and
 *   nobody, this contract included, can cut a branch out of the tree.
 * - mints its token and hands all of it to Uniswap's LBPStrategy, which runs a Continuous Clearing
 *   Auction priced in the parent world's token (a first-generation world is priced in rootCurrency)
 *   and, once the auction graduates, seeds a v4 pool that LineageHook guards and takes royalties on.
 * - writes the text records the app already reads (cartridge, version, sha256 hash) plus the token and
 *   the auction. Content never goes on chain.
 *
 * Whoever holds a world's ENS name may publish its revisions and is who its royalties are paid to.
 * Launching is open to anyone; a label is first come, first served under its parent.
 */
contract LineageRegistry {
    struct World {
        address parent; // the parent world's token; address(0) for a first-generation world
        address currency; // what it trades against: the parent's token, or rootCurrency
        address auction; // its Continuous Clearing Auction
        address entryRegistry; // the ENS registry holding its label
        address subregistry; // the ENS registry holding its remixes' labels, made at launch
        uint256 labelId;
        string label;
        bytes dnsName;
    }

    struct LaunchParams {
        string label;
        address parent;
        address owner;
        string cartridgeId;
        string version;
        bytes32 contentHash;
        uint128 supply;
        uint128 lpReserve;
        uint64 auctionBlocks;
        uint256 floorPriceQ96;
        uint256 tickSpacingQ96;
        uint128 requiredCurrencyRaised;
    }

    uint24 public constant POOL_FEE = 3000;
    int24 public constant TICK_SPACING = 60;
    /// Half of what the auction raises seeds the pool; the other half goes to the world's owner.
    uint24 public constant LP_SHARE_MPS = 5_000_000;
    uint256 private constant MPS = 10_000_000;
    /// Neither is in RegistryRolesLib.UNEMANCIPATED_ROLE_BITMAP, so every registry here stays emancipated.
    uint256 private constant REGISTRY_ROLES = EnsRoles.REGISTRAR | EnsRoles.SET_PARENT;

    ILBPStrategy public immutable lbpStrategy;
    IDistributorFactory public immutable auctionFactory;
    IVerifiableFactory public immutable ensFactory;
    address public immutable userRegistryImpl;
    address public immutable rootCurrency;
    /// Holds the first-generation worlds; `<rootLabel>.eth` points its subregistry here.
    IEnsRegistry public immutable rootRegistry;
    IEnsResolver public immutable resolver;
    /// May set the hook, once. Not msg.sender: deployments go through the CREATE2 deployer.
    address private immutable admin;

    bytes public rootDnsName;
    address public hook;
    mapping(address token => World) private worlds;

    event WorldLaunched(
        address indexed token, address indexed parent, address indexed owner, address auction, bytes dnsName
    );
    event WorldRevised(address indexed token, string version, bytes32 contentHash);

    error HookAlreadySet();
    error HookNotSet();
    error BadLabel(string label);
    error BadSupply();
    error BadAuctionBlocks(uint64 blocks);
    error UnknownWorld(address token);
    error NotOwner(address caller, address owner);
    error AuctionMismatch(address predicted);

    constructor(
        ILBPStrategy lbpStrategy_,
        IDistributorFactory auctionFactory_,
        IVerifiableFactory ensFactory_,
        address userRegistryImpl_,
        address resolverImpl,
        address rootCurrency_,
        address ethRegistry,
        string memory rootLabel,
        address admin_
    ) {
        lbpStrategy = lbpStrategy_;
        auctionFactory = auctionFactory_;
        ensFactory = ensFactory_;
        userRegistryImpl = userRegistryImpl_;
        rootCurrency = rootCurrency_;
        rootDnsName = bytes.concat(bytes1(uint8(bytes(rootLabel).length)), bytes(rootLabel), hex"0365746800");
        admin = admin_;
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant(address(this), EnsRoles.RESOLVER_ALL);
        resolver = IEnsResolver(
            ensFactory_.deployProxy(
                resolverImpl,
                uint256(keccak256(abi.encode("unwritten.lineage.resolver", address(this)))),
                abi.encodeCall(IEnsResolver.initialize, (grants, new bytes[](0)))
            )
        );
        IEnsRegistry root = _newRegistry(
            ensFactory_, userRegistryImpl_, keccak256(abi.encode("unwritten.lineage.root", address(this)))
        );
        root.setParent(ethRegistry, rootLabel);
        rootRegistry = root;
    }

    /// The hook's address depends on this contract's (it is mined against it), so it is set once, after.
    function setHook(address hook_) external {
        if (msg.sender != admin || hook != address(0)) revert HookAlreadySet();
        hook = hook_;
    }

    /// Names, mints and auctions a world. `parent` is a launched world's token, or address(0).
    function launch(LaunchParams calldata p) external returns (address token) {
        if (hook == address(0)) revert HookNotSet();
        _checkLabel(p.label);
        if (p.owner == address(0) || p.lpReserve == 0 || p.lpReserve >= p.supply) revert BadSupply();
        if (p.auctionBlocks == 0 || MPS % p.auctionBlocks != 0) revert BadAuctionBlocks(p.auctionBlocks);

        token = address(new WorldToken(p.label, _symbol(p.label), p.supply, address(this)));
        World storage w = worlds[token];
        w.parent = p.parent;
        w.label = p.label;
        w.labelId = uint256(keccak256(bytes(p.label)));
        bytes memory parentDns;
        if (p.parent == address(0)) {
            w.currency = rootCurrency;
            w.entryRegistry = address(rootRegistry);
            parentDns = rootDnsName;
        } else {
            World storage pw = worlds[p.parent];
            if (pw.entryRegistry == address(0)) revert UnknownWorld(p.parent);
            w.currency = p.parent;
            w.entryRegistry = pw.subregistry;
            parentDns = pw.dnsName;
        }
        w.dnsName = bytes.concat(bytes1(uint8(bytes(p.label).length)), bytes(p.label), parentDns);
        // Its remixes' registry exists from the start, so no role that repoints a name is ever needed.
        IEnsRegistry sub = _newRegistry(
            ensFactory, userRegistryImpl, keccak256(abi.encode("unwritten.lineage.world", address(this), token))
        );
        w.subregistry = address(sub);
        IEnsRegistry(w.entryRegistry)
            .register(p.label, p.owner, address(sub), address(resolver), EnsRoles.CAN_TRANSFER_ADMIN, type(uint64).max);
        sub.setParent(w.entryRegistry, p.label);
        w.auction = _startAuction(token, w.currency, p);
        _writeRecords(w, token, p);
        emit WorldLaunched(token, p.parent, p.owner, w.auction, w.dnsName);
    }

    /// Points the name at a new revision of the same world. Only the name's current holder may.
    function revise(address token, string calldata version, bytes32 contentHash) external {
        World storage w = _world(token);
        _onlyOwner(token);
        resolver.setText(w.dnsName, "unwritten.version", version);
        resolver.setText(w.dnsName, "unwritten.hash", _hashText(contentHash));
        emit WorldRevised(token, version, contentHash);
    }

    function describe(address token, string calldata description) external {
        World storage w = _world(token);
        _onlyOwner(token);
        resolver.setText(w.dnsName, "description", description);
    }

    /// Anyone may move a finished auction into its pool (LBPStrategy.migrate is open too).
    function graduate(address token) external {
        lbpStrategy.migrate(_world(token).auction);
    }

    /// The holder of the world's ENS name; address(0) for an unknown token.
    function ownerOf(address token) public view returns (address) {
        World storage w = worlds[token];
        if (w.entryRegistry == address(0)) return address(0);
        return IEnsRegistry(w.entryRegistry).getState(w.labelId).latestOwner;
    }

    function parentOf(address token) external view returns (address) {
        return worlds[token].parent;
    }

    function worldOf(address token) external view returns (World memory) {
        return _world(token);
    }

    /// The world a pool belongs to: its token must be paired with exactly the world's currency, under
    /// this registry's hook, fee and tick spacing. address(0) for any other pool.
    function worldOfPool(PoolKey calldata key) external view returns (address) {
        if (address(key.hooks) != hook || key.fee != POOL_FEE || key.tickSpacing != TICK_SPACING) return address(0);
        address a = Currency.unwrap(key.currency0);
        address b = Currency.unwrap(key.currency1);
        if (worlds[a].entryRegistry != address(0) && worlds[a].currency == b) return a;
        if (worlds[b].entryRegistry != address(0) && worlds[b].currency == a) return b;
        return address(0);
    }

    function poolKeyOf(address token) public view returns (PoolKey memory key) {
        address currency = _world(token).currency;
        (address a, address b) = currency < token ? (currency, token) : (token, currency);
        key = PoolKey(Currency.wrap(a), Currency.wrap(b), POOL_FEE, TICK_SPACING, IHooks(hook));
    }

    /// The world's line from its first-generation ancestor down to itself.
    function pathTo(address token) external view returns (address[] memory path) {
        uint256 depth = 1;
        for (address up = _world(token).parent; up != address(0); up = worlds[up].parent) depth++;
        path = new address[](depth);
        address cursor = token;
        for (uint256 i = depth; i > 0; i--) {
            path[i - 1] = cursor;
            cursor = worlds[cursor].parent;
        }
    }

    function _startAuction(address token, address currency, LaunchParams calldata p)
        private
        returns (address auction)
    {
        uint64 start = uint64(block.number) + 1;
        uint64 end = start + p.auctionBlocks;
        bytes memory auctionConfig = abi.encode(
            AuctionParameters({
                currency: currency,
                tokensRecipient: p.owner,
                fundsRecipient: address(lbpStrategy),
                startBlock: start,
                endBlock: end,
                claimBlock: end,
                tickSpacing: p.tickSpacingQ96,
                validationHook: address(0),
                floorPrice: p.floorPriceQ96,
                requiredCurrencyRaised: p.requiredCurrencyRaised,
                // One step: the same share of supply every block (mps × blocks = 1e7).
                auctionStepsData: abi.encodePacked(bytes8((uint64(MPS / p.auctionBlocks) << 40) | p.auctionBlocks))
            })
        );
        LiquidityAllocationBracket[] memory schedule = new LiquidityAllocationBracket[](1);
        schedule[0] = LiquidityAllocationBracket(0, LP_SHARE_MPS);
        MigratorParameters memory mp = MigratorParameters({
            token: token,
            currency: currency,
            migrationBlock: end + 1,
            reservedTokenAmountForLP: p.lpReserve,
            recipient: p.owner,
            // The full-range position is minted to this contract, which has no way to withdraw it.
            positionRecipient: address(this),
            poolParameters: PoolParameters(POOL_FEE, TICK_SPACING, hook),
            positionDefinitions: abi.encode(new PositionDefinition[](0)),
            lpAllocationSchedule: abi.encode(schedule)
        });
        bytes32 salt = keccak256(abi.encode(token));
        IERC20(token).approve(address(lbpStrategy), p.supply);
        lbpStrategy.initializeDistribution(token, p.supply, abi.encode(mp, auctionConfig), salt);
        // LBPStrategy deploys the auction through the CCA factory with this salt (LBPStrategy.sol).
        uint256 auctionSupply = p.supply - p.lpReserve;
        auction = auctionFactory.getAddress(
            token, auctionSupply, auctionConfig, keccak256(abi.encode(salt, mp)), address(lbpStrategy)
        );
        if (IERC20(token).balanceOf(auction) != auctionSupply) revert AuctionMismatch(auction);
    }

    function _newRegistry(IVerifiableFactory factory, address impl, bytes32 salt) private returns (IEnsRegistry) {
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant(address(this), REGISTRY_ROLES);
        return IEnsRegistry(
            factory.deployProxy(impl, uint256(salt), abi.encodeCall(IEnsRegistry.initialize, (grants)))
        );
    }

    function _writeRecords(World storage w, address token, LaunchParams calldata p) private {
        bytes memory name = w.dnsName;
        resolver.setText(name, "unwritten.cartridge", p.cartridgeId);
        resolver.setText(name, "unwritten.version", p.version);
        resolver.setText(name, "unwritten.hash", _hashText(p.contentHash));
        resolver.setText(name, "unwritten.token", Strings.toHexString(token));
        resolver.setText(name, "unwritten.auction", Strings.toHexString(w.auction));
    }

    function _world(address token) private view returns (World storage w) {
        w = worlds[token];
        if (w.entryRegistry == address(0)) revert UnknownWorld(token);
    }

    function _onlyOwner(address token) private view {
        address owner = ownerOf(token);
        if (msg.sender != owner) revert NotOwner(msg.sender, owner);
    }

    /// `sha256:<64 hex>`, the form `pointerFromTexts` accepts.
    function _hashText(bytes32 contentHash) private pure returns (string memory) {
        bytes memory full = bytes(Strings.toHexString(uint256(contentHash), 32));
        bytes memory digits = new bytes(64);
        for (uint256 i; i < 64; i++) {
            digits[i] = full[i + 2];
        }
        return string.concat("sha256:", string(digits));
    }

    /// One DNS label the app would also produce (`cartridgeLabel`): a–z, 0–9, inner hyphens, ≤ 63 bytes.
    function _checkLabel(string calldata label) private pure {
        bytes calldata b = bytes(label);
        if (b.length == 0 || b.length > 63 || b[0] == "-" || b[b.length - 1] == "-") revert BadLabel(label);
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "-")) revert BadLabel(label);
        }
    }

    /// The label in capitals without hyphens, at most 11 characters.
    function _symbol(string calldata label) private pure returns (string memory) {
        bytes calldata b = bytes(label);
        bytes memory out = new bytes(b.length < 11 ? b.length : 11);
        uint256 n;
        for (uint256 i; i < b.length && n < out.length; i++) {
            bytes1 c = b[i];
            if (c == "-") continue;
            out[n++] = c >= "a" && c <= "z" ? bytes1(uint8(c) - 32) : c;
        }
        assembly {
            mstore(out, n)
        }
        return string(out);
    }
}
