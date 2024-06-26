const { ethers } = require("hardhat");
const { expandDecimals } = require("./utilities");
const { toUsd } = require("./units");
const { errors } = require("../core/Vault/helpers");

async function deployContract(name, args, options) {
  const contractFactory = await ethers.getContractFactory(name, options)
  return await contractFactory.deploy(...args)
}

async function deployContractWithBlockInfo(name, args, options) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const contractFactory = await ethers.getContractFactory(name, options);
  return await contractFactory.deploy(...args, proxyBlockInfo.address);
}

async function deployVault() {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const vaultDelegatePartOne = await deployContract("VaultDelegatePartOne", [])
  const vaultDelegatePartTwo = await deployContract("VaultDelegatePartTwo", [])
  const vaultDelegatePartThree = await deployContract("VaultDelegatePartThree", [])
  const vault = await deployContract("Vault", [vaultDelegatePartOne.address, vaultDelegatePartTwo.address, vaultDelegatePartThree.address, proxyBlockInfo.address])
  return vault;
}

async function deployProxyBlockInfo() {
  const implDefault = await deployContract("BlockInfoDefault", [])
  const proxy = await deployContract("BlockInfoProxy", [])
  await proxy.setImplementation(implDefault.address)
  return proxy;
}

async function deployCyberLPManager(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const cyberLPManager = await deployContract("CyberLPManager", [...args, proxyBlockInfo.address])
  return cyberLPManager;
}

async function deployVaultPriceFeed() {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const priceFeed = await deployContract("VaultPriceFeed", [proxyBlockInfo.address])
  return priceFeed;
}

async function deployFastPriceFeed(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const priceFeed = await deployContract("FastPriceFeed", [...args, proxyBlockInfo.address])
  return priceFeed;
}

async function deployTimelock(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const timelock = await deployContract("Timelock", [...args, proxyBlockInfo.address])
  return timelock;
}

async function deployCybTimelock(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const cybTimelock = await deployContract("CybTimelock", [...args, proxyBlockInfo.address])
  return cybTimelock;
}

async function deployBonusDistributor(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const bonusDistr = await deployContract("BonusDistributor", [...args, proxyBlockInfo.address])
  return bonusDistr;
}

async function deployRewardDistributor(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const rewardDistr = await deployContract("RewardDistributor", [...args, proxyBlockInfo.address])
  return rewardDistr;
}

async function deployVester(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const vester = await deployContract("Vester", [...args, proxyBlockInfo.address])
  return vester;
}

async function deployTimeDistributor(args) {
  const proxyBlockInfo = await deployProxyBlockInfo();
  const timeDistr = await deployContract("TimeDistributor", [proxyBlockInfo.address])
  return timeDistr;
}

async function contractAt(name, address) {
  const contractFactory = await ethers.getContractFactory(name)
  return await contractFactory.attach(address)
}

