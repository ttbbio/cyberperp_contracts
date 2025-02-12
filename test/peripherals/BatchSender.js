const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract, deployVault, deployProxyBlockInfo, deployVaultPriceFeed, deployCyberLPManager } = require("../shared/fixtures")

use(solidity)

describe("BatchSender", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let batchSender
  let cyb

  beforeEach(async () => {
    batchSender = await deployContract("BatchSender", [])
    cyb = await deployContract("CYB", [])
    // await cyb.beginMigration()
  })

  it("setHandler", async () => {
    expect(await batchSender.isHandler(wallet.address)).eq(true)
    expect(await batchSender.isHandler(user0.address)).eq(false)

    await expect(batchSender.connect(user1).setHandler(user0.address, true))
      .to.be.revertedWith("Governable: forbidden")

    await expect(batchSender.connect(user1).setGov(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await batchSender.gov()).eq(wallet.address)
    await batchSender.connect(wallet).setGov(user1.address)
    expect(await batchSender.gov()).eq(user1.address)

    const accounts = [user0.address, user1.address, user2.address, user3.address]
    const amounts = [100, 200, 300, 400]

    await expect(batchSender.connect(user0).send(cyb.address, accounts, amounts))
      .to.be.revertedWith("BatchSender: forbidden")

    await expect(batchSender.connect(user0).sendAndEmit(cyb.address, accounts, amounts, 1))
      .to.be.revertedWith("BatchSender: forbidden")

    expect(await batchSender.isHandler(user0.address)).eq(false)
    await batchSender.connect(user1).setHandler(user0.address, true)
    expect(await batchSender.isHandler(user0.address)).eq(true)

    await expect(batchSender.connect(user0).send(cyb.address, accounts, amounts))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await expect(batchSender.connect(user0).sendAndEmit(cyb.address, accounts, amounts, 1))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")
  })

  it("send", async () => {
      expect(await cyb.balanceOf(wallet.address)).eq("50000000000000000000000000")
  
      expect(await cyb.balanceOf(user0.address)).eq(0)
      expect(await cyb.balanceOf(user1.address)).eq(0)
      expect(await cyb.balanceOf(user2.address)).eq(0)
      expect(await cyb.balanceOf(user3.address)).eq(0)
  
      const accounts = [user0.address, user1.address, user2.address, user3.address]
      const amounts = [100, 200, 300, 400]
  
      await expect(batchSender.connect(user0).send(cyb.address, accounts, amounts))
        .to.be.revertedWith("BatchSender: forbidden")
  
      await cyb.approve(batchSender.address, 1000)
  
      await batchSender.send(cyb.address, accounts, amounts)
  
      expect(await cyb.balanceOf(user0.address)).eq(100)
      expect(await cyb.balanceOf(user1.address)).eq(200)
      expect(await cyb.balanceOf(user2.address)).eq(300)
      expect(await cyb.balanceOf(user3.address)).eq(400)
      expect(await cyb.balanceOf(wallet.address)).eq("49999999999999999999999000")
  })
  
  it("sendAndEmit", async () => {
      expect(await cyb.balanceOf(wallet.address)).eq("50000000000000000000000000")
  
      expect(await cyb.balanceOf(user0.address)).eq(0)
      expect(await cyb.balanceOf(user1.address)).eq(0)
      expect(await cyb.balanceOf(user2.address)).eq(0)
      expect(await cyb.balanceOf(user3.address)).eq(0)
  
      const accounts = [user0.address, user1.address, user2.address, user3.address]
      const amounts = [100, 200, 300, 400]
  
      await expect(batchSender.connect(user0).sendAndEmit(cyb.address, accounts, amounts, 1))
        .to.be.revertedWith("BatchSender: forbidden")
  
      await cyb.approve(batchSender.address, 1000)
  
      const tx = await batchSender.sendAndEmit(cyb.address, accounts, amounts, 1)
  
      expect(await cyb.balanceOf(user0.address)).eq(100)
      expect(await cyb.balanceOf(user1.address)).eq(200)
      expect(await cyb.balanceOf(user2.address)).eq(300)
      expect(await cyb.balanceOf(user3.address)).eq(400)
      expect(await cyb.balanceOf(wallet.address)).eq("49999999999999999999999000")
  
      const receipt = await tx.wait()
  
      const event = receipt.events[receipt.events.length - 1]
      expect(event.args.typeId).eq(1)
      expect(event.args.token).eq(cyb.address)
      event.args.accounts.forEach((account, i) => {
        expect(account).eq(accounts[i])
      })
      event.args.amounts.forEach((amount, i) => {
        expect(amount).eq(amounts[i])
      })
  })
})
