// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./IVault.sol";

interface ICyberLPManager {
    function cyberLP() external view returns (address);
    function usdg() external view returns (address);
    function vault() external view returns (IVault);
    function aumAddition() external view returns (uint256);
    function aumDeduction() external view returns (uint256);
    function cooldownDuration() external returns (uint256);
    function getAumInUsdg(bool maximise) external view returns (uint256);
    function getGlobalShortDelta(address _token, uint256 _price, uint256 _size) external view returns (uint256, bool);
    function lastAddedAt(address _account) external returns (uint256);
    function addLiquidity(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minCyberLP) external returns (uint256);
    function addLiquidityForAccount(address _fundingAccount, address _account, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minCyberLP) external returns (uint256);
    function removeLiquidity(address _tokenOut, uint256 _cyberLPAmount, uint256 _minOut, address _receiver) external returns (uint256);
    function removeLiquidityForAccount(address _account, address _tokenOut, uint256 _cyberLPAmount, uint256 _minOut, address _receiver) external returns (uint256);
    function setShortsTrackerAveragePriceWeight(uint256 _shortsTrackerAveragePriceWeight) external;
    function setCooldownDuration(uint256 _cooldownDuration) external;
}
