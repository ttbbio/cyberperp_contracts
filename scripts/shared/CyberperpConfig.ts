import * as hre from 'hardhat';

interface NetworkConfig {
    pyth: string,

    weth: string,
    wbtc: string,
    eth: string,
    usdc: string,

    wethPriceFeedId: string,
    btcPriceFeedId: string,
    ethPriceFeedId: string,
    usdcPriceFeedId: string,
    pepePriceFeedId: string,

    connectionEndpoint: string
}

function cyberperpMainnet(): NetworkConfig {
    return {
        pyth: "0x8D254a21b3C86D32F7179855531CE99164721933",
        usdc: "",
        weth: "",
        wbtc: "",
        eth: "",
        wethPriceFeedId: "",
        usdcPriceFeedId: "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
        ethPriceFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        btcPriceFeedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        pepePriceFeedId: "0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4",
        connectionEndpoint: "https://hermes.pyth.network"
    };
}

export function getNetworkConfig(): NetworkConfig {
    if(hre.network.name.indexOf("IOTA") != -1){
        return cyberperpMainnet()
    }
    throw new Error("network config for this network is not specified");
}