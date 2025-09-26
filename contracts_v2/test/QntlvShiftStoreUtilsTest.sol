
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../qntlv/qntlvShift/QntlvShiftStoreUtils.sol";

/**
 * @title ShifteStoreUtilsTest
 * @dev Contract to help test the ShiftStoreUtils library
 */
contract QntlvShiftStoreUtilsTest {
    function getEmptyQntlvShift() external pure returns (QntlvShift.Props memory) {
        QntlvShift.Props memory qntlvShift;
        return qntlvShift;
    }

    function setQntlvShift(DataStore dataStore, bytes32 key, QntlvShift.Props memory qntlvShift) external {
        QntlvShiftStoreUtils.set(dataStore, key, qntlvShift);
    }

    function removeQntlvShift(DataStore dataStore, bytes32 key) external {
        QntlvShiftStoreUtils.remove(dataStore, key);
    }
}
