// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ENSv2 on Sepolia (ens_v2_sepolia_20260916, ensdomains/contracts-v2@366de741): the calls a world's
// name needs. Same ABI as src/main/chain/ensCalls.ts, which the ens:setup dry run exercises.

struct Grant {
    address account;
    uint256 roleBitmap;
}

/// PermissionedRegistry `State`; `status` is 0 available, 1 reserved, 2 registered.
struct NameState {
    uint8 status;
    uint64 expiry;
    address latestOwner;
    uint256 tokenId;
    uint256 resource;
}

interface IEnsRegistry {
    function register(
        string calldata label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);

    function getState(uint256 anyId) external view returns (NameState memory);

    function setParent(address parent, string calldata label) external;

    function initialize(Grant[] calldata grants) external;

    function isEmancipated() external view returns (bool);
}

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address);
}

interface IEnsResolver {
    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;

    function setText(bytes calldata name, string calldata key, string calldata value) external;
}

/// RegistryRolesLib / PermissionedResolverLib bits at 366de741.
library EnsRoles {
    uint256 internal constant REGISTRAR = 1 << 0;
    uint256 internal constant SET_PARENT = 1 << 8;
    uint256 internal constant CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    /// Every resolver role and its admin.
    uint256 internal constant RESOLVER_ALL = 0x1111111111111111111111111111111111111111111111111111111111111111;
}
