// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../qntlv/qntlvDeposit/QntlvDepositUtils.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawalUtils.sol";
import "../oracle/OracleUtils.sol";

interface IQntlvHandler {
    function createQntlvDeposit(
        address account,
        QntlvDepositUtils.CreateQntlvDepositParams calldata params
    ) external payable returns (bytes32);

    function cancelQntlvDeposit(bytes32 key) external;

    function simulateExecuteQntlvDeposit(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;

    function createQntlvWithdrawal(
        address account,
        QntlvWithdrawalUtils.CreateQntlvWithdrawalParams calldata params
    ) external payable returns (bytes32);

    function cancelQntlvWithdrawal(bytes32 key) external;

    function simulateExecuteQntlvWithdrawal(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
