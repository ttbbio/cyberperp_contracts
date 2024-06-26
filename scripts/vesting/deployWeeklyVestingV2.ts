import * as hre from 'hardhat';


import { getProvider } from '../shared/network';
import { deployContract, sendTxn } from '../shared/deploy';
import { WeeklyVestingV2__factory, CYB__factory } from '../../typechain';




async function main() {
  const provider = getProvider();
  // const [wallet, user0, user1, user2, user3] = getRichWallets(provider);
  const deployerWallet = hre.ethers.provider.getSigner(0);
  

  const cybAddress = ""
  const option1Address = ""
  const option2Address = "" //MigrateVesting
  const option3Address = ""

//   const option1 = await deployContract( "WeeklyVestingV2", [option1Address]);
//   const option2 = await deployContract( "WeeklyVestingV2", [option2Address]);
//   const option3 = await deployContract( "WeeklyVestingV2", [option3Address]);

  const option1Contract = WeeklyVestingV2__factory.connect("", deployerWallet);
  const option2Contract = WeeklyVestingV2__factory.connect("", deployerWallet);
  const option3Contract = WeeklyVestingV2__factory.connect("", deployerWallet);
  
  const option1TotalPurchased = await option1Contract.totalCybPurchased();
  const option2TotalPurchased = await option2Contract.totalCybPurchased();
  const option3TotalPurchased = await option3Contract.totalCybPurchased();
    
  console.log("option1TotalPurchased ", option1TotalPurchased.toString())    
  console.log("option2TotalPurchased ", option2TotalPurchased.toString())    
  console.log("option3TotalPurchased ", option3TotalPurchased.toString())  
  const cybContract = CYB__factory.connect(cybAddress, deployerWallet);
  await sendTxn(cybContract.transfer(option1Contract.address, option1TotalPurchased), "cybContract.transfer(option1Contract.address, option1TotalPurchased)");
  await sendTxn(cybContract.transfer(option2Contract.address, option2TotalPurchased), "cybContract.transfer(option2Contract.address, option2TotalPurchased)");
  await sendTxn(cybContract.transfer(option3Contract.address, option3TotalPurchased), "cybContract.transfer(option3Contract.address, option3TotalPurchased)");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
