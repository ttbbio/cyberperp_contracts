// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../callback/IOrderCallbackReceiver.sol";
import "../callback/IGasFeeCallbackReceiver.sol";
import "../callback/IQntlvDepositCallbackReceiver.sol";
import "../callback/IQntlvWithdrawalCallbackReceiver.sol";

contract MockCallbackReceiver is IOrderCallbackReceiver, IGasFeeCallbackReceiver, IQntlvDepositCallbackReceiver, IQntlvWithdrawalCallbackReceiver {
    uint public called;

    uint public qntlvDepositExecutionCalled;
    uint public qntlvDepositCancellationCalled;
    uint public qntlvWithdrawalExecutionCalled;
    uint public qntlvWithdrawalCancellationCalled;

    function afterOrderExecution(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderCancellation(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function afterOrderFrozen(bytes32 /* key */, Order.Props memory /* order */, EventUtils.EventLogData memory /* eventData */) external {
        ++called;
    }

    function refundExecutionFee(bytes32 /* key */, EventUtils.EventLogData memory /* eventData */) external payable {
        ++called;
    }

    function afterQntlvDepositExecution(bytes32 /* key */, QntlvDeposit.Props memory /* qntlv deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++qntlvDepositExecutionCalled;
    }

    function afterQntlvDepositCancellation(bytes32 /* key */, QntlvDeposit.Props memory /* qntlv deposit */, EventUtils.EventLogData memory /* eventData */) external {
        ++qntlvDepositCancellationCalled;
    }

    function afterQntlvWithdrawalExecution(bytes32 /* key */, QntlvWithdrawal.Props memory /* qntlv withdrawal */, EventUtils.EventLogData memory /* eventData */) external {
        ++qntlvWithdrawalExecutionCalled;
    }

    function afterQntlvWithdrawalCancellation(bytes32 /* key */, QntlvWithdrawal.Props memory /* qntlv withdrawal */, EventUtils.EventLogData memory /* eventData */) external {
        ++qntlvWithdrawalCancellationCalled;
    }
}
