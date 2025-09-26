// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../nonce/NonceUtils.sol";
import "../../bank/Bank.sol";

import "../../event/EventEmitter.sol";
import "../../shift/ShiftUtils.sol";
import "../QntlvUtils.sol";
import "../QntlvToken.sol";
import "../QntlvVault.sol";

import "./QntlvShiftStoreUtils.sol";
import "./QntlvShiftEventUtils.sol";
import "./QntlvShift.sol";

library QntlvShiftUtils {
    using QntlvShift for QntlvShift.Props;
    using SafeCast for int256;
    using SafeCast for uint256;

    struct CreateQntlvShiftParams {
        address qntlv;
        address fromMarket;
        address toMarket;
        uint256 marketTokenAmount;
        uint256 minMarketTokens;
    }

    struct ExecuteQntlvShiftParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        Oracle oracle;
        ShiftVault shiftVault;
        QntlvVault qntlvVault;
        bytes32 key;
        address keeper;
    }

    struct ExecuteQntlvShiftCache {
        Market.Props fromMarket;
        Market.Props toMarket;
        Shift.Props shift;
        MarketPoolValueInfo.Props fromMarketPoolValueInfo;
        uint256 fromMarketTokenSupply;
        MarketPoolValueInfo.Props toMarketPoolValueInfo;
        uint256 toMarketTokenSupply;
        uint256 marketTokensUsd;
        uint256 receivedMarketTokens;
        uint256 receivedMarketTokensUsd;
        bytes32 shiftKey;
        uint256 qntlvValue;
        uint256 qntlvSupply;
    }

    function createQntlvShift(
        DataStore dataStore,
        EventEmitter eventEmitter,
        CreateQntlvShiftParams memory params
    ) external returns (bytes32) {
        QntlvUtils.validateQntlv(dataStore, params.qntlv);
        QntlvUtils.validateQntlvMarket(dataStore, params.qntlv, params.fromMarket, false);
        QntlvUtils.validateQntlvMarket(dataStore, params.qntlv, params.toMarket, true);

        validateQntlvShiftInterval(dataStore, params.qntlv);

        uint256 fromMarketTokenBalance = QntlvToken(payable(params.qntlv)).tokenBalances(params.fromMarket);
        if (fromMarketTokenBalance < params.marketTokenAmount) {
            revert Errors.QntlvInsufficientMarketTokenBalance(
                params.qntlv,
                params.fromMarket,
                fromMarketTokenBalance,
                params.marketTokenAmount
            );
        }

        MarketUtils.validateEnabledMarket(dataStore, params.fromMarket);
        MarketUtils.validateEnabledMarket(dataStore, params.toMarket);

        QntlvShift.Props memory qntlvShift = QntlvShift.Props(
            QntlvShift.Addresses({qntlv: params.qntlv, fromMarket: params.fromMarket, toMarket: params.toMarket}),
            QntlvShift.Numbers({
                marketTokenAmount: params.marketTokenAmount,
                minMarketTokens: params.minMarketTokens,
                updatedAtTime: Chain.currentTimestamp()
            })
        );

        bytes32 key = NonceUtils.getNextKey(dataStore);

        QntlvShiftStoreUtils.set(dataStore, key, qntlvShift);

        QntlvShiftEventUtils.emitQntlvShiftCreated(eventEmitter, key, qntlvShift);

        return key;
    }

    function validateQntlvShiftInterval(DataStore dataStore, address qntlv) internal view {
        uint256 qntlvShiftMinInterval = dataStore.getUint(Keys.qntlvShiftMinIntervalKey(qntlv));
        if (qntlvShiftMinInterval == 0) {
            return;
        }

        uint256 qntlvShiftLastExecutedAt = dataStore.getUint(Keys.qntlvShiftLastExecutedAtKey(qntlv));
        if (Chain.currentTimestamp() < qntlvShiftLastExecutedAt + qntlvShiftMinInterval) {
            revert Errors.QntlvShiftIntervalNotYetPassed(
                Chain.currentTimestamp(),
                qntlvShiftLastExecutedAt,
                qntlvShiftMinInterval
            );
        }
    }

    function executeQntlvShift(
        ExecuteQntlvShiftParams memory params,
        QntlvShift.Props memory qntlvShift
    ) external returns (uint256) {
        QntlvShiftStoreUtils.remove(params.dataStore, params.key);

        validateQntlvShiftInterval(params.dataStore, qntlvShift.qntlv());
        params.dataStore.setUint(Keys.qntlvShiftLastExecutedAtKey(qntlvShift.qntlv()), Chain.currentTimestamp());

        Bank(payable(qntlvShift.qntlv())).transferOut(
            qntlvShift.fromMarket(),
            address(params.shiftVault),
            qntlvShift.marketTokenAmount()
        );
        params.shiftVault.syncTokenBalance(qntlvShift.fromMarket());

        ExecuteQntlvShiftCache memory cache;
        cache.shift = Shift.Props(
            Shift.Addresses({
                account: qntlvShift.qntlv(),
                receiver: qntlvShift.qntlv(),
                callbackContract: address(0),
                uiFeeReceiver: address(0),
                fromMarket: qntlvShift.fromMarket(),
                toMarket: qntlvShift.toMarket()
            }),
            Shift.Numbers({
                minMarketTokens: qntlvShift.minMarketTokens(),
                marketTokenAmount: qntlvShift.marketTokenAmount(),
                updatedAtTime: qntlvShift.updatedAtTime(),
                executionFee: 0,
                callbackGasLimit: 0
            })
        );

        cache.shiftKey = NonceUtils.getNextKey(params.dataStore);
        params.dataStore.addBytes32(Keys.SHIFT_LIST, cache.shiftKey);
        ShiftEventUtils.emitShiftCreated(params.eventEmitter, cache.shiftKey, cache.shift);

        ShiftUtils.ExecuteShiftParams memory executeShiftParams = ShiftUtils.ExecuteShiftParams({
            dataStore: params.dataStore,
            eventEmitter: params.eventEmitter,
            shiftVault: params.shiftVault,
            oracle: params.oracle,
            key: cache.shiftKey,
            keeper: params.keeper,

            // executionFee is not used for QntlvShift's
            // pass gasleft() not to break startGas calculations inside ShiftUtils
            startingGas: gasleft()
        });

        cache.receivedMarketTokens = ShiftUtils.executeShift(executeShiftParams, cache.shift);

        QntlvToken(payable(qntlvShift.qntlv())).syncTokenBalance(qntlvShift.toMarket());

        cache.toMarket = MarketStoreUtils.get(params.dataStore, qntlvShift.toMarket());

        cache.toMarketPoolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            cache.toMarket,
            params.oracle.getPrimaryPrice(cache.toMarket.indexToken),
            params.oracle.getPrimaryPrice(cache.toMarket.longToken),
            params.oracle.getPrimaryPrice(cache.toMarket.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );
        cache.toMarketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(qntlvShift.toMarket())));

        QntlvUtils.validateQntlvMarketTokenBalance(
            params.dataStore,
            qntlvShift.qntlv(),
            cache.toMarket,
            cache.toMarketPoolValueInfo.poolValue.toUint256(),
            cache.toMarketTokenSupply
        );
        cache.receivedMarketTokensUsd = MarketUtils.marketTokenAmountToUsd(
            cache.receivedMarketTokens,
            cache.toMarketPoolValueInfo.poolValue.toUint256(),
            cache.toMarketTokenSupply
        );

        cache.fromMarket = MarketStoreUtils.get(params.dataStore, qntlvShift.fromMarket());
        cache.fromMarketPoolValueInfo = MarketUtils.getPoolValueInfo(
            params.dataStore,
            cache.fromMarket,
            params.oracle.getPrimaryPrice(cache.fromMarket.indexToken),
            params.oracle.getPrimaryPrice(cache.fromMarket.longToken),
            params.oracle.getPrimaryPrice(cache.fromMarket.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true // maximize
        );
        cache.fromMarketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(qntlvShift.fromMarket())));

        cache.marketTokensUsd = MarketUtils.marketTokenAmountToUsd(
            qntlvShift.marketTokenAmount(),
            cache.fromMarketPoolValueInfo.poolValue.toUint256(),
            cache.fromMarketTokenSupply
        );

        validatePriceImpact(params.dataStore, qntlvShift.qntlv(), cache.marketTokensUsd, cache.receivedMarketTokensUsd);

        QntlvShiftEventUtils.emitQntlvShiftExecuted(params.eventEmitter, params.key, cache.receivedMarketTokens);

        cache.qntlvValue = QntlvUtils.getQntlvValue(
            params.dataStore,
            params.oracle,
            qntlvShift.qntlv(),
            true // maximize
        );
        cache.qntlvSupply = QntlvToken(payable(qntlvShift.qntlv())).totalSupply();
        QntlvEventUtils.emitQntlvValueUpdated(params.eventEmitter, qntlvShift.qntlv(), cache.qntlvValue, cache.qntlvSupply);

        return cache.receivedMarketTokens;
    }

    function cancelQntlvShift(
        DataStore dataStore,
        EventEmitter eventEmitter,
        bytes32 key,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        QntlvShiftStoreUtils.remove(dataStore, key);

        QntlvShiftEventUtils.emitQntlvShiftCancelled(eventEmitter, key, reason, reasonBytes);
    }

    function validatePriceImpact(
        DataStore dataStore,
        address qntlv,
        uint256 marketTokensUsd,
        uint256 receivedMarketTokensUsd
    ) internal view {
        if (marketTokensUsd < receivedMarketTokensUsd) {
            // price impact is positive, no need to validate it
            return;
        }

        uint256 qntlvMaxShiftPriceImpactFactor = dataStore.getUint(Keys.qntlvShiftMaxPriceImpactFactorKey(qntlv));

        uint256 effectivePriceImpactFactor = Precision.toFactor(
            marketTokensUsd - receivedMarketTokensUsd,
            marketTokensUsd
        );
        if (effectivePriceImpactFactor > qntlvMaxShiftPriceImpactFactor) {
            revert Errors.QntlvShiftMaxPriceImpactExceeded(effectivePriceImpactFactor, qntlvMaxShiftPriceImpactFactor);
        }
    }
}
