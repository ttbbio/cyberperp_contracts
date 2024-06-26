const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract, deployProxyBlockInfo, deployVester, deployRewardDistributor, deployVault, deployVaultPriceFeed, deployCyberLPManager, deployTimelock, deployBonusDistributor } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")
const { randomBytes } = require("ethers/lib/utils")
const { priceFeedIds, priceUpdateData } = require("../shared/pyth")
const { ADDRESS_ZERO } = require("@uniswap/v3-sdk")

use(solidity)

describe("RewardRouterV4", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4, tokenManager] = provider.getWallets()

  const vestingDuration = 365 * 24 * 60 * 60

  let timelock

  let vault
  let cyberLPManager
  let cyberLP
  let usdg
  let router
  let vaultPriceFeed
  let eth
  let ethPriceFeed
  let btc
  let btcPriceFeed
  let dai
  let daiPriceFeed

  let cyb
  let esCyb
  let bnCyb

  let stakedCybTracker
  let stakedCybDistributor
  let bonusCybTracker
  let bonusCybDistributor
  let feeCybTracker
  let feeCybDistributor

  let feeCyberLPTracker
  let feeCyberLPDistributor
  let stakedCyberLPTracker
  let stakedCyberLPDistributor

  let cybVester
  let cyberLPVester

  let degenLP
  let feeDegenLPDistributor
  let feeDegenLPTracker
  let stakedDegenLPTracker
  let stakedDegenLPDistributor
  let degenLPManager
  let degenLPVester

  let rewardRouter
  let blockInfoProxy
  let pyth

  beforeEach(async () => {

    pyth = await deployContract("Pyth", [])
    blockInfoProxy = await deployProxyBlockInfo();
    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, priceFeedIds.eth, 10000])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, priceFeedIds.btc, 10000])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, priceFeedIds.eth, 10000])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address, priceFeedIds.dai, 10000])

    vault = await deployVault()
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, eth.address, pyth.address])
    vaultPriceFeed = await deployVaultPriceFeed()
    cyberLP = await deployContract("CyberLP", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    cyberLPManager = await deployCyberLPManager([vault.address, usdg.address, cyberLP.address, ethers.constants.AddressZero, 24 * 60 * 60])

    timelock = await deployTimelock([
      wallet.address, // _admin
      10, // _buffer
      tokenManager.address, // _tokenManager
      tokenManager.address, // _mintReceiver
      cyberLPManager.address, // _cyberLPManager
      user0.address, // _rewardRouter
      expandDecimals(1000000, 18), // _maxTokenSupply
      10, // marginFeeBasisPoints
      100 // maxMarginFeeBasisPoints
    ])

    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await pyth.updatePrice(priceFeedIds.dai, toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await pyth.updatePrice(priceFeedIds.btc, toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await pyth.updatePrice(priceFeedIds.eth, toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(eth, ethPriceFeed))

    await cyberLP.setInPrivateTransferMode(true)
    await cyberLP.setMinter(cyberLPManager.address, true)
    await cyberLPManager.setInPrivateMode(true)

    cyb = await deployContract("CYB", []);
    esCyb = await deployContract("EsCYB", []);
    bnCyb = await deployContract("MintableBaseToken", ["Bonus CYB", "bnCYB", 0]);

    // CYB
    stakedCybTracker = await deployContract("RewardTracker", ["Staked CYB", "sCYB"])
    stakedCybDistributor = await deployRewardDistributor([esCyb.address, stakedCybTracker.address])
    await stakedCybTracker.initialize([cyb.address, esCyb.address], stakedCybDistributor.address)
    await stakedCybDistributor.updateLastDistributionTime()

    bonusCybTracker = await deployContract("RewardTracker", ["Staked + Bonus CYB", "sbCYB"])
    bonusCybDistributor = await deployBonusDistributor([bnCyb.address, bonusCybTracker.address])
    await bonusCybTracker.initialize([stakedCybTracker.address], bonusCybDistributor.address)
    await bonusCybDistributor.updateLastDistributionTime()

    feeCybTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee CYB", "sbfCYB"])
    feeCybDistributor = await deployRewardDistributor([eth.address, feeCybTracker.address])
    await feeCybTracker.initialize([bonusCybTracker.address, bnCyb.address], feeCybDistributor.address)
    await feeCybDistributor.updateLastDistributionTime()

    // CyberLP
    feeCyberLPTracker = await deployContract("RewardTracker", ["Fee CyberLP", "fCyberLP"])
    feeCyberLPDistributor = await deployRewardDistributor([eth.address, feeCyberLPTracker.address])
    await feeCyberLPTracker.initialize([cyberLP.address], feeCyberLPDistributor.address)
    await feeCyberLPDistributor.updateLastDistributionTime()

    stakedCyberLPTracker = await deployContract("RewardTracker", ["Fee + Staked CyberLP", "fsCyberLP"])
    stakedCyberLPDistributor = await deployRewardDistributor([esCyb.address, stakedCyberLPTracker.address])
    await stakedCyberLPTracker.initialize([feeCyberLPTracker.address], stakedCyberLPDistributor.address)
    await stakedCyberLPDistributor.updateLastDistributionTime()

    cybVester = await deployVester([
      "Vested CYB", // _name
      "vCYB", // _symbol
      vestingDuration, // _vestingDuration
      esCyb.address, // _esToken
      feeCybTracker.address, // _pairToken
      cyb.address, // _claimableToken
      stakedCybTracker.address, // _rewardTracker
    ])

    cyberLPVester = await deployVester([
      "Vested CyberLP", // _name
      "vCyberLP", // _symbol
      vestingDuration, // _vestingDuration
      esCyb.address, // _esToken
      stakedCyberLPTracker.address, // _pairToken
      cyb.address, // _claimableToken
      stakedCyberLPTracker.address, // _rewardTracker
    ])



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

    await esCyb.setInPrivateTransferMode(true)

    degenLP = await deployContract("CyberLP", [])

    degenLPManager = await deployCyberLPManager([vault.address, usdg.address, degenLP.address, ethers.constants.AddressZero, 24 * 60 * 60])

    await degenLP.setInPrivateTransferMode(true)
    await degenLP.setMinter(degenLPManager.address, true)
    await degenLPManager.setInPrivateMode(true)

    feeDegenLPTracker = await deployContract("RewardTracker", ["Fee degenLP", "fDegenLP"])
    feeDegenLPDistributor = await deployContract("RewardDistributor", [eth.address, feeDegenLPTracker.address, blockInfoProxy.address])
    await feeDegenLPTracker.initialize([degenLP.address], feeDegenLPDistributor.address)
    await feeDegenLPDistributor.updateLastDistributionTime()

    stakedDegenLPTracker = await deployContract("RewardTracker", ["Fee + Staked degenLP", "fsDegenLP"])
    stakedDegenLPDistributor = await deployContract("RewardDistributor", [esCyb.address, stakedDegenLPTracker.address, blockInfoProxy.address])
    await stakedDegenLPTracker.initialize([feeDegenLPTracker.address], stakedDegenLPDistributor.address)
    await stakedDegenLPDistributor.updateLastDistributionTime()

    await feeDegenLPTracker.setInPrivateTransferMode(true)
    await feeDegenLPTracker.setInPrivateStakingMode(true)
    await stakedDegenLPTracker.setInPrivateTransferMode(true)
    await stakedDegenLPTracker.setInPrivateStakingMode(true)

    degenLPVester = await deployVester([
      "Vested degenLP", // _name
      "vDegenLP", // _symbol
      vestingDuration, // _vestingDuration
      esCyb.address, // _esToken
      stakedDegenLPTracker.address, // _pairToken
      cyb.address, // _claimableToken
      stakedDegenLPTracker.address, // _rewardTracker
    ])

    rewardRouter = await deployContract("RewardRouterV4", [])
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
      degenLP.address,
      feeDegenLPTracker.address,
      stakedDegenLPTracker.address,
      degenLPManager.address,
      degenLPVester.address,
      pyth.address
    )

    // allow bonusCybTracker to stake stakedCybTracker
    await stakedCybTracker.setHandler(bonusCybTracker.address, true)
    // allow bonusCybTracker to stake feeCybTracker
    await bonusCybTracker.setHandler(feeCybTracker.address, true)
    await bonusCybDistributor.setBonusMultiplier(10000)
    // allow feeCybTracker to stake bnCyb
    await bnCyb.setHandler(feeCybTracker.address, true)

    // allow stakedCyberLPTracker to stake feeCyberLPTracker
    await feeCyberLPTracker.setHandler(stakedCyberLPTracker.address, true)
    // allow feeCyberLPTracker to stake cyberLP
    await cyberLP.setHandler(feeCyberLPTracker.address, true)

    // mint esCyb for distributors
    await esCyb.setMinter(wallet.address, true)
    await esCyb.mint(stakedCybDistributor.address, expandDecimals(50000, 18))
    await stakedCybDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esCyb per second
    await esCyb.mint(stakedCyberLPDistributor.address, expandDecimals(50000, 18))
    await stakedCyberLPDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esCyb per second

    // mint bnCyb for distributor
    await bnCyb.setMinter(wallet.address, true)
    await bnCyb.mint(bonusCybDistributor.address, expandDecimals(1500, 18))

    await esCyb.setHandler(tokenManager.address, true)
    await cybVester.setHandler(wallet.address, true)

    await esCyb.setHandler(rewardRouter.address, true)
    await esCyb.setHandler(stakedCybDistributor.address, true)
    await esCyb.setHandler(stakedCyberLPDistributor.address, true)
    await esCyb.setHandler(stakedCybTracker.address, true)
    await esCyb.setHandler(stakedCyberLPTracker.address, true)
    await esCyb.setHandler(cybVester.address, true)
    await esCyb.setHandler(cyberLPVester.address, true)

    await cyberLPManager.setHandler(rewardRouter.address, true)
    await stakedCybTracker.setHandler(rewardRouter.address, true)
    await bonusCybTracker.setHandler(rewardRouter.address, true)
    await feeCybTracker.setHandler(rewardRouter.address, true)
    await feeCyberLPTracker.setHandler(rewardRouter.address, true)
    await stakedCyberLPTracker.setHandler(rewardRouter.address, true)

    await esCyb.setHandler(rewardRouter.address, true)
    await bnCyb.setMinter(rewardRouter.address, true)
    await esCyb.setMinter(cybVester.address, true)
    await esCyb.setMinter(cyberLPVester.address, true)

    await cybVester.setHandler(rewardRouter.address, true)
    await cyberLPVester.setHandler(rewardRouter.address, true)

    await feeCybTracker.setHandler(cybVester.address, true)
    await stakedCyberLPTracker.setHandler(cyberLPVester.address, true)




    await degenLPManager.setHandler(rewardRouter.address, true)

    await feeDegenLPTracker.setHandler(stakedDegenLPTracker.address, true)
    await degenLP.setHandler(feeDegenLPTracker.address, true)


    await feeDegenLPTracker.setHandler(rewardRouter.address, true)
    await stakedDegenLPTracker.setHandler(rewardRouter.address, true)

    await esCyb.setHandler(stakedDegenLPDistributor.address, true)
    await esCyb.setHandler(stakedDegenLPTracker.address, true)

    await esCyb.setHandler(degenLPVester.address, true)

    await esCyb.setMinter(degenLPVester.address, true)

    await degenLPVester.setHandler(rewardRouter.address, true)

    await stakedDegenLPTracker.setHandler(degenLPVester.address, true)



    await cyberLPManager.setGov(timelock.address)
    await stakedCybTracker.setGov(timelock.address)
    await bonusCybTracker.setGov(timelock.address)
    await feeCybTracker.setGov(timelock.address)
    await feeCyberLPTracker.setGov(timelock.address)
    await stakedCyberLPTracker.setGov(timelock.address)
    await stakedCybDistributor.setGov(timelock.address)
    await stakedCyberLPDistributor.setGov(timelock.address)
    await esCyb.setGov(timelock.address)
    await bnCyb.setGov(timelock.address)
    await cybVester.setGov(timelock.address)
    await cyberLPVester.setGov(timelock.address)
  })

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(eth.address)
    expect(await rewardRouter.cyb()).eq(cyb.address)
    expect(await rewardRouter.esCyb()).eq(esCyb.address)
    expect(await rewardRouter.bnCyb()).eq(bnCyb.address)

    expect(await rewardRouter.cyberLP()).eq(cyberLP.address)

    expect(await rewardRouter.stakedCybTracker()).eq(stakedCybTracker.address)
    expect(await rewardRouter.bonusCybTracker()).eq(bonusCybTracker.address)
    expect(await rewardRouter.feeCybTracker()).eq(feeCybTracker.address)

    expect(await rewardRouter.feeCyberLPTracker()).eq(feeCyberLPTracker.address)
    expect(await rewardRouter.stakedCyberLPTracker()).eq(stakedCyberLPTracker.address)

    expect(await rewardRouter.cyberLPManager()).eq(cyberLPManager.address)

    expect(await rewardRouter.cybVester()).eq(cybVester.address)
    expect(await rewardRouter.cyberLPVester()).eq(cyberLPVester.address)

    await expect(rewardRouter.initialize(
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
      degenLP.address,
      feeDegenLPTracker.address,
      stakedDegenLPTracker.address,
      degenLPManager.address,
      degenLPVester.address,
      pyth.address
    )).to.be.revertedWith("RewardRouter: already initialized")
  })

  it("stakeCybForAccount, stakeCyb, stakeEsCyb, unstakeCyb, unstakeEsCyb, claimEsCyb, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeCybDistributor.address, expandDecimals(100, 18))
    await feeCybDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await cyb.setMinter(wallet.address, true)
    await cyb.mint(user0.address, expandDecimals(1500, 18))
    expect(await cyb.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await cyb.connect(user0).approve(stakedCybTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).stakeCybForAccount(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).stakeCybForAccount(user1.address, expandDecimals(800, 18))
    expect(await cyb.balanceOf(user0.address)).eq(expandDecimals(700, 18))

    await cyb.mint(user1.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user1).approve(stakedCybTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)

    expect(await stakedCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user0.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(1000, 18))

    expect(await bonusCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusCybTracker.depositBalances(user0.address, stakedCybTracker.address)).eq(0)
    expect(await bonusCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusCybTracker.depositBalances(user1.address, stakedCybTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user0.address, bonusCybTracker.address)).eq(0)
    expect(await feeCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedCybTracker.claimable(user0.address)).eq(0)
    expect(await stakedCybTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedCybTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusCybTracker.claimable(user0.address)).eq(0)
    expect(await bonusCybTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusCybTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await feeCybTracker.claimable(user0.address)).eq(0)
    expect(await feeCybTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeCybTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await timelock.signalMint(esCyb.address, tokenManager.address, expandDecimals(500, 18))
    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.processMint(esCyb.address, tokenManager.address, expandDecimals(500, 18))
    await esCyb.connect(tokenManager).transferFrom(tokenManager.address, user2.address, expandDecimals(500, 18))
    await rewardRouter.connect(user2).stakeEsCyb(expandDecimals(500, 18))

    expect(await stakedCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user0.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(1000, 18))
    expect(await stakedCybTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await stakedCybTracker.depositBalances(user2.address, esCyb.address)).eq(expandDecimals(500, 18))

    expect(await bonusCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusCybTracker.depositBalances(user0.address, stakedCybTracker.address)).eq(0)
    expect(await bonusCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusCybTracker.depositBalances(user1.address, stakedCybTracker.address)).eq(expandDecimals(1000, 18))
    expect(await bonusCybTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await bonusCybTracker.depositBalances(user2.address, stakedCybTracker.address)).eq(expandDecimals(500, 18))

    expect(await feeCybTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user0.address, bonusCybTracker.address)).eq(0)
    expect(await feeCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeCybTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeCybTracker.depositBalances(user2.address, bonusCybTracker.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedCybTracker.claimable(user0.address)).eq(0)
    expect(await stakedCybTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedCybTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedCybTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedCybTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await bonusCybTracker.claimable(user0.address)).eq(0)
    expect(await bonusCybTracker.claimable(user1.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusCybTracker.claimable(user1.address)).lt("5490000000000000000")
    expect(await bonusCybTracker.claimable(user2.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusCybTracker.claimable(user2.address)).lt("1380000000000000000")

    expect(await feeCybTracker.claimable(user0.address)).eq(0)
    expect(await feeCybTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeCybTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeCybTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeCybTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await esCyb.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsCyb()
    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esCyb.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsCyb()
    expect(await esCyb.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esCyb.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await stakedCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(1000, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(2643, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(2645, 18))

    expect(await bonusCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await bonusCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))

    expect(await feeCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3657, 18))
    expect(await feeCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3659, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).gt(expandDecimals(3643, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).lt(expandDecimals(3645, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("14100000000000000000") // 14.1
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("14300000000000000000") // 14.3

    expect(await cyb.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).unstakeCyb(expandDecimals(300, 18))
    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(300, 18))

    expect(await stakedCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await stakedCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(700, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(2643, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(2645, 18))

    expect(await bonusCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await bonusCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))

    expect(await feeCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(3357, 18))
    expect(await feeCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(3359, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).gt(expandDecimals(3343, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).lt(expandDecimals(3345, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("13000000000000000000") // 13
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("13100000000000000000") // 13.1

    const esCybBalance1 = await esCyb.balanceOf(user1.address)
    const esCybUnstakeBalance1 = await stakedCybTracker.depositBalances(user1.address, esCyb.address)
    await rewardRouter.connect(user1).unstakeEsCyb(esCybUnstakeBalance1)
    expect(await esCyb.balanceOf(user1.address)).eq(esCybBalance1.add(esCybUnstakeBalance1))

    expect(await stakedCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(700, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).eq(0)

    expect(await bonusCybTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))

    expect(await feeCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(702, 18))
    expect(await feeCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(703, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).eq(expandDecimals(700, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("2720000000000000000") // 2.72
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("2740000000000000000") // 2.74

    await expect(rewardRouter.connect(user1).unstakeEsCyb(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")
  })

  it("mintAndStakeCyberLP, unstakeAndRedeemCyberLP, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeCyberLPDistributor.address, expandDecimals(100, 18))
    await feeCyberLPDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(user1.address, expandDecimals(1, 18))
    await eth.connect(user1).approve(cyberLPManager.address, expandDecimals(1, 18))
    const tx0 = await rewardRouter.connect(user1).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18),
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )
    await reportGasUsed(provider, tx0, "mintAndStakeCyberLP gas used")

    expect(await feeCyberLPTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeCyberLPTracker.depositBalances(user1.address, cyberLP.address)).eq(expandDecimals(2991, 17))

    expect(await stakedCyberLPTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedCyberLPTracker.depositBalances(user1.address, feeCyberLPTracker.address)).eq(expandDecimals(2991, 17))

    await eth.mint(user1.address, expandDecimals(2, 18))
    await eth.connect(user1).approve(cyberLPManager.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18),
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeCyberLPTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeCyberLPTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    expect(await stakedCyberLPTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedCyberLPTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await eth.mint(user2.address, expandDecimals(1, 18))
    await eth.connect(user2).approve(cyberLPManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18),
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )

    await expect(rewardRouter.connect(user2).unstakeAndRedeemCyberLP(
      eth.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address,
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )).to.be.revertedWith("CyberLPManager: cooldown duration not yet passed")

    expect(await feeCyberLPTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    expect(await stakedCyberLPTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await eth.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemCyberLP(
      eth.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address,
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemCyberLP gas used")

    expect(await feeCyberLPTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedCyberLPTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await eth.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeCyberLPTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeCyberLPTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeCyberLPTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeCyberLPTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await stakedCyberLPTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedCyberLPTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedCyberLPTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedCyberLPTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await esCyb.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsCyb()
    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq("993676666666666666")
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("6940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("6950000000000000000")

    expect(await esCyb.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsCyb()
    expect(await esCyb.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esCyb.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(4165, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(4167, 18))

    expect(await bonusCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await feeCybTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeCybTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).gt(expandDecimals(4165, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bonusCybTracker.address)).lt(expandDecimals(4167, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("12900000000000000000") // 12.9
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("13100000000000000000") // 13.1

    expect(await feeCyberLPTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedCyberLPTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
  })

  it("mintAndStakeCyberLPETH, unstakeAndRedeemCyberLPETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeCyberLPETH(expandDecimals(300, 18), expandDecimals(300, 18), priceUpdateData, { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

    await expect(rewardRouter.connect(user0).mintAndStakeCyberLPETH(expandDecimals(300, 18), expandDecimals(300, 18), priceUpdateData, { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("CyberLPManager: insufficient USDG output")

    await expect(rewardRouter.connect(user0).mintAndStakeCyberLPETH(expandDecimals(299, 18), expandDecimals(300, 18), priceUpdateData, { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("CyberLPManager: insufficient CyberLP output")

    expect(await eth.balanceOf(user0.address)).eq(0)
    expect(await eth.balanceOf(vault.address)).eq(0)
    expect(await eth.totalSupply()).eq(0)
    expect(await provider.getBalance(eth.address)).eq(0)
    expect(await stakedCyberLPTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeCyberLPETH(expandDecimals(299, 18), expandDecimals(299, 18), priceUpdateData, { value: expandDecimals(1, 18) })

    expect(await eth.balanceOf(user0.address)).eq(0)
    expect(await eth.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(eth.address)).eq(expandDecimals(1, 18))
    expect(await eth.totalSupply()).eq(expandDecimals(1, 18))
    expect(await stakedCyberLPTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await expect(rewardRouter.connect(user0).unstakeAndRedeemCyberLPETH(expandDecimals(300, 18), expandDecimals(1, 18), receiver0.address, priceUpdateData))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await expect(rewardRouter.connect(user0).unstakeAndRedeemCyberLPETH("299100000000000000000", expandDecimals(1, 18), receiver0.address, priceUpdateData))
      .to.be.revertedWith("CyberLPManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await expect(rewardRouter.connect(user0).unstakeAndRedeemCyberLPETH("299100000000000000000", expandDecimals(1, 18), receiver0.address, priceUpdateData))
      .to.be.revertedWith("CyberLPManager: insufficient output")

    await rewardRouter.connect(user0).unstakeAndRedeemCyberLPETH("299100000000000000000", "990000000000000000", receiver0.address, priceUpdateData)
    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await eth.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(eth.address)).eq("5991000000000000")
    expect(await eth.totalSupply()).eq("5991000000000000")
  })

  it("cyb: signalTransfer, acceptTransfer", async () => {
    await cyb.setMinter(wallet.address, true)
    await cyb.mint(user1.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user1).approve(stakedCybTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)

    await cyb.mint(user2.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user2).approve(stakedCybTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).claim()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedCybTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await cybVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedCybTracker.depositBalances(user2.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user2.address, esCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user2.address, bnCyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).eq(0)
    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await cybVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await cybVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.bonusRewards(user3.address)).eq(0)
    expect(await cybVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await cybVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedCybTracker.depositBalances(user2.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user2.address, esCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user2.address, bnCyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).gt(expandDecimals(892, 18))
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).lt(expandDecimals(893, 18))
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).gt("547000000000000000") // 0.547
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).lt("549000000000000000") // 0.548
    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await cybVester.bonusRewards(user2.address)).eq(0)
    expect(await cybVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await cybVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await cyb.connect(user3).approve(stakedCybTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user3).signalTransfer(user4.address)
    await rewardRouter.connect(user4).acceptTransfer(user3.address)

    expect(await stakedCybTracker.depositBalances(user3.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user4.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user4.address, esCyb.address)).gt(expandDecimals(892, 18))
    expect(await stakedCybTracker.depositBalances(user4.address, esCyb.address)).lt(expandDecimals(894, 18))
    expect(await feeCybTracker.depositBalances(user4.address, bnCyb.address)).gt("547000000000000000") // 0.547
    expect(await feeCybTracker.depositBalances(user4.address, bnCyb.address)).lt("549000000000000000") // 0.548
    expect(await cybVester.transferredAverageStakedAmounts(user4.address)).gt(expandDecimals(200, 18))
    expect(await cybVester.transferredAverageStakedAmounts(user4.address)).lt(expandDecimals(201, 18))
    expect(await cybVester.transferredCumulativeRewards(user4.address)).gt(expandDecimals(892, 18))
    expect(await cybVester.transferredCumulativeRewards(user4.address)).lt(expandDecimals(894, 18))
    expect(await cybVester.bonusRewards(user3.address)).eq(0)
    expect(await cybVester.bonusRewards(user4.address)).eq(expandDecimals(100, 18))
    expect(await stakedCybTracker.averageStakedAmounts(user3.address)).gt(expandDecimals(1092, 18))
    expect(await stakedCybTracker.averageStakedAmounts(user3.address)).lt(expandDecimals(1094, 18))
    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user4.address)).gt(expandDecimals(200, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user4.address)).lt(expandDecimals(201, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user4.address)).gt(expandDecimals(992, 18))
    expect(await cybVester.getMaxVestableAmount(user4.address)).lt(expandDecimals(994, 18))
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).eq(0)
    expect(await cybVester.getPairAmount(user4.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await cybVester.getPairAmount(user4.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await expect(rewardRouter.connect(user4).acceptTransfer(user3.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")
  })

  it("cyb, cyberLP: signalTransfer, acceptTransfer", async () => {
    await cyb.setMinter(wallet.address, true)
    await cyb.mint(cybVester.address, expandDecimals(10000, 18))
    await cyb.mint(cyberLPVester.address, expandDecimals(10000, 18))
    await eth.mint(feeCyberLPDistributor.address, expandDecimals(100, 18))
    await feeCyberLPDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(user1.address, expandDecimals(1, 18))
    await eth.connect(user1).approve(cyberLPManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18),
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )

    await eth.mint(user2.address, expandDecimals(1, 18))
    await eth.connect(user2).approve(cyberLPManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18),
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )

    await cyb.mint(user1.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user1).approve(stakedCybTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)

    await cyb.mint(user2.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user2).approve(stakedCybTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedCybTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await cybVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedCybTracker.depositBalances(user2.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user2.address, esCyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).eq(0)

    expect(await feeCybTracker.depositBalances(user2.address, bnCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).eq(0)

    expect(await feeCyberLPTracker.depositBalances(user2.address, cyberLP.address)).eq("299100000000000000000") // 299.1
    expect(await feeCyberLPTracker.depositBalances(user3.address, cyberLP.address)).eq(0)

    expect(await stakedCyberLPTracker.depositBalances(user2.address, feeCyberLPTracker.address)).eq("299100000000000000000") // 299.1
    expect(await stakedCyberLPTracker.depositBalances(user3.address, feeCyberLPTracker.address)).eq(0)

    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await cybVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await cybVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.bonusRewards(user3.address)).eq(0)
    expect(await cybVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await cybVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedCybTracker.depositBalances(user2.address, cyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user2.address, esCyb.address)).eq(0)
    expect(await stakedCybTracker.depositBalances(user3.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).gt(expandDecimals(1785, 18))
    expect(await stakedCybTracker.depositBalances(user3.address, esCyb.address)).lt(expandDecimals(1786, 18))

    expect(await feeCybTracker.depositBalances(user2.address, bnCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).gt("547000000000000000") // 0.547
    expect(await feeCybTracker.depositBalances(user3.address, bnCyb.address)).lt("549000000000000000") // 0.548

    expect(await feeCyberLPTracker.depositBalances(user2.address, cyberLP.address)).eq(0)
    expect(await feeCyberLPTracker.depositBalances(user3.address, cyberLP.address)).eq("299100000000000000000") // 299.1

    expect(await stakedCyberLPTracker.depositBalances(user2.address, feeCyberLPTracker.address)).eq(0)
    expect(await stakedCyberLPTracker.depositBalances(user3.address, feeCyberLPTracker.address)).eq("299100000000000000000") // 299.1

    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await cybVester.bonusRewards(user2.address)).eq(0)
    expect(await cybVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await cybVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(199, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(200, 18))

    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user1).claim()
    await rewardRouter.connect(user2).claim()
    await rewardRouter.connect(user3).claim()

    expect(await cybVester.getCombinedAverageStakedAmount(user1.address)).gt(expandDecimals(1092, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user1.address)).lt(expandDecimals(1094, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))

    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1885, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1887, 18))
    expect(await cybVester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1785, 18))
    expect(await cybVester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1787, 18))

    expect(await cybVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(1885, 18))).gt(expandDecimals(1092, 18))
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(1885, 18))).lt(expandDecimals(1094, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(1785, 18))).gt(expandDecimals(1092, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(1785, 18))).lt(expandDecimals(1094, 18))

    await rewardRouter.connect(user1).compound()
    await rewardRouter.connect(user3).compound()

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(1992, 18))
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(1993, 18))

    await cybVester.connect(user1).deposit(expandDecimals(1785, 18))

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(1991 - 1092, 18)) // 899
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(1993 - 1092, 18)) // 901

    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt(expandDecimals(4, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt(expandDecimals(6, 18))

    await rewardRouter.connect(user1).unstakeCyb(expandDecimals(200, 18))
    await expect(rewardRouter.connect(user1).unstakeEsCyb(expandDecimals(699, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await rewardRouter.connect(user1).unstakeEsCyb(expandDecimals(599, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(97, 18))
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(99, 18))

    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(599, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(601, 18))

    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await cybVester.connect(user1).withdraw()

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18)) // 1190 - 98 => 1092
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(2378, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(2380, 18))

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    expect(await cyberLPVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1785, 18))
    expect(await cyberLPVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1787, 18))

    expect(await cyberLPVester.getPairAmount(user3.address, expandDecimals(1785, 18))).gt(expandDecimals(298, 18))
    expect(await cyberLPVester.getPairAmount(user3.address, expandDecimals(1785, 18))).lt(expandDecimals(300, 18))

    expect(await stakedCyberLPTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esCyb.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esCyb.balanceOf(user3.address)).lt(expandDecimals(1787, 18))

    expect(await cyb.balanceOf(user3.address)).eq(0)

    await cyberLPVester.connect(user3).deposit(expandDecimals(1785, 18))

    expect(await stakedCyberLPTracker.balanceOf(user3.address)).gt(0)
    expect(await stakedCyberLPTracker.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await esCyb.balanceOf(user3.address)).gt(0)
    expect(await esCyb.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await cyb.balanceOf(user3.address)).eq(0)

    await expect(rewardRouter.connect(user3).unstakeAndRedeemCyberLP(
      eth.address,
      expandDecimals(1, 18),
      0,
      user3.address,
      [randomBytes(1)], { value: expandDecimals(1, 1) }
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await cyberLPVester.connect(user3).withdraw()

    expect(await stakedCyberLPTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esCyb.balanceOf(user3.address)).gt(expandDecimals(1785 - 5, 18))
    expect(await esCyb.balanceOf(user3.address)).lt(expandDecimals(1787 - 5, 18))

    expect(await cyb.balanceOf(user3.address)).gt(expandDecimals(4, 18))
    expect(await cyb.balanceOf(user3.address)).lt(expandDecimals(6, 18))

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(2379, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(2381, 18))

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await cybVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(743, 18)) // 1190 - 743 => 447
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(754, 18))

    expect(await cybVester.claimable(user1.address)).eq(0)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await cybVester.claimable(user1.address)).gt("3900000000000000000") // 3.9
    expect(await cybVester.claimable(user1.address)).lt("4100000000000000000") // 4.1

    await cybVester.connect(user1).deposit(expandDecimals(365, 18))

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(522, 18)) // 743 - 522 => 221
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(524, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await cybVester.claimable(user1.address)).gt("9900000000000000000") // 9.9
    expect(await cybVester.claimable(user1.address)).lt("10100000000000000000") // 10.1

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await cybVester.connect(user1).claim()

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(214, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(216, 18))

    await cybVester.connect(user1).deposit(expandDecimals(365, 18))
    expect(await cybVester.balanceOf(user1.address)).gt(expandDecimals(1449, 18)) // 365 * 4 => 1460, 1460 - 10 => 1450
    expect(await cybVester.balanceOf(user1.address)).lt(expandDecimals(1451, 18))
    expect(await cybVester.getVestedAmount(user1.address)).eq(expandDecimals(1460, 18))

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(303, 18)) // 522 - 303 => 219
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(304, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await cybVester.claimable(user1.address)).gt("7900000000000000000") // 7.9
    expect(await cybVester.claimable(user1.address)).lt("8100000000000000000") // 8.1

    await cybVester.connect(user1).withdraw()

    expect(await feeCybTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeCybTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(222, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(224, 18))

    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(2360, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(2362, 18))

    await cybVester.connect(user1).deposit(expandDecimals(365, 18))

    await increaseTime(provider, 500 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await cybVester.claimable(user1.address)).eq(expandDecimals(365, 18))

    await cybVester.connect(user1).withdraw()

    expect(await cyb.balanceOf(user1.address)).gt(expandDecimals(222 + 365, 18))
    expect(await cyb.balanceOf(user1.address)).lt(expandDecimals(224 + 365, 18))

    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(2360 - 365, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(2362 - 365, 18))

    expect(await cybVester.transferredAverageStakedAmounts(user2.address)).eq(0)
    expect(await cybVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.cumulativeRewards(user2.address)).gt(expandDecimals(892, 18))
    expect(await stakedCybTracker.cumulativeRewards(user2.address)).lt(expandDecimals(893, 18))
    expect(await stakedCybTracker.cumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await stakedCybTracker.cumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await cybVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await cybVester.bonusRewards(user2.address)).eq(0)
    expect(await cybVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await cybVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1093, 18))
    expect(await cybVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await cybVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884, 18))
    expect(await cybVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886, 18))
    expect(await cybVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(574, 18))
    expect(await cybVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(575, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(545, 18))
    expect(await cybVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(546, 18))
  })

  it("handleRewards", async () => {
    const timelockV2 = wallet

    // use new rewardRouter, use eth for weth
    const RewardRouterV4 = await deployContract("RewardRouterV4", [])
    await RewardRouterV4.initialize(
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
      degenLP.address,
      feeDegenLPTracker.address,
      stakedDegenLPTracker.address,
      degenLPManager.address,
      degenLPVester.address,
      pyth.address
    )

    await timelock.signalSetGov(cyberLPManager.address, timelockV2.address)
    await timelock.signalSetGov(stakedCybTracker.address, timelockV2.address)
    await timelock.signalSetGov(bonusCybTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeCybTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeCyberLPTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedCyberLPTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedCybDistributor.address, timelockV2.address)
    await timelock.signalSetGov(stakedCyberLPDistributor.address, timelockV2.address)
    await timelock.signalSetGov(esCyb.address, timelockV2.address)
    await timelock.signalSetGov(bnCyb.address, timelockV2.address)
    await timelock.signalSetGov(cybVester.address, timelockV2.address)
    await timelock.signalSetGov(cyberLPVester.address, timelockV2.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGov(cyberLPManager.address, timelockV2.address)
    await timelock.setGov(stakedCybTracker.address, timelockV2.address)
    await timelock.setGov(bonusCybTracker.address, timelockV2.address)
    await timelock.setGov(feeCybTracker.address, timelockV2.address)
    await timelock.setGov(feeCyberLPTracker.address, timelockV2.address)
    await timelock.setGov(stakedCyberLPTracker.address, timelockV2.address)
    await timelock.setGov(stakedCybDistributor.address, timelockV2.address)
    await timelock.setGov(stakedCyberLPDistributor.address, timelockV2.address)
    await timelock.setGov(esCyb.address, timelockV2.address)
    await timelock.setGov(bnCyb.address, timelockV2.address)
    await timelock.setGov(cybVester.address, timelockV2.address)
    await timelock.setGov(cyberLPVester.address, timelockV2.address)

    await esCyb.setHandler(RewardRouterV4.address, true)
    await esCyb.setHandler(stakedCybDistributor.address, true)
    await esCyb.setHandler(stakedCyberLPDistributor.address, true)
    await esCyb.setHandler(stakedCybTracker.address, true)
    await esCyb.setHandler(stakedCyberLPTracker.address, true)
    await esCyb.setHandler(cybVester.address, true)
    await esCyb.setHandler(cyberLPVester.address, true)

    await cyberLPManager.setHandler(RewardRouterV4.address, true)
    await stakedCybTracker.setHandler(RewardRouterV4.address, true)
    await bonusCybTracker.setHandler(RewardRouterV4.address, true)
    await feeCybTracker.setHandler(RewardRouterV4.address, true)
    await feeCyberLPTracker.setHandler(RewardRouterV4.address, true)
    await stakedCyberLPTracker.setHandler(RewardRouterV4.address, true)

    await esCyb.setHandler(RewardRouterV4.address, true)
    await bnCyb.setMinter(RewardRouterV4.address, true)
    await esCyb.setMinter(cybVester.address, true)
    await esCyb.setMinter(cyberLPVester.address, true)

    await cybVester.setHandler(RewardRouterV4.address, true)
    await cyberLPVester.setHandler(RewardRouterV4.address, true)

    await feeCybTracker.setHandler(cybVester.address, true)
    await stakedCyberLPTracker.setHandler(cyberLPVester.address, true)

    await degenLPManager.setHandler(RewardRouterV4.address, true)

    await feeDegenLPTracker.setHandler(RewardRouterV4.address, true)
    await stakedDegenLPTracker.setHandler(RewardRouterV4.address, true)

    await degenLPVester.setHandler(RewardRouterV4.address, true)

    await eth.deposit({ value: expandDecimals(10, 18) })

    await cyb.setMinter(wallet.address, true)
    await cyb.mint(cybVester.address, expandDecimals(10000, 18))
    await cyb.mint(cyberLPVester.address, expandDecimals(10000, 18))

    await eth.mint(feeCyberLPDistributor.address, expandDecimals(50, 18))
    await feeCyberLPDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeCybDistributor.address, expandDecimals(50, 18))
    await feeCybDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(user1.address, expandDecimals(1, 18))
    await eth.connect(user1).approve(cyberLPManager.address, expandDecimals(1, 18))
    await RewardRouterV4.connect(user1).mintAndStakeCyberLP(
      eth.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18), priceUpdateData
    )

    await cyb.mint(user1.address, expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await cyb.connect(user1).approve(stakedCybTracker.address, expandDecimals(200, 18))
    await RewardRouterV4.connect(user1).stakeCyb(expandDecimals(200, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await cyb.balanceOf(user1.address)).eq(0)
    expect(await esCyb.balanceOf(user1.address)).eq(0)
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).eq(0)
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).eq(0)

    await RewardRouterV4.connect(user1).handleRewards(
      true, // _shouldClaimCyb
      true, // _shouldStakeCyb
      true, // _shouldClaimEsCyb
      true, // _shouldStakeEsCyb
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await cyb.balanceOf(user1.address)).eq(0)
    expect(await esCyb.balanceOf(user1.address)).eq(0)
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(3571, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(3572, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("540000000000000000") // 0.54
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const ethBalance0 = await provider.getBalance(user1.address)

    await RewardRouterV4.connect(user1).handleRewards(
      false, // _shouldClaimCyb
      false, // _shouldStakeCyb
      false, // _shouldClaimEsCyb
      false, // _shouldStakeEsCyb
      false, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      true // _shouldConvertWethToEth
    )

    const ethBalance1 = await provider.getBalance(user1.address)

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)
    expect(await esCyb.balanceOf(user1.address)).eq(0)
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(3571, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(3572, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("540000000000000000") // 0.54
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("560000000000000000") // 0.56

    await RewardRouterV4.connect(user1).handleRewards(
      false, // _shouldClaimCyb
      false, // _shouldStakeCyb
      true, // _shouldClaimEsCyb
      false, // _shouldStakeEsCyb
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)
    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(3571, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(3572, 18))
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(3571, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(3572, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("540000000000000000") // 0.54
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("560000000000000000") // 0.56

    await cybVester.connect(user1).deposit(expandDecimals(365, 18))
    await cyberLPVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await cyb.balanceOf(user1.address)).eq(0)
    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(3571, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(3572, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("540000000000000000") // 0.54
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await RewardRouterV4.connect(user1).handleRewards(
      true, // _shouldClaimCyb
      false, // _shouldStakeCyb
      false, // _shouldClaimEsCyb
      false, // _shouldStakeEsCyb
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await cyb.balanceOf(user1.address)).gt("2900000000000000000") // 2.9
    expect(await cyb.balanceOf(user1.address)).lt("3100000000000000000") // 3.1
    expect(await esCyb.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esCyb.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnCyb.balanceOf(user1.address)).eq(0)
    expect(await cyberLP.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedCybTracker.depositBalances(user1.address, cyb.address)).eq(expandDecimals(200, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).gt(expandDecimals(3571, 18))
    expect(await stakedCybTracker.depositBalances(user1.address, esCyb.address)).lt(expandDecimals(3572, 18))
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).gt("540000000000000000") // 0.54
    expect(await feeCybTracker.depositBalances(user1.address, bnCyb.address)).lt("560000000000000000") // 0.56
  })
})
