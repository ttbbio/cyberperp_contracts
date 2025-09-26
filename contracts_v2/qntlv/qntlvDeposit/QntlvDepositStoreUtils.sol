// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/Keys.sol";
import "../../data/DataStore.sol";

import "./QntlvDeposit.sol";

/**
 * @title QntlvDepositStoreUtils
 * @dev Library for deposit storage functions
 */
library QntlvDepositStoreUtils {
    using QntlvDeposit for QntlvDeposit.Props;

    bytes32 public constant ACCOUNT = keccak256(abi.encode("ACCOUNT"));
    bytes32 public constant RECEIVER = keccak256(abi.encode("RECEIVER"));
    bytes32 public constant CALLBACK_CONTRACT = keccak256(abi.encode("CALLBACK_CONTRACT"));
    bytes32 public constant UI_FEE_RECEIVER = keccak256(abi.encode("UI_FEE_RECEIVER"));
    bytes32 public constant QNTLV = keccak256(abi.encode("QNTLV"));
    bytes32 public constant MARKET = keccak256(abi.encode("MARKET"));
    bytes32 public constant INITIAL_LONG_TOKEN = keccak256(abi.encode("INITIAL_LONG_TOKEN"));
    bytes32 public constant INITIAL_SHORT_TOKEN = keccak256(abi.encode("INITIAL_SHORT_TOKEN"));
    bytes32 public constant LONG_TOKEN_SWAP_PATH = keccak256(abi.encode("LONG_TOKEN_SWAP_PATH"));
    bytes32 public constant SHORT_TOKEN_SWAP_PATH = keccak256(abi.encode("SHORT_TOKEN_SWAP_PATH"));

    bytes32 public constant MARKET_TOKEN_AMOUNT = keccak256(abi.encode("MARKET_TOKEN_AMOUNT"));
    bytes32 public constant INITIAL_LONG_TOKEN_AMOUNT = keccak256(abi.encode("INITIAL_LONG_TOKEN_AMOUNT"));
    bytes32 public constant INITIAL_SHORT_TOKEN_AMOUNT = keccak256(abi.encode("INITIAL_SHORT_TOKEN_AMOUNT"));
    bytes32 public constant MIN_QNTLV_TOKENS = keccak256(abi.encode("MIN_QNTLV_TOKENS"));
    bytes32 public constant UPDATED_AT_TIME = keccak256(abi.encode("UPDATED_AT_TIME"));
    bytes32 public constant EXECUTION_FEE = keccak256(abi.encode("EXECUTION_FEE"));
    bytes32 public constant CALLBACK_GAS_LIMIT = keccak256(abi.encode("CALLBACK_GAS_LIMIT"));

    bytes32 public constant SHOULD_UNWRAP_NATIVE_TOKEN = keccak256(abi.encode("SHOULD_UNWRAP_NATIVE_TOKEN"));
    bytes32 public constant IS_MARKET_TOKEN_DEPOSIT = keccak256(abi.encode("IS_MARKET_TOKEN_DEPOSIT"));

    function get(DataStore dataStore, bytes32 key) external view returns (QntlvDeposit.Props memory) {
        QntlvDeposit.Props memory qntlvDeposit;
        if (!dataStore.containsBytes32(Keys.QNTLV_DEPOSIT_LIST, key)) {
            return qntlvDeposit;
        }

        qntlvDeposit.setAccount(dataStore.getAddress(
            keccak256(abi.encode(key, ACCOUNT))
        ));

        qntlvDeposit.setReceiver(dataStore.getAddress(
            keccak256(abi.encode(key, RECEIVER))
        ));

        qntlvDeposit.setCallbackContract(dataStore.getAddress(
            keccak256(abi.encode(key, CALLBACK_CONTRACT))
        ));

        qntlvDeposit.setUiFeeReceiver(dataStore.getAddress(
            keccak256(abi.encode(key, UI_FEE_RECEIVER))
        ));

        qntlvDeposit.setQntlv(dataStore.getAddress(
            keccak256(abi.encode(key, QNTLV))
        ));

        qntlvDeposit.setMarket(dataStore.getAddress(
            keccak256(abi.encode(key, MARKET))
        ));

        qntlvDeposit.setInitialLongToken(dataStore.getAddress(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN))
        ));

        qntlvDeposit.setInitialShortToken(dataStore.getAddress(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN))
        ));

        qntlvDeposit.setLongTokenSwapPath(dataStore.getAddressArray(
            keccak256(abi.encode(key, LONG_TOKEN_SWAP_PATH))
        ));

        qntlvDeposit.setShortTokenSwapPath(dataStore.getAddressArray(
            keccak256(abi.encode(key, SHORT_TOKEN_SWAP_PATH))
        ));

        qntlvDeposit.setMarketTokenAmount(dataStore.getUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        ));

        qntlvDeposit.setInitialLongTokenAmount(dataStore.getUint(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN_AMOUNT))
        ));

        qntlvDeposit.setInitialShortTokenAmount(dataStore.getUint(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN_AMOUNT))
        ));

        qntlvDeposit.setMinQntlvTokens(dataStore.getUint(
            keccak256(abi.encode(key, MIN_QNTLV_TOKENS))
        ));

        qntlvDeposit.setUpdatedAtTime(dataStore.getUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        ));

        qntlvDeposit.setExecutionFee(dataStore.getUint(
            keccak256(abi.encode(key, EXECUTION_FEE))
        ));

        qntlvDeposit.setCallbackGasLimit(dataStore.getUint(
            keccak256(abi.encode(key, CALLBACK_GAS_LIMIT))
        ));

        qntlvDeposit.setShouldUnwrapNativeToken(dataStore.getBool(
            keccak256(abi.encode(key, SHOULD_UNWRAP_NATIVE_TOKEN))
        ));

        qntlvDeposit.setIsMarketTokenDeposit(dataStore.getBool(
            keccak256(abi.encode(key, IS_MARKET_TOKEN_DEPOSIT))
        ));

        return qntlvDeposit;
    }

    function set(DataStore dataStore, bytes32 key, QntlvDeposit.Props memory qntlvDeposit) external {
        dataStore.addBytes32(
            Keys.QNTLV_DEPOSIT_LIST,
            key
        );

        dataStore.addBytes32(
            Keys.accountQntlvDepositListKey(qntlvDeposit.account()),
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, ACCOUNT)),
            qntlvDeposit.account()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, RECEIVER)),
            qntlvDeposit.receiver()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, CALLBACK_CONTRACT)),
            qntlvDeposit.callbackContract()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, UI_FEE_RECEIVER)),
            qntlvDeposit.uiFeeReceiver()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, QNTLV)),
            qntlvDeposit.qntlv()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, MARKET)),
            qntlvDeposit.market()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN)),
            qntlvDeposit.initialLongToken()
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN)),
            qntlvDeposit.initialShortToken()
        );

        dataStore.setAddressArray(
            keccak256(abi.encode(key, LONG_TOKEN_SWAP_PATH)),
            qntlvDeposit.longTokenSwapPath()
        );

        dataStore.setAddressArray(
            keccak256(abi.encode(key, SHORT_TOKEN_SWAP_PATH)),
            qntlvDeposit.shortTokenSwapPath()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT)),
            qntlvDeposit.marketTokenAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN_AMOUNT)),
            qntlvDeposit.initialLongTokenAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN_AMOUNT)),
            qntlvDeposit.initialShortTokenAmount()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, MIN_QNTLV_TOKENS)),
            qntlvDeposit.minQntlvTokens()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME)),
            qntlvDeposit.updatedAtTime()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, EXECUTION_FEE)),
            qntlvDeposit.executionFee()
        );

        dataStore.setUint(
            keccak256(abi.encode(key, CALLBACK_GAS_LIMIT)),
            qntlvDeposit.callbackGasLimit()
        );

        dataStore.setBool(
            keccak256(abi.encode(key, SHOULD_UNWRAP_NATIVE_TOKEN)),
            qntlvDeposit.shouldUnwrapNativeToken()
        );

        dataStore.setBool(
            keccak256(abi.encode(key, IS_MARKET_TOKEN_DEPOSIT)),
            qntlvDeposit.isMarketTokenDeposit()
        );
    }

    function remove(DataStore dataStore, bytes32 key, address account) external {
        if (!dataStore.containsBytes32(Keys.QNTLV_DEPOSIT_LIST, key)) {
            revert Errors.QntlvDepositNotFound(key);
        }

        dataStore.removeBytes32(
            Keys.QNTLV_DEPOSIT_LIST,
            key
        );

        dataStore.removeBytes32(
            Keys.accountQntlvDepositListKey(account),
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, ACCOUNT))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, RECEIVER))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, CALLBACK_CONTRACT))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, UI_FEE_RECEIVER))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, QNTLV))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, MARKET))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN))
        );

        dataStore.removeAddressArray(
            keccak256(abi.encode(key, LONG_TOKEN_SWAP_PATH))
        );

        dataStore.removeAddressArray(
            keccak256(abi.encode(key, SHORT_TOKEN_SWAP_PATH))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MARKET_TOKEN_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, INITIAL_LONG_TOKEN_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, INITIAL_SHORT_TOKEN_AMOUNT))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, MIN_QNTLV_TOKENS))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, UPDATED_AT_TIME))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, EXECUTION_FEE))
        );

        dataStore.removeUint(
            keccak256(abi.encode(key, CALLBACK_GAS_LIMIT))
        );

        dataStore.removeBool(
            keccak256(abi.encode(key, SHOULD_UNWRAP_NATIVE_TOKEN))
        );

        dataStore.removeBool(
            keccak256(abi.encode(key, IS_MARKET_TOKEN_DEPOSIT))
        );
    }

    function getQntlvDepositCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.QNTLV_DEPOSIT_LIST);
    }

    function getQntlvDepositKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.QNTLV_DEPOSIT_LIST, start, end);
    }

    function getAccountQntlvDepositCount(DataStore dataStore, address account) internal view returns (uint256) {
        return dataStore.getBytes32Count(Keys.accountQntlvDepositListKey(account));
    }

    function getAccountQntlvDepositKeys(DataStore dataStore, address account, uint256 start, uint256 end) internal view returns (bytes32[] memory) {
        return dataStore.getBytes32ValuesAt(Keys.accountQntlvDepositListKey(account), start, end);
    }
}
