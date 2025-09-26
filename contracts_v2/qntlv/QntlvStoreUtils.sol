// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../data/DataStore.sol";

import "./Qntlv.sol";

library QntlvStoreUtils {
    using Qntlv for Qntlv.Props;

    bytes32 public constant QNTLV_SALT = keccak256(abi.encode("QNTLV_SALT"));
    bytes32 public constant QNTLV_TOKEN = keccak256(abi.encode("QNTLV_TOKEN"));
    bytes32 public constant LONG_TOKEN = keccak256(abi.encode("LONG_TOKEN"));
    bytes32 public constant SHORT_TOKEN = keccak256(abi.encode("SHORT_TOKEN"));

    function get(DataStore dataStore, address key) public view returns (Qntlv.Props memory) {
        Qntlv.Props memory qntlv;
        if (!dataStore.containsAddress(Keys.QNTLV_LIST, key)) {
            return qntlv;
        }

        qntlv.qntlvToken = dataStore.getAddress(
            keccak256(abi.encode(key, QNTLV_TOKEN))
        );

        qntlv.longToken = dataStore.getAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        qntlv.shortToken = dataStore.getAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );

        return qntlv;
    }

    function getBySalt(DataStore dataStore, bytes32 salt) external view returns (Qntlv.Props memory) {
        address key = dataStore.getAddress(getQntlvSaltHash(salt));
        return get(dataStore, key);
    }

    function set(DataStore dataStore, address key, bytes32 salt, Qntlv.Props memory qntlv) external {
        dataStore.addAddress(
            Keys.QNTLV_LIST,
            key
        );

        // the salt is based on the qntlv props while the key gives the qntlv's address
        // use the salt to store a reference to the key to allow the key to be retrieved
        // using just the salt value
        dataStore.setAddress(
            getQntlvSaltHash(salt),
            key
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, QNTLV_TOKEN)),
            qntlv.qntlvToken
        );


        dataStore.setAddress(
            keccak256(abi.encode(key, LONG_TOKEN)),
            qntlv.longToken
        );

        dataStore.setAddress(
            keccak256(abi.encode(key, SHORT_TOKEN)),
            qntlv.shortToken
        );
    }

    function remove(DataStore dataStore, address key) external {
        if (!dataStore.containsAddress(Keys.QNTLV_LIST, key)) {
            revert Errors.QntlvNotFound(key);
        }

        dataStore.removeAddress(
            Keys.QNTLV_LIST,
            key
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, QNTLV_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, LONG_TOKEN))
        );

        dataStore.removeAddress(
            keccak256(abi.encode(key, SHORT_TOKEN))
        );
    }

    function getQntlvSaltHash(bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(QNTLV_SALT, salt));
    }

    function getQntlvCount(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getAddressCount(Keys.QNTLV_LIST);
    }

    function getQntlvKeys(DataStore dataStore, uint256 start, uint256 end) internal view returns (address[] memory) {
        return dataStore.getAddressValuesAt(Keys.QNTLV_LIST, start, end);
    }
}
