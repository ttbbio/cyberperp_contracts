// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {DataStore} from "../data/DataStore.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract ConfigTimelockController is TimelockController {

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        DataStore _dataStore,
        EventEmitter _eventEmitter
    ) TimelockController(minDelay, proposers, executors, msg.sender) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) {
            revert Errors.Unauthorized(msg.sender, "SELF");
        }
        _;
    }
}
