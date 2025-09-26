
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../qntlv/qntlvWithdrawal/QntlvWithdrawalStoreUtils.sol";

/**
 * @title WithdrawaleStoreUtilsTest
 * @dev Contract to help test the WithdrawalStoreUtils library
 */
contract QntlvWithdrawalStoreUtilsTest {
    function getEmptyQntlvWithdrawal() external pure returns (QntlvWithdrawal.Props memory) {
        QntlvWithdrawal.Props memory qntlvWithdrawal;
        return qntlvWithdrawal;
    }

    function setQntlvWithdrawal(DataStore dataStore, bytes32 key, QntlvWithdrawal.Props memory qntlvWithdrawal) external {
        QntlvWithdrawalStoreUtils.set(dataStore, key, qntlvWithdrawal);
    }

    function removeQntlvWithdrawal(DataStore dataStore, bytes32 key, address account) external {
        QntlvWithdrawalStoreUtils.remove(dataStore, key, account);
    }
}
