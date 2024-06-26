// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

import "./interfaces/IRewardTracker_0_8_18.sol";
import "./interfaces/IRewardRouterV4.sol";
import "./interfaces/IVester_0_8_18.sol";
import "../tokens/interfaces/IMintable_0_8_18.sol";
import "../tokens/interfaces/IWETH_0_8_18.sol";
import "../core/interfaces/ICyberLPManager_0_8_18.sol";
import "../access/Governable_0_8_18.sol";

contract RewardRouterV4 is IRewardRouterV4, ReentrancyGuard, Governable_0_8_18 {
    using SafeERC20 for IERC20;
    using Address for address payable;

    bool public isInitialized;

    address public weth;

    address public cyb;
    address public esCyb;
    address public bnCyb;

    address public cyberLP; // CYB Liquidity Provider token
    address public degenLP;

    address public stakedCybTracker;
    address public bonusCybTracker;
    address public feeCybTracker;

    address public override stakedCyberLPTracker;
    address public override feeCyberLPTracker;

    address public override stakedDegenLPTracker;
    address public override feeDegenLPTracker;

    address public cyberLPManager;
    address public degenLPManager;

    address public cybVester;
    address public cyberLPVester;
    address public degenLPVester;

    mapping (address => address) public pendingReceivers;
    IPyth pyth;

    event StakeCyb(address account, address token, uint256 amount);
    event UnstakeCyb(address account, address token, uint256 amount);

    event StakeCyberLP(address account, uint256 amount);
    event UnstakeCyberLP(address account, uint256 amount);

    event StakeDegenLP(address account, uint256 amount);
    event UnstakeDegenLP(address account, uint256 amount);

    event SetPyth(address pyth);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        address _cyb,
        address _esCyb,
        address _bnCyb,
        address _cyberLP,
        address _stakedCybTracker,
        address _bonusCybTracker,
        address _feeCybTracker,
        address _feeCyberLPTracker,
        address _stakedCyberLPTracker,
        address _cyberLPManager,
        address _cybVester,
        address _cyberLPVester,
        address _degenLP,
        address _feeDegenLPTracker,
        address _stakedDegenLPTracker,
        address _degenLPManager,
        address _degenLPVester,
        address _pyth
    ) external onlyGov {
        require(!isInitialized, "RewardRouter: already initialized");
        isInitialized = true;

        weth = _weth;

        cyb = _cyb;
        esCyb = _esCyb;
        bnCyb = _bnCyb;

        cyberLP = _cyberLP;
        degenLP = _degenLP;

        stakedCybTracker = _stakedCybTracker;
        bonusCybTracker = _bonusCybTracker;
        feeCybTracker = _feeCybTracker;

        feeCyberLPTracker = _feeCyberLPTracker;
        stakedCyberLPTracker = _stakedCyberLPTracker;

        cyberLPManager = _cyberLPManager;

        cybVester = _cybVester;
        cyberLPVester = _cyberLPVester;


        feeDegenLPTracker = _feeDegenLPTracker;
        stakedDegenLPTracker = _stakedDegenLPTracker;

        degenLPManager = _degenLPManager;

        degenLPVester = _degenLPVester;

        pyth = IPyth(_pyth);
    }

    function setPyth(address _pyth) external onlyGov {
        pyth = IPyth(_pyth);
        emit SetPyth(_pyth);
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function batchStakeCybForAccount(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
        address _cyb = cyb;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeCyb(msg.sender, _accounts[i], _cyb, _amounts[i]);
        }
    }

    function stakeCybForAccount(address _account, uint256 _amount) external nonReentrant onlyGov {
        _stakeCyb(msg.sender, _account, cyb, _amount);
    }

    function stakeCyb(uint256 _amount) external nonReentrant {
        _stakeCyb(msg.sender, msg.sender, cyb, _amount);
    }

    function stakeEsCyb(uint256 _amount) external nonReentrant {
        _stakeCyb(msg.sender, msg.sender, esCyb, _amount);
    }

    function unstakeCyb(uint256 _amount) external nonReentrant {
        _unstakeCyb(msg.sender, cyb, _amount, true);
    }

    function unstakeEsCyb(uint256 _amount) external nonReentrant {
        _unstakeCyb(msg.sender, esCyb, _amount, true);
    }

    function mintAndStakeCyberLP(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minCyberLP, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(_amount > 0, "RewardRouter: invalid _amount");
        _updatePrice(priceUpdateData);
        
        address account = msg.sender;
        uint256 cyberLPAmount = ICyberLPManager_0_8_18(cyberLPManager).addLiquidityForAccount(account, account, _token, _amount, _minUsdg, _minCyberLP);
        IRewardTracker_0_8_18(feeCyberLPTracker).stakeForAccount(account, account, cyberLP, cyberLPAmount);
        IRewardTracker_0_8_18(stakedCyberLPTracker).stakeForAccount(account, account, feeCyberLPTracker, cyberLPAmount);

        emit StakeCyberLP(account, cyberLPAmount);

        return cyberLPAmount;
    }

        function mintAndStakeDegenLP(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minDegenLP, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(_amount > 0, "RewardRouter: invalid _amount");
        _updatePrice(priceUpdateData);
        
        address account = msg.sender;
        uint256 degenLPAmount = ICyberLPManager_0_8_18(degenLPManager).addLiquidityForAccount(account, account, _token, _amount, _minUsdg, _minDegenLP);
        IRewardTracker_0_8_18(feeDegenLPTracker).stakeForAccount(account, account, degenLP, degenLPAmount);
        IRewardTracker_0_8_18(stakedDegenLPTracker).stakeForAccount(account, account, feeDegenLPTracker, degenLPAmount);

        emit StakeDegenLP(account, degenLPAmount);

        return degenLPAmount;
    }

    function mintAndStakeCyberLPETH(uint256 _minUsdg, uint256 _minCyberLP, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "RewardRouter: invalid msg.value");
        uint256 newMsgValue = _updatePrice(priceUpdateData);

        IWETH_0_8_18(weth).deposit{value: newMsgValue}();
        IERC20(weth).approve(cyberLPManager, newMsgValue);

        address account = msg.sender;
        uint256 cyberLPAmount = ICyberLPManager_0_8_18(cyberLPManager).addLiquidityForAccount(address(this), account, weth, newMsgValue, _minUsdg, _minCyberLP);

        IRewardTracker_0_8_18(feeCyberLPTracker).stakeForAccount(account, account, cyberLP, cyberLPAmount);
        IRewardTracker_0_8_18(stakedCyberLPTracker).stakeForAccount(account, account, feeCyberLPTracker, cyberLPAmount);

        emit StakeCyberLP(account, cyberLPAmount);

        return cyberLPAmount;
    }

    function unstakeAndRedeemCyberLP(address _tokenOut, uint256 _cyberLPAmount, uint256 _minOut, address _receiver, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(_cyberLPAmount > 0, "RewardRouter: invalid _cyberLPAmount");
        _updatePrice(priceUpdateData);

        address account = msg.sender;
        IRewardTracker_0_8_18(stakedCyberLPTracker).unstakeForAccount(account, feeCyberLPTracker, _cyberLPAmount, account);
        IRewardTracker_0_8_18(feeCyberLPTracker).unstakeForAccount(account, cyberLP, _cyberLPAmount, account);
        uint256 amountOut = ICyberLPManager_0_8_18(cyberLPManager).removeLiquidityForAccount(account, _tokenOut, _cyberLPAmount, _minOut, _receiver);

        emit UnstakeCyberLP(account, _cyberLPAmount);

        return amountOut;
    }

        function unstakeAndRedeemDegenLP(address _tokenOut, uint256 _degenLPAmount, uint256 _minOut, address _receiver, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(_degenLPAmount > 0, "RewardRouter: invalid _degenLPAmount");
        _updatePrice(priceUpdateData);

        address account = msg.sender;
        IRewardTracker_0_8_18(stakedDegenLPTracker).unstakeForAccount(account, feeDegenLPTracker, _degenLPAmount, account);
        IRewardTracker_0_8_18(feeDegenLPTracker).unstakeForAccount(account, degenLP, _degenLPAmount, account);
        uint256 amountOut = ICyberLPManager_0_8_18(degenLPManager).removeLiquidityForAccount(account, _tokenOut, _degenLPAmount, _minOut, _receiver);

        emit UnstakeDegenLP(account, _degenLPAmount);

        return amountOut;
    }

    function unstakeAndRedeemCyberLPETH(uint256 _cyberLPAmount, uint256 _minOut, address payable _receiver, bytes[] calldata priceUpdateData) external payable nonReentrant returns (uint256) {
        require(_cyberLPAmount > 0, "RewardRouter: invalid _cyberLPAmount");
        _updatePrice(priceUpdateData);

        address account = msg.sender;
        IRewardTracker_0_8_18(stakedCyberLPTracker).unstakeForAccount(account, feeCyberLPTracker, _cyberLPAmount, account);
        IRewardTracker_0_8_18(feeCyberLPTracker).unstakeForAccount(account, cyberLP, _cyberLPAmount, account);
        uint256 amountOut = ICyberLPManager_0_8_18(cyberLPManager).removeLiquidityForAccount(account, weth, _cyberLPAmount, _minOut, address(this));

        IWETH_0_8_18(weth).withdraw(amountOut);

        _receiver.sendValue(amountOut);

        emit UnstakeCyberLP(account, _cyberLPAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;

        IRewardTracker_0_8_18(feeCybTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(feeCyberLPTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(feeDegenLPTracker).claimForAccount(account, account);

        IRewardTracker_0_8_18(stakedCybTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(stakedCyberLPTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(stakedDegenLPTracker).claimForAccount(account, account);
    }

    function claimEsCyb() external nonReentrant {
        address account = msg.sender;

        IRewardTracker_0_8_18(stakedCybTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(stakedCyberLPTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(stakedDegenLPTracker).claimForAccount(account, account);
    }

    function claimFees() external nonReentrant {
        address account = msg.sender;

        IRewardTracker_0_8_18(feeCybTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(feeCyberLPTracker).claimForAccount(account, account);
        IRewardTracker_0_8_18(feeDegenLPTracker).claimForAccount(account, account);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
    }

    function handleRewards(
        bool _shouldClaimCyb,
        bool _shouldStakeCyb,
        bool _shouldClaimEsCyb,
        bool _shouldStakeEsCyb,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        uint256 cybAmount = 0;
        if (_shouldClaimCyb) {
            uint256 cybAmount0 = IVester_0_8_18(cybVester).claimForAccount(account, account);
            uint256 cybAmount1 = IVester_0_8_18(cyberLPVester).claimForAccount(account, account);
            uint256 cybAmount2 = IVester_0_8_18(degenLPVester).claimForAccount(account, account);
            cybAmount = cybAmount0 + cybAmount1 + cybAmount2;
        }

        if (_shouldStakeCyb && cybAmount > 0) {
            _stakeCyb(account, account, cyb, cybAmount);
        }

        uint256 esCybAmount = 0;
        if (_shouldClaimEsCyb) {
            uint256 esCybAmount0 = IRewardTracker_0_8_18(stakedCybTracker).claimForAccount(account, account);
            uint256 esCybAmount1 = IRewardTracker_0_8_18(stakedCyberLPTracker).claimForAccount(account, account);
            uint256 esCybAmount2 = IRewardTracker_0_8_18(stakedDegenLPTracker).claimForAccount(account, account);
            esCybAmount = esCybAmount0 + esCybAmount1 + esCybAmount2;
        }

        if (_shouldStakeEsCyb && esCybAmount > 0) {
            _stakeCyb(account, account, esCyb, esCybAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            uint256 bnCybAmount = IRewardTracker_0_8_18(bonusCybTracker).claimForAccount(account, account);
            if (bnCybAmount > 0) {
                IRewardTracker_0_8_18(feeCybTracker).stakeForAccount(account, account, bnCyb, bnCybAmount);
            }
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 weth0 = IRewardTracker_0_8_18(feeCybTracker).claimForAccount(account, address(this));
                uint256 weth1 = IRewardTracker_0_8_18(feeCyberLPTracker).claimForAccount(account, address(this));
                uint256 weth2 = IRewardTracker_0_8_18(feeDegenLPTracker).claimForAccount(account, address(this));

                uint256 wethAmount = weth0 + weth1 + weth2;
                IWETH_0_8_18(weth).withdraw(wethAmount);

                payable(account).sendValue(wethAmount);
            } else {
                IRewardTracker_0_8_18(feeCybTracker).claimForAccount(account, account);
                IRewardTracker_0_8_18(feeCyberLPTracker).claimForAccount(account, account);
                IRewardTracker_0_8_18(feeDegenLPTracker).claimForAccount(account, account);
            }
        }
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    // the _validateReceiver function checks that the averageStakedAmounts and cumulativeRewards
    // values of an account are zero, this is to help ensure that vesting calculations can be
    // done correctly
    // averageStakedAmounts and cumulativeRewards are updated if the claimable reward for an account
    // is more than zero
    // it is possible for multiple transfers to be sent into a single account, using signalTransfer and
    // acceptTransfer, if those values have not been updated yet
    // for CyberLP transfers it is also possible to transfer CyberLP into an account using the StakedCyberLP contract
    function signalTransfer(address _receiver) external nonReentrant {
        require(IERC20(cybVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(cyberLPVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(degenLPVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");

        _validateReceiver(_receiver);
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        require(IERC20(cybVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(cyberLPVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(degenLPVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");

        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "RewardRouter: transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        _compound(_sender);

        uint256 stakedCyb = IRewardTracker_0_8_18(stakedCybTracker).depositBalances(_sender, cyb);
        if (stakedCyb > 0) {
            _unstakeCyb(_sender, cyb, stakedCyb, false);
            _stakeCyb(_sender, receiver, cyb, stakedCyb);
        }

        uint256 stakedEsCyb = IRewardTracker_0_8_18(stakedCybTracker).depositBalances(_sender, esCyb);
        if (stakedEsCyb > 0) {
            _unstakeCyb(_sender, esCyb, stakedEsCyb, false);
            _stakeCyb(_sender, receiver, esCyb, stakedEsCyb);
        }

        uint256 stakedBnCyb = IRewardTracker_0_8_18(feeCybTracker).depositBalances(_sender, bnCyb);
        if (stakedBnCyb > 0) {
            IRewardTracker_0_8_18(feeCybTracker).unstakeForAccount(_sender, bnCyb, stakedBnCyb, _sender);
            IRewardTracker_0_8_18(feeCybTracker).stakeForAccount(_sender, receiver, bnCyb, stakedBnCyb);
        }

        uint256 esCybBalance = IERC20(esCyb).balanceOf(_sender);
        if (esCybBalance > 0) {
            IERC20(esCyb).transferFrom(_sender, receiver, esCybBalance);
        }

        uint256 cyberLPAmount = IRewardTracker_0_8_18(feeCyberLPTracker).depositBalances(_sender, cyberLP);
        if (cyberLPAmount > 0) {
            IRewardTracker_0_8_18(stakedCyberLPTracker).unstakeForAccount(_sender, feeCyberLPTracker, cyberLPAmount, _sender);
            IRewardTracker_0_8_18(feeCyberLPTracker).unstakeForAccount(_sender, cyberLP, cyberLPAmount, _sender);

            IRewardTracker_0_8_18(feeCyberLPTracker).stakeForAccount(_sender, receiver, cyberLP, cyberLPAmount);
            IRewardTracker_0_8_18(stakedCyberLPTracker).stakeForAccount(receiver, receiver, feeCyberLPTracker, cyberLPAmount);
        }

        uint256 degenLPAmount = IRewardTracker_0_8_18(feeDegenLPTracker).depositBalances(_sender, degenLP);
        if (degenLPAmount > 0) {
            IRewardTracker_0_8_18(stakedDegenLPTracker).unstakeForAccount(_sender, feeDegenLPTracker, degenLPAmount, _sender);
            IRewardTracker_0_8_18(feeDegenLPTracker).unstakeForAccount(_sender, degenLP, degenLPAmount, _sender);

            IRewardTracker_0_8_18(feeDegenLPTracker).stakeForAccount(_sender, receiver, degenLP, degenLPAmount);
            IRewardTracker_0_8_18(stakedDegenLPTracker).stakeForAccount(receiver, receiver, feeDegenLPTracker, degenLPAmount);
        }

        IVester_0_8_18(cybVester).transferStakeValues(_sender, receiver);
        IVester_0_8_18(cyberLPVester).transferStakeValues(_sender, receiver);
        IVester_0_8_18(degenLPVester).transferStakeValues(_sender, receiver);
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker_0_8_18(stakedCybTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedCybTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(stakedCybTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedCybTracker.cumulativeRewards > 0");

        require(IRewardTracker_0_8_18(bonusCybTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: bonusCybTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(bonusCybTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: bonusCybTracker.cumulativeRewards > 0");

        require(IRewardTracker_0_8_18(feeCybTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeCybTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(feeCybTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeCybTracker.cumulativeRewards > 0");

        require(IVester_0_8_18(cybVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: cybVester.transferredAverageStakedAmounts > 0");
        require(IVester_0_8_18(cybVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: cybVester.transferredCumulativeRewards > 0");

        require(IRewardTracker_0_8_18(stakedCyberLPTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedCyberLPTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(stakedCyberLPTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedCyberLPTracker.cumulativeRewards > 0");

        require(IRewardTracker_0_8_18(feeCyberLPTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeCyberLPTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(feeCyberLPTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeCyberLPTracker.cumulativeRewards > 0");

        require(IVester_0_8_18(cyberLPVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: cybVester.transferredAverageStakedAmounts > 0");
        require(IVester_0_8_18(cyberLPVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: cybVester.transferredCumulativeRewards > 0");

        require(IRewardTracker_0_8_18(stakedDegenLPTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedCyberLPTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(stakedDegenLPTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedCyberLPTracker.cumulativeRewards > 0");

        require(IRewardTracker_0_8_18(feeDegenLPTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeCyberLPTracker.averageStakedAmounts > 0");
        require(IRewardTracker_0_8_18(feeDegenLPTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeCyberLPTracker.cumulativeRewards > 0");

        require(IVester_0_8_18(degenLPVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: cybVester.transferredAverageStakedAmounts > 0");
        require(IVester_0_8_18(degenLPVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: cybVester.transferredCumulativeRewards > 0");

        require(IERC20(cybVester).balanceOf(_receiver) == 0, "RewardRouter: cybVester.balance > 0");
        require(IERC20(cyberLPVester).balanceOf(_receiver) == 0, "RewardRouter: cyberLPVester.balance > 0");
        require(IERC20(degenLPVester).balanceOf(_receiver) == 0, "RewardRouter: cyberLPVester.balance > 0");
    }

    function _compound(address _account) private {
        _compoundCyb(_account);
        _compoundCyberLP(_account);
        _compoundDegenLP(_account);
    }

    function _compoundCyb(address _account) private {
        uint256 esCybAmount = IRewardTracker_0_8_18(stakedCybTracker).claimForAccount(_account, _account);
        if (esCybAmount > 0) {
            _stakeCyb(_account, _account, esCyb, esCybAmount);
        }

        uint256 bnCybAmount = IRewardTracker_0_8_18(bonusCybTracker).claimForAccount(_account, _account);
        if (bnCybAmount > 0) {
            IRewardTracker_0_8_18(feeCybTracker).stakeForAccount(_account, _account, bnCyb, bnCybAmount);
        }
    }

    function _compoundCyberLP(address _account) private {
        uint256 esCybAmount = IRewardTracker_0_8_18(stakedCyberLPTracker).claimForAccount(_account, _account);
        if (esCybAmount > 0) {
            _stakeCyb(_account, _account, esCyb, esCybAmount);
        }
    }

    function _compoundDegenLP(address _account) private {
        uint256 esCybAmount = IRewardTracker_0_8_18(stakedDegenLPTracker).claimForAccount(_account, _account);
        if (esCybAmount > 0) {
            _stakeCyb(_account, _account, esCyb, esCybAmount);
        }
    }

    function _stakeCyb(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        IRewardTracker_0_8_18(stakedCybTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker_0_8_18(bonusCybTracker).stakeForAccount(_account, _account, stakedCybTracker, _amount);
        IRewardTracker_0_8_18(feeCybTracker).stakeForAccount(_account, _account, bonusCybTracker, _amount);

        emit StakeCyb(_account, _token, _amount);
    }

    function _unstakeCyb(address _account, address _token, uint256 _amount, bool _shouldReduceBnCyb) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        uint256 balance = IRewardTracker_0_8_18(stakedCybTracker).stakedAmounts(_account);

        IRewardTracker_0_8_18(feeCybTracker).unstakeForAccount(_account, bonusCybTracker, _amount, _account);
        IRewardTracker_0_8_18(bonusCybTracker).unstakeForAccount(_account, stakedCybTracker, _amount, _account);
        IRewardTracker_0_8_18(stakedCybTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnCyb) {
            uint256 bnCybAmount = IRewardTracker_0_8_18(bonusCybTracker).claimForAccount(_account, _account);
            if (bnCybAmount > 0) {
                IRewardTracker_0_8_18(feeCybTracker).stakeForAccount(_account, _account, bnCyb, bnCybAmount);
            }

            uint256 stakedBnCyb = IRewardTracker_0_8_18(feeCybTracker).depositBalances(_account, bnCyb);
            if (stakedBnCyb > 0) {
                uint256 reductionAmount = stakedBnCyb* _amount / balance;
                IRewardTracker_0_8_18(feeCybTracker).unstakeForAccount(_account, bnCyb, reductionAmount, _account);
                IMintable_0_8_18(bnCyb).burn(_account, reductionAmount);
            }
        }

        emit UnstakeCyb(_account, _token, _amount);
    }

    function _updatePrice(bytes[] calldata priceUpdateData) private returns(uint256) {
        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        require(msg.value >= fee, "RewardRouter: use correct price update fee");
        pyth.updatePriceFeeds{ value: fee }(priceUpdateData);
        return msg.value - fee;
    }
}
