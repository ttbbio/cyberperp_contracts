// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../position/Position.sol";

import "../market/Market.sol";
import "../price/Price.sol";

import "../position/Position.sol";
import "../market/Market.sol";

import "../qntlv/QntlvUtils.sol";
import "../qntlv/QntlvStoreUtils.sol";
import "../qntlv/qntlvDeposit/QntlvDepositStoreUtils.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawalStoreUtils.sol";
import "../qntlv/qntlvShift/QntlvShiftStoreUtils.sol";

// @title QntlvReader
contract QntlvReader {
    function getQntlvValue(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address qntlv,
        bool maximize
    ) external view returns (uint256) {
        return
            QntlvUtils.getQntlvValue(
                dataStore,
                marketAddresses,
                indexTokenPrices,
                longTokenPrice,
                shortTokenPrice,
                qntlv,
                maximize
            );
    }

    function getQntlvTokenPrice(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address qntlv,
        bool maximize
    ) external view returns (uint256, uint256, uint256) {
        return
            QntlvUtils.getQntlvTokenPrice(
                dataStore,
                marketAddresses,
                indexTokenPrices,
                longTokenPrice,
                shortTokenPrice,
                qntlv,
                maximize
            );
    }

    function getQntlv(DataStore dataStore, address qntlv) external view returns (Qntlv.Props memory) {
        return QntlvStoreUtils.get(dataStore, qntlv);
    }

    struct QntlvInfo {
        Qntlv.Props qntlv;
        address[] markets;
    }

    function getQntlvInfo(DataStore dataStore, address qntlv) public view returns (QntlvInfo memory) {
        bytes32 key = Keys.qntlvSupportedMarketListKey(qntlv);
        uint256 count = dataStore.getAddressCount(key);
        address[] memory markets = dataStore.getAddressValuesAt(key, 0, count);
        return QntlvInfo({qntlv: QntlvStoreUtils.get(dataStore, qntlv), markets: markets});
    }

    function getQntlvBySalt(DataStore dataStore, bytes32 salt) external view returns (Qntlv.Props memory) {
        return QntlvStoreUtils.getBySalt(dataStore, salt);
    }

    function getQntlvs(DataStore dataStore, uint256 start, uint256 end) external view returns (Qntlv.Props[] memory) {
        uint256 qntlvCount = QntlvStoreUtils.getQntlvCount(dataStore);
        if (end > qntlvCount) {
            end = qntlvCount;
        }
        address[] memory qntlvKeys = QntlvStoreUtils.getQntlvKeys(dataStore, start, end);
        Qntlv.Props[] memory qntlvs = new Qntlv.Props[](qntlvKeys.length);
        for (uint256 i; i < qntlvKeys.length; i++) {
            address qntlvKey = qntlvKeys[i];
            Qntlv.Props memory qntlv = QntlvStoreUtils.get(dataStore, qntlvKey);
            qntlvs[i] = qntlv;
        }

        return qntlvs;
    }

    function getQntlvInfoList(DataStore dataStore, uint256 start, uint256 end) external view returns (QntlvInfo[] memory) {
        uint256 qntlvCount = QntlvStoreUtils.getQntlvCount(dataStore);
        if (end > qntlvCount) {
            end = qntlvCount;
        }
        address[] memory qntlvKeys = QntlvStoreUtils.getQntlvKeys(dataStore, start, end);
        QntlvInfo[] memory qntlvInfoLists = new QntlvInfo[](qntlvKeys.length);
        for (uint256 i; i < qntlvKeys.length; i++) {
            address qntlvKey = qntlvKeys[i];
            qntlvInfoLists[i] = getQntlvInfo(dataStore, qntlvKey);
        }

        return qntlvInfoLists;
    }

    function getQntlvDeposit(DataStore dataStore, bytes32 key) external view returns (QntlvDeposit.Props memory) {
        return QntlvDepositStoreUtils.get(dataStore, key);
    }

    function getQntlvDeposits(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (QntlvDeposit.Props[] memory) {
        bytes32[] memory qntlvDepositKeys = QntlvDepositStoreUtils.getQntlvDepositKeys(dataStore, start, end);
        QntlvDeposit.Props[] memory qntlvDeposits = new QntlvDeposit.Props[](qntlvDepositKeys.length);
        for (uint256 i; i < qntlvDepositKeys.length; i++) {
            bytes32 qntlvDepositKey = qntlvDepositKeys[i];
            QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(dataStore, qntlvDepositKey);
            qntlvDeposits[i] = qntlvDeposit;
        }

        return qntlvDeposits;
    }

    function getAccountQntlvDeposits(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (QntlvDeposit.Props[] memory) {
        bytes32[] memory qntlvDepositKeys = QntlvDepositStoreUtils.getAccountQntlvDepositKeys(dataStore, account, start, end);
        QntlvDeposit.Props[] memory qntlvDeposits = new QntlvDeposit.Props[](qntlvDepositKeys.length);
        for (uint256 i; i < qntlvDepositKeys.length; i++) {
            bytes32 qntlvDepositKey = qntlvDepositKeys[i];
            QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(dataStore, qntlvDepositKey);
            qntlvDeposits[i] = qntlvDeposit;
        }

        return qntlvDeposits;
    }

    function getQntlvWithdrawal(DataStore dataStore, bytes32 key) external view returns (QntlvWithdrawal.Props memory) {
        return QntlvWithdrawalStoreUtils.get(dataStore, key);
    }

    function getQntlvWithdrawals(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (QntlvWithdrawal.Props[] memory) {
        bytes32[] memory qntlvWithdrawalKeys = QntlvWithdrawalStoreUtils.getQntlvWithdrawalKeys(dataStore, start, end);
        QntlvWithdrawal.Props[] memory qntlvWithdrawals = new QntlvWithdrawal.Props[](qntlvWithdrawalKeys.length);
        for (uint256 i; i < qntlvWithdrawalKeys.length; i++) {
            bytes32 qntlvWithdrawalKey = qntlvWithdrawalKeys[i];
            QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(dataStore, qntlvWithdrawalKey);
            qntlvWithdrawals[i] = qntlvWithdrawal;
        }

        return qntlvWithdrawals;
    }

    function getAccountQntlvWithdrawals(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (QntlvWithdrawal.Props[] memory) {
        bytes32[] memory qntlvWithdrawalKeys = QntlvWithdrawalStoreUtils.getAccountQntlvWithdrawalKeys(
            dataStore,
            account,
            start,
            end
        );
        QntlvWithdrawal.Props[] memory qntlvWithdrawals = new QntlvWithdrawal.Props[](qntlvWithdrawalKeys.length);
        for (uint256 i; i < qntlvWithdrawalKeys.length; i++) {
            bytes32 qntlvWithdrawalKey = qntlvWithdrawalKeys[i];
            QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(dataStore, qntlvWithdrawalKey);
            qntlvWithdrawals[i] = qntlvWithdrawal;
        }

        return qntlvWithdrawals;
    }

    function getQntlvShift(DataStore dataStore, bytes32 key) external view returns (QntlvShift.Props memory) {
        return QntlvShiftStoreUtils.get(dataStore, key);
    }

    function getQntlvShifts(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (QntlvShift.Props[] memory) {
        bytes32[] memory qntlvShiftKeys = QntlvShiftStoreUtils.getQntlvShiftKeys(dataStore, start, end);
        QntlvShift.Props[] memory qntlvShifts = new QntlvShift.Props[](qntlvShiftKeys.length);
        for (uint256 i; i < qntlvShiftKeys.length; i++) {
            bytes32 qntlvShiftKey = qntlvShiftKeys[i];
            QntlvShift.Props memory qntlvShift = QntlvShiftStoreUtils.get(dataStore, qntlvShiftKey);
            qntlvShifts[i] = qntlvShift;
        }

        return qntlvShifts;
    }
}
