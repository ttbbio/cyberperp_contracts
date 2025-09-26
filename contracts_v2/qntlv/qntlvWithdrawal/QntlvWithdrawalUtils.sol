// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../data/DataStore.sol";
import "../../oracle/Oracle.sol";
import "../../market/Market.sol";
import "../../market/MarketUtils.sol";
import "../../withdrawal/ExecuteWithdrawalUtils.sol";
import "../../withdrawal/WithdrawalEventUtils.sol";
import "../../withdrawal/WithdrawalUtils.sol";
import "../../data/Keys.sol";
import "../../event/EventUtils.sol";
import "../../callback/CallbackUtils.sol";
import "../../gas/GasUtils.sol";
import "../../nonce/NonceUtils.sol";
import "../QntlvVault.sol";
import "../QntlvUtils.sol";
import "../QntlvToken.sol";
import "./QntlvWithdrawal.sol";
import "./QntlvWithdrawalStoreUtils.sol";
import "./QntlvWithdrawalEventUtils.sol";

library QntlvWithdrawalUtils {
    using QntlvWithdrawal for QntlvWithdrawal.Props;
    using SafeCast for int256;
    using SafeCast for uint256;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.AddressItems;

    struct CreateQntlvWithdrawalParams {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address qntlv;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    struct ExecuteQntlvWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        QntlvVault qntlvVault;
        Oracle oracle;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteQntlvWithdrawalCache {
        uint256 qntlvValue;
        uint256 marketCount;
        uint256 oraclePriceCount;
        uint256 marketTokenAmount;
    }

    struct CancelQntlvWithdrawalParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        QntlvVault qntlvVault;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        string reason;
        bytes reasonBytes;
    }

    function createQntlvWithdrawal(
        DataStore dataStore,
        EventEmitter eventEmitter,
        QntlvVault qntlvVault,
        address account,
        CreateQntlvWithdrawalParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        QntlvUtils.validateQntlv(dataStore, params.qntlv);
        QntlvUtils.validateQntlvMarket(dataStore, params.qntlv, params.market, false);

        MarketUtils.validateEnabledMarket(dataStore, params.market);
        MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
        MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

        address wnt = TokenUtils.wnt(dataStore);
        uint256 wntAmount = qntlvVault.recordTransferIn(wnt);
        if (wntAmount < params.executionFee) {
            revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
        }
        params.executionFee = wntAmount;

        AccountUtils.validateReceiver(params.receiver);

        uint256 qntlvTokenAmount = qntlvVault.recordTransferIn(params.qntlv);

        if (qntlvTokenAmount == 0) {
            revert Errors.EmptyQntlvWithdrawalAmount();
        }

        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawal.Props(
            QntlvWithdrawal.Addresses({
                account: account,
                qntlv: params.qntlv,
                receiver: params.receiver,
                callbackContract: params.callbackContract,
                uiFeeReceiver: params.uiFeeReceiver,
                market: params.market,
                longTokenSwapPath: params.longTokenSwapPath,
                shortTokenSwapPath: params.shortTokenSwapPath
            }),
            QntlvWithdrawal.Numbers({
                qntlvTokenAmount: qntlvTokenAmount,
                minLongTokenAmount: params.minLongTokenAmount,
                minShortTokenAmount: params.minShortTokenAmount,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit
            }),
            QntlvWithdrawal.Flags({shouldUnwrapNativeToken: params.shouldUnwrapNativeToken})
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = QntlvUtils.getQntlvMarketCount(dataStore, qntlvWithdrawal.qntlv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteQntlvWithdrawalGasLimit(
            dataStore,
            qntlvWithdrawal,
            marketCount
        );
        uint256 oraclePriceCount = GasUtils.estimateQntlvWithdrawalOraclePriceCount(
            marketCount,
            params.longTokenSwapPath.length + params.shortTokenSwapPath.length
        );
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee, oraclePriceCount);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        QntlvWithdrawalStoreUtils.set(dataStore, key, qntlvWithdrawal);

        QntlvWithdrawalEventUtils.emitQntlvWithdrawalCreated(eventEmitter, key, qntlvWithdrawal);

        return key;
    }

    function executeQntlvWithdrawal(
        ExecuteQntlvWithdrawalParams memory params,
        QntlvWithdrawal.Props memory qntlvWithdrawal
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        QntlvWithdrawalStoreUtils.remove(params.dataStore, params.key, qntlvWithdrawal.account());

        ExecuteQntlvWithdrawalCache memory cache;
        cache.marketTokenAmount = _getMarketTokenAmount(params.dataStore, params.oracle, qntlvWithdrawal);

        // burn QNTLV tokens before executing withdrawal
        // for both QNTLV amount and token amounts will be correct inside the receive() function
        // if receiver is a contract
        QntlvToken(payable(qntlvWithdrawal.qntlv())).burn(address(params.qntlvVault), qntlvWithdrawal.qntlvTokenAmount());
        params.qntlvVault.syncTokenBalance(qntlvWithdrawal.qntlv());

        ExecuteWithdrawalUtils.ExecuteWithdrawalResult memory withdrawalResult = _processMarketWithdrawal(
            params,
            qntlvWithdrawal,
            cache.marketTokenAmount
        );

        QntlvWithdrawalEventUtils.emitQntlvWithdrawalExecuted(params.eventEmitter, params.key, qntlvWithdrawal.account());

        cache.qntlvValue = QntlvUtils.getQntlvValue(
            params.dataStore,
            params.oracle,
            qntlvWithdrawal.qntlv(),
            true
        );
        QntlvEventUtils.emitQntlvValueUpdated(
            params.eventEmitter,
            qntlvWithdrawal.qntlv(),
            cache.qntlvValue,
            QntlvToken(payable(qntlvWithdrawal.qntlv())).totalSupply()
        );

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "outputToken", withdrawalResult.outputToken);
        eventData.addressItems.setItem(1, "secondaryOutputToken", withdrawalResult.secondaryOutputToken);
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "outputAmount", withdrawalResult.outputAmount);
        eventData.uintItems.setItem(1, "secondaryOutputAmount", withdrawalResult.secondaryOutputAmount);
        CallbackUtils.afterQntlvWithdrawalExecution(params.key, qntlvWithdrawal, eventData);

        cache.marketCount = QntlvUtils.getQntlvMarketCount(params.dataStore, qntlvWithdrawal.qntlv());
        cache.oraclePriceCount = GasUtils.estimateQntlvWithdrawalOraclePriceCount(
            cache.marketCount,
            qntlvWithdrawal.longTokenSwapPath().length + qntlvWithdrawal.shortTokenSwapPath().length
        );

        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.qntlvVault,
            params.key,
            qntlvWithdrawal.callbackContract(),
            qntlvWithdrawal.executionFee(),
            params.startingGas,
            cache.oraclePriceCount,
            params.keeper,
            qntlvWithdrawal.receiver()
        );
    }

    function _processMarketWithdrawal(
        ExecuteQntlvWithdrawalParams memory params,
        QntlvWithdrawal.Props memory qntlvWithdrawal,
        uint256 marketTokenAmount
    ) private returns (ExecuteWithdrawalUtils.ExecuteWithdrawalResult memory) {

        Withdrawal.Props memory withdrawal = Withdrawal.Props(
            Withdrawal.Addresses({
                account: qntlvWithdrawal.qntlv(),
                receiver: qntlvWithdrawal.receiver(),
                callbackContract: address(0),
                uiFeeReceiver: qntlvWithdrawal.uiFeeReceiver(),
                market: qntlvWithdrawal.market(),
                longTokenSwapPath: qntlvWithdrawal.longTokenSwapPath(),
                shortTokenSwapPath: qntlvWithdrawal.shortTokenSwapPath()
            }),
            Withdrawal.Numbers({
                minLongTokenAmount: qntlvWithdrawal.minLongTokenAmount(),
                minShortTokenAmount: qntlvWithdrawal.minShortTokenAmount(),
                marketTokenAmount: marketTokenAmount,
                updatedAtTime: qntlvWithdrawal.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            }),
            Withdrawal.Flags({shouldUnwrapNativeToken: qntlvWithdrawal.shouldUnwrapNativeToken()})
        );

        bytes32 withdrawalKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.WITHDRAWAL_LIST, withdrawalKey);
        WithdrawalEventUtils.emitWithdrawalCreated(
            params.eventEmitter,
            withdrawalKey,
            withdrawal,
            WithdrawalUtils.WithdrawalType.Qntlv
        );

        Bank(payable(qntlvWithdrawal.qntlv())).transferOut(
            qntlvWithdrawal.market(),
            address(params.qntlvVault),
            marketTokenAmount
        );
        params.qntlvVault.syncTokenBalance(qntlvWithdrawal.market());

        ExecuteWithdrawalUtils.ExecuteWithdrawalParams memory executeWithdrawalParams = ExecuteWithdrawalUtils
            .ExecuteWithdrawalParams({
                dataStore: params.dataStore,
                eventEmitter: params.eventEmitter,
                withdrawalVault: WithdrawalVault(payable(params.qntlvVault)),
                oracle: params.oracle,
                key: withdrawalKey,
                keeper: params.keeper,
                startingGas: params.startingGas,
                swapPricingType: ISwapPricingUtils.SwapPricingType.Withdrawal
            });

        return ExecuteWithdrawalUtils.executeWithdrawal(executeWithdrawalParams, withdrawal);
    }

    function _getMarketTokenAmount(
        DataStore dataStore,
        Oracle oracle,
        QntlvWithdrawal.Props memory qntlvWithdrawal
    ) internal view returns (uint256) {
        uint256 qntlvValue = QntlvUtils.getQntlvValue(
            dataStore,
            oracle,
            qntlvWithdrawal.qntlv(),
            false // maximize
        );
        uint256 qntlvSupply = QntlvToken(payable(qntlvWithdrawal.qntlv())).totalSupply();
        uint256 qntlvTokenUsd = QntlvUtils.qntlvTokenAmountToUsd(qntlvWithdrawal.qntlvTokenAmount(), qntlvValue, qntlvSupply);

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, qntlvWithdrawal.market());
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            true // maximize
        );
        uint256 marketTokenAmount = MarketUtils.usdToMarketTokenAmount(
            qntlvTokenUsd,
            poolValueInfo.poolValue.toUint256(),
            ERC20(market.marketToken).totalSupply()
        );

        return marketTokenAmount;
    }

    function cancelQntlvWithdrawal(CancelQntlvWithdrawalParams memory params) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(params.dataStore, params.key);
        QntlvWithdrawalStoreUtils.remove(params.dataStore, params.key, qntlvWithdrawal.account());

        params.qntlvVault.transferOut(
            qntlvWithdrawal.qntlv(),
            qntlvWithdrawal.account(),
            qntlvWithdrawal.qntlvTokenAmount(),
            false // shouldUnwrapNativeToken
        );

        QntlvWithdrawalEventUtils.emitQntlvWithdrawalCancelled(
            params.eventEmitter,
            params.key,
            qntlvWithdrawal.account(),
            params.reason,
            params.reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterQntlvWithdrawalCancellation(params.key, qntlvWithdrawal, eventData);

        uint256 marketCount = QntlvUtils.getQntlvMarketCount(params.dataStore, qntlvWithdrawal.qntlv());
        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.qntlvVault,
            params.key,
            qntlvWithdrawal.callbackContract(),
            qntlvWithdrawal.executionFee(),
            params.startingGas,
            GasUtils.estimateQntlvWithdrawalOraclePriceCount(
                marketCount,
                qntlvWithdrawal.longTokenSwapPath().length + qntlvWithdrawal.shortTokenSwapPath().length
            ),
            params.keeper,
            qntlvWithdrawal.receiver()
        );
    }
}
