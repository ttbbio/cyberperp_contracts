// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./interfaces/IBlockInfo.sol";

contract BlockInfoDefault is IBlockInfo {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public owner;
    mapping(address => bool) public isAdmin;
    
    constructor() public {
        _transferOwnership(msg.sender);
    }

    /**
     * Returns (blockNumber, blockTimestamp)
     */
    function getBlockInfo() override external view returns (uint256, uint256) {
        return (block.number, block.timestamp);
    }
    function getBlockTimestamp() override external view returns (uint256) {
        return block.timestamp;
    }
    function getBlockNumber() override external view returns (uint256) {
        return block.number;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }


    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view {
        require(owner == msg.sender, "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
