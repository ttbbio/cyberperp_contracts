// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LPToken is ERC20 {
    address public pool;

    constructor(string memory name_, string memory symbol_, address pool_) ERC20(name_, symbol_) {
        pool = pool_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == pool, "Only pool can mint");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == pool, "Only pool can burn");
        _burn(from, amount);
    }
}
