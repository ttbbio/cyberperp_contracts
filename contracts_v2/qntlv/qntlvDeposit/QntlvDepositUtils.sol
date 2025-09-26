// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../deposit/DepositVault.sol";
import "../../deposit/ExecuteDepositUtils.sol";
import "../../deposit/DepositUtils.sol";
import "../../data/DataStore.sol";
import "../../oracle/Oracle.sol";
import "../../market/Market.sol";
import "../../market/MarketUtils.sol";
import "../../data/Keys.sol";
import "../../event/EventUtils.sol";

import "../QntlvVault.sol";
import "../QntlvUtils.sol";
import "../QntlvToken.sol";
import "../QntlvEventUtils.sol";
import "./QntlvDeposit.sol";
import "./QntlvDepositEventUtils.sol";
import "./QntlvDepositStoreUtils.sol";

library QntlvDepositUtils {
    using QntlvDeposit for QntlvDeposit.Props;
    using Deposit for Deposit.Props;
    using SafeCast for int256;
    using SafeCast for uint256;
    using EventUtils for EventUtils.UintItems;

    struct CreateQntlvDepositParams {
        address qntlv;
        address market;
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minQntlvTokens;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bool shouldUnwrapNativeToken;
        bool isMarketTokenDeposit;
    }

    struct CreateQntlvDepositCache {
        uint256 marketTokenAmount;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
    }

    struct ExecuteQntlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        QntlvVault qntlvVault;
        Oracle oracle;
        bytes32 key;
        uint256 startingGas;
        address keeper;
    }

    struct ExecuteQntlvDepositCache {
        Market.Props market;
        MarketPoolValueInfo.Props marketPoolValueInfo;
        uint256 marketTokenSupply;
        uint256 receivedMarketTokens;
        uint256 mintAmount;
        uint256 marketCount;
        uint256 oraclePriceCount;
        uint256 qntlvValue;
        uint256 qntlvSupply;
    }

    struct CancelQntlvDepositParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        QntlvVault qntlvVault;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        string reason;
        bytes reasonBytes;
    }

    address public constant RECEIVER_FOR_FIRST_QNTLV_DEPOSIT = address(1);

    function createQntlvDeposit(
        DataStore dataStore,
        EventEmitter eventEmitter,
        QntlvVault qntlvVault,
        address account,
        CreateQntlvDepositParams memory params
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);
        QntlvUtils.validateQntlv(dataStore, params.qntlv);
        QntlvUtils.validateQntlvMarket(dataStore, params.qntlv, params.market, true);

        MarketUtils.validateEnabledMarket(dataStore, params.market);

        CreateQntlvDepositCache memory cache;

        if (params.isMarketTokenDeposit) {
            // user deposited QNTM tokens
            if (params.initialLongToken != address(0)) {
                revert Errors.InvalidQntlvDepositInitialLongToken(params.initialLongToken);
            }
            if (params.initialShortToken != address(0)) {
                revert Errors.InvalidQntlvDepositInitialShortToken(params.initialShortToken);
            }
            if (params.longTokenSwapPath.length > 0 || params.shortTokenSwapPath.length > 0) {
                revert Errors.InvalidQntlvDepositSwapPath(
                    params.longTokenSwapPath.length,
                    params.shortTokenSwapPath.length
                );
            }
            cache.marketTokenAmount = qntlvVault.recordTransferIn(params.market);

            if (cache.marketTokenAmount == 0) {
                revert Errors.EmptyQntlvMarketAmount();
            }
        } else {
            MarketUtils.validateSwapPath(dataStore, params.longTokenSwapPath);
            MarketUtils.validateSwapPath(dataStore, params.shortTokenSwapPath);

            if (params.initialLongToken == address(0)) {
                revert Errors.InvalidQntlvDepositInitialLongToken(params.initialLongToken);
            }
            if (params.initialShortToken == address(0)) {
                revert Errors.InvalidQntlvDepositInitialShortToken(params.initialShortToken);
            }

            // if the initialLongToken and initialShortToken are the same, only the initialLongTokenAmount would
            // be non-zero, the initialShortTokenAmount would be zero
            cache.initialLongTokenAmount = qntlvVault.recordTransferIn(params.initialLongToken);
            if (params.initialShortToken != params.initialLongToken) {
                cache.initialShortTokenAmount = qntlvVault.recordTransferIn(params.initialShortToken);
            }
        }

        address wnt = TokenUtils.wnt(dataStore);
        if (params.initialLongToken == wnt) {
            if (cache.initialLongTokenAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(cache.initialLongTokenAmount, params.executionFee);
            }
            cache.initialLongTokenAmount -= params.executionFee;
        } else if (params.initialShortToken == wnt) {
            if (cache.initialShortTokenAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(cache.initialShortTokenAmount, params.executionFee);
            }
            cache.initialShortTokenAmount -= params.executionFee;
        } else {
            uint256 wntAmount = qntlvVault.recordTransferIn(wnt);
            if (wntAmount < params.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.executionFee);
            }

            params.executionFee = wntAmount;
        }

        if (!params.isMarketTokenDeposit && (cache.initialLongTokenAmount == 0 && cache.initialShortTokenAmount == 0)) {
            revert Errors.EmptyQntlvDepositAmounts();
        }

        AccountUtils.validateReceiver(params.receiver);

        QntlvDeposit.Props memory qntlvDeposit = QntlvDeposit.Props(
            QntlvDeposit.Addresses({
                account: account,
                qntlv: params.qntlv,
                receiver: params.receiver,
                callbackContract: params.callbackContract,
                uiFeeReceiver: params.uiFeeReceiver,
                market: params.market,
                initialLongToken: params.initialLongToken,
                initialShortToken: params.initialShortToken,
                longTokenSwapPath: params.longTokenSwapPath,
                shortTokenSwapPath: params.shortTokenSwapPath
            }),
            QntlvDeposit.Numbers({
                marketTokenAmount: cache.marketTokenAmount,
                initialLongTokenAmount: cache.initialLongTokenAmount,
                initialShortTokenAmount: cache.initialShortTokenAmount,
                minQntlvTokens: params.minQntlvTokens,
                updatedAtTime: Chain.currentTimestamp(),
                executionFee: params.executionFee,
                callbackGasLimit: params.callbackGasLimit
            }),
            QntlvDeposit.Flags({
                shouldUnwrapNativeToken: params.shouldUnwrapNativeToken,
                isMarketTokenDeposit: params.isMarketTokenDeposit
            })
        );

        CallbackUtils.validateCallbackGasLimit(dataStore, params.callbackGasLimit);

        uint256 marketCount = QntlvUtils.getQntlvMarketCount(dataStore, qntlvDeposit.qntlv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteQntlvDepositGasLimit(dataStore, qntlvDeposit, marketCount);
        uint256 oraclePriceCount = GasUtils.estimateQntlvDepositOraclePriceCount(
            marketCount,
            params.longTokenSwapPath.length + params.shortTokenSwapPath.length
        );
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, params.executionFee, oraclePriceCount);

        bytes32 key = NonceUtils.getNextKey(dataStore);

        QntlvDepositStoreUtils.set(dataStore, key, qntlvDeposit);

        QntlvDepositEventUtils.emitQntlvDepositCreated(eventEmitter, key, qntlvDeposit);

        return key;
    }

    function executeQntlvDeposit(
        ExecuteQntlvDepositParams memory params,
        QntlvDeposit.Props memory qntlvDeposit
    ) external returns (uint256) {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        QntlvDepositStoreUtils.remove(params.dataStore, params.key, qntlvDeposit.account());

        // should be called before any tokens are minted
        _validateFirstQntlvDeposit(params, qntlvDeposit);

        ExecuteQntlvDepositCache memory cache;

        cache.receivedMarketTokens = _processMarketDeposit(params, qntlvDeposit, params.qntlvVault);

        // qntlvValue should be calculated after funds are deposited into QNTM market
        // but before QNTLV syncs QNTM token balance for qntlvValue to account for
        // slightly increased QNTM market price because of paid fees
        cache.qntlvValue = QntlvUtils.getQntlvValue(
            params.dataStore,
            params.oracle,
            qntlvDeposit.qntlv(),
            true // maximize
        );
        QntlvToken(payable(qntlvDeposit.qntlv())).syncTokenBalance(qntlvDeposit.market());

        cache.qntlvSupply = QntlvToken(payable(qntlvDeposit.qntlv())).totalSupply();
        cache.mintAmount = _getMintAmount(
            params.dataStore,
            params.oracle,
            qntlvDeposit,
            cache.receivedMarketTokens,
            cache.qntlvValue,
            cache.qntlvSupply
        );
        if (cache.mintAmount < qntlvDeposit.minQntlvTokens()) {
            revert Errors.MinQntlvTokens(cache.mintAmount, qntlvDeposit.minQntlvTokens());
        }

        QntlvToken(payable(qntlvDeposit.qntlv())).mint(qntlvDeposit.receiver(), cache.mintAmount);

        cache.market = MarketUtils.getEnabledMarket(params.dataStore, qntlvDeposit.market());
        cache.marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            cache.market,
            params.oracle.getPrimaryPrice(cache.market.indexToken),
            params.oracle.getPrimaryPrice(cache.market.longToken),
            params.oracle.getPrimaryPrice(cache.market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );
        cache.marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(qntlvDeposit.market())));

        QntlvUtils.validateQntlvMarketTokenBalance(
            params.dataStore,
            qntlvDeposit.qntlv(),
            cache.market,
            cache.marketPoolValueInfo.poolValue.toUint256(),
            cache.marketTokenSupply
        );

        QntlvDepositEventUtils.emitQntlvDepositExecuted(
            params.eventEmitter,
            params.key,
            qntlvDeposit.account(),
            cache.mintAmount
        );

        cache.qntlvValue = QntlvUtils.getQntlvValue(
            params.dataStore,
            params.oracle,
            qntlvDeposit.qntlv(),
            true // maximize
        );
        cache.qntlvSupply = QntlvToken(payable(qntlvDeposit.qntlv())).totalSupply();
        QntlvEventUtils.emitQntlvValueUpdated(params.eventEmitter, qntlvDeposit.qntlv(), cache.qntlvValue, cache.qntlvSupply);

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedQntlvTokens", cache.mintAmount);
        CallbackUtils.afterQntlvDepositExecution(params.key, qntlvDeposit, eventData);

        cache.marketCount = QntlvUtils.getQntlvMarketCount(params.dataStore, qntlvDeposit.qntlv());
        cache.oraclePriceCount = GasUtils.estimateQntlvDepositOraclePriceCount(
            cache.marketCount,
            qntlvDeposit.longTokenSwapPath().length + qntlvDeposit.shortTokenSwapPath().length
        );
        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.qntlvVault,
            params.key,
            qntlvDeposit.callbackContract(),
            qntlvDeposit.executionFee(),
            params.startingGas,
            cache.oraclePriceCount,
            params.keeper,
            qntlvDeposit.receiver()
        );

        return cache.mintAmount;
    }

    function _validateFirstQntlvDeposit(
        ExecuteQntlvDepositParams memory params,
        QntlvDeposit.Props memory qntlvDeposit
    ) internal view {
        address qntlv = qntlvDeposit.qntlv();
        uint256 initialQntlvTokenSupply = QntlvToken(payable(qntlv)).totalSupply();

        // return if this is not the first qntlv deposit
        if (initialQntlvTokenSupply != 0) {
            return;
        }

        uint256 minQntlvTokens = params.dataStore.getUint(Keys.minQntlvTokensForFirstQntlvDepositKey(qntlv));

        // return if there is no minQntlvTokens requirement
        if (minQntlvTokens == 0) {
            return;
        }

        if (qntlvDeposit.receiver() != RECEIVER_FOR_FIRST_QNTLV_DEPOSIT) {
            revert Errors.InvalidReceiverForFirstQntlvDeposit(qntlvDeposit.receiver(), RECEIVER_FOR_FIRST_QNTLV_DEPOSIT);
        }

        if (qntlvDeposit.minQntlvTokens() < minQntlvTokens) {
            revert Errors.InvalidMinQntlvTokensForFirstQntlvDeposit(qntlvDeposit.minQntlvTokens(), minQntlvTokens);
        }
    }

    function _getMintAmount(
        DataStore dataStore,
        Oracle oracle,
        QntlvDeposit.Props memory qntlvDeposit,
        uint256 receivedMarketTokens,
        uint256 qntlvValue,
        uint256 qntlvSupply
    ) internal view returns (uint256) {
        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, qntlvDeposit.market());
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            false // maximize
        );
        uint256 marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(market.marketToken)));
        uint256 receivedMarketTokensUsd = MarketUtils.marketTokenAmountToUsd(
            receivedMarketTokens,
            poolValueInfo.poolValue.toUint256(),
            marketTokenSupply
        );
        return QntlvUtils.usdToQntlvTokenAmount(receivedMarketTokensUsd, qntlvValue, qntlvSupply);
    }

    function _processMarketDeposit(
        ExecuteQntlvDepositParams memory params,
        QntlvDeposit.Props memory qntlvDeposit,
        QntlvVault qntlvVault
    ) private returns (uint256) {
        if (qntlvDeposit.isMarketTokenDeposit()) {
            Market.Props memory market = MarketUtils.getEnabledMarket(params.dataStore, qntlvDeposit.market());

            MarketUtils.MarketPrices memory marketPrices = MarketUtils.MarketPrices(
                params.oracle.getPrimaryPrice(market.indexToken),
                params.oracle.getPrimaryPrice(market.longToken),
                params.oracle.getPrimaryPrice(market.shortToken)
            );
            MarketUtils.validateMaxPnl(
                params.dataStore,
                market,
                marketPrices,
                Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
                Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS
            );

            // user deposited QNTM tokens
            qntlvVault.transferOut(qntlvDeposit.market(), qntlvDeposit.qntlv(), qntlvDeposit.marketTokenAmount());
            return qntlvDeposit.marketTokenAmount();
        }

        Deposit.Props memory deposit = Deposit.Props(
            Deposit.Addresses({
                account: qntlvDeposit.qntlv(),
                receiver: qntlvDeposit.qntlv(),
                callbackContract: address(0),
                uiFeeReceiver: qntlvDeposit.uiFeeReceiver(),
                market: qntlvDeposit.market(),
                initialLongToken: qntlvDeposit.initialLongToken(),
                initialShortToken: qntlvDeposit.initialShortToken(),
                longTokenSwapPath: qntlvDeposit.longTokenSwapPath(),
                shortTokenSwapPath: qntlvDeposit.shortTokenSwapPath()
            }),
            Deposit.Numbers({
                initialLongTokenAmount: qntlvDeposit.initialLongTokenAmount(),
                initialShortTokenAmount: qntlvDeposit.initialShortTokenAmount(),
                minMarketTokens: 0,
                updatedAtTime: qntlvDeposit.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            }),
            Deposit.Flags({shouldUnwrapNativeToken: false})
        );

        bytes32 depositKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.DEPOSIT_LIST, depositKey);
        DepositEventUtils.emitDepositCreated(params.eventEmitter, depositKey, deposit, DepositUtils.DepositType.Qntlv);

        ExecuteDepositUtils.ExecuteDepositParams memory executeDepositParams = ExecuteDepositUtils.ExecuteDepositParams(
                params.dataStore,
                params.eventEmitter,
                DepositVault(payable(params.qntlvVault)),
                params.oracle,
                depositKey,
                params.keeper,
                params.startingGas,
                ISwapPricingUtils.SwapPricingType.Deposit,
                true // includeVirtualInventoryImpact
            );

        uint256 receivedMarketTokens = ExecuteDepositUtils.executeDeposit(executeDepositParams, deposit);
        return receivedMarketTokens;
    }

    function cancelQntlvDeposit(CancelQntlvDepositParams memory params) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        params.startingGas -= gasleft() / 63;

        QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(params.dataStore, params.key);
        QntlvDepositStoreUtils.remove(params.dataStore, params.key, qntlvDeposit.account());

        if (qntlvDeposit.isMarketTokenDeposit()) {
            // in this case marketTokenAmount > 0
            params.qntlvVault.transferOut(
                qntlvDeposit.market(),
                qntlvDeposit.account(),
                qntlvDeposit.marketTokenAmount(),
                qntlvDeposit.shouldUnwrapNativeToken()
            );
        } else {
            if (qntlvDeposit.initialLongTokenAmount() > 0) {
                params.qntlvVault.transferOut(
                    qntlvDeposit.initialLongToken(),
                    qntlvDeposit.account(),
                    qntlvDeposit.initialLongTokenAmount(),
                    qntlvDeposit.shouldUnwrapNativeToken()
                );
            }

            if (qntlvDeposit.initialShortTokenAmount() > 0) {
                params.qntlvVault.transferOut(
                    qntlvDeposit.initialShortToken(),
                    qntlvDeposit.account(),
                    qntlvDeposit.initialShortTokenAmount(),
                    qntlvDeposit.shouldUnwrapNativeToken()
                );
            }
        }

        QntlvDepositEventUtils.emitQntlvDepositCancelled(
            params.eventEmitter,
            params.key,
            qntlvDeposit.account(),
            params.reason,
            params.reasonBytes
        );

        EventUtils.EventLogData memory eventData;
        CallbackUtils.afterQntlvDepositCancellation(params.key, qntlvDeposit, eventData);

        uint256 marketCount = QntlvUtils.getQntlvMarketCount(params.dataStore, qntlvDeposit.qntlv());
        uint256 oraclePriceCount = GasUtils.estimateQntlvDepositOraclePriceCount(
            marketCount,
            qntlvDeposit.longTokenSwapPath().length + qntlvDeposit.shortTokenSwapPath().length
        );
        GasUtils.payExecutionFee(
            params.dataStore,
            params.eventEmitter,
            params.qntlvVault,
            params.key,
            qntlvDeposit.callbackContract(),
            qntlvDeposit.executionFee(),
            params.startingGas,
            oraclePriceCount,
            params.keeper,
            qntlvDeposit.receiver()
        );
    }
}
