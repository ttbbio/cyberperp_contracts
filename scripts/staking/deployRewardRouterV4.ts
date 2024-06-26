import * as hre from 'hardhat';


import { getProvider } from '../shared/network';
import { deployContract, getJsonField, sendTxn } from '../shared/deploy';
import { BonusDistributor__factory, EsCYB__factory, MintableBaseToken__factory, RewardDistributor__factory, RewardRouterV4__factory, RewardTracker__factory, Vester__factory, CYB__factory, CyberLP__factory, CyberLPManager__factory } from '../../typechain';
import { getNetworkConfig } from '../shared/cyberperpConfig';

const VESTING_DURATION = 365 * 24 * 60 * 60

export default async function main() {
  const provider = getProvider();
  // const [wallet, user0, user1, user2, user3] = getRichWallets(provider);
  const deployerWallet = hre.ethers.provider.getSigner(0);
  
  const config = getNetworkConfig();

  const cyberLPAddress = await getJsonField("cyberLP") as string
  const cyberLP = CyberLP__factory.connect(cyberLPAddress, deployerWallet);

  const degenLPAddress = await getJsonField("degenLP") as string
  const degenLP = DegenLP__factory.connect(degenLPAddress, deployerWallet);

  const cyberLPManagerAddress = await getJsonField("cyberLPManager") as string
  
  const cyberLPManager = CyberLPManager__factory.connect(cyberLPManagerAddress, deployerWallet);

  const degenLPManagerAddress = await getJsonField("cyberLPManager") as string
  
  const degenLPManager = CyberLPManager__factory.connect(degenLPManagerAddress, deployerWallet);
  
  const blockInfo = await getJsonField("blockInfoProxy") as string

  const cyb = await deployContract( "CYB", [], "cyb");
  const esCyb = await deployContract( "EsCYB", [], "esCyb");
  const bnCyb = await deployContract( "MintableBaseToken", ["Bonus CYB", "bnCYB", 0], "bnCyb");
  const cybAddress = await getJsonField("cyb") as string;
  const esCybAddress = await getJsonField("esCyb") as string;
  const bnCybAddress = await getJsonField("bnCyb") as string;
  // const cyb = CYB__factory.connect(cybAddress, deployerWallet);
  // const esCyb = EsCYB__factory.connect(esCybAddress, deployerWallet);
  // const bnCyb = MintableBaseToken__factory.connect(bnCybAddress, deployerWallet);

  await sendTxn(esCyb.setInPrivateTransferMode(true), "esCyb.setInPrivateTransferMode")
  await sendTxn(cyberLP.setInPrivateTransferMode(true), "cyberLP.setInPrivateTransferMode")

  const stakedCybTracker = await deployContract( "RewardTracker", ["Staked CYB", "sCYB"], "stakedCybTracker")
  const stakedCybDistributor = await deployContract( "RewardDistributor", [esCyb.address, stakedCybTracker.address, blockInfo], "stakedCybDistributor")
  await sendTxn(stakedCybTracker.initialize([cyb.address, esCyb.address], stakedCybDistributor.address), "stakedCybTracker.initialize")
  await sendTxn(stakedCybDistributor.updateLastDistributionTime(), "stakedCybDistributor.updateLastDistributionTime")

  const bonusCybTracker = await deployContract( "RewardTracker", ["Staked + Bonus CYB", "sbCYB"], "bonusCybTracker")
  const bonusCybDistributor = await deployContract( "BonusDistributor", [bnCyb.address, bonusCybTracker.address, blockInfo], "bonusCybDistributor")
  await sendTxn(bonusCybTracker.initialize([stakedCybTracker.address], bonusCybDistributor.address), "bonusCybTracker.initialize")
  await sendTxn(bonusCybDistributor.updateLastDistributionTime(), "bonusCybDistributor.updateLastDistributionTime")

  const feeCybTracker = await deployContract( "RewardTracker", ["Staked + Bonus + Fee CYB", "sbfCYB"], "feeCybTracker")
  const feeCybDistributor = await deployContract( "RewardDistributor", [config.weth, feeCybTracker.address, blockInfo], "feeCybDistributor")
  await sendTxn(feeCybTracker.initialize([bonusCybTracker.address, bnCyb.address], feeCybDistributor.address), "feeCybTracker.initialize")
  await sendTxn(feeCybDistributor.updateLastDistributionTime(), "feeCybDistributor.updateLastDistributionTime")

  const feeCyberLPTracker = await deployContract( "RewardTracker", ["Fee CyberLP", "fCyberLP"], "feeCyberLPTracker")
  const feeCyberLPDistributor = await deployContract( "RewardDistributor", [config.weth, feeCyberLPTracker.address, blockInfo], "feeCyberLPDistributor")
  await sendTxn(feeCyberLPTracker.initialize([cyberLP.address], feeCyberLPDistributor.address), "feeCyberLPTracker.initialize")
  await sendTxn(feeCyberLPDistributor.updateLastDistributionTime(), "feeCyberLPDistributor.updateLastDistributionTime")

  const stakedCyberLPTracker = await deployContract( "RewardTracker", ["Fee + Staked CyberLP", "fsCyberLP"], "stakedCyberLPTracker")
  const stakedCyberLPDistributor = await deployContract( "RewardDistributor", [esCyb.address, stakedCyberLPTracker.address, blockInfo], "stakedCyberLPDistributor")
  await sendTxn(stakedCyberLPTracker.initialize([feeCyberLPTracker.address], stakedCyberLPDistributor.address), "stakedCyberLPTracker.initialize")
  await sendTxn(stakedCyberLPDistributor.updateLastDistributionTime(), "stakedCyberLPDistributor.updateLastDistributionTime")







  // const rewardRouterAddress = await getJsonFieldV2("rewardRouter") as string;
  // const rewardRouter = RewardRouterV4__factory.connect(rewardRouterAddress, deployerWallet);

  // const stakedCybTrackerAddress = await getJsonField("stakedCybTracker") as string;
  // const stakedCybTracker = RewardTracker__factory.connect(stakedCybTrackerAddress, deployerWallet);

  // const feeCybTrackerAddress = await getJsonField("feeCybTracker") as string;
  // const feeCybTracker = RewardTracker__factory.connect(feeCybTrackerAddress, deployerWallet);

  // const feeCyberLPTrackerAddress = await getJsonField("feeCyberLPTracker") as string;
  // const feeCyberLPTracker = RewardTracker__factory.connect(feeCyberLPTrackerAddress, deployerWallet);

  // const stakedCyberLPTrackerAddress = await getJsonField("stakedCyberLPTracker") as string;
  // const stakedCyberLPTracker = RewardTracker__factory.connect(stakedCyberLPTrackerAddress, deployerWallet);

  // const bonusCybTrackerAddress = await getJsonField("bonusCybTracker") as string;
  // const bonusCybTracker = RewardTracker__factory.connect(bonusCybTrackerAddress, deployerWallet);

  // const bonusCybDistributorAddress = await getJsonField("bonusCybDistributor") as string;
  // const bonusCybDistributor = BonusDistributor__factory.connect(bonusCybDistributorAddress, deployerWallet);

  // const stakedCybDistributorAddress = await getJsonField("stakedCybDistributor") as string;
  // const stakedCybDistributor = RewardDistributor__factory.connect(stakedCybDistributorAddress, deployerWallet);

  // const stakedCyberLPDistributorAddress = await getJsonField("stakedCyberLPDistributor") as string;
  // const stakedCyberLPDistributor = RewardDistributor__factory.connect(stakedCyberLPDistributorAddress, deployerWallet);

  // const cybVesterAddress = await getJsonField("cybVester") as string;
  // const cybVester = Vester__factory.connect(cybVesterAddress, deployerWallet);

  // const cyberLPVesterAddress = await getJsonField("cyberLPVester") as string;
  // const cyberLPVester = Vester__factory.connect(cyberLPVesterAddress, deployerWallet);












  const feeDegenLPTracker = await deployContract( "RewardTracker", ["Fee degenLP", "fDegenLP"], "feeDegenLPTracker")
  const feeDegenLPDistributor = await deployContract( "RewardDistributor", [config.weth, feeDegenLPTracker.address, blockInfo], "feeDegenLPDistributor")
  await sendTxn(feeDegenLPTracker.initialize([degenLP.address], feeDegenLPDistributor.address), "feeDegenLPTracker.initialize")
  await sendTxn(feeDegenLPDistributor.updateLastDistributionTime(), "feeDegenLPDistributor.updateLastDistributionTime")

  const stakedDegenLPTracker = await deployContract( "RewardTracker", ["Fee + Staked degenLP", "fsDegenLP"], "stakedDegenLPTracker")
  const stakedDegenLPDistributor = await deployContract( "RewardDistributor", [esCyb.address, stakedDegenLPTracker.address, blockInfo], "stakedDegenLPDistributor")
  await sendTxn(stakedDegenLPTracker.initialize([feeDegenLPTracker.address], stakedDegenLPDistributor.address), "stakedDegenLPTracker.initialize")
  await sendTxn(stakedDegenLPDistributor.updateLastDistributionTime(), "stakedDegenLPDistributor.updateLastDistributionTime")



  // const feeDegenLPTrackerAddress = await getJsonField("feeDegenLPTracker") as string;
  // const feeDegenLPTracker = RewardTracker__factory.connect(feeDegenLPTrackerAddress, deployerWallet);

  // const feeDegenLPDistributorAddress = await getJsonField("feeDegenLPDistributor") as string;
  // const feeDegenLPDistributor = RewardDistributor__factory.connect(feeDegenLPDistributorAddress, deployerWallet);

  // const stakedDegenLPTrackerAddress = await getJsonField("stakedDegenLPTracker") as string;
  // const stakedDegenLPTracker = RewardTracker__factory.connect(stakedDegenLPTrackerAddress, deployerWallet);

  // const stakedDegenLPDistributorAddress = await getJsonField("stakedDegenLPDistributor") as string;
  // const stakedDegenLPDistributor = RewardDistributor__factory.connect(stakedDegenLPDistributorAddress, deployerWallet);

  // const degenLPVesterAddress = await getJsonField("degenLPVester") as string;
  // const degenLPVester = RewardTracker__factory.connect(degenLPVesterAddress, deployerWallet);


  await sendTxn(stakedCybTracker.setInPrivateTransferMode(true), "stakedCybTracker.setInPrivateTransferMode")
  await sendTxn(stakedCybTracker.setInPrivateStakingMode(true), "stakedCybTracker.setInPrivateStakingMode")
  await sendTxn(bonusCybTracker.setInPrivateTransferMode(true), "bonusCybTracker.setInPrivateTransferMode")
  await sendTxn(bonusCybTracker.setInPrivateStakingMode(true), "bonusCybTracker.setInPrivateStakingMode")
  await sendTxn(bonusCybTracker.setInPrivateClaimingMode(true), "bonusCybTracker.setInPrivateClaimingMode")
  await sendTxn(feeCybTracker.setInPrivateTransferMode(true), "feeCybTracker.setInPrivateTransferMode")
  await sendTxn(feeCybTracker.setInPrivateStakingMode(true), "feeCybTracker.setInPrivateStakingMode")

  await sendTxn(feeCyberLPTracker.setInPrivateTransferMode(true), "feeCyberLPTracker.setInPrivateTransferMode")
  await sendTxn(feeCyberLPTracker.setInPrivateStakingMode(true), "feeCyberLPTracker.setInPrivateStakingMode")
  await sendTxn(stakedCyberLPTracker.setInPrivateTransferMode(true), "stakedCyberLPTracker.setInPrivateTransferMode")
  await sendTxn(stakedCyberLPTracker.setInPrivateStakingMode(true), "stakedCyberLPTracker.setInPrivateStakingMode")

     await sendTxn(feeDegenLPTracker.setInPrivateTransferMode(true), "feeCyberLPTracker.setInPrivateTransferMode")
     await sendTxn(feeDegenLPTracker.setInPrivateStakingMode(true), "feeCyberLPTracker.setInPrivateStakingMode")
     await sendTxn(stakedDegenLPTracker.setInPrivateTransferMode(true), "stakedCyberLPTracker.setInPrivateTransferMode")
     await sendTxn(stakedDegenLPTracker.setInPrivateStakingMode(true), "stakedCyberLPTracker.setInPrivateStakingMode")

  const cybVester = await deployContract( "Vester", [
    "Vested CYB", // _name
    "vCYB", // _symbol
    VESTING_DURATION, // _vestingDuration
    esCyb.address, // _esToken
    feeCybTracker.address, // _pairToken
    cyb.address, // _claimableToken
    stakedCybTracker.address, // _rewardTracker
    blockInfo //_blockInfo
  ], "cybVester")

  const cyberLPVester = await deployContract( "Vester", [
    "Vested CyberLP", // _name
    "vCyberLP", // _symbol
    VESTING_DURATION, // _vestingDuration
    esCyb.address, // _esToken
    stakedCyberLPTracker.address, // _pairToken
    cyb.address, // _claimableToken
    stakedCyberLPTracker.address, // _rewardTracker
    blockInfo
  ], "cyberLPVester")

  const degenLPVester = await deployContract( "Vester", [
    "Vested degenLP", // _name
    "vDegenLP", // _symbol
    VESTING_DURATION, // _vestingDuration
    esCyb.address, // _esToken
    stakedDegenLPTracker.address, // _pairToken
    cyb.address, // _claimableToken
    stakedDegenLPTracker.address, // _rewardTracker
    blockInfo
  ], "degenLPVester")

  const rewardRouter = await deployContract( "RewardRouterV4", [], "rewardRouter")
  await sendTxn(rewardRouter.initialize(
    config.weth,
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
    config.pyth
  ), "rewardRouter.initialize")


// console.log(rewardRouter.address)
  await sendTxn(cyberLPManager.setHandler(rewardRouter.address, true), "cyberLPManager.setHandler(rewardRouter)")
  await sendTxn(degenLPManager.setHandler(rewardRouter.address, true), "cyberLPManager.setHandler(rewardRouter)")

  // // allow rewardRouter to stake in stakedCybTracker
  await sendTxn(stakedCybTracker.setHandler(rewardRouter.address, true), "stakedCybTracker.setHandler(rewardRouter)")
  // // allow bonusCybTracker to stake stakedCybTracker
  await sendTxn(stakedCybTracker.setHandler(bonusCybTracker.address, true), "stakedCybTracker.setHandler(bonusCybTracker)")
  // // allow rewardRouter to stake in bonusCybTracker
  await sendTxn(bonusCybTracker.setHandler(rewardRouter.address, true), "bonusCybTracker.setHandler(rewardRouter)")
  // // allow bonusCybTracker to stake feeCybTracker
  await sendTxn(bonusCybTracker.setHandler(feeCybTracker.address, true), "bonusCybTracker.setHandler(feeCybTracker)")
  await sendTxn(bonusCybDistributor.setBonusMultiplier(10000), "bonusCybDistributor.setBonusMultiplier")
  // allow rewardRouter to stake in feeCybTracker
  await sendTxn(feeCybTracker.setHandler(rewardRouter.address, true), "feeCybTracker.setHandler(rewardRouter)")
  // allow stakedCybTracker to stake esCyb
  await sendTxn(esCyb.setHandler(stakedCybTracker.address, true), "esCyb.setHandler(stakedCybTracker)")
  // allow feeCybTracker to stake bnCyb
  await sendTxn(bnCyb.setHandler(feeCybTracker.address, true), "bnCyb.setHandler(feeCybTracker")
  // allow rewardRouter to burn bnCyb
  await sendTxn(bnCyb.setMinter(rewardRouter.address, true), "bnCyb.setMinter(rewardRouter")

  // allow stakedCyberLPTracker to stake feeCyberLPTracker
  await sendTxn(feeCyberLPTracker.setHandler(stakedCyberLPTracker.address, true), "feeCyberLPTracker.setHandler(stakedCyberLPTracker)")
  // allow feeCyberLPTracker to stake cyberLP
  await sendTxn(cyberLP.setHandler(feeCyberLPTracker.address, true), "cyberLP.setHandler(feeCyberLPTracker)")

  // allow stakedDegenLPTracker to stake feeDegenLPTracker
  await sendTxn(feeDegenLPTracker.setHandler(stakedDegenLPTracker.address, true), "feeDegenLPTracker.setHandler(stakedDegenLPTracker)")
  // allow feeDegenLPTracker to stake degenLP
  await sendTxn(degenLP.setHandler(feeDegenLPTracker.address, true), "degenLP.setHandler(feeDegenLPTracker)")

  // allow rewardRouter to stake in feeCyberLPTracker
  await sendTxn(feeCyberLPTracker.setHandler(rewardRouter.address, true), "feeCyberLPTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedCyberLPTracker
  await sendTxn(stakedCyberLPTracker.setHandler(rewardRouter.address, true), "stakedCyberLPTracker.setHandler(rewardRouter)")

  // allow rewardRouter to stake in feeDegenLPTracker
  await sendTxn(feeDegenLPTracker.setHandler(rewardRouter.address, true), "feeDegenLPTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedDegenLPTracker
  await sendTxn(stakedDegenLPTracker.setHandler(rewardRouter.address, true), "stakedDegenLPTracker.setHandler(rewardRouter)")

  await sendTxn(esCyb.setHandler(rewardRouter.address, true), "esCyb.setHandler(rewardRouter)")
  await sendTxn(esCyb.setHandler(stakedCybDistributor.address, true), "esCyb.setHandler(stakedCybDistributor)")
  await sendTxn(esCyb.setHandler(stakedCyberLPDistributor.address, true), "esCyb.setHandler(stakedCyberLPDistributor)")
  await sendTxn(esCyb.setHandler(stakedCyberLPTracker.address, true), "esCyb.setHandler(stakedCyberLPTracker)")
  await sendTxn(esCyb.setHandler(stakedDegenLPDistributor.address, true), "esCyb.setHandler(stakedDegenLPDistributor)")
  await sendTxn(esCyb.setHandler(stakedDegenLPTracker.address, true), "esCyb.setHandler(stakedDegenLPTracker)")
  await sendTxn(esCyb.setHandler(cybVester.address, true), "esCyb.setHandler(cybVester)")
  await sendTxn(esCyb.setHandler(cyberLPVester.address, true), "esCyb.setHandler(cyberLPVester)")
  await sendTxn(esCyb.setHandler(degenLPVester.address, true), "esCyb.setHandler(degenLPVester)")

  await sendTxn(esCyb.setMinter(cybVester.address, true), "esCyb.setMinter(cybVester)")
  await sendTxn(esCyb.setMinter(cyberLPVester.address, true), "esCyb.setMinter(cyberLPVester)")
  await sendTxn(esCyb.setMinter(degenLPVester.address, true), "esCyb.setMinter(degenLPVester)")

  await sendTxn(cybVester.setHandler(rewardRouter.address, true), "cybVester.setHandler(rewardRouter)")
  await sendTxn(cyberLPVester.setHandler(rewardRouter.address, true), "cyberLPVester.setHandler(rewardRouter)")
  await sendTxn(degenLPVester.setHandler(rewardRouter.address, true), "degenLPVester.setHandler(rewardRouter)")

  await sendTxn(feeCybTracker.setHandler(cybVester.address, true), "feeCybTracker.setHandler(cybVester)")
  await sendTxn(stakedCyberLPTracker.setHandler(cyberLPVester.address, true), "stakedCyberLPTracker.setHandler(cyberLPVester)")
  await sendTxn(stakedDegenLPTracker.setHandler(degenLPVester.address, true), "stakedDegenLPTracker.setHandler(degenLPVester)")
}

 main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
