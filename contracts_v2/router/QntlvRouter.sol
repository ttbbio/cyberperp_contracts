// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseRouter.sol";
import "../exchange/IQntlvHandler.sol";
import "../external/IExternalHandler.sol";

contract QntlvRouter is BaseRouter {
    using QntlvDeposit for QntlvDeposit.Props;
    using QntlvWithdrawal for QntlvWithdrawal.Props;

    IQntlvHandler public immutable qntlvHandler;
    IExternalHandler public immutable externalHandler;

    constructor(
        Router _router,
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IQntlvHandler _qntlvHandler,
        IExternalHandler _externalHandler
    ) BaseRouter(_router, _roleStore, _dataStore, _eventEmitter) {
        qntlvHandler = _qntlvHandler;
        externalHandler = _externalHandler;
    }

    receive() external payable {
        address wnt = TokenUtils.wnt(dataStore);
        if (msg.sender != wnt) {
            revert Errors.InvalidNativeTokenSender(msg.sender);
        }
    }

    function createQntlvDeposit(
        QntlvDepositUtils.CreateQntlvDepositParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        address account = msg.sender;

        return qntlvHandler.createQntlvDeposit(account, params);
    }

    function cancelQntlvDeposit(bytes32 key) external nonReentrant {
        QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(dataStore, key);
        if (qntlvDeposit.account() == address(0)) {
            revert Errors.EmptyQntlvDeposit();
        }

        if (qntlvDeposit.account() != msg.sender) {
            revert Errors.Unauthorized(msg.sender, "account for cancelQntlvDeposit");
        }

        qntlvHandler.cancelQntlvDeposit(key);
    }

    function simulateExecuteQntlvDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        qntlvHandler.simulateExecuteQntlvDeposit(key, simulatedOracleParams);
    }

    function simulateExecuteLatestQntlvDeposit(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        qntlvHandler.simulateExecuteQntlvDeposit(key, simulatedOracleParams);
    }

    function createQntlvWithdrawal(
        QntlvWithdrawalUtils.CreateQntlvWithdrawalParams calldata params
    ) external payable nonReentrant returns (bytes32) {
        address account = msg.sender;

        return qntlvHandler.createQntlvWithdrawal(account, params);
    }

    function cancelQntlvWithdrawal(bytes32 key) external nonReentrant {
        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(dataStore, key);
        if (qntlvWithdrawal.account() == address(0)) {
            revert Errors.EmptyQntlvWithdrawal();
        }

        if (qntlvWithdrawal.account() != msg.sender) {
            revert Errors.Unauthorized(msg.sender, "account for cancelQntlvWithdrawal");
        }

        qntlvHandler.cancelQntlvWithdrawal(key);
    }

    function simulateExecuteQntlvWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        qntlvHandler.simulateExecuteQntlvWithdrawal(key, simulatedOracleParams);
    }

    function simulateExecuteLatestQntlvWithdrawal(
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external payable nonReentrant {
        bytes32 key = NonceUtils.getCurrentKey(dataStore);
        qntlvHandler.simulateExecuteQntlvWithdrawal(key, simulatedOracleParams);
    }

    // makeExternalCalls can be used to perform an external swap before
    // an action
    // example:
    // - ExchangeRouter.sendTokens(token: WETH, receiver: externalHandler, amount: 1e18)
    // - ExchangeRouter.makeExternalCalls(
    //     WETH.approve(spender: aggregator, amount: 1e18),
    //     aggregator.swap(amount: 1, from: WETH, to: USDC, receiver: orderHandler)
    // )
    // - ExchangeRouter.createOrder
    // the msg.sender for makeExternalCalls would be externalHandler
    // refundTokens can be used to retrieve any excess tokens that may
    // be left in the externalHandler
    function makeExternalCalls(
        address[] memory externalCallTargets,
        bytes[] memory externalCallDataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external nonReentrant {
        externalHandler.makeExternalCalls(
            externalCallTargets,
            externalCallDataList,
            refundTokens,
            refundReceivers
        );
    }
}
