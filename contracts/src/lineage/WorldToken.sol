// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// A world's token: a fixed supply minted once to the registry, which hands all of it to the launch
/// (auction supply + LP reserve). Nothing can mint more, burn, pause or tax it.
contract WorldToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply, address to) ERC20(name_, symbol_) {
        _mint(to, supply);
    }
}
