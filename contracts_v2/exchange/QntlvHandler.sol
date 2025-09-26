// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";

import "../qntlv/QntlvUtils.sol";
import "../qntlv/qntlvDeposit/QntlvDepositUtils.sol";
import "../qntlv/qntlvDeposit/QntlvDepositStoreUtils.sol";
import "../qntlv/qntlvDeposit/QntlvDeposit.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawalUtils.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawalStoreUtils.sol";
import "../qntlv/qntlvWithdrawal/QntlvWithdrawal.sol";
import "../qntlv/qntlvShift/QntlvShiftUtils.sol";
import "../qntlv/QntlvVault.sol";

contract QntlvHandler is BaseHandler, ReentrancyGuard {
    using QntlvDeposit for QntlvDeposit.Props;
    using QntlvShift for QntlvShift.Props;
    using QntlvWithdrawal for QntlvWithdrawal.Props;

    QntlvVault public immutable qntlvVault;
    ShiftVault public immutable shiftVault;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        QntlvVault _qntlvVault,
        ShiftVault _shiftVault
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        qntlvVault = _qntlvVault;
        shiftVault = _shiftVault;
    }

    function createQntlvDeposit(
        address account,
        QntlvDepositUtils.CreateQntlvDepositParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createQntlvDepositFeatureDisabledKey(address(this)));

        return QntlvDepositUtils.createQntlvDeposit(dataStore, eventEmitter, qntlvVault, account, params);
    }

    // @key qntlvDeposit key
    // @oracleParams prices for all markets in QNTLV are required
    function executeQntlvDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(_dataStore, key);
        uint256 marketCount = QntlvUtils.getQntlvMarketCount(_dataStore, qntlvDeposit.qntlv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteQntlvDepositGasLimit(_dataStore, qntlvDeposit, marketCount);
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeQntlvDeposit{gas: executionGas}(key, qntlvDeposit, msg.sender) {} catch (
            bytes memory reasonBytes
        ) {
            _handleQntlvDepositError(key, startingGas, reasonBytes);
        }
    }

    function _executeQntlvDeposit(bytes32 key, QntlvDeposit.Props memory qntlvDeposit, address keeper) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeQntlvDepositFeatureDisabledKey(address(this)));

        QntlvDepositUtils.ExecuteQntlvDepositParams memory params = QntlvDepositUtils.ExecuteQntlvDepositParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            oracle: oracle,
            startingGas: startingGas,
            keeper: keeper
        });

        QntlvDepositUtils.executeQntlvDeposit(params, qntlvDeposit);
    }

    function _handleQntlvDepositError(bytes32 key, uint256 startingGas, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        QntlvDepositUtils.CancelQntlvDepositParams memory params = QntlvDepositUtils.CancelQntlvDepositParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            key: key,
            keeper: msg.sender,
            startingGas: startingGas,
            reason: reason,
            reasonBytes: reasonBytes
        });
        QntlvDepositUtils.cancelQntlvDeposit(params);
    }

    function cancelQntlvDeposit(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.cancelQntlvDepositFeatureDisabledKey(address(this)));

        QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(_dataStore, key);
        validateRequestCancellation(qntlvDeposit.updatedAtTime(), "QntlvDeposit");

        QntlvDepositUtils.CancelQntlvDepositParams memory params = QntlvDepositUtils.CancelQntlvDepositParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            key: key,
            keeper: qntlvDeposit.account(),
            startingGas: startingGas,
            reason: Keys.USER_INITIATED_CANCEL,
            reasonBytes: ""
        });
        QntlvDepositUtils.cancelQntlvDeposit(params);
    }

    function createQntlvWithdrawal(
        address account,
        QntlvWithdrawalUtils.CreateQntlvWithdrawalParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.createQntlvWithdrawalFeatureDisabledKey(address(this)));

        return QntlvWithdrawalUtils.createQntlvWithdrawal(_dataStore, eventEmitter, qntlvVault, account, params);
    }

    // @key qntlvDeposit key
    // @oracleParams prices for all markets in QNTLV are required
    function executeQntlvWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(_dataStore, key);
        uint256 marketCount = QntlvUtils.getQntlvMarketCount(_dataStore, qntlvWithdrawal.qntlv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteQntlvWithdrawalGasLimit(
            _dataStore,
            qntlvWithdrawal,
            marketCount
        );
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeQntlvWithdrawal{gas: executionGas}(key, qntlvWithdrawal, msg.sender) {} catch (
            bytes memory reasonBytes
        ) {
            _handleQntlvWithdrawalError(key, startingGas, reasonBytes);
        }
    }

    function _executeQntlvWithdrawal(
        bytes32 key,
        QntlvWithdrawal.Props memory qntlvWithdrawal,
        address keeper
    ) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeQntlvWithdrawalFeatureDisabledKey(address(this)));

        QntlvWithdrawalUtils.ExecuteQntlvWithdrawalParams memory params = QntlvWithdrawalUtils.ExecuteQntlvWithdrawalParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            oracle: oracle,
            startingGas: startingGas,
            keeper: keeper
        });

        QntlvWithdrawalUtils.executeQntlvWithdrawal(params, qntlvWithdrawal);
    }

    function _handleQntlvWithdrawalError(bytes32 key, uint256 startingGas, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        QntlvWithdrawalUtils.CancelQntlvWithdrawalParams memory params = QntlvWithdrawalUtils.CancelQntlvWithdrawalParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            key: key,
            keeper: msg.sender,
            startingGas: startingGas,
            reason: reason,
            reasonBytes: reasonBytes
        });
        QntlvWithdrawalUtils.cancelQntlvWithdrawal(params);
    }

    function cancelQntlvWithdrawal(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.cancelQntlvWithdrawalFeatureDisabledKey(address(this)));

        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(_dataStore, key);
        validateRequestCancellation(qntlvWithdrawal.updatedAtTime(), "QntlvWithdrawal");

        QntlvWithdrawalUtils.CancelQntlvWithdrawalParams memory params = QntlvWithdrawalUtils.CancelQntlvWithdrawalParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            qntlvVault: qntlvVault,
            key: key,
            keeper: qntlvWithdrawal.account(),
            startingGas: startingGas,
            reason: Keys.USER_INITIATED_CANCEL,
            reasonBytes: ""
        });
        QntlvWithdrawalUtils.cancelQntlvWithdrawal(params);
    }

    function simulateExecuteQntlvDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external onlyController withSimulatedOraclePrices(params) globalNonReentrant {
        QntlvDeposit.Props memory qntlvDeposit = QntlvDepositStoreUtils.get(dataStore, key);

        this._executeQntlvDeposit(key, qntlvDeposit, msg.sender);
    }

    function simulateExecuteQntlvWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external onlyController withSimulatedOraclePrices(params) globalNonReentrant {
        QntlvWithdrawal.Props memory qntlvWithdrawal = QntlvWithdrawalStoreUtils.get(dataStore, key);

        this._executeQntlvWithdrawal(key, qntlvWithdrawal, msg.sender);
    }

    function createQntlvShift(
        QntlvShiftUtils.CreateQntlvShiftParams memory params
    ) external globalNonReentrant onlyOrderKeeper returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createQntlvShiftFeatureDisabledKey(address(this)));

        return QntlvShiftUtils.createQntlvShift(dataStore, eventEmitter, params);
    }

    // @key qntlvDeposit key
    // @oracleParams prices for `fromMarket` and `toMarket` are required
    function executeQntlvShift(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        QntlvShift.Props memory qntlvShift = QntlvShiftStoreUtils.get(_dataStore, key);
        uint256 estimatedGasLimit = GasUtils.estimateExecuteQntlvShiftGasLimit(_dataStore);
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeQntlvShift{gas: executionGas}(key, qntlvShift, msg.sender) {} catch (bytes memory reasonBytes) {
            _handleQntlvShiftError(key, reasonBytes);
        }
    }

    function _executeQntlvShift(bytes32 key, QntlvShift.Props memory qntlvShift, address keeper) external onlySelf {
        FeatureUtils.validateFeature(dataStore, Keys.executeQntlvShiftFeatureDisabledKey(address(this)));

        QntlvShiftUtils.ExecuteQntlvShiftParams memory params = QntlvShiftUtils.ExecuteQntlvShiftParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            shiftVault: shiftVault,
            qntlvVault: qntlvVault,
            oracle: oracle,
            keeper: keeper
        });

        QntlvShiftUtils.executeQntlvShift(params, qntlvShift);
    }

    function _handleQntlvShiftError(bytes32 key, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        QntlvShiftUtils.cancelQntlvShift(
            dataStore,
            eventEmitter,
            key,
            reason,
            reasonBytes
        );
    }

    function addMarketToQntlv(address qntlv, address market) external globalNonReentrant onlyConfigKeeper {
        QntlvUtils.addMarketToQntlv(dataStore, eventEmitter, qntlv, market);
    }

    function removeMarketFromQntlv(address qntlv, address market) external globalNonReentrant onlyConfigKeeper {
        QntlvUtils.removeMarketFromQntlv(dataStore, eventEmitter, qntlv, market);
    }
}
