const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract, deployProxyBlockInfo, deployVester, deployRewardDistributor, deployVault, deployVaultPriceFeed, deployCyberLPManager, deployTimelock, deployBonusDistributor, deployContractWithBlockInfo } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")
const { ethers, utils } = require("ethers");
const { priceFeedIds } = require("../shared/pyth")
use(solidity)

const { AddressZero } = ethers.constants

const getHashApprove = (values) => {
    return utils.solidityKeccak256(["string", "address", "address", "uint256", "uint256"], ["approve", ...values]);
}

const getHashApproveNFTs = (values) => {
    return utils.solidityKeccak256(["string", "address", "address", "uint256[]", "uint256"], ["approveNFTs", ...values]);
}

const getHashApproveAllNFT = (values) => {
    return utils.solidityKeccak256(["string", "address", "address", "bool", "uint256"], ["approveAllNFT", ...values]);
}

const getHashTransferNFTs = (values) => {
    return utils.solidityKeccak256(["string", "address", "address[]", "uint256[]", "uint256"], ["transferNFTs", ...values]);
}

const getHashTransfer = (values) => {
    return utils.solidityKeccak256(["string", "address", "address", "uint256", "uint256"], ["transfer", ...values]);
}

const getHashTransferFrom = (values) => {
    return utils.solidityKeccak256(["string", "address", "address", "address", "uint256", "uint256"], ["transferFrom", ...values]);
}

const getHashTransferETH = (values) => {
    return utils.solidityKeccak256(["string", "address", "uint256", "uint256"], ["transferETH", ...values]);
}

const getHashTransaction = (values) => {
    return utils.solidityKeccak256(["address", "uint256", "bytes", "uint256"], values);
}

const getHashSetMinAuthorizations = (values) => {
    return utils.solidityKeccak256(["string", "uint256", "uint256"], ["setMinAuthorizations", ...values]);
}

const getHashSetSigner = (values) => {
    return utils.solidityKeccak256(["string", "address", "bool", "uint256"], ["setSigner", ...values]);
}

