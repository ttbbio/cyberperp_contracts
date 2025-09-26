// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../event/EventEmitter.sol";
import "../../event/EventUtils.sol";
import "../../utils/Cast.sol";

import "./QntlvWithdrawal.sol";

library QntlvWithdrawalEventUtils {
    using QntlvWithdrawal for QntlvWithdrawal.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitQntlvWithdrawalCreated(
        EventEmitter eventEmitter,
        bytes32 key,
        QntlvWithdrawal.Props memory qntlvWithdrawal
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(6);
        eventData.addressItems.setItem(0, "account", qntlvWithdrawal.account());
        eventData.addressItems.setItem(1, "receiver", qntlvWithdrawal.receiver());
        eventData.addressItems.setItem(2, "callbackContract", qntlvWithdrawal.callbackContract());
        eventData.addressItems.setItem(3, "market", qntlvWithdrawal.market());
        eventData.addressItems.setItem(4, "qntlv", qntlvWithdrawal.qntlv());
        eventData.addressItems.setItem(5, "uiFeeReceiver", qntlvWithdrawal.uiFeeReceiver());

        eventData.addressItems.initArrayItems(2);
        eventData.addressItems.setItem(0, "longTokenSwapPath", qntlvWithdrawal.longTokenSwapPath());
        eventData.addressItems.setItem(1, "shortTokenSwapPath", qntlvWithdrawal.shortTokenSwapPath());

        eventData.uintItems.initItems(6);
        eventData.uintItems.setItem(0, "qntlvTokenAmount", qntlvWithdrawal.qntlvTokenAmount());
        eventData.uintItems.setItem(1, "minLongTokenAmount", qntlvWithdrawal.minLongTokenAmount());
        eventData.uintItems.setItem(2, "minShortTokenAmount", qntlvWithdrawal.minShortTokenAmount());
        eventData.uintItems.setItem(3, "updatedAtTime", qntlvWithdrawal.updatedAtTime());
        eventData.uintItems.setItem(4, "executionFee", qntlvWithdrawal.executionFee());
        eventData.uintItems.setItem(5, "callbackGasLimit", qntlvWithdrawal.callbackGasLimit());

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "shouldUnwrapNativeToken", qntlvWithdrawal.shouldUnwrapNativeToken());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventEmitter.emitEventLog2("QntlvWithdrawalCreated", key, Cast.toBytes32(qntlvWithdrawal.account()), eventData);
    }

    function emitQntlvWithdrawalExecuted(EventEmitter eventEmitter, bytes32 key, address account) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "key", key);

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventEmitter.emitEventLog2("QntlvWithdrawalExecuted", key, Cast.toBytes32(account), eventData);
    }

    function emitQntlvWithdrawalCancelled(
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

        eventEmitter.emitEventLog2("QntlvWithdrawalCancelled", key, Cast.toBytes32(account), eventData);
    }
}
