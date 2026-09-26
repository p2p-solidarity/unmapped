// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/**
 * A player's account on the lineage market, owned by nothing but a passkey. It holds world tokens,
 * MockUSDC, auction bids and world names (ERC-1155), and does something only when the passkey
 * signs exactly that list of calls: the WebAuthn challenge is the hash of (chain, this account,
 * nonce, deadline, calls), checked against the passkey's P-256 key (the EIP-7951 precompile on
 * Sepolia, OpenZeppelin's WebAuthn and P256). Anyone may carry the signature on chain and pay the
 * gas — the app's relayer does — but nobody can change what was signed, replay it or reuse it on
 * another account. There is no other owner, no upgrade and no recovery.
 */
contract PasskeyAccount is ERC1155Holder {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    address public immutable factory;
    bytes32 public qx;
    bytes32 public qy;
    uint256 public nonce;

    event Executed(uint256 indexed nonce, uint256 calls);

    error AlreadyInitialized();
    error NotFactory();
    error Expired(uint256 deadline);
    error BadSignature();
    error CallFailed(uint256 index, bytes reason);

    constructor(address factory_) {
        factory = factory_;
    }

    function initialize(bytes32 qx_, bytes32 qy_) external {
        if (msg.sender != factory) revert NotFactory();
        if (qx != bytes32(0)) revert AlreadyInitialized();
        qx = qx_;
        qy = qy_;
    }

    /// What the passkey signs for this batch (the raw 32 bytes are the WebAuthn challenge).
    function digest(Call[] calldata calls, uint256 deadline) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), nonce, deadline, calls));
    }

    function execute(Call[] calldata calls, uint256 deadline, WebAuthn.WebAuthnAuth calldata auth) external {
        if (block.timestamp > deadline) revert Expired(deadline);
        if (!WebAuthn.verify(abi.encodePacked(digest(calls, deadline)), auth, qx, qy)) revert BadSignature();
        uint256 used = nonce++;
        for (uint256 i; i < calls.length; i++) {
            (bool ok, bytes memory reason) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, reason);
        }
        emit Executed(used, calls.length);
    }

    receive() external payable {}
}

/// Makes one PasskeyAccount per passkey public key, at an address known before it exists, and
/// carries a signed batch to it (making it first if needed). Open to anyone: only the passkey can
/// make an account do anything.
contract PasskeyAccountFactory {
    address public immutable implementation;

    event AccountCreated(address indexed account, bytes32 qx, bytes32 qy);

    constructor() {
        implementation = address(new PasskeyAccount(address(this)));
    }

    function accountOf(bytes32 qx, bytes32 qy) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, keccak256(abi.encode(qx, qy)));
    }

    function deploy(bytes32 qx, bytes32 qy) public returns (PasskeyAccount account) {
        account = PasskeyAccount(payable(accountOf(qx, qy)));
        if (address(account).code.length == 0) {
            Clones.cloneDeterministic(implementation, keccak256(abi.encode(qx, qy)));
            account.initialize(qx, qy);
            emit AccountCreated(address(account), qx, qy);
        }
    }

    function execute(
        bytes32 qx,
        bytes32 qy,
        PasskeyAccount.Call[] calldata calls,
        uint256 deadline,
        WebAuthn.WebAuthnAuth calldata auth
    ) external {
        deploy(qx, qy).execute(calls, deadline, auth);
    }
}
