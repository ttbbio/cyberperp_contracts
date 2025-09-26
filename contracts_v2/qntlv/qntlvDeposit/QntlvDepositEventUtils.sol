// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../event/EventEmitter.sol";
import "../../event/EventUtils.sol";
import "../../utils/Cast.sol";

import "./QntlvDeposit.sol";

library QntlvDepositEventUtils {
    using QntlvDeposit for QntlvDeposit.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitQntlvDepositCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        QntlvDeposit.Props memory qntlvDeposit
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(8);
        eventData.addressItems.setItem(0, "account", qntlvDeposit.account());
        eventData.addressItems.setItem(1, "receiver", qntlvDeposit.receiver());
        eventData.addressItems.setItem(2, "callbackContract", qntlvDeposit.callbackContract());
        eventData.addressItems.setItem(3, "market", qntlvDeposit.market());
        eventData.addressItems.setItem(4, "qntlv", qntlvDeposit.qntlv());
        eventData.addressItems.setItem(5, "initialLongToken", qntlvDeposit.initialLongToken());
        eventData.addressItems.setItem(6, "initialShortToken", qntlvDeposit.initialShortToken());
        eventData.addressItems.setItem(7, "uiFeeReceiver", qntlvDeposit.uiFeeReceiver());

        eventData.addressItems.initArrayItems(2);
        eventData.addressItems.setItem(0, "longTokenSwapPath", qntlvDeposit.longTokenSwapPath());
        eventData.addressItems.setItem(1, "shortTokenSwapPath", qntlvDeposit.shortTokenSwapPath());

        eventData.uintItems.initItems(7);
        eventData.uintItems.setItem(0, "initialLongTokenAmount", qntlvDeposit.initialLongTokenAmount());
        eventData.uintItems.setItem(1, "initialShortTokenAmount", qntlvDeposit.initialShortTokenAmount());
        eventData.uintItems.setItem(2, "minQntlvTokens", qntlvDeposit.minQntlvTokens());
        eventData.uintItems.setItem(3, "updatedAtTime", qntlvDeposit.updatedAtTime());
        eventData.uintItems.setItem(4, "executionFee", qntlvDeposit.executionFee());
        eventData.uintItems.setItem(5, "callbackGasLimit", qntlvDeposit.callbackGasLimit());
        eventData.uintItems.setItem(6, "marketTokenAmount", qntlvDeposit.marketTokenAmount());

        eventData.boolItems.initItems(2);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", qntlvDeposit.shouldUnwrapNativeToken());
        eventData.boolItems.setItem(1, "isMarketTokenDeposit", qntlvDeposit.isMarketTokenDeposit());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog2(
            "QntlvDepositCreated",
            key,
            Cast.toBytes32(qntlvDeposit.account()),
            eventData
        );
    }

    function emitQntlvDepositExecuted(
        EventEmitter eventEmitter,
        bytes32 key,
        address account,
        uint256 receivedQntlvTokens
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "receivedQntlvTokens", receivedQntlvTokens);

        eventEmitter.emitEventLog2(
            "QntlvDepositExecuted",
            key,
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitQntlvDepositCancelled(
        EventEmitter eventEmitter,
        bytes32 key,
        address account,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "reason", reason);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "reasonBytes", reasonBytes);

        eventEmitter.emitEventLog2(
            "QntlvDepositCancelled",
            key,
            Cast.toBytes32(account),
            eventData
        );
    }
}
