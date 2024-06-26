import { HardhatUserConfig } from "hardhat/config";
import "hardhat-contract-sizer";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-abi-exporter";
import dotenv from 'dotenv';

dotenv.config();
const pk: any = process.env.TESTNET_DEPLOYER_PK;

const config: HardhatUserConfig = {
  networks: {
    IOTATestnet: {
      url: "https://json-rpc.evm.testnet.iotaledger.net", // public endpoint
      chainId: 1075,
      accounts: [pk],
      allowUnlimitedContractSize: true
    },
    IOTA: {
      url: "https://json-rpc.evm.iotaledger.net", // public endpoint
      chainId: 8822,
      accounts: [pk],
      allowUnlimitedContractSize: true
    },
    hardhat: {
      allowUnlimitedContractSize: true,
      blockGasLimit:100000000000
    },
  },
  defaultNetwork:"hardhat",
  etherscan: {
    apiKey: {
      IOTA: "IOTA",
      IOTATestnet: "IOTATestnet"
    },
    customChains: [
      {
        network: "IOTA",
        chainId: 8822,
        urls: {
          apiURL: "https://explorer.evm.iota.org/api",
          browserURL: "https://explorer.evm.iota.org"
        }
      },
      {
        network: "IOTATestnet",
        chainId: 1075,
        urls: {
          apiURL: "https://explorer.evm.testnet.iotaledger.net/api",
          browserURL: "https://explorer.evm.testnet.iotaledger.net",
        },
      },
    ]
  },
  solidity: {
    compilers: [
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
          viaIR: true
        }
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  // paths: {
  //   tests: "./test/core/Vault", // Replace 'my-test-folder' with the name of the folder you prefer
  // },
  contractSizer: {
    alphaSort: false,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: false,
  },
  abiExporter: {
    path: "./data/abi",
    runOnCompile: true,
    clear: true,
    // flat: true,
    // only: [':RewardRouterV2$'],
    spacing: 2,
    pretty: false,
    // format: "json",
  }
};

export default config;
