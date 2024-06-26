const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract, deployTimeDistributor, deployRewardDistributor, deployVault, deployVaultPriceFeed, deployCybTimelock } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault } = require("../core/Vault/helpers")
const { priceFeedIds } = require("../shared/pyth")

use(solidity)

const { AddressZero } = ethers.constants

describe("CybTimelock", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, rewardManager, tokenManager, mintReceiver] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
  let usdg
  let router
  let eth
  let ethPriceFeed
  let btc
  let btcPriceFeed
  let dai
  let daiPriceFeed
  let distributor0
  let yieldTracker0
  let timelock
  let pyth

  beforeEach(async () => {
    pyth = await deployContract("Pyth", [])
    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address,priceFeedIds.eth,10000])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address,priceFeedIds.btc,10000])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address,priceFeedIds.dai,10000])

    vault = await deployVault()
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, eth.address,pyth.address])
    vaultPriceFeed = await deployVaultPriceFeed()

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = initVaultResult.vaultUtils

    distributor0 = await deployTimeDistributor([])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [eth.address])

    await eth.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vault.setPriceFeed(user3.address)

    timelock = await deployCybTimelock([
      wallet.address,
      5 * 24 * 60 * 60,
      7 * 24 * 60 * 60,
      rewardManager.address,
      tokenManager.address,
      mintReceiver.address,
      expandDecimals(1000, 18)
    ])
    await vault.setGov(timelock.address)

    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await vaultPriceFeed.setGov(timelock.address)
    await router.setGov(timelock.address)
  })

  it("inits", async () => {
    expect(await usdg.gov()).eq(wallet.address)
    expect(await usdg.vaults(vault.address)).eq(true)
    expect(await usdg.vaults(user0.address)).eq(false)

    expect(await vault.gov()).eq(timelock.address)
    expect(await vault.isInitialized()).eq(true)
    expect(await vault.router()).eq(router.address)
    expect(await vault.usdg()).eq(usdg.address)
    expect(await vault.liquidationFeeUsd()).eq(toUsd(5))
    expect(await vault.fundingRateFactor()).eq(600)

    expect(await timelock.admin()).eq(wallet.address)
    expect(await timelock.buffer()).eq(5 * 24 * 60 * 60)
    expect(await timelock.tokenManager()).eq(tokenManager.address)
    expect(await timelock.maxTokenSupply()).eq(expandDecimals(1000, 18))

    await expect(deployCybTimelock([
      wallet.address,
      7 * 24 * 60 * 60 + 1,
      7 * 24 + 60 * 60,
      rewardManager.address,
      tokenManager.address,
      mintReceiver.address,
      1000
    ])).to.be.revertedWith("CybTimelock: invalid _buffer")

    await expect(deployCybTimelock([
      wallet.address,
      7 * 24 * 60 * 60,
      7 * 24 * 60 * 60 + 1,
      rewardManager.address,
      tokenManager.address,
      mintReceiver.address,
      1000
    ])).to.be.revertedWith("CybTimelock: invalid _longBuffer")
  })

  it("setTokenConfig", async () => {
    await timelock.connect(wallet).signalSetPriceFeed(vault.address, vaultPriceFeed.address)
    await increaseTime(provider, 5 * 24 * 60 * 60 + 10)
    await mineBlock(provider)
    await timelock.connect(wallet).setPriceFeed(vault.address, vaultPriceFeed.address)

    await pyth.updatePrice(priceFeedIds.eth, 500)

    await expect(timelock.connect(user0).setTokenConfig(
      vault.address,
      eth.address,
      100,
      200,
      1000,
      0,
      0
    )).to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setTokenConfig(
      vault.address,
      eth.address,
      100,
      200,
      1000,
      0,
      0
    )).to.be.revertedWith("CybTimelock: token not yet whitelisted")

    await timelock.connect(wallet).signalVaultSetTokenConfig(
      vault.address,
      eth.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      300, // _minProfitBps
      5000, // _maxUsdgAmount
      false, // _isStable
      true // isShortable
    )

    await increaseTime(provider, 5 * 24 * 60 *60)
    await mineBlock(provider)

    await timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      eth.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      300, // _minProfitBps
      5000, // _maxUsdgAmount
      false, // _isStable
      true // isShortable
    )

    expect(await vault.whitelistedTokenCount()).eq(1)
    expect(await vault.totalTokenWeights()).eq(7000)
    expect(await vault.whitelistedTokens(eth.address)).eq(true)
    expect(await vault.tokenDecimals(eth.address)).eq(12)
    expect(await vault.tokenWeights(eth.address)).eq(7000)
    expect(await vault.minProfitBasisPoints(eth.address)).eq(300)
    expect(await vault.maxUsdgAmounts(eth.address)).eq(5000)
    expect(await vault.stableTokens(eth.address)).eq(false)
    expect(await vault.shortableTokens(eth.address)).eq(true)

    await timelock.connect(wallet).setTokenConfig(
      vault.address,
      eth.address,
      100, // _tokenWeight
      200, // _minProfitBps
      1000, // _maxUsdgAmount
      300, // _bufferAmount
      500 // _usdgAmount
    )

    expect(await vault.whitelistedTokenCount()).eq(1)
    expect(await vault.totalTokenWeights()).eq(100)
    expect(await vault.whitelistedTokens(eth.address)).eq(true)
    expect(await vault.tokenDecimals(eth.address)).eq(12)
    expect(await vault.tokenWeights(eth.address)).eq(100)
    expect(await vault.minProfitBasisPoints(eth.address)).eq(200)
    expect(await vault.maxUsdgAmounts(eth.address)).eq(1000)
    expect(await vault.stableTokens(eth.address)).eq(false)
    expect(await vault.shortableTokens(eth.address)).eq(true)
    expect(await vault.bufferAmounts(eth.address)).eq(300)
    expect(await vault.usdgAmounts(eth.address)).eq(500)
  })

  it("setBuffer", async () => {
    const timelock0 = await deployCybTimelock([
      user1.address,
      3 * 24 * 60 * 60,
      7 * 24 * 60 * 60,
      rewardManager.address,
      tokenManager.address,
      mintReceiver.address,
      1000
    ])
    await expect(timelock0.connect(user0).setBuffer(3 * 24 * 60 * 60 - 10))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock0.connect(user1).setBuffer(7 * 24 * 60 * 60 + 10))
      .to.be.revertedWith("CybTimelock: invalid _buffer")

    await expect(timelock0.connect(user1).setBuffer(3 * 24 * 60 * 60 - 10))
      .to.be.revertedWith("CybTimelock: buffer cannot be decreased")

    expect(await timelock0.buffer()).eq(3 * 24 * 60 * 60)
    await timelock0.connect(user1).setBuffer(3 * 24 * 60 * 60 + 10)
    expect(await timelock0.buffer()).eq(3 * 24 * 60 * 60 + 10)
  })

  it("setIsAmmEnabled", async () => {
    await expect(timelock.connect(user0).setIsAmmEnabled(vaultPriceFeed.address, false))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).setIsAmmEnabled(vaultPriceFeed.address, false)
    expect(await vaultPriceFeed.isAmmEnabled()).eq(false)
  })

  it("setMaxStrictPriceDeviation", async () => {
    await expect(timelock.connect(user0).setMaxStrictPriceDeviation(vaultPriceFeed.address, 100))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vaultPriceFeed.maxStrictPriceDeviation()).eq(0)
    await timelock.connect(wallet).setMaxStrictPriceDeviation(vaultPriceFeed.address, 100)
    expect(await vaultPriceFeed.maxStrictPriceDeviation()).eq(100)
  })

  it("setVaultUtils", async () => {
    await expect(timelock.connect(user0).setVaultUtils(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.vaultUtils()).eq(vaultUtils.address)
    await timelock.connect(wallet).setVaultUtils(vault.address, user1.address)
    expect(await vault.vaultUtils()).eq(user1.address)
  })

  it("setIsSwapEnabled", async () => {
    await expect(timelock.connect(user0).setIsSwapEnabled(vault.address, false))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.isSwapEnabled()).eq(true)
    await timelock.connect(wallet).setIsSwapEnabled(vault.address, false)
    expect(await vault.isSwapEnabled()).eq(false)
  })

  it("setContractHandler", async() => {
    await expect(timelock.connect(user0).setContractHandler(user1.address, true))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await timelock.isHandler(user1.address)).eq(false)
    await timelock.connect(wallet).setContractHandler(user1.address, true)
    expect(await timelock.isHandler(user1.address)).eq(true)
  })

  it("setIsLeverageEnabled", async () => {
    await expect(timelock.connect(user0).setIsLeverageEnabled(vault.address, false))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.isLeverageEnabled()).eq(true)
    await timelock.connect(wallet).setIsLeverageEnabled(vault.address, false)
    expect(await vault.isLeverageEnabled()).eq(false)

    await expect(timelock.connect(user1).setIsLeverageEnabled(vault.address, false))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).setContractHandler(user1.address, true)

    expect(await vault.isLeverageEnabled()).eq(false)
    await timelock.connect(user1).setIsLeverageEnabled(vault.address, true)
    expect(await vault.isLeverageEnabled()).eq(true)

    await expect(timelock.connect(user1).addExcludedToken(user2.address))
      .to.be.revertedWith("CybTimelock: forbidden")
  })

  it("setMaxGlobalShortSize", async () => {
    await expect(timelock.connect(user0).setMaxGlobalShortSize(vault.address, eth.address, 100))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.maxGlobalShortSizes(eth.address)).eq(0)
    await timelock.connect(wallet).setMaxGlobalShortSize(vault.address, eth.address, 100)
    expect(await vault.maxGlobalShortSizes(eth.address)).eq(100)
  })

  it("setMaxGasPrice", async () => {
    await expect(timelock.connect(user0).setMaxGasPrice(vault.address, 7000000000))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.maxGasPrice()).eq(0)
    await timelock.connect(wallet).setMaxGasPrice(vault.address, 7000000000)
    expect(await vault.maxGasPrice()).eq(7000000000)
  })

  it("setMaxLeverage", async () => {
    await expect(timelock.connect(user0).setMaxLeverage(vault.address, 100 * 10000))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setMaxLeverage(vault.address, 49 * 10000))
      .to.be.revertedWith("CybTimelock: invalid _maxLeverage")

    expect(await vault.maxLeverage()).eq(50 * 10000)
    await timelock.connect(wallet).setMaxLeverage(vault.address, 100 * 10000)
    expect(await vault.maxLeverage()).eq(100 * 10000)
  })

  it("setFundingRate", async () => {
    await expect(timelock.connect(user0).setFundingRate(vault.address, 59 * 60, 100, 100))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setFundingRate(vault.address, 59 * 60, 100, 100))
      .to.be.revertedWith("Vault: invalid _fundingInterval")

    expect(await vault.fundingRateFactor()).eq(600)
    expect(await vault.stableFundingRateFactor()).eq(600)
    await timelock.connect(wallet).setFundingRate(vault.address, 60 * 60, 0, 100)
    expect(await vault.fundingRateFactor()).eq(0)
    expect(await vault.stableFundingRateFactor()).eq(100)

    await timelock.connect(wallet).setFundingRate(vault.address, 60 * 60, 100, 0)
    expect(await vault.fundingRateFactor()).eq(100)
    expect(await vault.stableFundingRateFactor()).eq(0)
  })

  it("transferIn", async () => {
    await eth.mint(user1.address, 1000)
    await expect(timelock.connect(user0).transferIn(user1.address, eth.address, 1000))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).transferIn(user1.address, eth.address, 1000))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await eth.connect(user1).approve(timelock.address, 1000)

    expect(await eth.balanceOf(user1.address)).eq(1000)
    expect(await eth.balanceOf(timelock.address)).eq(0)
    await timelock.connect(wallet).transferIn(user1.address, eth.address, 1000)
    expect(await eth.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(timelock.address)).eq(1000)
  })

  it("approve", async () => {
    await expect(timelock.connect(user0).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalApprove(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalApprove(dai.address, user1.address, expandDecimals(100, 18))

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).approve(eth.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).approve(dai.address, user2.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(101, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await dai.mint(timelock.address, expandDecimals(150, 18))

    expect(await dai.balanceOf(timelock.address)).eq(expandDecimals(150, 18))
    expect(await dai.balanceOf(user1.address)).eq(0)

    await expect(dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18))
    await expect(dai.connect(user2).transferFrom(timelock.address, user2.address, expandDecimals(100, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    await dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(100, 18))

    expect(await dai.balanceOf(timelock.address)).eq(expandDecimals(50, 18))
    expect(await dai.balanceOf(user1.address)).eq(expandDecimals(100, 18))

    await expect(dai.connect(user1).transferFrom(timelock.address, user1.address, expandDecimals(1, 18)))
      .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await timelock.connect(wallet).signalApprove(dai.address, user1.address, expandDecimals(100, 18))

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address", "uint256"], ["approve", eth.address, user1.address, expandDecimals(100, 18)])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address", "uint256"], ["approve", dai.address, user1.address, expandDecimals(100, 18)])

    await expect(timelock.connect(user0).cancelAction(action0))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("CybTimelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).approve(dai.address, user1.address, expandDecimals(100, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")
  })

  it("setGov", async () => {
    await expect(timelock.connect(user0).setGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalSetGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).signalSetGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(tokenManager).signalSetGov(vault.address, user1.address)

    await expect(timelock.connect(wallet).setGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setGov(user2.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).setGov(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).setGov(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 2 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    expect(await vault.gov()).eq(timelock.address)
    await timelock.connect(wallet).setGov(vault.address, user1.address)
    expect(await vault.gov()).eq(user1.address)

    await timelock.connect(tokenManager).signalSetGov(vault.address, user2.address)

    await expect(timelock.connect(wallet).setGov(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setGov", user1.address, user2.address])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setGov", vault.address, user2.address])

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("CybTimelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).setGov(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")
  })

  it("setPriceFeed", async () => {
    await expect(timelock.connect(user0).setPriceFeed(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalSetPriceFeed(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalSetPriceFeed(vault.address, user1.address)

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).setPriceFeed(user2.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    expect(await vault.priceFeed()).eq(user3.address)
    await timelock.connect(wallet).setPriceFeed(vault.address, user1.address)
    expect(await vault.priceFeed()).eq(user1.address)

    await timelock.connect(wallet).signalSetPriceFeed(vault.address, user2.address)

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setPriceFeed", user1.address, user2.address])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["setPriceFeed", vault.address, user2.address])

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("CybTimelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).setPriceFeed(vault.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")
  })

  it("withdrawToken", async () => {
    const cyb = await deployContract("CYB", [])
    await cyb.setGov(timelock.address)

    await expect(timelock.connect(user0).withdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalWithdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalWithdrawToken(cyb.address, eth.address, user0.address, 100)

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).withdrawToken(dai.address, eth.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, dai.address, user0.address, 100))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user1.address, 100))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 101))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 100))
      .to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await eth.mint(cyb.address, 100)
    expect(await eth.balanceOf(user0.address)).eq(0)
    await timelock.connect(wallet).withdrawToken(cyb.address, eth.address, user0.address, 100)
    expect(await eth.balanceOf(user0.address)).eq(100)
  })

  it("vaultSetTokenConfig", async () => {
    await timelock.connect(wallet).signalSetPriceFeed(vault.address, vaultPriceFeed.address)
    await increaseTime(provider, 5 * 24 * 60 * 60 + 10)
    await mineBlock(provider)
    await timelock.connect(wallet).setPriceFeed(vault.address, vaultPriceFeed.address)

    await pyth.updatePrice(priceFeedIds.dai, 1)

    await expect(timelock.connect(user0).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalVaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalVaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )

    await expect(timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      15, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    expect(await vault.totalTokenWeights()).eq(0)
    expect(await vault.whitelistedTokens(dai.address)).eq(false)
    expect(await vault.tokenDecimals(dai.address)).eq(0)
    expect(await vault.tokenWeights(dai.address)).eq(0)
    expect(await vault.minProfitBasisPoints(dai.address)).eq(0)
    expect(await vault.maxUsdgAmounts(dai.address)).eq(0)
    expect(await vault.stableTokens(dai.address)).eq(false)
    expect(await vault.shortableTokens(dai.address)).eq(false)

    await timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      dai.address, // _token
      12, // _tokenDecimals
      7000, // _tokenWeight
      120, // _minProfitBps
      5000, // _maxUsdgAmount
      true, // _isStable
      false // isShortable
    )

    expect(await vault.totalTokenWeights()).eq(7000)
    expect(await vault.whitelistedTokens(dai.address)).eq(true)
    expect(await vault.tokenDecimals(dai.address)).eq(12)
    expect(await vault.tokenWeights(dai.address)).eq(7000)
    expect(await vault.minProfitBasisPoints(dai.address)).eq(120)
    expect(await vault.maxUsdgAmounts(dai.address)).eq(5000)
    expect(await vault.stableTokens(dai.address)).eq(true)
    expect(await vault.shortableTokens(dai.address)).eq(false)
  })

  it("priceFeedSetTokenConfig", async () => {
    await timelock.connect(wallet).signalSetPriceFeed(vault.address, vaultPriceFeed.address)
    await increaseTime(provider, 5 * 24 * 60 * 60 + 10)
    await mineBlock(provider)
    await timelock.connect(wallet).setPriceFeed(vault.address, vaultPriceFeed.address)

    await pyth.updatePrice(priceFeedIds.btc, toChainlinkPrice(70000))

    await expect(timelock.connect(user0).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalPriceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalPriceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action time not yet passed")


    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      user0.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      eth.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      ethPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      9, // _priceDecimals
      true // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      false // _isStrictStable
    )).to.be.revertedWith("CybTimelock: action not signalled")

    expect(await vaultPriceFeed.priceFeeds(btc.address)).eq(AddressZero)
    expect(await vaultPriceFeed.priceDecimals(btc.address)).eq(0)
    expect(await vaultPriceFeed.strictStableTokens(btc.address)).eq(false)
    await expect(vaultPriceFeed.getPrice(btc.address, true, false, false))
      .to.be.revertedWith("VaultPriceFeed: invalid price feed")

    await timelock.connect(wallet).priceFeedSetTokenConfig(
      vaultPriceFeed.address,
      btc.address, // _token
      btcPriceFeed.address, // _priceFeed
      8, // _priceDecimals
      true // _isStrictStable
    )

    expect(await vaultPriceFeed.priceFeeds(btc.address)).eq(btcPriceFeed.address)
    expect(await vaultPriceFeed.priceDecimals(btc.address)).eq(8)
    expect(await vaultPriceFeed.strictStableTokens(btc.address)).eq(true)
    expect(await vaultPriceFeed.getPrice(btc.address, true, false, false)).eq(toNormalizedPrice(70000))
  })

  it("addPlugin", async () => {
    await expect(timelock.connect(user0).addPlugin(router.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).addPlugin(router.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalAddPlugin(router.address, user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalAddPlugin(router.address, user1.address)

    await expect(timelock.connect(wallet).addPlugin(router.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 4 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).addPlugin(router.address, user1.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 1 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).addPlugin(user2.address, user1.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(wallet).addPlugin(router.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")

    expect(await router.plugins(user1.address)).eq(false)
    await timelock.connect(wallet).addPlugin(router.address, user1.address)
    expect(await router.plugins(user1.address)).eq(true)

    await timelock.connect(wallet).signalAddPlugin(router.address, user2.address)

    await expect(timelock.connect(wallet).addPlugin(router.address, user2.address))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    const action0 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["addPlugin", user1.address, user2.address])
    const action1 = ethers.utils.solidityKeccak256(["string", "address", "address"], ["addPlugin", router.address, user2.address])

    await expect(timelock.connect(wallet).cancelAction(action0))
      .to.be.revertedWith("CybTimelock: invalid _action")

    await timelock.connect(wallet).cancelAction(action1)

    await expect(timelock.connect(wallet).addPlugin(router.address, user2.address))
      .to.be.revertedWith("CybTimelock: action not signalled")
  })

  it("addExcludedToken", async () => {
    const cyb = await deployContract("CYB", [])
    await expect(timelock.connect(user0).addExcludedToken(cyb.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await timelock.excludedTokens(cyb.address)).eq(false)
    await timelock.connect(wallet).addExcludedToken(cyb.address)
    expect(await timelock.excludedTokens(cyb.address)).eq(true)
  })

  it("setInPrivateTransferMode", async () => {
    const cyb = await deployContract("CYB", [])
    await cyb.setMinter(wallet.address, true)
    await cyb.mint(user0.address, 100)
    await expect(timelock.connect(user0).setInPrivateTransferMode(cyb.address, true))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).setInPrivateTransferMode(cyb.address, true))
      .to.be.revertedWith("BaseToken: forbidden")

    await cyb.setGov(timelock.address)

    expect(await cyb.inPrivateTransferMode()).eq(false)
    await timelock.connect(wallet).setInPrivateTransferMode(cyb.address, true)
    expect(await cyb.inPrivateTransferMode()).eq(true)

    await timelock.connect(wallet).setInPrivateTransferMode(cyb.address, false)
    expect(await cyb.inPrivateTransferMode()).eq(false)

    await timelock.connect(wallet).setInPrivateTransferMode(cyb.address, true)
    expect(await cyb.inPrivateTransferMode()).eq(true)

    await expect(cyb.connect(user0).transfer(user1.address, 100))
      .to.be.revertedWith("BaseToken: msg.sender not whitelisted")

    await timelock.addExcludedToken(cyb.address)
    await expect(timelock.connect(wallet).setInPrivateTransferMode(cyb.address, true))
      .to.be.revertedWith("CybTimelock: invalid _inPrivateTransferMode")

    await timelock.connect(wallet).setInPrivateTransferMode(cyb.address, false)
    expect(await cyb.inPrivateTransferMode()).eq(false)

    await cyb.connect(user0).transfer(user1.address, 100)
  })

  it("setAdmin", async () => {
    await expect(timelock.setAdmin(user1.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await timelock.admin()).eq(wallet.address)
    await timelock.connect(tokenManager).setAdmin(user1.address)
    expect(await timelock.admin()).eq(user1.address)
  })

  it("setExternalAdmin", async () => {
    const distributor = await deployRewardDistributor([user1.address, user2.address])
    await distributor.setGov(timelock.address)
    await expect(timelock.connect(user0).setExternalAdmin(distributor.address, user3.address))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await distributor.admin()).eq(wallet.address)
    await timelock.connect(wallet).setExternalAdmin(distributor.address, user3.address)
    expect(await distributor.admin()).eq(user3.address)

    await expect(timelock.connect(wallet).setExternalAdmin(timelock.address, user3.address))
      .to.be.revertedWith("CybTimelock: invalid _target")
  })

  it("setInPrivateLiquidationMode", async () => {
    await expect(timelock.connect(user0).setInPrivateLiquidationMode(vault.address, true))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.inPrivateLiquidationMode()).eq(false)
    await timelock.connect(wallet).setInPrivateLiquidationMode(vault.address, true)
    expect(await vault.inPrivateLiquidationMode()).eq(true)

    await timelock.connect(wallet).setInPrivateLiquidationMode(vault.address, false)
    expect(await vault.inPrivateLiquidationMode()).eq(false)
  })

  it("setLiquidator", async () => {
    await expect(timelock.connect(user0).setLiquidator(vault.address, user1.address, true))
      .to.be.revertedWith("CybTimelock: forbidden")

    expect(await vault.isLiquidator(user1.address)).eq(false)
    await timelock.connect(wallet).setLiquidator(vault.address, user1.address, true)
    expect(await vault.isLiquidator(user1.address)).eq(true)

    await timelock.connect(wallet).setLiquidator(vault.address, user1.address, false)
    expect(await vault.isLiquidator(user1.address)).eq(false)

    await expect(vault.connect(user1).liquidatePosition(user0.address, eth.address, eth.address, true, user2.address))
      .to.be.reverted //Vault: empty position

    await timelock.connect(wallet).setInPrivateLiquidationMode(vault.address, true)

    await expect(vault.connect(user1).liquidatePosition(user0.address, eth.address, eth.address, true, user2.address))
      .to.be.reverted //With("Vault: invalid liquidator")

    await timelock.connect(wallet).setLiquidator(vault.address, user1.address, true)

    await expect(vault.connect(user1).liquidatePosition(user0.address, eth.address, eth.address, true, user2.address))
      .to.be.reverted //With("Vault: empty position")
  })

  it("redeemUsdg", async () => {
    await expect(timelock.connect(user0).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("CybTimelock: forbidden")

    await expect(timelock.connect(wallet).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("CybTimelock: action not signalled")

    await expect(timelock.connect(user0).signalRedeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("CybTimelock: forbidden")

    await timelock.connect(wallet).signalRedeemUsdg(vault.address, eth.address, expandDecimals(1000, 18))

    await expect(timelock.connect(wallet).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("CybTimelock: action time not yet passed")

    await increaseTime(provider, 5 * 24 * 60 * 60)
    await mineBlock(provider)

    await expect(timelock.connect(wallet).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("YieldToken: forbidden")

    await usdg.setGov(timelock.address)

    await expect(timelock.connect(wallet).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Vault: _token not whitelisted")

    await timelock.connect(wallet).signalSetPriceFeed(vault.address, vaultPriceFeed.address)
    await increaseTime(provider, 5 * 24 * 60 * 60 + 10)
    await mineBlock(provider)
    await timelock.connect(wallet).setPriceFeed(vault.address, vaultPriceFeed.address)

    await pyth.updatePrice(priceFeedIds.eth, toChainlinkPrice(500))

    await timelock.connect(wallet).signalVaultSetTokenConfig(
      vault.address,
      eth.address, // _token
      18, // _tokenDecimals
      7000, // _tokenWeight
      300, // _minProfitBps
      expandDecimals(5000, 18), // _maxUsdgAmount
      false, // _isStable
      true // isShortable
    )

    await increaseTime(provider, 7 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await timelock.connect(wallet).vaultSetTokenConfig(
      vault.address,
      eth.address, // _token
      18, // _tokenDecimals
      7000, // _tokenWeight
      300, // _minProfitBps
      expandDecimals(5000, 18), // _maxUsdgAmount
      false, // _isStable
      true // isShortable
    )

    await eth.mint(vault.address, expandDecimals(3, 18))
    await vault.buyUSDG(eth.address, user3.address)

    await timelock.connect(tokenManager).signalSetGov(vault.address, user1.address)

    await increaseTime(provider, 7 * 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await timelock.setGov(vault.address, user1.address)
    await vault.connect(user1).setInManagerMode(true)
    await vault.connect(user1).setGov(timelock.address)

    expect(await eth.balanceOf(mintReceiver.address)).eq(0)
    await timelock.connect(wallet).redeemUsdg(vault.address, eth.address, expandDecimals(1000, 18))
    expect(await eth.balanceOf(mintReceiver.address)).eq("1994000000000000000") // 1.994
  })
})
