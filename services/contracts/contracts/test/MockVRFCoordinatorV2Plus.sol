// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/**
 * Minimal VRF v2.5 coordinator mock for tests. Implements just enough of
 * IVRFCoordinatorV2Plus for our consumer to call `requestRandomWords` and for
 * tests to call `fulfillRandomWordsWithOverride` to drive the callback.
 *
 * Doesn't simulate fees, subscriptions, or proofs — those aren't relevant to
 * the consumer's logic, which is what we're testing.
 */
interface IVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

contract MockVRFCoordinatorV2Plus {
    uint256 public lastRequestId;

    event RandomWordsRequested(uint256 indexed requestId, address indexed consumer);

    /// Mirrors IVRFCoordinatorV2Plus.requestRandomWords; only returns a fresh id.
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata)
        external
        returns (uint256 requestId)
    {
        lastRequestId += 1;
        requestId = lastRequestId;
        emit RandomWordsRequested(requestId, msg.sender);
    }

    /// Test helper: call back into the consumer with a chosen random word.
    function fulfillRandomWordsWithOverride(
        uint256 requestId,
        address consumer,
        uint256[] calldata words
    ) external {
        IVRFConsumer(consumer).rawFulfillRandomWords(requestId, words);
    }
}
