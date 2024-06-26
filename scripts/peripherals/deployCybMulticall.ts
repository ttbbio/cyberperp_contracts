import * as hre from "hardhat";
import { ethers } from "ethers";


import { getProvider } from "../shared/network";
import { deployContract, getJsonField, sendTxn } from "../shared/deploy";
import { getNetworkConfig } from "../shared/cyberperpConfig";
import { OrderBookV2__factory, PositionRouterV2__factory, CybMulticall__factory } from "../../typechain";

async function main() {
  const provider = getProvider();
  // const [wallet, user0, user1, user2, user3] = getRichWallets(provider);
  const deployerWallet = hre.ethers.provider.getSigner(0);
  
  const config = getNetworkConfig();

  const posRouterAddress = (await getJsonField("positionRouterV2")) as string;
  const orderBookAddress = (await getJsonField("orderBookV2")) as string;

  const posRouter = PositionRouterV2__factory.connect(posRouterAddress, deployerWallet);
  const orderBook = OrderBookV2__factory.connect(orderBookAddress, deployerWallet);
  const minExecutionFee = ethers.utils.parseEther("0.00042"); //~ $2

  // const cybMulticallAddress = (await getJsonField("cybMulticall")) as string;

  // const cybMulticall = CybMulticall__factory.connect(
  //   cybMulticallAddress,
  //   deployerWallet
  // );

  const cybMulticall = await deployContract(
    
    "CybMulticall",
    [posRouterAddress, orderBookAddress,minExecutionFee],
    "cybMulticall",
    false
  );

  await sendTxn(posRouter.setHandler(cybMulticall.address, true), "posRouter.setHandler");
  await sendTxn(orderBook.setHandler(cybMulticall.address, true), "orderBook.setHandler");
  // await sendTxn(cybMulticall.setMinExecutionFee(minExecutionFee), "cybMulticall.setMinExecutionFee");
  // await sendTxn(cybMulticall.setGov("0x720986753900A12884773858F63F98713FDf1FfF"), "cybMulticall.setMinExecutionFee");
  // console.log(cybMulticall.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
