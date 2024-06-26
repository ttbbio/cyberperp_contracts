const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract, deployRewardDistributor, deployBonusDistributor } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

describe("BonusDistributor", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let cyb
  let esCyb
  let bnCyb
  let stakedCybTracker
  let stakedCybDistributor
  let bonusCybTracker
  let bonusCybDistributor

  beforeEach(async () => {
    cyb = await deployContract("CYB", []);
    esCyb = await deployContract("EsCYB", []);
    bnCyb = await deployContract("MintableBaseToken", ["Bonus CYB", "bnCYB", 0]);

    stakedCybTracker = await deployContract("RewardTracker", ["Staked CYB", "stCYB"])
    stakedCybDistributor = await deployRewardDistributor([esCyb.address, stakedCybTracker.address])
    await stakedCybDistributor.updateLastDistributionTime()

    bonusCybTracker = await deployContract("RewardTracker", ["Staked + Bonus CYB", "sbCYB"])
    bonusCybDistributor = await deployBonusDistributor([bnCyb.address, bonusCybTracker.address])
    await bonusCybDistributor.updateLastDistributionTime()

    await stakedCybTracker.initialize([cyb.address, esCyb.address], stakedCybDistributor.address)
    await bonusCybTracker.initialize([stakedCybTracker.address], bonusCybDistributor.address)

    await stakedCybTracker.setInPrivateTransferMode(true)
    await stakedCybTracker.setInPrivateStakingMode(true)
    await bonusCybTracker.setInPrivateTransferMode(true)
    await bonusCybTracker.setInPrivateStakingMode(true)

    await stakedCybTracker.setHandler(rewardRouter.address, true)
    await stakedCybTracker.setHandler(bonusCybTracker.address, true)
    await bonusCybTracker.setHandler(rewardRouter.address, true)
    await bonusCybDistributor.setBonusMultiplier(10000)
  })

  it("distributes bonus", async () => {
    await esCyb.setMinter(wallet.address, true)
    await esCyb.mint(stakedCybDistributor.address, expandDecimals(50000, 18))
    await bnCyb.setMinter(wallet.address, true)
    await bnCyb.mint(bonusCybDistributor.address, expandDecimals(1500, 18))
    await stakedCybDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esCyb per second
    await cyb.setMinter(wallet.address, true)
    await cyb.mint(user0.address, expandDecimals(1000, 18))

    await cyb.connect(user0).approve(stakedCybTracker.address, expandDecimals(1001, 18))
    await expect(stakedCybTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, cyb.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")
    await stakedCybTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, cyb.address, expandDecimals(1000, 18))
    await expect(bonusCybTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedCybTracker.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")
    await bonusCybTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedCybTracker.address, expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedCybTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedCybTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))
    expect(await bonusCybTracker.claimable(user0.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusCybTracker.claimable(user0.address)).lt("2750000000000000000") // 2.75

    await esCyb.mint(user1.address, expandDecimals(500, 18))
    await esCyb.connect(user1).approve(stakedCybTracker.address, expandDecimals(500, 18))
    await stakedCybTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, esCyb.address, expandDecimals(500, 18))
    await bonusCybTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, stakedCybTracker.address, expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedCybTracker.claimable(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedCybTracker.claimable(user0.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await stakedCybTracker.claimable(user1.address)).gt(expandDecimals(595, 18))
    expect(await stakedCybTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await bonusCybTracker.claimable(user0.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusCybTracker.claimable(user0.address)).lt("5490000000000000000") // 5.49

    expect(await bonusCybTracker.claimable(user1.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusCybTracker.claimable(user1.address)).lt("1380000000000000000") // 1.38
  })
})
