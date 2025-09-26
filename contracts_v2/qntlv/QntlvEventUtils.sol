// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

library QntlvEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitQntlvMarketAdded(EventEmitter eventEmitter, address qntlv, address market) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "qntlv", qntlv);
        eventData.addressItems.setItem(1, "market", market);

        eventEmitter.emitEventLog2("QntlvMarketAdded", Cast.toBytes32(qntlv), Cast.toBytes32(market), eventData);
    }

    function emitQntlvMarketRemoved(EventEmitter eventEmitter, address qntlv, address market) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "qntlv", qntlv);
        eventData.addressItems.setItem(1, "market", market);

        eventEmitter.emitEventLog2("QntlvMarketRemoved", Cast.toBytes32(qntlv), Cast.toBytes32(market), eventData);
    }

    function emitQntlvValueUpdated(EventEmitter eventEmitter, address qntlv, uint256 value, uint256 supply) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "qntlv", qntlv);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "value", value);
        eventData.uintItems.setItem(1, "supply", supply);

        eventEmitter.emitEventLog1("QntlvValueUpdated", Cast.toBytes32(qntlv), eventData);
    }
}
