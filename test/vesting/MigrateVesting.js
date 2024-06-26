const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { parseEther } = ethers.utils;

function expectPartisipantEqual(res, cybPurchased, cybClaimed, lastClaimed){
    expect(BigNumber.from(res[0]).eq(cybPurchased), `cybPurchased ${res[0].toString()} not equal to expected${cybPurchased.toString()}`).to.be.true
    expect(BigNumber.from(res[1]).eq(cybClaimed), `cybClaimed ${res[1].toString()} not equal to expected${cybClaimed.toString()}`).to.be.true
    expect(BigNumber.from(res[2]).eq(lastClaimed), `lastClaimed ${res[2].toString()} not equal to expected${lastClaimed.toString()}`).to.be.true
}

describe("MigrateVesting", () => {
    let weeklyVesting, migrateVesting, cyb, usdc, owner, user1, user2;
    const TOKEN_PRICE = 1000000; //$1
    const MAX_CYB_VESTING = parseEther("1500000"); //1.5m
    const DEFAULT_USDC_BALANCE = 10000 * 1000000; //10000 usdc

    beforeEach(async () => {
        // Deploying CYB and USDC tokens (mock)
        const ERC20 = await ethers.getContractFactory("UsdcMock");
        const CYB = await ethers.getContractFactory("CYB");
        cyb = await CYB.deploy();
        usdc = await ERC20.deploy();
      
        // Deploying WeeklyVesting
        const latestTimeStamp = (await helpers.time.latest());
        const WeeklyVesting = await ethers.getContractFactory("WeeklyVesting");
        weeklyVesting = await WeeklyVesting.deploy(
            cyb.address,
            usdc.address,
            4, // vestingWeeks
            TOKEN_PRICE,
            MAX_CYB_VESTING, // maxCybVesting
            latestTimeStamp + 60 * 60 * 24 // vestingStart (1 day from now)
        );
        const MigrateVesting = await ethers.getContractFactory("MigrateVesting");
        migrateVesting = await MigrateVesting.deploy(
            4, // vestingWeeks
            TOKEN_PRICE,
            MAX_CYB_VESTING, // maxCybVesting
            latestTimeStamp + 60 * 60 * 24, // vestingStart (1 day from now)
            weeklyVesting.address
        );

        [owner, user1, user2] = await ethers.getSigners();

        // Transfer initial CYB and USDC to users
        // await cyb.transfer(user1.address, parseEther("1000"));
        // await cyb.transfer(user2.address, parseEther("1000"));
        await cyb.transfer(weeklyVesting.address, MAX_CYB_VESTING);
        await cyb.transfer(migrateVesting.address, MAX_CYB_VESTING);
        
        await usdc.transfer(user1.address, DEFAULT_USDC_BALANCE);
        await usdc.transfer(user2.address, DEFAULT_USDC_BALANCE);
    });

    it("should set initial contract variables correctly", async () => {
        expect(await migrateVesting.cyb()).to.equal(cyb.address);
        expect(await migrateVesting.usdc()).to.equal(usdc.address);
        expect(await migrateVesting.vestingWeeks()).to.equal(4);
        expect(await migrateVesting.tokenPrice()).to.equal(TOKEN_PRICE);
        expect(await migrateVesting.maxCybVesting()).to.equal(MAX_CYB_VESTING);
    });

    it("should allow user to buy tokens", async () => {
        const user1Usdc = usdc.connect(user1);
        await user1Usdc.approve(weeklyVesting.address, DEFAULT_USDC_BALANCE);

        const balanceBefore = await user1Usdc.balanceOf(user1.address);
        const user1WeeklyVesting = weeklyVesting.connect(user1);
        await expect(user1WeeklyVesting.buyTokens(parseEther("10")))
        .to.emit(weeklyVesting, "CybPurchased")
        .withArgs(user1.address, parseEther("10"));
        
        const balanceAfter = await user1Usdc.balanceOf(user1.address);
        const expectedDiff = TOKEN_PRICE * 10;
        expect(balanceBefore.sub(balanceAfter).eq(expectedDiff), "usdc balance hasn`t been changed correctly").to.be.true;
        
        const res = await migrateVesting.participants(user1.address);
        expectPartisipantEqual(res, parseEther("10"),parseEther("0"), parseEther("0") );
    });

    it("should not allow user to claim tokens before vesting starts", async () => {
        const user1WeeklyVesting = migrateVesting.connect(user1);
        await expect(user1WeeklyVesting.claimTokens()).to.be.revertedWith(
            "Vesting has not started yet"
        );
    });

    it("owner should withdraw usdc", async () => {
        await migrateVesting.withdrawTokens(cyb.address, parseEther("100"))
        await usdc.approve(migrateVesting.address, DEFAULT_USDC_BALANCE);
        await migrateVesting.buyTokens(parseEther("10"))
        await migrateVesting.withdrawTokens(usdc.address, 1000000)
    });

    it("not owner shouldn`t withdraw usdc", async () => {
        await expect(migrateVesting.connect(user1).withdrawTokens(cyb.address, parseEther("100"))).to.be.revertedWith("Ownable: caller is not the owner")
    });

    // it("should use shared claim from old contract ", async () => {
    //     // User1 buys tokens
    //     const user1Usdc = usdc.connect(user1);
    //     await user1Usdc.approve(weeklyVesting.address, DEFAULT_USDC_BALANCE);

    //     const user1WeeklyVesting = weeklyVesting.connect(user1);
    //     await user1WeeklyVesting.buyTokens(parseEther("40")); // User1 buys 40 CYB tokens
    //     // Fast forward to vesting start
    //     const vestingStarts = await user1WeeklyVesting.vestingStart();
    //     console.log("vestingStarts ", vestingStarts.toString());
    //     let latestTimeStamp = (await helpers.time.latest());
    //     console.log("latestTimeStamp ", latestTimeStamp);
    //     //1 day to reach vestingStart and 7 days to reach weeklyClaimTick
    //     await helpers.time.increaseTo(latestTimeStamp + 60 * 60 * 24 * 7  + 60 * 60 * 24); 
        
    //     const user1Cyb = cyb.connect(user1);
    //     const expectedDiff = parseEther("10");
    //     const balanceBefore = await user1Cyb.balanceOf(user1.address);
    //     await expect(user1WeeklyVesting.claimTokens())
    //     .to.emit(weeklyVesting, "CybClaimed")
    //     .withArgs(user1.address, expectedDiff); // User1 claims 10 CYB tokens (1/4 of the purchased amount)
    //     const balanceAfter = await user1Cyb.balanceOf(user1.address);
    //     expect(balanceAfter.sub(balanceBefore).eq(expectedDiff), "cyb balance hasn`t been changed correctly").to.be.true;

    //     const res = await weeklyVesting.participants(user1.address);
    //     latestTimeStamp = await helpers.time.latest();
    //     expectPartisipantEqual(res, parseEther("40"), parseEther("10"), latestTimeStamp);
    // });

    it("should claim tokens referencing to the state of migrated contract", async () => {
        // User1 buys tokens
        const user1Usdc = usdc.connect(user1);
        await user1Usdc.approve(weeklyVesting.address, DEFAULT_USDC_BALANCE);
        await user1Usdc.approve(migrateVesting.address, DEFAULT_USDC_BALANCE);

        const user1WeeklyVesting = weeklyVesting.connect(user1);
        const user1MigrateVesting = migrateVesting.connect(user1);
        await user1WeeklyVesting.buyTokens(parseEther("30")); // User1 buys 40 CYB tokens
        let res = await migrateVesting.participants(user1.address);
        console.log(`res 1: ${res[0]} ${res[1]} ${res[2]}`)
        expectPartisipantEqual(res, parseEther("30"), 0, 0);

        await user1MigrateVesting.buyTokens(parseEther("10")); // User1 buys 40 CYB tokens
        res = await migrateVesting.participants(user1.address);
        console.log(`res 1: ${res[0]} ${res[1]} ${res[2]}`)
        expectPartisipantEqual(res, parseEther("40"), 0, 0);
        // Fast forward to vesting start
        const vestingStarts = await user1WeeklyVesting.vestingStart();
        let latestTimeStamp = (await helpers.time.latest());
        //1 day to reach vestingStart and 7 days to reach weeklyClaimTick
        await helpers.time.increaseTo(latestTimeStamp + 60 * 60 * 24 * 7  + 60 * 60 * 24); 
        
        const user1Cyb = cyb.connect(user1);
        const expectedDiff = parseEther("10");
        const balanceBefore = await user1Cyb.balanceOf(user1.address);
        // await user1WeeklyVesting.claimTokens()
        await expect(user1MigrateVesting.claimTokens())
        .to.emit(migrateVesting, "CybClaimed")
        .withArgs(user1.address, expectedDiff); // User1 claims 10 CYB tokens (1/4 of the purchased amount)
        const balanceAfter = await user1Cyb.balanceOf(user1.address);
        expect(balanceAfter.sub(balanceBefore).eq(expectedDiff), "cyb balance hasn`t been changed correctly").to.be.true;

        res = await migrateVesting.participants(user1.address);
        latestTimeStamp = await helpers.time.latest();
        console.log(`res 2: ${res[0]} ${res[1]} ${res[2]}`)
        expectPartisipantEqual(res, parseEther("40"), parseEther("10"), latestTimeStamp);
    });

    it("should allow user to claim tokens after vesting starts", async () => {
        // User1 buys tokens
        const user1Usdc = usdc.connect(user1);
        await user1Usdc.approve(migrateVesting.address, DEFAULT_USDC_BALANCE);

        const user1WeeklyVesting = migrateVesting.connect(user1);
        await user1WeeklyVesting.buyTokens(parseEther("40")); // User1 buys 40 CYB tokens
        let res = await migrateVesting.participants(user1.address);
        console.log(`res 1: ${res[0]} ${res[1]} ${res[2]}`)
        expectPartisipantEqual(res, parseEther("40"), 0, 0);
        // Fast forward to vesting start
        const vestingStarts = await user1WeeklyVesting.vestingStart();
        let latestTimeStamp = (await helpers.time.latest());
        //1 day to reach vestingStart and 7 days to reach weeklyClaimTick
        await helpers.time.increaseTo(latestTimeStamp + 60 * 60 * 24 * 7  + 60 * 60 * 24); 
        
        const user1Cyb = cyb.connect(user1);
        const expectedDiff = parseEther("10");
        const balanceBefore = await user1Cyb.balanceOf(user1.address);
        // await user1WeeklyVesting.claimTokens()
        await expect(user1WeeklyVesting.claimTokens())
        .to.emit(migrateVesting, "CybClaimed")
        .withArgs(user1.address, expectedDiff); // User1 claims 10 CYB tokens (1/4 of the purchased amount)
        const balanceAfter = await user1Cyb.balanceOf(user1.address);
        expect(balanceAfter.sub(balanceBefore).eq(expectedDiff), "cyb balance hasn`t been changed correctly").to.be.true;

        res = await migrateVesting.participants(user1.address);
        latestTimeStamp = await helpers.time.latest();
        console.log(`res 2: ${res[0]} ${res[1]} ${res[2]}`)
        expectPartisipantEqual(res, parseEther("40"), parseEther("10"), latestTimeStamp);
    });

    it("should allow owner to pause and unpause claiming for a user", async () => {
        await migrateVesting.pauseClaiming(user1.address);
        expect(await migrateVesting.pausedClaiming(user1.address)).to.be.true;
        await migrateVesting.unpauseClaiming(user1.address);
        expect(await migrateVesting.pausedClaiming(user1.address)).to.be.false;
    });

    it("should not allow user to claim tokens if claiming is paused", async () => {
        // User1 buys tokens
        const user1Usdc = usdc.connect(user1);
        await user1Usdc.approve(migrateVesting.address, parseEther("1000"));
        const user1WeeklyVesting = migrateVesting.connect(user1);
        await user1WeeklyVesting.buyTokens(parseEther("40")); // User1 buys 40 CYB tokens
        await helpers.time.increase(60 * 60 * 24);


        // Pause claiming for user1
        await migrateVesting.pauseClaiming(user1.address);

        // Fast forward 1 week
        await helpers.time.increase(60 * 60 * 24 * 7);

        await expect(user1WeeklyVesting.claimTokens()).to.be.revertedWith(
            "Claiming is paused for this user"
        );
    });

    it("should allow owner to set vesting start", async () => {
        const latestTimeStamp = await helpers.time.latest();
        const newVestingStart = latestTimeStamp + 60 * 60 * 24 * 2; // 2 days from now
        await migrateVesting.setVestingStart(newVestingStart);
        expect(await migrateVesting.vestingStart()).to.equal(newVestingStart);
    });
});


