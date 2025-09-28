// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockAggregator
 * @dev Mock Chainlink price feed for testing purposes
 */
contract MockAggregator is AggregatorV3Interface {
    uint8 public override decimals;
    int256 public price;
    uint256 public timestamp;
    uint80 public round;

    constructor(uint8 _decimals, int256 _initialPrice) {
        decimals = _decimals;
        price = _initialPrice;
        timestamp = block.timestamp;
        round = 1;
    }

    function description() external pure override returns (string memory) {
        return "Mock Price Feed";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, price, timestamp, timestamp, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (round, price, timestamp, timestamp, round);
    }

    function updatePrice(int256 _price) external {
        price = _price;
        timestamp = block.timestamp;
        round++;
    }

    function updateRoundData(
        uint80 _roundId,
        int256 _price,
        uint256 _timestamp
    ) external {
        round = _roundId;
        price = _price;
        timestamp = _timestamp;
    }
}