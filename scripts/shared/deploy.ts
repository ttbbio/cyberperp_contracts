import * as hre from "hardhat";
import { ethers } from "ethers";

import { readFile, writeFile } from "fs/promises";

export async function deployContract(
  name: string,
  args: any[] = [],
  saveJsonField: string,
  verify: boolean = true,
  options: any = undefined
) {
  try {
    const argStr = args.map((i) => `"${i}"`).join(", ");
    console.info(`Deploying...  ${name}(${argStr})`);
    let contractFactory;
    if(options){
      contractFactory  = await hre.ethers.getContractFactory(name,options);
    }
    else{
      contractFactory = await hre.ethers.getContractFactory(name);
    }

    const contract = await contractFactory.deploy(...args); // ,{gasLimit:100000000, gasPrice:13000000000}

    console.info(`Completed: ${contract.address}\n`);
    await contract.deployTransaction.wait()
    await saveToJson(saveJsonField, contract.address);
    const verifyArgs = options ? {
      address: contract.address,
      constructorArguments: args,
      libraries: options.libraries
    } : {
      address: contract.address,
      constructorArguments: args,
    };
    if (verify) {
      try {
        await hre.run("verify:verify", verifyArgs);
      } catch (error: any) {
        console.log(`Error verifying contract ${error}`);
      }
    }
    await sleep(2000);
    return contract;
  } catch (error: any) {
    throw new Error(`Error deploying contract ${error}`);
  }
}

export async function getJsonField(
  jsonField: string,
  forwardError: boolean = true
): Promise<string | undefined> {
  const currentNetwork = hre.network.name;
  const fileName = `DEPLOY_INFO_${currentNetwork}.json`;
  let deployResult: { [key: string]: any } = {};
  try {
    const data = await readFile(fileName, "utf-8");
    deployResult = JSON.parse(data);
    return deployResult[jsonField];
  } catch (error) {
    console.info(`error while getting json field from ${fileName}`);
    if (forwardError) {
      throw error;
    }
  }
  return undefined;
}

//requires running from root directory
async function saveToJson(saveJsonField: string, contractAddress: string) {
  // Read the .json file, or initialize an empty object if the file doesn't exist
  const currentNetwork = hre.network.name;
  const fileName = `DEPLOY_INFO_${currentNetwork}.json`;
  let deployResult: { [key: string]: any } = {};
  try {
    const data = await readFile(fileName, "utf-8");
    deployResult = JSON.parse(data);
  } catch (error) {
    console.info(fileName, " file does not exist, creating a new one.");
  }

  // Update the field with the contract address
  deployResult[saveJsonField] = contractAddress;

  // Write the updated deployResult back to the file
  try {
    await writeFile(fileName, JSON.stringify(deployResult, null, 2));
  } catch (error) {
    console.error(`Error writing to ${fileName}: `, error);
  }
}

export async function sendTxn(
  txnPromise: Promise<ethers.ContractTransaction>,
  label: string
) {
  let txn: ethers.ContractTransaction;
  try {
    console.info(`Sending ${label}`);
    txn = await txnPromise;
    console.info(`${txn.hash}...`);
    await txn.wait();
  } catch (error: any) {
    console.error("{error } ", { error });

    throw new Error(`Error sending tx`);
  }
  await sleep(2000);
  return txn;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
