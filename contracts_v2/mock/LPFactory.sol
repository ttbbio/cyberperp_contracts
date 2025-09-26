// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./LPToken.sol";

contract LPTokenFactory {
    event LPTokenCreated(address indexed tokenA, address indexed tokenB, address lpToken);

    mapping(address => mapping(address => address)) public getLPToken;
    address[] public allLPTokens;

    function createLPToken(address tokenA, address tokenB) external returns (address lpToken) {
        require(tokenA != tokenB, "Identical addresses");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
        require(getLPToken[token0][token1] == address(0), "LPToken exists");

        string memory name = string(abi.encodePacked("LP-", _toAsciiString(token0), "-", _toAsciiString(token1)));
        string memory symbol = "LP";
        LPToken newLP = new LPToken(name, symbol, msg.sender);
        lpToken = address(newLP);

        getLPToken[token0][token1] = lpToken;
        getLPToken[token1][token0] = lpToken;
        allLPTokens.push(lpToken);

        emit LPTokenCreated(token0, token1, lpToken);
    }

    function allLPTokensLength() external view returns (uint) {
        return allLPTokens.length;
    }

    // Utility to print address as string (for names)
    function _toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2 ** (8 * (19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = _char(hi);
            s[2*i+1] = _char(lo);            
        }
        return string(s);
    }
    function _char(bytes1 b) private pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}
