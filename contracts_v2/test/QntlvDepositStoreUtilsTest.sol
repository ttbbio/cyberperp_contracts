
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../qntlv/qntlvDeposit/QntlvDepositStoreUtils.sol";

/**
 * @title DepositeStoreUtilsTest
 * @dev Contract to help test the DepositStoreUtils library
 */
contract QntlvDepositStoreUtilsTest {
    function getEmptyQntlvDeposit() external pure returns (QntlvDeposit.Props memory) {
        QntlvDeposit.Props memory qntlvDeposit;
        return qntlvDeposit;
    }

    function setQntlvDeposit(DataStore dataStore, bytes32 key, QntlvDeposit.Props memory qntlvDeposit) external {
        QntlvDepositStoreUtils.set(dataStore, key, qntlvDeposit);
    }

    function removeQntlvDeposit(DataStore dataStore, bytes32 key, address account) external {
        QntlvDepositStoreUtils.remove(dataStore, key, account);
    }
}
