// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/access/access_0_8_0/Ownable_0_8_0.sol";
import "./WeeklyVesting.sol";

contract WeeklyVestingV2 is Ownable_0_8_0 {
    WeeklyVesting oldVester;
    uint256 public vestingWeeks;
    uint256 public tokenPrice;
    uint256 public maxCybVesting;
    uint256 public vestingStart;
    IERC20 public cyb;
    IERC20 public usdc;

    uint256 private _totalCybPurchased; 
    uint256 private constant CYB_DECIMALS = 18;

    struct Participant {
        uint256 cybPurchased;
        uint256 cybClaimed;
        uint256 lastClaimed;
    }

    mapping(address => Participant) private _participants;
    mapping(address => bool) private _pausedClaiming;

    event CybPurchased(address indexed buyer, uint256 amount);
    event CybClaimed(address indexed claimer, uint256 amount);

    constructor (address _oldVester) {
        oldVester = WeeklyVesting(_oldVester);
        vestingWeeks = oldVester.vestingWeeks();
        tokenPrice = oldVester.tokenPrice();
        maxCybVesting = oldVester.maxCybVesting();
        vestingStart = oldVester.vestingStart();
        cyb = oldVester.cyb();
        usdc = oldVester.usdc();
    }

    function totalCybPurchased() public view returns(uint256) {
        return _totalCybPurchased + oldVester.totalCybPurchased();
    }

    function pausedClaiming(address account) public view returns(bool) {
        return _pausedClaiming[account] || oldVester.pausedClaiming(account);
    }

    function participants(address account) public view returns (uint256,uint256,uint256) {
        Participant memory participant = _participants[account];
        (uint256 cybPurchased, uint256 cybClaimed, uint256 lastClaimed) = oldVester.participants(account);
        cybPurchased = participant.cybPurchased + cybPurchased;
        cybClaimed = participant.cybClaimed + cybClaimed;
        lastClaimed = max(participant.lastClaimed, lastClaimed);

        return (cybPurchased, cybClaimed, lastClaimed);
    }

    function setVestingStart(uint256 _vestingStart) external {
        _checkOwner();
        vestingStart = _vestingStart;
    }

    function setVestingWeeks(uint256 _vestingWeeks) external {
        _checkOwner();
        vestingWeeks = _vestingWeeks;
    }

    function setTokenPrice(uint256 _tokenPrice) external {
        _checkOwner();
        tokenPrice = _tokenPrice;
    }

    function setMaxCybVesting(uint256 _maxCybVesting) external {
        _checkOwner();
        maxCybVesting = _maxCybVesting;
    }

    function buyTokens(uint256 tokenAmount) external {
        require(
            block.timestamp < vestingStart,
            "Token purchase not allowed after vesting starts"
        );
        require(
            totalCybPurchased() + tokenAmount <= maxCybVesting,
            "Exceeds maximum CYB vesting limit"
        );

        uint256 requiredUsdc = (tokenAmount * tokenPrice) /
            (10 ** CYB_DECIMALS);

        require(requiredUsdc > 0, "tokenAmount too small");
        usdc.transferFrom(msg.sender, address(this), requiredUsdc);

        Participant storage participant = _participants[msg.sender];
        participant.cybPurchased += tokenAmount;

        _totalCybPurchased += tokenAmount;

        emit CybPurchased(msg.sender, tokenAmount);
    }

    function claimTokens() external {
        require(!pausedClaiming(msg.sender), "Claiming is paused for this user");
        require(block.timestamp >= vestingStart, "Vesting has not started yet");

        Participant storage participant = _participants[msg.sender];

        uint256 tokensAvailable = getAvailableTokens(msg.sender);
        require(tokensAvailable > 0, "No tokens available to claim");

        participant.cybClaimed += tokensAvailable;
        participant.lastClaimed = block.timestamp;
        cyb.transfer(msg.sender, tokensAvailable);

        emit CybClaimed(msg.sender, tokensAvailable);
    }

    function getAvailableTokens(address user) public view returns (uint256) {
        if (block.timestamp < vestingStart) {
            return 0;
        }
        (uint256 cybPurchased, uint256 cybClaimed, uint256 lastClaimed) = participants(user);

        bool firstClaim = lastClaimed == 0;
        uint256 vestedWeeks = (block.timestamp - vestingStart ) / (86400 * 7);
        uint256 claimedWeeks = firstClaim ? 0 : (lastClaimed - vestingStart) / (86400 * 7);
        uint256 weeksPassed = vestedWeeks - claimedWeeks;

        if (weeksPassed == 0) {
            return 0;
        }

        uint256 tokensPerWeek = cybPurchased / vestingWeeks;
        uint256 tokensToClaim = tokensPerWeek * weeksPassed;

        return
            (cybClaimed + tokensToClaim > cybPurchased)
                ? cybPurchased - cybClaimed
                : tokensToClaim;
    }

    function max(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a : b;
    }

    function withdrawTokens(
        address _tokenAddress,
        uint256 _amount
    ) external {
        _checkOwner();
        IERC20 _token = IERC20(_tokenAddress);
        _token.transfer(owner(), _amount);
    }

    function pauseClaiming(address user) external {
        _checkOwner();
        _pausedClaiming[user] = true;
    }

    function unpauseClaiming(address user) external {
        _checkOwner();
        _pausedClaiming[user] = false;
    }
}
