// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiWhitelist} from "./SiHiWhitelist.sol";

/**
 * @title  SiHiBurnFee
 * @notice 거래세 소각 기능
 * 화이트리스트 대상은 수수료 면제 시켜주는 경우가 많기 때문

    가스비       → 이더리움 네트워크에 내는 수수료
    거래세       → 토큰 거래 시 프로젝트에 내는 수수료(토큰 전송 시 일정 % 차감) 프로젝트 지갑으로
    소각세       → 거래세 중 소각되는 부분

    100 토큰 전송
    ├── 가스비 0.001 ETH    → 이더리움 네트워크
    ├── 거래세 3 토큰       → 프로젝트 지갑
    └── 소각세 2 토큰       → address(0) 소각
        = 실제 수령 95 토큰

    1. 소각률 → 거래당 몇 % 소각?
    2. 최대 소각률 → 얼마까지 허용?
    3. 변경 가능 여부 → 고정 or 오너가 변경 가능?
    4. 최대 소각량 → 총 공급량의 몇 % 까지 소각?       
 */
abstract contract SiHiBurnFee is SiHiWhitelist {
    uint256 public burnFeeRate;
    uint256 public constant MAX_FEE_RATE = 1000;   // 10% (basis points)
    uint256 public maxBurnSupply;                   // ← state 로 변경
    uint256 public totalBurned;
    mapping(address => uint256) public discountRate;

    event BurnFeeRateChanged(uint256 oldRate, uint256 newRate);
    event MaxBurnSupplyChanged(uint256 oldMax, uint256 newMax);
    event DiscountRateChanged(address indexed account, uint256 oldRate, uint256 newRate);
    event BurnFeeApplied(address indexed account, uint256 amount, uint256 totalBurned);

    function setBurnFeeRate(uint256 rate) external onlyOwner {
        require(rate <= MAX_FEE_RATE, "SiHi: fee rate too high");
        emit BurnFeeRateChanged(burnFeeRate, rate);
        burnFeeRate = rate;
    }

    function setMaxBurnSupply(uint256 newMax) external onlyOwner {
        require(newMax >= totalBurned, "SiHi: cannot lower below totalBurned");
        emit MaxBurnSupplyChanged(maxBurnSupply, newMax);
        maxBurnSupply = newMax;
    }

    function setDiscountRate(address account, uint256 rate) external onlyOwner {
        require(rate <= 100, "SiHi: discount rate too high");
        emit DiscountRateChanged(account, discountRate[account], rate);
        discountRate[account] = rate;
    }

    /**
     * @notice 거래세 계산 (실제 소각은 _update 에서)
     * @return fee 소각할 양 (0 이면 면제)
     */
    function _calcBurnFee(address from, uint256 value) internal view returns (uint256 fee) {
        if (burnFeeRate == 0)               return 0;
        if (totalBurned >= maxBurnSupply)   return 0;
        if (_isWhitelisted(from))           return 0;

        uint256 discount  = discountRate[from];
        uint256 finalRate = burnFeeRate * (100 - discount) / 100;
        fee = value * finalRate / 10_000;   // ← basis points 표준

        // 한도 초과 방지
        if (totalBurned + fee > maxBurnSupply) {
            fee = maxBurnSupply - totalBurned;
        }
    }
}
