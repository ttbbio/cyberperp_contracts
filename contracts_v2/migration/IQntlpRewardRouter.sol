// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IQntlpRewardRouter {
    function unstakeAndRedeemQntlp(address _tokenOut, uint256 _qntlpAmount, uint256 _minOut, address _receiver) external returns (uint256);
}
