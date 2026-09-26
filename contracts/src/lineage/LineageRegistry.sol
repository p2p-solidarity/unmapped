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
 * UNMAPPED's name tree and market in one place, under `<root>.eth` on ENSv2. Names come first:
 *
 * - A cartridge (a world's published content) is named `<cartridge>.<root>.eth`; a remix of it is
 *   `<remix>.<cartridge>.<root>.eth`. Its records hold what the app already knows about a revision —
 *   id, version, sha256 hash — never its content. Its holder may point it at newer revisions.
 * - A save (one player's run of a cartridge) is `<save>.<cartridge>.<root>.eth`, registered by and
 *   to the player's own account (their PasskeyAccount; no wallet needed). Its records pin the exact
 *   revision it plays, the save's sha256 and one line of progress. Only its holder updates it.
 * - Launching a cartridge's name puts it on the market: its token is minted and handed to Uniswap's
 *   LBPStrategy, which runs a Continuous Clearing Auction priced in the parent world's token (a
 *   top-level world in rootCurrency) and, once it graduates, seeds a v4 pool that LineageHook guards
 *   and takes royalties on. A remix launches only after its parent has.
 *
 * Every registry in the tree is made by this contract, which keeps only the right to register new
 * labels and set a registry's parent — no role that can repoint, take back or upgrade a name. So
 * every name is an emancipated ENSv2 token its holder can transfer safely, and nobody, this contract
 * included, can cut a branch out of the tree. Labels are first come, first served under a parent;
 * a cartridge's remixes and saves share its label space.
 */
contract LineageRegistry {
    uint8 public constant CARTRIDGE = 1;
    uint8 public constant SAVE = 2;

    struct Name {
        bytes32 parent; // the parent cartridge's node, or rootNode
        address entryRegistry; // the ENS registry holding its label
        address subregistry; // the registry of its remixes and saves; none for a save
        address token; // its world token once launched; never for a save
        uint8 kind;
        uint256 labelId;
        string label;
        string cartridgeId; // a save's is its cartridge's
        bytes dnsName;
    }

    struct World {
        bytes32 node; // its name
        address parent; // the parent world's token; address(0) for a top-level world
        address currency; // what it trades against: the parent's token, or rootCurrency
        address auction; // its Continuous Clearing Auction
    }

    struct NameParams {
        bytes32 parent; // rootNode, or a cartridge's node for a remix
        string label;
        address owner;
        string cartridgeId;
        string version;
        bytes32 contentHash;
    }

    struct LaunchParams {
        uint128 supply;
        uint128 lpReserve;
        uint64 auctionBlocks;
        uint256 floorPriceQ96;
        uint256 tickSpacingQ96;
        uint128 requiredCurrencyRaised;
    }

    struct SaveParams {
        bytes32 cartridge; // the node of the cartridge this save plays
        string label;
        string version; // the revision the save is pinned to
        bytes32 contentHash;
        bytes32 saveHash;
        string progress; // one short line, e.g. "Chapter 2 of 3"
    }

    uint24 public constant POOL_FEE = 3000;
    int24 public constant TICK_SPACING = 60;
    /// Half of what the auction raises seeds the pool; the other half goes to the world's owner.
    uint24 public constant LP_SHARE_MPS = 5_000_000;
    uint256 private constant MPS = 10_000_000;
    uint256 private constant MAX_PROGRESS = 120;
    /// Neither is in RegistryRolesLib.UNEMANCIPATED_ROLE_BITMAP, so every registry here stays emancipated.
    uint256 private constant REGISTRY_ROLES = EnsRoles.REGISTRAR | EnsRoles.SET_PARENT;

    ILBPStrategy public immutable lbpStrategy;
    IDistributorFactory public immutable auctionFactory;
    IVerifiableFactory public immutable ensFactory;
    address public immutable userRegistryImpl;
    address public immutable rootCurrency;
    /// Holds the top-level cartridges; `<rootLabel>.eth` points its subregistry here.
    IEnsRegistry public immutable rootRegistry;
    IEnsResolver public immutable resolver;
    /// namehash(`<rootLabel>.eth`): the parent of every top-level name.
    bytes32 public immutable rootNode;
    /// May set the hook, once. Not msg.sender: deployments go through the CREATE2 deployer.
    address private immutable admin;

    bytes public rootDnsName;
    address public hook;
    mapping(bytes32 node => Name) private names;
    mapping(address token => World) private worlds;

    event NameRegistered(
        bytes32 indexed node, bytes32 indexed parent, address indexed owner, uint8 kind, bytes dnsName
    );
    event WorldLaunched(
        address indexed token, address indexed parent, address indexed owner, address auction, bytes dnsName
    );
    event CartridgeRevised(bytes32 indexed node, string version, bytes32 contentHash);
    event SaveRecorded(
        bytes32 indexed node, bytes32 indexed cartridge, bytes32 saveHash, string version, string progress
    );

    error HookAlreadySet();
    error HookNotSet();
    error BadLabel(string label);
    error BadOwner();
    error BadSupply();
    error BadAuctionBlocks(uint64 blocks);
    error BadProgress();
    error UnknownWorld(address token);
    error UnknownName(bytes32 node);
    error NotACartridge(bytes32 node);
    error NotASave(bytes32 node);
    error AlreadyLaunched(bytes32 node);
    error ParentNotLaunched(bytes32 node);
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
        bytes32 ethNode = keccak256(abi.encodePacked(bytes32(0), keccak256("eth")));
        rootNode = keccak256(abi.encodePacked(ethNode, keccak256(bytes(rootLabel))));
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
        IEnsRegistry root = _newRegistry(keccak256(abi.encode("unwritten.lineage.root", address(this))));
        root.setParent(ethRegistry, rootLabel);
        rootRegistry = root;
    }

    /// The hook's address depends on this contract's (it is mined against it), so it is set once, after.
    function setHook(address hook_) external {
        if (msg.sender != admin || hook != address(0)) revert HookAlreadySet();
        hook = hook_;
    }

    // ── Names ─────────────────────────────────────────────────────────────────────────────────────

    /// Names a cartridge revision: `<label>.<root>.eth`, or `<label>.<parent>` for a remix. Open to anyone.
    function register(NameParams calldata p) public returns (bytes32 node) {
        if (p.owner == address(0)) revert BadOwner();
        (address entry, bytes memory parentDns) = _childSlot(p.parent);
        node = _put(p.parent, entry, p.label, CARTRIDGE, p.cartridgeId, parentDns);
        Name storage n = names[node];
        // Its children's registry exists from the start, so no role that repoints a name is ever needed.
        IEnsRegistry sub = _newRegistry(keccak256(abi.encode("unwritten.lineage.name", address(this), node)));
        n.subregistry = address(sub);
        IEnsRegistry(entry)
            .register(p.label, p.owner, address(sub), address(resolver), EnsRoles.CAN_TRANSFER_ADMIN, type(uint64).max);
        sub.setParent(entry, p.label);
        bytes memory dns = n.dnsName;
        resolver.setText(dns, "unwritten.kind", "cartridge");
        resolver.setText(dns, "unwritten.cartridge", p.cartridgeId);
        _pin(dns, p.version, p.contentHash);
        emit NameRegistered(node, p.parent, p.owner, CARTRIDGE, dns);
    }

    /// Points a cartridge's name at a newer revision. Only the name's current holder may.
    function revise(bytes32 node, string calldata version, bytes32 contentHash) external {
        if (names[node].kind != CARTRIDGE) revert NotACartridge(node);
        _onlyHolder(node);
        _pin(names[node].dnsName, version, contentHash);
        emit CartridgeRevised(node, version, contentHash);
    }

    /// Names the caller's own save of a cartridge: `<label>.<cartridge>`, held by msg.sender.
    function recordSave(SaveParams calldata s) external returns (bytes32 node) {
        Name storage c = names[s.cartridge];
        if (c.kind != CARTRIDGE) revert NotACartridge(s.cartridge);
        node = _put(s.cartridge, c.subregistry, s.label, SAVE, c.cartridgeId, c.dnsName);
        IEnsRegistry(c.subregistry)
            .register(s.label, msg.sender, address(0), address(resolver), EnsRoles.CAN_TRANSFER_ADMIN, type(uint64).max);
        bytes memory dns = names[node].dnsName;
        resolver.setText(dns, "unwritten.kind", "save");
        resolver.setText(dns, "unwritten.cartridge", c.cartridgeId);
        emit NameRegistered(node, s.cartridge, msg.sender, SAVE, dns);
        _writeSave(node, s.version, s.contentHash, s.saveHash, s.progress);
    }

    /// Moves a save's name to a later checkpoint. Only the name's current holder may.
    function updateSave(
        bytes32 node,
        string calldata version,
        bytes32 contentHash,
        bytes32 saveHash,
        string calldata progress
    ) external {
        if (names[node].kind != SAVE) revert NotASave(node);
        _onlyHolder(node);
        _writeSave(node, version, contentHash, saveHash, progress);
    }

    function describe(bytes32 node, string calldata description) external {
        _onlyHolder(node);
        resolver.setText(names[node].dnsName, "description", description);
    }

    // ── Market ────────────────────────────────────────────────────────────────────────────────────

    /// Puts a named cartridge on the market. Only its holder may; tokens and proceeds go to them.
    function launch(bytes32 node, LaunchParams calldata lp) external returns (address token) {
        _onlyHolder(node);
        return _launch(node, msg.sender, lp);
    }

    /// Names and launches in one transaction, for `p.owner` (the operator's scripts use this).
    function registerAndLaunch(NameParams calldata p, LaunchParams calldata lp) external returns (address token) {
        return _launch(register(p), p.owner, lp);
    }

    /// Anyone may move a finished auction into its pool (LBPStrategy.migrate is open too).
    function graduate(address token) external {
        lbpStrategy.migrate(_world(token).auction);
    }

    // ── Views ─────────────────────────────────────────────────────────────────────────────────────

    /// A name's record; `kind` is 0 for a node this registry never made.
    function nameOf(bytes32 node) external view returns (Name memory) {
        return names[node];
    }

    function holderOf(bytes32 node) public view returns (address) {
        Name storage n = names[node];
        if (n.kind == 0) revert UnknownName(node);
        return IEnsRegistry(n.entryRegistry).getState(n.labelId).latestOwner;
    }

    /// The holder of a world's ENS name; address(0) for an unknown token. Royalties are paid here.
    function ownerOf(address token) public view returns (address) {
        bytes32 node = worlds[token].node;
        return node == bytes32(0) ? address(0) : holderOf(node);
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
        if (worlds[a].node != bytes32(0) && worlds[a].currency == b) return a;
        if (worlds[b].node != bytes32(0) && worlds[b].currency == a) return b;
        return address(0);
    }

    function poolKeyOf(address token) public view returns (PoolKey memory key) {
        address currency = _world(token).currency;
        (address a, address b) = currency < token ? (currency, token) : (token, currency);
        key = PoolKey(Currency.wrap(a), Currency.wrap(b), POOL_FEE, TICK_SPACING, IHooks(hook));
    }

    /// The world's line from its top-level ancestor down to itself.
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

    // ── Internals ─────────────────────────────────────────────────────────────────────────────────

    function _launch(bytes32 node, address owner, LaunchParams calldata lp) private returns (address token) {
        if (hook == address(0)) revert HookNotSet();
        if (lp.lpReserve == 0 || lp.lpReserve >= lp.supply) revert BadSupply();
        if (lp.auctionBlocks == 0 || MPS % lp.auctionBlocks != 0) revert BadAuctionBlocks(lp.auctionBlocks);
        Name storage n = names[node];
        if (n.kind != CARTRIDGE) revert NotACartridge(node);
        if (n.token != address(0)) revert AlreadyLaunched(node);
        address parentToken;
        address currency = rootCurrency;
        if (n.parent != rootNode) {
            parentToken = names[n.parent].token;
            if (parentToken == address(0)) revert ParentNotLaunched(n.parent);
            currency = parentToken;
        }
        token = address(new WorldToken(n.label, _symbol(n.label), lp.supply, address(this)));
        n.token = token;
        World storage w = worlds[token];
        w.node = node;
        w.parent = parentToken;
        w.currency = currency;
        w.auction = _startAuction(token, currency, owner, lp);
        resolver.setText(n.dnsName, "unwritten.token", Strings.toHexString(token));
        resolver.setText(n.dnsName, "unwritten.auction", Strings.toHexString(w.auction));
        emit WorldLaunched(token, parentToken, owner, w.auction, n.dnsName);
    }

    function _startAuction(address token, address currency, address owner, LaunchParams calldata lp)
        private
        returns (address auction)
    {
        uint64 start = uint64(block.number) + 1;
        uint64 end = start + lp.auctionBlocks;
        bytes memory auctionConfig = abi.encode(
            AuctionParameters({
                currency: currency,
                tokensRecipient: owner,
                fundsRecipient: address(lbpStrategy),
                startBlock: start,
                endBlock: end,
                claimBlock: end,
                tickSpacing: lp.tickSpacingQ96,
                validationHook: address(0),
                floorPrice: lp.floorPriceQ96,
                requiredCurrencyRaised: lp.requiredCurrencyRaised,
                // One step: the same share of supply every block (mps × blocks = 1e7).
                auctionStepsData: abi.encodePacked(bytes8((uint64(MPS / lp.auctionBlocks) << 40) | lp.auctionBlocks))
            })
        );
        LiquidityAllocationBracket[] memory schedule = new LiquidityAllocationBracket[](1);
        schedule[0] = LiquidityAllocationBracket(0, LP_SHARE_MPS);
        MigratorParameters memory mp = MigratorParameters({
            token: token,
            currency: currency,
            migrationBlock: end + 1,
            reservedTokenAmountForLP: lp.lpReserve,
            recipient: owner,
            // The full-range position is minted to this contract, which has no way to withdraw it.
            positionRecipient: address(this),
            poolParameters: PoolParameters(POOL_FEE, TICK_SPACING, hook),
            positionDefinitions: abi.encode(new PositionDefinition[](0)),
            lpAllocationSchedule: abi.encode(schedule)
        });
        bytes32 salt = keccak256(abi.encode(token));
        IERC20(token).approve(address(lbpStrategy), lp.supply);
        lbpStrategy.initializeDistribution(token, lp.supply, abi.encode(mp, auctionConfig), salt);
        // LBPStrategy deploys the auction through the CCA factory with this salt (LBPStrategy.sol).
        uint256 auctionSupply = lp.supply - lp.lpReserve;
        auction = auctionFactory.getAddress(
            token, auctionSupply, auctionConfig, keccak256(abi.encode(salt, mp)), address(lbpStrategy)
        );
        if (IERC20(token).balanceOf(auction) != auctionSupply) revert AuctionMismatch(auction);
    }

    /// Where a child of `parent` is registered: the root registry, or a cartridge's own registry.
    function _childSlot(bytes32 parent) private view returns (address entry, bytes memory parentDns) {
        if (parent == rootNode) return (address(rootRegistry), rootDnsName);
        Name storage p = names[parent];
        if (p.kind != CARTRIDGE) revert NotACartridge(parent);
        return (p.subregistry, p.dnsName);
    }

    /// Records a name's place in the tree; the ENS registry's own register call rejects a taken label.
    function _put(
        bytes32 parent,
        address entry,
        string calldata label,
        uint8 kind,
        string memory cartridgeId,
        bytes memory parentDns
    ) private returns (bytes32 node) {
        _checkLabel(label);
        node = keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
        Name storage n = names[node];
        n.parent = parent;
        n.entryRegistry = entry;
        n.kind = kind;
        n.labelId = uint256(keccak256(bytes(label)));
        n.label = label;
        n.cartridgeId = cartridgeId;
        n.dnsName = bytes.concat(bytes1(uint8(bytes(label).length)), bytes(label), parentDns);
    }

    function _writeSave(
        bytes32 node,
        string calldata version,
        bytes32 contentHash,
        bytes32 saveHash,
        string calldata progress
    ) private {
        if (bytes(progress).length > MAX_PROGRESS) revert BadProgress();
        bytes memory dns = names[node].dnsName;
        _pin(dns, version, contentHash);
        resolver.setText(dns, "unwritten.save", _hashText(saveHash));
        resolver.setText(dns, "unwritten.progress", progress);
        emit SaveRecorded(node, names[node].parent, saveHash, version, progress);
    }

    function _pin(bytes memory dns, string calldata version, bytes32 contentHash) private {
        resolver.setText(dns, "unwritten.version", version);
        resolver.setText(dns, "unwritten.hash", _hashText(contentHash));
    }

    function _newRegistry(bytes32 salt) private returns (IEnsRegistry) {
        Grant[] memory grants = new Grant[](1);
        grants[0] = Grant(address(this), REGISTRY_ROLES);
        return IEnsRegistry(
            ensFactory.deployProxy(userRegistryImpl, uint256(salt), abi.encodeCall(IEnsRegistry.initialize, (grants)))
        );
    }

    function _world(address token) private view returns (World storage w) {
        w = worlds[token];
        if (w.node == bytes32(0)) revert UnknownWorld(token);
    }

    function _onlyHolder(bytes32 node) private view {
        address holder = holderOf(node);
        if (msg.sender != holder) revert NotOwner(msg.sender, holder);
    }

    /// `sha256:<64 hex>`, the form `pointerFromTexts` accepts.
    function _hashText(bytes32 hash) private pure returns (string memory) {
        bytes memory full = bytes(Strings.toHexString(uint256(hash), 32));
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
    function _symbol(string memory label) private pure returns (string memory) {
        bytes memory b = bytes(label);
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
