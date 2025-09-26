// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../oracle/Oracle.sol";
import "../market/Market.sol";
import "../market/MarketUtils.sol";
import "./QntlvToken.sol";
import "./QntlvEventUtils.sol";
import "./QntlvStoreUtils.sol";

library QntlvUtils {
    using SafeCast for int256;
    using SafeCast for uint256;

    struct GetQntlvValueCache {
        bytes32 marketListKey;
        uint256 marketCount;
        uint256 qntlvValue;
        Price.Props indexTokenPrice;
        Price.Props longTokenPrice;
        Price.Props shortTokenPrice;
        Market.Props market;
    }

    // @dev get the USD value of the Qntlv
    // @param dataStore DataStore
    // @param oracle Oracle
    // @param qntlv Qntlv
    // @param maximize
    // @return the USD value of the Qntlv
    function getQntlvValue(
        DataStore dataStore,
        Oracle oracle,
        address qntlv,
        bool maximize
    ) public view returns (uint256) {
        GetQntlvValueCache memory cache;
        cache.marketListKey = Keys.qntlvSupportedMarketListKey(qntlv);
        cache.marketCount = dataStore.getAddressCount(cache.marketListKey);

        address[] memory marketAddresses = dataStore.getAddressValuesAt(cache.marketListKey, 0, cache.marketCount);
        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
            if (i == 0) {
                cache.longTokenPrice = oracle.getPrimaryPrice(market.longToken);
                cache.shortTokenPrice = oracle.getPrimaryPrice(market.shortToken);
            }
            cache.qntlvValue += _getQntlvMarketValue(
                dataStore,
                qntlv,
                marketAddress,
                oracle.getPrimaryPrice(market.indexToken),
                cache.longTokenPrice,
                cache.shortTokenPrice,
                maximize
            );
        }

        return cache.qntlvValue;
    }

    function getQntlvValue(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address qntlv,
        bool maximize
    ) public view returns (uint256) {
        GetQntlvValueCache memory cache;

        for (uint256 i = 0; i < marketAddresses.length; i++) {
            address marketAddress = marketAddresses[i];
            cache.indexTokenPrice = indexTokenPrices[i];

            cache.qntlvValue += _getQntlvMarketValue(
                dataStore,
                qntlv,
                marketAddress,
                cache.indexTokenPrice,
                longTokenPrice,
                shortTokenPrice,
                maximize
            );
        }

        return cache.qntlvValue;
    }

    function _getQntlvMarketValue(
        DataStore dataStore,
        address qntlv,
        address marketAddress,
        Price.Props memory indexTokenPrice,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        bool maximize
    ) internal view returns (uint256) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);

        uint256 marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(marketAddress)));
        uint256 balance = QntlvToken(payable(qntlv)).tokenBalances(marketAddress);

        if (balance == 0) {
            return 0;
        }

        MarketPoolValueInfo.Props memory marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            indexTokenPrice,
            longTokenPrice,
            shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            maximize
        );

        if (marketPoolValueInfo.poolValue < 0) {
            revert Errors.QntlvNegativeMarketPoolValue(qntlv, marketAddress);
        }

        return
            MarketUtils.marketTokenAmountToUsd(balance, marketPoolValueInfo.poolValue.toUint256(), marketTokenSupply);
    }

    function getQntlvTokenPrice(
        DataStore dataStore,
        Oracle oracle,
        address qntlv,
        bool maximize
    ) internal view returns (uint256, uint256, uint256) {
        uint256 value = getQntlvValue(dataStore, oracle, qntlv, maximize);
        uint256 supply = ERC20(qntlv).totalSupply();

        return _getQntlvTokenPrice(value, supply);
    }

    function getQntlvTokenPrice(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address qntlv,
        bool maximize
    ) internal view returns (uint256, uint256, uint256) {
        uint256 value = getQntlvValue(
            dataStore,
            marketAddresses,
            indexTokenPrices,
            longTokenPrice,
            shortTokenPrice,
            qntlv,
            maximize
        );
        uint256 supply = ERC20(qntlv).totalSupply();

        return _getQntlvTokenPrice(value, supply);
    }

    function _getQntlvTokenPrice(uint256 value, uint256 supply) internal pure returns (uint256, uint256, uint256) {
        // if the supply is zero then treat the market token price as 1 USD
        if (supply == 0) {
            return (Precision.FLOAT_PRECISION, value, supply);
        }
        if (value == 0) {
            return (0, value, supply);
        }
        return (Precision.mulDiv(Precision.WEI_PRECISION, value, supply), value, supply);
    }

    function usdToQntlvTokenAmount(
        uint256 usdValue,
        uint256 qntlvValue,
        uint256 qntlvSupply
    ) internal pure returns (uint256) {
        // if the supply and qntlvValue is zero, use 1 USD as the token price
        if (qntlvSupply == 0 && qntlvValue == 0) {
            return Precision.floatToWei(usdValue);
        }

        // if the supply is zero and the qntlvValue is more than zero,
        // then include the qntlvValue for the amount of tokens minted so that
        // the market token price after mint would be 1 USD
        if (qntlvSupply == 0 && qntlvValue > 0) {
            return Precision.floatToWei(qntlvValue + usdValue);
        }

        // round market tokens down
        return Precision.mulDiv(qntlvSupply, usdValue, qntlvValue);
    }

    function qntlvTokenAmountToUsd(
        uint256 qntlvTokenAmount,
        uint256 qntlvValue,
        uint256 qntlvSupply
    ) internal pure returns (uint256) {
        if (qntlvSupply == 0) {
            revert Errors.EmptyQntlvTokenSupply();
        }

        return Precision.mulDiv(qntlvValue, qntlvTokenAmount, qntlvSupply);
    }

    function validateQntlvMarket(DataStore dataStore, address qntlv, address market, bool shouldBeEnabled) public view {
        if (!dataStore.containsAddress(Keys.qntlvSupportedMarketListKey(qntlv), market)) {
            revert Errors.QntlvUnsupportedMarket(qntlv, market);
        }

        if (shouldBeEnabled && dataStore.getBool(Keys.isQntlvMarketDisabledKey(qntlv, market))) {
            revert Errors.QntlvDisabledMarket(qntlv, market);
        }
    }

    function validateQntlv(DataStore dataStore, address qntlv) public view {
        if (!dataStore.containsAddress(Keys.QNTLV_LIST, qntlv)) {
            revert Errors.EmptyQntlv(qntlv);
        }
    }

    function getQntlvMarketCount(DataStore dataStore, address qntlv) external view returns (uint256) {
        return dataStore.getAddressCount(Keys.qntlvSupportedMarketListKey(qntlv));
    }

    function validateQntlvMarketTokenBalance(
        DataStore dataStore,
        address qntlv,
        Market.Props memory market,
        uint256 marketPoolValue,
        uint256 marketTokenSupply
    ) external view {
        uint256 maxMarketTokenBalanceUsd = dataStore.getUint(
            Keys.qntlvMaxMarketTokenBalanceUsdKey(qntlv, market.marketToken)
        );
        uint256 maxMarketTokenBalanceAmount = dataStore.getUint(
            Keys.qntlvMaxMarketTokenBalanceAmountKey(qntlv, market.marketToken)
        );

        if (maxMarketTokenBalanceAmount == 0 && maxMarketTokenBalanceUsd == 0) {
            return;
        }

        uint256 marketTokenBalanceAmount = QntlvToken(payable(qntlv)).tokenBalances(market.marketToken);
        if (maxMarketTokenBalanceAmount > 0 && marketTokenBalanceAmount > maxMarketTokenBalanceAmount) {
            revert Errors.QntlvMaxMarketTokenBalanceAmountExceeded(
                qntlv,
                market.marketToken,
                maxMarketTokenBalanceAmount,
                marketTokenBalanceAmount
            );
        }

        if (maxMarketTokenBalanceUsd > 0) {
            uint256 marketTokenBalanceUsd = MarketUtils.marketTokenAmountToUsd(
                marketTokenBalanceAmount,
                marketPoolValue,
                marketTokenSupply
            );
            if (marketTokenBalanceUsd > maxMarketTokenBalanceUsd) {
                revert Errors.QntlvMaxMarketTokenBalanceUsdExceeded(
                    qntlv,
                    market.marketToken,
                    maxMarketTokenBalanceUsd,
                    marketTokenBalanceUsd
                );
            }
        }
    }

    function addMarketToQntlv(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address qntlvAddress,
        address marketAddress
    ) external {
        validateQntlv(dataStore, qntlvAddress);

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketAddress);
        Qntlv.Props memory qntlv = QntlvStoreUtils.get(dataStore, qntlvAddress);
        if (market.longToken != qntlv.longToken) {
            revert Errors.QntlvInvalidLongToken(qntlvAddress, market.longToken, qntlv.longToken);
        }
        if (market.shortToken != qntlv.shortToken) {
            revert Errors.QntlvInvalidShortToken(qntlvAddress, market.shortToken, qntlv.shortToken);
        }

        bytes32 key = Keys.qntlvSupportedMarketListKey(qntlvAddress);
        if (dataStore.containsAddress(key, marketAddress)) {
            revert Errors.QntlvMarketAlreadyExists(qntlvAddress, marketAddress);
        }
        dataStore.addAddress(key, marketAddress);

        validateQntlvMarketCount(dataStore, qntlvAddress);

        QntlvEventUtils.emitQntlvMarketAdded(eventEmitter, qntlvAddress, market.marketToken);
    }

    function validateQntlvMarketCount(DataStore dataStore, address qntlvAddress) internal view {
        uint256 qntlvMaxMarketCount = dataStore.getUint(Keys.QNTLV_MAX_MARKET_COUNT);
        if (qntlvMaxMarketCount > 0) {
            bytes32 key = Keys.qntlvSupportedMarketListKey(qntlvAddress);
            uint256 qntlvMarketCount = dataStore.getAddressCount(key);
            if (qntlvMarketCount > qntlvMaxMarketCount) {
                revert Errors.QntlvMaxMarketCountExceeded(qntlvAddress, qntlvMaxMarketCount);
            }
        }
    }

    function removeMarketFromQntlv(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address qntlvAddress,
        address marketAddress
    ) external {
        validateQntlv(dataStore, qntlvAddress);
        validateQntlvMarket(dataStore, qntlvAddress, marketAddress, false);

        if (!dataStore.getBool(Keys.isQntlvMarketDisabledKey(qntlvAddress, marketAddress))) {
            revert Errors.QntlvEnabledMarket(qntlvAddress, marketAddress);
        }

        uint256 balance = QntlvToken(payable(qntlvAddress)).tokenBalances(marketAddress);
        if (balance != 0) {
            revert Errors.QntlvNonZeroMarketBalance(qntlvAddress, marketAddress);
        }

        bytes32 key = Keys.qntlvSupportedMarketListKey(qntlvAddress);
        dataStore.removeAddress(key, marketAddress);

        QntlvEventUtils.emitQntlvMarketRemoved(eventEmitter, qntlvAddress, marketAddress);
    }
}