async function deployAll(admin, keeper) {
  // common

  function getEthConfig(weth) {
    return [
      weth, // _token
      18, // _tokenDecimals
      30000, // _tokenWeight
      0, // _minProfitBps
      0, // _maxUsdgAmount
      false, // _isStable
      true // _isShortable
    ]
  }

  function getBtcConfig(btc) {
    return [
      btc, // _token
      8, // _tokenDecimals
      25000, // _tokenWeight
      0, // _minProfitBps
      0, // _maxUsdgAmount
      false, // _isStable
      true // _isShortable
    ]
  }

  function getUsdcConfig(usdc) {
    return [
      usdc, // _token
      6, // _tokenDecimals
      45000, // _tokenWeight
      0, // _minProfitBps
      0, // _maxUsdgAmount
      true, // _isStable
      false // _isShortable
    ]
  }


  const eth = await deployContract("WETH", ["WETH", "WETH", 18]);
  const pyth = await deployContract("Pyth", []);

  // vault
  const blockInfoProxy = await deployProxyBlockInfo();
  const vaultDelegatePartOne = await deployContract("VaultDelegatePartOne", []);
  const vaultDelegatePartTwo = await deployContract("VaultDelegatePartTwo", []);
  const vaultDelegatePartThree = await deployContract("VaultDelegatePartThree", []);
  const vault = await deployContract("Vault", [vaultDelegatePartOne.address, vaultDelegatePartTwo.address, vaultDelegatePartThree.address, blockInfoProxy.address]);

  const usdg = await deployContract("USDG", [vault.address]);
  const router = await deployContract("Router", [vault.address, usdg.address, eth.address, pyth.address]);

  const vaultPriceFeed = await deployContract("VaultPriceFeed", [blockInfoProxy.address]);

  await vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 28));
  await vaultPriceFeed.setIsAmmEnabled(false);


  const cyberLP = await deployContract("CyberLP", []);
  await cyberLP.setInPrivateTransferMode(true);

  const shortsTracker = await deployContract("ShortsTracker", [vault.address]);



  const cyberLPManager = await deployContract("CyberLPManager",
    [vault.address, usdg.address, cyberLP.address, shortsTracker.address, 15 * 60, blockInfoProxy.address]);

  await cyberLPManager.setInPrivateMode(true);

  await cyberLP.setMinter(cyberLPManager.address, true);
  await usdg.addVault(cyberLPManager.address);

  await vault.initialize(
    router.address, // router
    usdg.address, // usdg
    vaultPriceFeed.address, // priceFeed
    toUsd(2), // liquidationFeeUsd
    100, // fundingRateFactor
    100 // stableFundingRateFactor
  );

  await vault.setFundingRate(60 * 60, 100, 100)

  await vault.setInManagerMode(true)
  await vault.setManager(cyberLPManager.address, true)

  await vault.setFees(
    60, // _taxBasisPoints
    5, // _stableTaxBasisPoints
    25, // _mintBurnFeeBasisPoints
    30, // _swapFeeBasisPoints
    1, // _stableSwapFeeBasisPoints
    10, // _marginFeeBasisPoints
    toUsd(2), // _liquidationFeeUsd
    24 * 60 * 60, // _minProfitTime
    true // _hasDynamicFees
  )

  const vaultErrorController = await deployContract("VaultErrorController", [])

  await vault.setErrorController(vaultErrorController.address)
  await vaultErrorController.setErrors(vault.address, errors)

  const vaultUtils = await deployContract("VaultUtils", [vault.address])
  await vault.setVaultUtils(vaultUtils.address)



  // RewardsRouter
  const VESTING_DURATION = 365 * 24 * 60 * 60

  const cyb = await deployContract("CYB", []);
  const esCyb = await deployContract("EsCYB", []);
  const bnCyb = await deployContract("MintableBaseToken", ["Bonus CYB", "bnCYB", 0]);



  await esCyb.setInPrivateTransferMode(true)
  await cyberLP.setInPrivateTransferMode(true)

  const stakedCybTracker = await deployContract("RewardTracker", ["Staked CYB", "sCYB"])
  const stakedCybDistributor = await deployContract("RewardDistributor", [esCyb.address, stakedCybTracker.address, blockInfoProxy.address])
  await stakedCybTracker.initialize([cyb.address, esCyb.address], stakedCybDistributor.address)
  await stakedCybDistributor.updateLastDistributionTime()

  const bonusCybTracker = await deployContract("RewardTracker", ["Staked + Bonus CYB", "sbCYB"])
  const bonusCybDistributor = await deployContract("BonusDistributor", [bnCyb.address, bonusCybTracker.address, blockInfoProxy.address])
  await bonusCybTracker.initialize([stakedCybTracker.address], bonusCybDistributor.address)
  await bonusCybDistributor.updateLastDistributionTime()

  const feeCybTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee CYB", "sbfCYB"])
  const feeCybDistributor = await deployContract("RewardDistributor", [eth.address, feeCybTracker.address, blockInfoProxy.address])
  await feeCybTracker.initialize([bonusCybTracker.address, bnCyb.address], feeCybDistributor.address)
  await feeCybDistributor.updateLastDistributionTime()

  const feeCyberLPTracker = await deployContract("RewardTracker", ["Fee CyberLP", "fCyberLP"])
  const feeCyberLPDistributor = await deployContract("RewardDistributor", [eth.address, feeCyberLPTracker.address, blockInfoProxy.address])
  await feeCyberLPTracker.initialize([cyberLP.address], feeCyberLPDistributor.address)
  await feeCyberLPDistributor.updateLastDistributionTime()

  const stakedCyberLPTracker = await deployContract("RewardTracker", ["Fee + Staked CyberLP", "fsCyberLP"])
  const stakedCyberLPDistributor = await deployContract("RewardDistributor", [esCyb.address, stakedCyberLPTracker.address, blockInfoProxy.address])
  await stakedCyberLPTracker.initialize([feeCyberLPTracker.address], stakedCyberLPDistributor.address)
  await stakedCyberLPDistributor.updateLastDistributionTime()

  await stakedCybTracker.setInPrivateTransferMode(true)
  await stakedCybTracker.setInPrivateStakingMode(true)
  await bonusCybTracker.setInPrivateTransferMode(true)
  await bonusCybTracker.setInPrivateStakingMode(true)
  await bonusCybTracker.setInPrivateClaimingMode(true)
  await feeCybTracker.setInPrivateTransferMode(true)
  await feeCybTracker.setInPrivateStakingMode(true)

  await feeCyberLPTracker.setInPrivateTransferMode(true)
  await feeCyberLPTracker.setInPrivateStakingMode(true)
  await stakedCyberLPTracker.setInPrivateTransferMode(true)
  await stakedCyberLPTracker.setInPrivateStakingMode(true)


  const cybVester = await deployContract("Vester", [
    "Vested CYB", // _name
    "vCYB", // _symbol
    VESTING_DURATION, // _vestingDuration
    esCyb.address, // _esToken
    feeCybTracker.address, // _pairToken
    cyb.address, // _claimableToken
    stakedCybTracker.address, // _rewardTracker
    blockInfoProxy.address //_blockInfo
  ])

  const cyberLPVester = await deployContract("Vester", [
    "Vested CyberLP", // _name
    "vCyberLP", // _symbol
    VESTING_DURATION, // _vestingDuration
    esCyb.address, // _esToken
    stakedCyberLPTracker.address, // _pairToken
    cyb.address, // _claimableToken
    stakedCyberLPTracker.address, // _rewardTracker
    blockInfoProxy.address
  ])

  const rewardRouter = await deployContract("RewardRouterV4", [])
  await rewardRouter.initialize(
    eth.address,
    cyb.address,
    esCyb.address,
    bnCyb.address,
    cyberLP.address,
    stakedCybTracker.address,
    bonusCybTracker.address,
    feeCybTracker.address,
    feeCyberLPTracker.address,
    stakedCyberLPTracker.address,
    cyberLPManager.address,
    cybVester.address,
    cyberLPVester.address,
    pyth.address
  )

  await cyberLPManager.setHandler(rewardRouter.address, true)

  // allow rewardRouter to stake in stakedCybTracker
  await stakedCybTracker.setHandler(rewardRouter.address, true)
  // allow bonusCybTracker to stake stakedCybTracker
  await stakedCybTracker.setHandler(bonusCybTracker.address, true)
  // allow rewardRouter to stake in bonusCybTracker
  await bonusCybTracker.setHandler(rewardRouter.address, true)
  // allow bonusCybTracker to stake feeCybTracker
  await bonusCybTracker.setHandler(feeCybTracker.address, true)
  await bonusCybDistributor.setBonusMultiplier(10000)
  // allow rewardRouter to stake in feeCybTracker
  await feeCybTracker.setHandler(rewardRouter.address, true)
  // allow stakedCybTracker to stake esCyb
  await esCyb.setHandler(stakedCybTracker.address, true)
  // allow feeCybTracker to stake bnCyb
  await bnCyb.setHandler(feeCybTracker.address, true)
  // allow rewardRouter to burn bnCyb
  await bnCyb.setMinter(rewardRouter.address, true)

  // allow stakedCyberLPTracker to stake feeCyberLPTracker
  await feeCyberLPTracker.setHandler(stakedCyberLPTracker.address, true)
  // allow feeCyberLPTracker to stake cyberLP
  await cyberLP.setHandler(feeCyberLPTracker.address, true)

  // allow rewardRouter to stake in feeCyberLPTracker
  await feeCyberLPTracker.setHandler(rewardRouter.address, true)
  // allow rewardRouter to stake in stakedCyberLPTracker
  await stakedCyberLPTracker.setHandler(rewardRouter.address, true)

  await esCyb.setHandler(rewardRouter.address, true)
  await esCyb.setHandler(stakedCybDistributor.address, true)
  await esCyb.setHandler(stakedCyberLPDistributor.address, true)
  await esCyb.setHandler(stakedCyberLPTracker.address, true)
  await esCyb.setHandler(cybVester.address, true)
  await esCyb.setHandler(cyberLPVester.address, true)

  await esCyb.setMinter(cybVester.address, true)
  await esCyb.setMinter(cyberLPVester.address, true)

  await cybVester.setHandler(rewardRouter.address, true)
  await cyberLPVester.setHandler(rewardRouter.address, true)

  await feeCybTracker.setHandler(cybVester.address, true)
  await stakedCyberLPTracker.setHandler(cyberLPVester.address, true)

  // timelock

  const maxTokenSupply = expandDecimals("50000000", 18);
  const initialBuffer = 0; //1 sec

  const timelock = await deployContract(
    "Timelock",
    [
      admin, // admin
      initialBuffer, // buffer
      admin, // tokenManager
      admin, // mintReceiver
      cyberLPManager.address, // cyberLPManager
      ethers.constants.AddressZero, // rewardRouter
      maxTokenSupply, // maxTokenSupply
      10, // marginFeeBasisPoints 0.1%
      500, // maxMarginFeeBasisPoints 5%
      blockInfoProxy.address,
    ]
  );

  await timelock.setShouldToggleIsLeverageEnabled(true);

  await timelock.setContractHandler(admin, true);

  await timelock.setKeeper(admin, true);



  // PositionRouter

  const depositFee = "30" // 0.3%
  const minExecutionFee = ethers.utils.parseEther("0.0009"); // ~$2

  const referralStorage = await deployContract("ReferralStorage", [])
  const positionUtils = await deployContract("PositionUtils_0_8_18", []);

  const positionRouterArgs = [vault.address, router.address, eth.address, shortsTracker.address, depositFee, minExecutionFee, blockInfoProxy.address, pyth.address]

  const positionRouter = await deployContract("PositionRouterV2", positionRouterArgs, {
    libraries: {
      PositionUtils_0_8_18: positionUtils.address
    }
  });


  await positionRouter.setReferralStorage(referralStorage.address)
  await referralStorage.setHandler(positionRouter.address, true)
  await referralStorage.setHandler(timelock.address, true)
  await timelock.signalSetHandler(referralStorage.address, positionRouter.address, true)

  await shortsTracker.setHandler(positionRouter.address, true)
  // await timelock.signalSetHandler(shortsTracker.address, positionRouter.address, true)
  // await timelock.setHandler(shortsTracker.address, positionRouter.address, true)

  await router.addPlugin(positionRouter.address)

  await positionRouter.setDelayValues(0, 180, 30 * 60)
  await timelock.setContractHandler(positionRouter.address, true)
  await positionRouter.setPositionKeeper(admin, true)



  // OrderBook

  const orderBook = await deployContract("OrderBookV2", []);

  await orderBook.initialize(
    router.address, // router
    vault.address, // vault
    eth.address, // weth
    usdg.address, // usdg
    minExecutionFee,
    expandDecimals(10, 30), // min purchase token amount usd
    pyth.address
  )

  await router.addPlugin(orderBook.address)


  // PositionManager

  const positionManager = await deployContract("PositionManagerV2",
    [vault.address, router.address, shortsTracker.address, eth.address, depositFee, orderBook.address, pyth.address], {
    libraries: {
      PositionUtils_0_8_18: positionUtils.address
    }
  })


  await positionManager.setReferralStorage(referralStorage.address)


  await positionManager.setShouldValidateIncreaseOrder(false)


  await positionManager.setOrderKeeper(admin, true)
  await positionManager.setLiquidator(admin, true)

  await positionManager.setOrderKeeper(keeper, true)
  await positionManager.setLiquidator(keeper, true)


  await timelock.setContractHandler(positionManager.address, true)




  await vault.setLiquidator(positionManager.address, true)



  await shortsTracker.setHandler(positionManager.address, true)
  // await timelock.signalSetHandler(shortsTracker.address, positionManager.address, true)
  // await timelock.setHandler(shortsTracker.address, positionManager.address, true)

  // await shortsTracker.setGov(timelock.address);


  await router.addPlugin(positionManager.address)



  // Pyth
  const ethPriceFeedId = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
  const usdcPriceFeedId = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
  const btcPriceFeedId = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

  const priceIds = [
    ethPriceFeedId,
    usdcPriceFeedId,
    btcPriceFeedId
  ];
  const age = 18000
  const usdc = await deployContract("USDC", [])
  const wbtc = await deployContract("WBTC", [])


  const ethPythPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, ethPriceFeedId, age]);
  const usdcPythPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, usdcPriceFeedId, age]);
  const btcPythPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, btcPriceFeedId, age]);

  const PRICE_DECIMALS = 8;

  await vaultPriceFeed.setTokenConfig(wbtc.address, btcPythPriceFeed.address, PRICE_DECIMALS, false)
  await vaultPriceFeed.setTokenConfig(eth.address, ethPythPriceFeed.address, PRICE_DECIMALS, false)
  await vaultPriceFeed.setTokenConfig(usdc.address, usdcPythPriceFeed.address, PRICE_DECIMALS, false)

  await vault.setTokenConfig(...getBtcConfig(wbtc.address))
  await vault.setTokenConfig(...getUsdcConfig(usdc.address))
  await vault.setTokenConfig(...getEthConfig(eth.address))

  await vault.setGov(timelock.address);

 

  return {
    eth, wbtc, usdc, pyth, vault, timelock, positionRouter, router, shortsTracker, cyberLPManager, rewardRouter, orderBook, blockInfoProxy, usdg, vaultUtils, positionManager, referralStorage, positionUtils
  };
}

module.exports = {
  deployContract,
  deployContractWithBlockInfo,
  deployVault,
  deployProxyBlockInfo,
  deployVaultPriceFeed,
  deployCyberLPManager,
  deployFastPriceFeed,
  deployTimelock,
  deployCybTimelock,
  deployBonusDistributor,
  deployRewardDistributor,
  deployVester,
  deployTimeDistributor,
  contractAt,
  deployAll
}
