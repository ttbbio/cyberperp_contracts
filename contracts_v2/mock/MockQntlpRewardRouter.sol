// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../migration/IQntlpRewardRouter.sol";

contract MockQntlpRewardRouter is IQntlpRewardRouter {
    function unstakeAndRedeemQntlp(
        address _tokenOut,
        uint256 /* _qntlpAmount */,
        uint256 _minOut,
        address _receiver
    ) external returns (uint256) {
        IERC20(_tokenOut).transfer(_receiver, _minOut);
        return _minOut;
    }
}
