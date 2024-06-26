import * as hre from "hardhat";
import { ethers } from "ethers";


import { getProvider } from "../shared/network";
import { deployContract } from "../shared/deploy";

async function main() {
  const provider = getProvider();
  // const [wallet, user0, user1, user2, user3] = getRichWallets(provider);
  const deployerWallet = hre.ethers.provider.getSigner(0);
  

  const cybMultisig = await deployContract(
    
    "CybMultisig",
    [[deployerWallet.address],1],
    "cybMultisig"
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
