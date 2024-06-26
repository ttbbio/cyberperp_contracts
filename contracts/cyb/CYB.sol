// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract CYB is MintableBaseToken {
    
    constructor() public MintableBaseToken("CYB", "CYB", 50000000000000000000000000 /* 50m */) {
    }

    function id() external pure returns (string memory _name) {
        return "CYB";
    }
}
