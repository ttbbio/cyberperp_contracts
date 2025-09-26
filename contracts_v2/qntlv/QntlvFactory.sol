// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./QntlvToken.sol";
import "./Qntlv.sol";
import "./QntlvStoreUtils.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";

// @title QntlvFactory
// @dev Contract to create qntlv
contract QntlvFactory is RoleModule {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    function createQntlv(
        address longToken,
        address shortToken,
        bytes32 qntlvType,
        string memory name,
        string memory symbol
    ) external onlyMarketKeeper returns (Qntlv.Props memory) {
        // not the same as length in characters
        if (bytes(symbol).length > 30) {
            revert Errors.QntlvSymbolTooLong();
        }
        if (bytes(name).length > 100) {
            revert Errors.QntlvNameTooLong();
        }

        bytes32 salt = keccak256(abi.encode("QUANTARA_QNTLV", longToken, shortToken, qntlvType));

        address existingQntlvAddress = dataStore.getAddress(QntlvStoreUtils.getQntlvSaltHash(salt));
        if (existingQntlvAddress != address(0)) {
            revert Errors.QntlvAlreadyExists(qntlvType, existingQntlvAddress);
        }

        QntlvToken qntlvToken = new QntlvToken{salt: salt}(roleStore, dataStore, name, symbol);

        Qntlv.Props memory qntlv = Qntlv.Props({qntlvToken: address(qntlvToken), longToken: longToken, shortToken: shortToken});

        QntlvStoreUtils.set(dataStore, address(qntlvToken), salt, qntlv);

        emitQntlvCreated(address(qntlvToken), salt, longToken, shortToken, qntlvType);

        return qntlv;
    }

    function emitQntlvCreated(address qntlvAddress, bytes32 salt, address longToken, address shortToken, bytes32 qntlvType) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "qntlvToken", qntlvAddress);
        eventData.addressItems.setItem(1, "longToken", longToken);
        eventData.addressItems.setItem(2, "shortToken", shortToken);

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "salt", salt);
        eventData.bytes32Items.setItem(1, "qntlvType", qntlvType);

        eventEmitter.emitEventLog1("QntlvCreated", Cast.toBytes32(qntlvAddress), eventData);
    }
}
