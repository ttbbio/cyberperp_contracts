// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

interface IRewardRouterV4 {
    function feeCyberLPTracker() external view returns (address);
    function stakedCyberLPTracker() external view returns (address);

    function feeDegenLPTracker() external view returns (address);
    function stakedDegenLPTracker() external view returns (address);
}
