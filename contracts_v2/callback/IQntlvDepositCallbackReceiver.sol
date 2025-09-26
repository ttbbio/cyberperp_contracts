// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventUtils.sol";
import "../qntlv/qntlvDeposit/QntlvDeposit.sol";

// @title IQntlvDepositCallbackReceiver
// @dev interface for a qntlvDeposit callback contract
interface IQntlvDepositCallbackReceiver {
    // @dev called after a qntlvDeposit execution
    // @param key the key of the qntlvDeposit
    // @param qntlvDeposit the qntlvDeposit that was executed
    function afterQntlvDepositExecution(
        bytes32 key,
        QntlvDeposit.Props memory qntlvDeposit,
        EventUtils.EventLogData memory eventData
    ) external;

    // @dev called after a qntlvDeposit cancellation
    // @param key the key of the qntlvDeposit
    // @param qntlvDeposit the qntlvDeposit that was cancelled
    function afterQntlvDepositCancellation(
        bytes32 key,
        QntlvDeposit.Props memory qntlvDeposit,
        EventUtils.EventLogData memory eventData
    ) external;
}
