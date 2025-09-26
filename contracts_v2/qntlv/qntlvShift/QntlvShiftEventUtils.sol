// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../event/EventEmitter.sol";
import "../../event/EventUtils.sol";

import "./QntlvShift.sol";

library QntlvShiftEventUtils {
    using QntlvShift for QntlvShift.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitQntlvShiftCreated(EventEmitter eventEmitter, bytes32 key, QntlvShift.Props memory qntlvShift) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "fromMarket", qntlvShift.fromMarket());
        eventData.addressItems.setItem(1, "toMarket", qntlvShift.toMarket());
        eventData.addressItems.setItem(2, "qntlv", qntlvShift.qntlv());

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "marketTokenAmount", qntlvShift.marketTokenAmount());
        eventData.uintItems.setItem(1, "minMarketTokens", qntlvShift.minMarketTokens());
        eventData.uintItems.setItem(2, "updatedAtTime", qntlvShift.updatedAtTime());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog1("QntlvShiftCreated", key, eventData);
    }

    function emitQntlvShiftExecuted(EventEmitter eventEmitter, bytes32 key, uint256 receivedMarketTokens) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedMarketTokens", receivedMarketTokens);

        eventEmitter.emitEventLog1("QntlvShiftExecuted", key, eventData);
    }

    function emitQntlvShiftCancelled(
        EventEmitter eventEmitter,
        bytes32 key,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "reason", reason);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "reasonBytes", reasonBytes);

        eventEmitter.emitEventLog1("QntlvShiftCancelled", key, eventData);
    }
}
