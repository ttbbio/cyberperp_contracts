
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../qntlv/QntlvStoreUtils.sol";

/**
 * @title QntlvStoreUtilsTest
 * @dev Contract to help test the StoreUtils library
 */
contract QntlvStoreUtilsTest {
    function getEmptyQntlv() external pure returns (Qntlv.Props memory) {
        Qntlv.Props memory qntlv;
        return qntlv;
    }

    function setQntlv(DataStore dataStore, address key, bytes32 salt, Qntlv.Props memory qntlv) external {
        QntlvStoreUtils.set(dataStore, key, salt, qntlv);
    }

    function removeQntlv(DataStore dataStore, address key) external {
        QntlvStoreUtils.remove(dataStore, key);
    }
}
