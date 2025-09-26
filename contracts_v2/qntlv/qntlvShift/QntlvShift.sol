// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library QntlvShift {
    struct Props {
        Addresses addresses;
        Numbers numbers;
    }

    struct Addresses {
        address qntlv;
        address fromMarket;
        address toMarket;
    }

    struct Numbers {
        uint256 marketTokenAmount;
        uint256 minMarketTokens;
        uint256 updatedAtTime;
    }

    function qntlv(Props memory props) internal pure returns (address) {
        return props.addresses.qntlv;
    }

    function setQntlv(Props memory props, address value) internal pure {
        props.addresses.qntlv = value;
    }

    function fromMarket(Props memory props) internal pure returns (address) {
        return props.addresses.fromMarket;
    }

    function setFromMarket(Props memory props, address value) internal pure {
        props.addresses.fromMarket = value;
    }

    function toMarket(Props memory props) internal pure returns (address) {
        return props.addresses.toMarket;
    }

    function setToMarket(Props memory props, address value) internal pure {
        props.addresses.toMarket = value;
    }

    function marketTokenAmount(Props memory props) internal pure returns (uint256) {
        return props.numbers.marketTokenAmount;
    }

    function setMarketTokenAmount(Props memory props, uint256 value) internal pure {
        props.numbers.marketTokenAmount = value;
    }

    function minMarketTokens(Props memory props) internal pure returns (uint256) {
        return props.numbers.minMarketTokens;
    }

    function setMinMarketTokens(Props memory props, uint256 value) internal pure {
        props.numbers.minMarketTokens = value;
    }

    function updatedAtTime(Props memory props) internal pure returns (uint256) {
        return props.numbers.updatedAtTime;
    }

    function setUpdatedAtTime(Props memory props, uint256 value) internal pure {
        props.numbers.updatedAtTime = value;
    }
}