describe("CybMultisig", function () {
    const provider = waffle.provider
    const [wallet, user0, user1, user2, user3, signer0, signer1, signer2, tokenManager] = provider.getWallets()

    let nft0
    let nft1

    let eth
    let ethPriceFeed

    let cyb

    let user0Data = user0.address.split("");
    user0Data.splice(0, 2);
    user0Data = user0Data.join("");
    let cybMultisig
    let data = "0xd6bf66c200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001";

    let pyth;

    beforeEach(async () => {
        pyth = await deployContract("Pyth", [])
        eth = await deployContract("Token", [])
        ethPriceFeed = await deployContract("PythPriceFeedV2", [pyth.address,priceFeedIds.eth,10000])
        cyb = await deployContract("CYB", []);
        nft0 = await deployContract("ERC721", ["NFT0", "NFT0"])
        nft1 = await deployContract("ERC721", ["NFT1", "NFT1"])

        cybMultisig = await deployContract("CybMultisig", [[signer0.address, signer1.address, signer2.address, wallet.address], 2]);
    })

    it("inits", async () => {
        expect(await cybMultisig.signers(0)).eq(signer0.address)
        expect(await cybMultisig.signers(1)).eq(signer1.address)
        expect(await cybMultisig.signers(2)).eq(signer2.address)
        expect(await cybMultisig.signers(3)).eq(wallet.address)
        expect(await cybMultisig.signersLength()).eq(4)

        expect(await cybMultisig.isSigner(user0.address)).eq(false)
        expect(await cybMultisig.isSigner(signer0.address)).eq(true)
        expect(await cybMultisig.isSigner(signer1.address)).eq(true)
        expect(await cybMultisig.isSigner(signer2.address)).eq(true)
        expect(await cybMultisig.isSigner(wallet.address)).eq(true)
    })

    it("signalApprove", async () => {
        await expect(cybMultisig.connect(user0).signalApprove(eth.address, user2.address, expandDecimals(5, 18)))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))
        await expect(tx)
            .to.emit(cybMultisig, "SignalApprove")
            .withArgs(eth.address, user2.address, expandDecimals(5, 18), getHashApprove([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("signApprove", async () => {
        await expect(cybMultisig.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(user0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashApprove([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);

        await expect(cybMultisig.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashApprove([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("approve", async () => {
        await eth.mint(cybMultisig.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(user0).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalApprove(eth.address, user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(wallet).approve(cyb.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approve(eth.address, user0.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approve(eth.address, user2.address, expandDecimals(6, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

        await expect(cybMultisig.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signApprove(eth.address, user2.address, expandDecimals(5, 18), 1)

        await expect(eth.connect(user2).transferFrom(cybMultisig.address, user1.address, expandDecimals(4, 18)))
            .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

        const tx = await cybMultisig.connect(wallet).approve(eth.address, user2.address, expandDecimals(5, 18), 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashApprove([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);

        await expect(eth.connect(user2).transferFrom(cybMultisig.address, user1.address, expandDecimals(6, 18)))
            .to.be.revertedWith("ERC20: transfer amount exceeds balance")

        expect(await eth.balanceOf(user1.address)).eq(0)
        await eth.connect(user2).transferFrom(cybMultisig.address, user1.address, expandDecimals(5, 18))
        expect(await eth.balanceOf(user1.address)).eq(expandDecimals(5, 18))
    })


    it("signalApproveNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await expect(cybMultisig.connect(user0).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1]))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

        await expect(tx)
            .to.emit(cybMultisig, "SignalApproveNFTs")
            .withArgs(nft0.address, user2.address, [nftId0, nftId1], getHashApproveNFTs([nft0.address, user2.address, [nftId0, nftId1], 1]), 1);
    })

    it("signApproveNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await expect(cybMultisig.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

        await expect(cybMultisig.connect(user0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await cybMultisig.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

        await expect(cybMultisig.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx = await cybMultisig.connect(signer1).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashApproveNFTs([nft0.address, user2.address, [nftId0, nftId1], 1]), 1);
    })

    it("approveNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await nft0.mint(cybMultisig.address, nftId0)
        await nft0.mint(cybMultisig.address, nftId1)

        await expect(cybMultisig.connect(user0).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalApproveNFTs(nft0.address, user2.address, [nftId0, nftId1])

        await expect(cybMultisig.connect(wallet).approveNFTs(nft1.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveNFTs(nft0.address, user0.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1 + 1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

        await expect(cybMultisig.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signApproveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

        await expect(nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId0))
            .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

        const tx = await cybMultisig.connect(wallet).approveNFTs(nft0.address, user2.address, [nftId0, nftId1], 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashApproveNFTs([nft0.address, user2.address, [nftId0, nftId1], 1]), 1);

        expect(await nft0.balanceOf(user1.address)).eq(0)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(2)
        expect(await nft0.ownerOf(nftId0)).eq(cybMultisig.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)

        await nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId0)

        expect(await nft0.balanceOf(user1.address)).eq(1)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(1)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)

        await nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId1)

        expect(await nft0.balanceOf(user1.address)).eq(2)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(0)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(user1.address)
    })

    it("signalApproveAllNFT", async () => {

        await expect(cybMultisig.connect(user0).signalApproveAllNFT(nft0.address, user2.address, true))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalApproveAllNFT(nft0.address, user2.address, true)

        await expect(tx)
            .to.emit(cybMultisig, "SignalApproveAllNFT")
            .withArgs(nft0.address, user2.address, true, getHashApproveAllNFT([nft0.address, user2.address, true, 1]), 1);
    })

    it("signApproveAllNFT", async () => {

        await expect(cybMultisig.connect(user0).signApproveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signApproveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalApproveAllNFT(nft0.address, user2.address, true)

        await expect(cybMultisig.connect(user0).signApproveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await cybMultisig.connect(signer2).signApproveAllNFT(nft0.address, user2.address, true, 1)

        await expect(cybMultisig.connect(signer2).signApproveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx = await cybMultisig.connect(signer1).signApproveAllNFT(nft0.address, user2.address, true, 1)

        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashApproveAllNFT([nft0.address, user2.address, true, 1]), 1);
    })

    it("approveAllNFT", async () => {
        const nftId0 = 21
        const nftId1 = 22
        const nftId2 = 23

        await nft0.mint(cybMultisig.address, nftId0)
        await nft0.mint(cybMultisig.address, nftId1)
        await nft0.mint(cybMultisig.address, nftId2)

        await expect(cybMultisig.connect(user0).approveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalApproveAllNFT(nft0.address, user2.address, true)

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft1.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft0.address, user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft0.address, user2.address, false, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signApproveAllNFT(nft0.address, user2.address, true, 1)

        await expect(cybMultisig.connect(wallet).approveAllNFT(nft0.address, user2.address, true, 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signApproveAllNFT(nft0.address, user2.address, true, 1)

        await expect(nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId0))
            .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

        const tx = await cybMultisig.connect(wallet).approveAllNFT(nft0.address, user2.address, true, 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashApproveAllNFT([nft0.address, user2.address, true, 1]), 1);

        expect(await nft0.balanceOf(user1.address)).eq(0)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(3)
        expect(await nft0.ownerOf(nftId0)).eq(cybMultisig.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)
        expect(await nft0.ownerOf(nftId2)).eq(cybMultisig.address)

        await nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId0)

        expect(await nft0.balanceOf(user1.address)).eq(1)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(2)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)

        await nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId1)

        expect(await nft0.balanceOf(user1.address)).eq(2)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(1)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(user1.address)


        await cybMultisig.connect(wallet).signalApproveAllNFT(nft0.address, user2.address, false)
        await cybMultisig.connect(signer0).signApproveAllNFT(nft0.address, user2.address, false, 2)
        await cybMultisig.connect(signer1).signApproveAllNFT(nft0.address, user2.address, false, 2)
        await cybMultisig.connect(signer2).approveAllNFT(nft0.address, user2.address, false, 2)

        await expect(nft0.connect(user2).transferFrom(cybMultisig.address, user1.address, nftId0)).to.be.revertedWith("ERC721: transfer caller is not owner nor approved")
    })

    it("receiveNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await nft0.mint(user1.address, nftId0)
        await nft0.mint(user1.address, nftId1)

        await expect(cybMultisig.receiveNFTs(nft0.address, user1.address, [nftId0, nftId1]))
            .to.be.revertedWith("ERC721: transfer caller is not owner nor approved")

        await nft0.connect(user1).approve(cybMultisig.address, nftId0);
        await nft0.connect(user1).approve(cybMultisig.address, nftId1);

        expect(await nft0.balanceOf(user1.address)).eq(2)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(0)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(user1.address)

        await cybMultisig.receiveNFTs(nft0.address, user1.address, [nftId0, nftId1])

        expect(await nft0.balanceOf(user1.address)).eq(0)
        expect(await nft0.balanceOf(cybMultisig.address)).eq(2)
        expect(await nft0.ownerOf(nftId0)).eq(cybMultisig.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)
    })

    it("signalTransferNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await expect(cybMultisig.connect(user0).signalTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1]))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).signalTransferNFTs(nft0.address, [user1.address, user2.address, user3.address], [nftId0, nftId1]))
            .to.be.revertedWith("CybMultisig: lengths invalid")

        const tx = await cybMultisig.connect(wallet).signalTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1])
        await expect(tx)
            .to.emit(cybMultisig, "SignalTransferNFTs")
            .withArgs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], getHashTransferNFTs([nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1]), 1);
    })

    it("signTransferNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await expect(cybMultisig.connect(user0).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1])

        await expect(cybMultisig.connect(user0).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferNFTs([nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1]), 1);

        await expect(cybMultisig.connect(signer2).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferNFTs([nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1]), 1);
    })

    it("transferNFTs", async () => {
        const nftId0 = 21
        const nftId1 = 22

        await nft0.mint(cybMultisig.address, nftId0)
        await nft0.mint(cybMultisig.address, nftId1)

        expect(await nft0.balanceOf(cybMultisig.address)).eq(2)
        expect(await nft0.balanceOf(user1.address)).eq(0)
        expect(await nft0.balanceOf(user2.address)).eq(0)
        expect(await nft0.ownerOf(nftId0)).eq(cybMultisig.address)
        expect(await nft0.ownerOf(nftId1)).eq(cybMultisig.address)

        await eth.mint(cybMultisig.address, expandDecimals(5, 18))
        expect(await eth.balanceOf(cybMultisig.address)).eq(expandDecimals(5, 18))
        await expect(cybMultisig.connect(user0).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1])

        await expect(cybMultisig.connect(wallet).transferNFTs(nft1.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user3.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, 23], 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1)

        await expect(cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signTransferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1)

        const tx = await cybMultisig.connect(wallet).transferNFTs(nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashTransferNFTs([nft0.address, [user1.address, user2.address], [nftId0, nftId1], 1]), 1);

        expect(await nft0.balanceOf(cybMultisig.address)).eq(0)
        expect(await nft0.balanceOf(user1.address)).eq(1)
        expect(await nft0.balanceOf(user2.address)).eq(1)
        expect(await nft0.ownerOf(nftId0)).eq(user1.address)
        expect(await nft0.ownerOf(nftId1)).eq(user2.address)
    })

    it("signalTransfer", async () => {
        await expect(cybMultisig.connect(user0).signalTransfer(eth.address, user2.address, expandDecimals(5, 18)))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalTransfer(eth.address, user2.address, expandDecimals(5, 18))
        await expect(tx)
            .to.emit(cybMultisig, "SignalTransfer")
            .withArgs(eth.address, user2.address, expandDecimals(5, 18), getHashTransfer([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("signTransfer", async () => {
        await expect(cybMultisig.connect(user0).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalTransfer(eth.address, user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(user0).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransfer([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);

        await expect(cybMultisig.connect(signer2).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransfer([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("transfer", async () => {
        await eth.mint(cybMultisig.address, expandDecimals(5, 18))
        expect(await eth.balanceOf(cybMultisig.address)).eq(expandDecimals(5, 18))
        await expect(cybMultisig.connect(user0).transfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).transfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalTransfer(eth.address, user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(wallet).transfer(cyb.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transfer(eth.address, user0.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transfer(eth.address, user2.address, expandDecimals(6, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1)

        await expect(cybMultisig.connect(wallet).transfer(eth.address, user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signTransfer(eth.address, user2.address, expandDecimals(5, 18), 1)

        const tx = await cybMultisig.connect(wallet).transfer(eth.address, user2.address, expandDecimals(5, 18), 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashTransfer([eth.address, user2.address, expandDecimals(5, 18), 1]), 1);

        expect(await eth.balanceOf(cybMultisig.address)).eq(0)
        expect(await eth.balanceOf(user2.address)).eq(expandDecimals(5, 18))
    })


    it("signalTransferFrom", async () => {
        await expect(cybMultisig.connect(user0).signalTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18)))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18))
        await expect(tx)
            .to.emit(cybMultisig, "SignalTransferFrom")
            .withArgs(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), getHashTransferFrom([eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1]), 1);
    })

    it("signTransferFrom", async () => {
        await expect(cybMultisig.connect(user0).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(user0).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferFrom([eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1]), 1);

        await expect(cybMultisig.connect(signer2).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferFrom([eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1]), 1);
    })

    it("transferFrom", async () => {
        await eth.mint(user1.address, expandDecimals(5, 18))
        expect(await eth.balanceOf(cybMultisig.address)).eq(0)
        expect(await eth.balanceOf(user1.address)).eq(expandDecimals(5, 18))
        await expect(cybMultisig.connect(user0).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(wallet).transferFrom(cyb.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user0.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(6, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1)

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signTransferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1)

        await expect(cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("ERC20: transfer amount exceeds allowance")

        await eth.connect(user1).approve(cybMultisig.address, expandDecimals(5, 18));

        const tx = await cybMultisig.connect(wallet).transferFrom(eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashTransferFrom([eth.address, user1.address, cybMultisig.address, expandDecimals(5, 18), 1]), 1);

        expect(await eth.balanceOf(cybMultisig.address)).eq(expandDecimals(5, 18))
        expect(await eth.balanceOf(user1.address)).eq(0)
    })


    it("signalTransferETH", async () => {
        await expect(cybMultisig.connect(user0).signalTransferETH(user2.address, expandDecimals(5, 18)))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalTransferETH(user2.address, expandDecimals(5, 18))
        await expect(tx)
            .to.emit(cybMultisig, "SignalTransferETH")
            .withArgs(user2.address, expandDecimals(5, 18), getHashTransferETH([user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("signTransferETH", async () => {
        await expect(cybMultisig.connect(user0).signTransferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signTransferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalTransferETH(user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(user0).signTransferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signTransferETH(user2.address, expandDecimals(5, 18), 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferETH([user2.address, expandDecimals(5, 18), 1]), 1);

        await expect(cybMultisig.connect(signer2).signTransferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signTransferETH(user2.address, expandDecimals(5, 18), 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransferETH([user2.address, expandDecimals(5, 18), 1]), 1);
    })

    it("transferETH", async () => {

        await wallet.sendTransaction({
            to: cybMultisig.address,
            value: expandDecimals(5, 18)
        });

        const b = await provider.getBalance(user2.address);
        const bC = await provider.getBalance(cybMultisig.address);
        expect(bC).to.eq(expandDecimals(5, 18));

        await expect(cybMultisig.connect(user0).transferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).transferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalTransferETH(user2.address, expandDecimals(5, 18))

        await expect(cybMultisig.connect(wallet).transferETH(user3.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferETH(user0.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferETH(user2.address, expandDecimals(6, 18), 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).transferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signTransferETH(user2.address, expandDecimals(5, 18), 1)

        await expect(cybMultisig.connect(wallet).transferETH(user2.address, expandDecimals(5, 18), 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signTransferETH(user2.address, expandDecimals(5, 18), 1)

        const tx = await cybMultisig.connect(wallet).transferETH(user2.address, expandDecimals(5, 18), 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashTransferETH([user2.address, expandDecimals(5, 18), 1]), 1);

        const b1 = await provider.getBalance(cybMultisig.address);
        const b2 = await provider.getBalance(user2.address);
        expect(b1).to.eq(0);
        expect(b2).to.eq(b.add(expandDecimals(5, 18)));
    })

    it("signalTransaction", async () => {
        await expect(cybMultisig.connect(user0).signalTransaction(tokenManager.address, expandDecimals(1, 18), data))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(wallet).signalTransaction(tokenManager.address, expandDecimals(1, 18), data)
        await expect(tx)
            .to.emit(cybMultisig, "SignalTransaction")
            .withArgs(tokenManager.address, expandDecimals(1, 18), data, getHashTransaction([tokenManager.address, expandDecimals(1, 18), data, 1]), 1);
    })

    it("signTransaction", async () => {
        await expect(cybMultisig.connect(user0).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalTransaction(tokenManager.address, expandDecimals(1, 18), data)

        await expect(cybMultisig.connect(user0).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransaction([tokenManager.address, expandDecimals(1, 18), data, 1]), 1);

        await expect(cybMultisig.connect(signer2).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signTransaction(tokenManager.address, expandDecimals(1, 18), data, 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashTransaction([tokenManager.address, expandDecimals(1, 18), data, 1]), 1);
    })

    it("signalSetMinAuthorizations", async () => {
        await expect(cybMultisig.connect(user0).signalSetMinAuthorizations(3))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).signalSetMinAuthorizations(0))
            .to.be.revertedWith("CybMultisig: invalid _minAuthorizations")

        await expect(cybMultisig.connect(wallet).signalSetMinAuthorizations(5))
            .to.be.revertedWith("CybMultisig: invalid _minAuthorizations")

        const tx = await cybMultisig.connect(wallet).signalSetMinAuthorizations(3)
        await expect(tx)
            .to.emit(cybMultisig, "SignalSetMinAuthorizations")
            .withArgs(3, getHashSetMinAuthorizations([3, 1]), 1);
    })

    it("signSetMinAuthorizations", async () => {
        await expect(cybMultisig.connect(user0).signSetMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signSetMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalSetMinAuthorizations(3)

        await expect(cybMultisig.connect(user0).signSetMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signSetMinAuthorizations(3, 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashSetMinAuthorizations([3, 1]), 1);

        await expect(cybMultisig.connect(signer2).signSetMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signSetMinAuthorizations(3, 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashSetMinAuthorizations([3, 1]), 1);
    })

    it("setMinAuthorizations", async () => {
        expect(await cybMultisig.minAuthorizations()).to.eq(2);
        await expect(cybMultisig.connect(user0).setMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).setMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalSetMinAuthorizations(3)

        await expect(cybMultisig.connect(wallet).setMinAuthorizations(4, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).setMinAuthorizations(3, 2))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).setMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signSetMinAuthorizations(3, 1)

        await expect(cybMultisig.connect(wallet).setMinAuthorizations(3, 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signSetMinAuthorizations(3, 1)

        const tx = await cybMultisig.connect(wallet).setMinAuthorizations(3, 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashSetMinAuthorizations([3, 1]), 1);

        expect(await cybMultisig.minAuthorizations()).to.eq(3);

        await cybMultisig.connect(wallet).signalSetMinAuthorizations(2)
        await cybMultisig.connect(signer0).signSetMinAuthorizations(2, 2)
        await cybMultisig.connect(signer1).signSetMinAuthorizations(2, 2)
        await expect(cybMultisig.connect(wallet).setMinAuthorizations(2, 2))
            .to.be.revertedWith("CybMultisig: insufficient authorization")
        await cybMultisig.connect(signer2).signSetMinAuthorizations(2, 2)
        await cybMultisig.connect(wallet).setMinAuthorizations(2, 2)
        expect(await cybMultisig.minAuthorizations()).to.eq(2);
    })

    it("signalSetSigner", async () => {
        await expect(cybMultisig.connect(user0).signalSetSigner(user0.address, true))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).signalSetSigner(user0.address, false))
            .to.be.revertedWith("CybMultisig: invalid _isSigner")

        await expect(cybMultisig.connect(wallet).signalSetSigner(signer0.address, true))
            .to.be.revertedWith("CybMultisig: invalid _isSigner")

        const tx = await cybMultisig.connect(wallet).signalSetSigner(user0.address, true)
        await expect(tx)
            .to.emit(cybMultisig, "SignalSetSigner")
            .withArgs(user0.address, true, getHashSetSigner([user0.address, true, 1]), 1);
    })

    it("signSetSigner", async () => {
        await expect(cybMultisig.connect(user0).signSetSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(signer2).signSetSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(signer0).signalSetSigner(user0.address, true)

        await expect(cybMultisig.connect(user0).signSetSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        const tx = await cybMultisig.connect(signer2).signSetSigner(user0.address, true, 1)
        await expect(tx)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashSetSigner([user0.address, true, 1]), 1);

        await expect(cybMultisig.connect(signer2).signSetSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: already signed")

        const tx2 = await cybMultisig.connect(signer1).signSetSigner(user0.address, true, 1)
        await expect(tx2)
            .to.emit(cybMultisig, "SignAction")
            .withArgs(getHashSetSigner([user0.address, true, 1]), 1);
    })

    it("setSigner", async () => {

        await expect(cybMultisig.connect(user0).setSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: forbidden")

        await expect(cybMultisig.connect(wallet).setSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await cybMultisig.connect(wallet).signalSetSigner(user0.address, true)

        await expect(cybMultisig.connect(wallet).setSigner(user1.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).setSigner(user0.address, true, 2))
            .to.be.revertedWith("CybMultisig: action not signalled")

        await expect(cybMultisig.connect(wallet).setSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: action not authorized")

        await cybMultisig.connect(signer0).signSetSigner(user0.address, true, 1)

        await expect(cybMultisig.connect(wallet).setSigner(user0.address, true, 1))
            .to.be.revertedWith("CybMultisig: insufficient authorization")

        await cybMultisig.connect(signer2).signSetSigner(user0.address, true, 1)

        const tx = await cybMultisig.connect(wallet).setSigner(user0.address, true, 1)

        await expect(tx)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashSetSigner([user0.address, true, 1]), 1);

        expect(await cybMultisig.signersLength()).to.eq(5);
        expect(await cybMultisig.isSigner(user0.address)).to.eq(true);


        await cybMultisig.connect(wallet).signalSetSigner(signer1.address, false)
        await cybMultisig.connect(user0).signSetSigner(signer1.address, false, 2)
        await cybMultisig.connect(signer0).signSetSigner(signer1.address, false, 2)

        const tx2 = await cybMultisig.connect(wallet).setSigner(signer1.address, false, 2)

        await expect(tx2)
            .to.emit(cybMultisig, "ClearAction")
            .withArgs(getHashSetSigner([signer1.address, false, 2]), 2);

        expect(await cybMultisig.signersLength()).to.eq(4);
        expect(await cybMultisig.isSigner(signer1.address)).to.eq(false);
    })

})
