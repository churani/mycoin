// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiWhitelist} from "./SiHiWhitelist.sol";

/**
 * @title  SiHiBurnFee
 * @notice 거래세 소각 기능
 */
abstract contract SiHiBurnFee is SiHiWhitelist {

    uint256 public burnFeeRate;
    uint256 public constant MAX_FEE_RATE = 1000;

    event BurnFeeRateChanged(uint256 oldRate, uint256 newRate);

    function setBurnFeeRate(uint256 rate) external onlyOwner {
        require(rate <= MAX_FEE_RATE, "SiHi: fee rate too high");
        uint256 old = burnFeeRate;
        burnFeeRate = rate;
        emit BurnFeeRateChanged(old, rate);
    }
}