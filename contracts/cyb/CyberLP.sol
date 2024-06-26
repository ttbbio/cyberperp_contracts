// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract CyberLP is MintableBaseToken {
    constructor() public MintableBaseToken("CyberLP LP", "CyberLP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "CyberLP";
    }
}
