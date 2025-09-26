// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawal.sol";

// @title IQntlvWithdrawalCallbackReceiver
// @dev interface for a qntlvWithdrawal callback contract
interface IQntlvWithdrawalCallbackReceiver {
    // @dev called after a qntlvWithdrawal execution
    // @param key the key of the qntlvWithdrawal
    // @param qntlvWithdrawal the qntlvWithdrawal that was executed
    function afterQntlvWithdrawalExecution(
        bytes32 key,
        QntlvWithdrawal.Props memory qntlvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) external;

    // @dev called after a qntlvWithdrawal cancellation
    // @param key the key of the qntlvWithdrawal
    // @param qntlvWithdrawal the qntlvWithdrawal that was cancelled
    function afterQntlvWithdrawalCancellation(
        bytes32 key,
        QntlvWithdrawal.Props memory qntlvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) external;
}
