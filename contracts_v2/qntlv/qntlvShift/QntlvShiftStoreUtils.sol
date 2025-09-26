// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/Keys.sol";
import "../../data/DataStore.sol";

import "./QntlvShift.sol";

library QntlvShiftStoreUtils {
    using QntlvShift for QntlvShift.Props;

    bytes32 public constant QNTLV = keccak256(abi.encode("QNTLV"));
    bytes32 public constant FROM_MARKET = keccak256(abi.encode("FROM_MARKET"));
    bytes32 public constant TO_MARKET = keccak256(abi.encode("TO_MARKET"));

    bytes32 public constant MARKET_TOKEN_AMOUNT = keccak256(abi.encode("MARKET_TOKEN_AMOUNT"));
    bytes32 public constant MIN_MARKET_TOKENS = keccak256(abi.encode("MIN_MARKET_TOKENS"));
    bytes32 public constant UPDATED_AT_TIME = keccak256(abi.encode("UPDATED_AT_TIME"));

    function get(DataStore dataStore, bytes32 key) external view returns (QntlvShift.Props memory) {
        QntlvShift.Props memory qntlvShift;
        if (!dataStore.containsBytes32(Keys.QNTLV_SHIFT_LIST, key)) {
            return qntlvShift;
        }

        qntlvShift.setQntlv(dataStore.getAddress(
            keccak256(abi.encode(key, QNTLV))
        ));

        qntlvShift.setFromMarket(dataStore.getAddress(
            keccak256(abi.encode(key, FROM_MARKET))
        ));

        qntlvShift.setToMarket(dataStore.getAddress(
            keccak256(abi.encode(key, TO_MARKET))
        ));

        qntlvShift.setMarketTokenAmount(dataStore.getUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        ));

        qntlvShift.setMinMarketTokens(dataStore.getUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS))
        ));

        qntlvShift.setUpdatedAtTime(dataStore.getUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        ));

        return qntlvShift;
    }

    function set(DataStore dataStore, bytes32 key, QntlvShift.Props memory qntlvShift) external {
        dataStore.addBytes32(
            Keys.QNTLV_SHIFT_LIST,
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, QNTLV)),
            qntlvShift.qntlv()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, FROM_MARKET)),
            qntlvShift.fromMarket()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, TO_MARKET)),
            qntlvShift.toMarket()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT)),
            qntlvShift.marketTokenAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS)),
            qntlvShift.minMarketTokens()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME)),
            qntlvShift.updatedAtTime()
        );
    }

    function remove(DataStore dataStore, bytes32 key) external {
        if (!dataStore.containsBytes32(Keys.QNTLV_SHIFT_LIST, key)) {
            revert Errors.QntlvShiftNotFound(key);
        }

        dataStore.removeBytes32(
            Keys.QNTLV_SHIFT_LIST,
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, QNTLV))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, FROM_MARKET))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, TO_MARKET))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MIN_MARKET_TOKENS))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        );
    }

    function getQntlvShiftCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.QNTLV_SHIFT_LIST);
    }

    function getQntlvShiftKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.QNTLV_SHIFT_LIST, start, end);
    }
}
