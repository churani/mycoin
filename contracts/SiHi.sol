// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiGovernance} from "./features/SiHiGovernance.sol";
import {SiHiBase}       from "./base/SiHiBase.sol";

/*
OZ v5 내부 흐름
_transfer (검증)
    ↓
_update (실제 잔고 변경)
    ↓
emit Transfer 이벤트
*/
contract SiHi is SiHiGovernance {

    // Added MAX Burn
    constructor(address initialOwner, uint256 _maxBurnSupply)
        SiHiBase(initialOwner)
    {
        require(_maxBurnSupply > 0, "SiHi: maxBurnSupply must be > 0");
        maxBurnSupply = _maxBurnSupply;   // SiHiBurnFee 의 state 사용
    }

    function _update(address from, address to, uint256 value)
        internal
        override(SiHiBase)
    {
        // 블랙리스트
        require(!_isBlacklisted(from), "SiHi: sender is blacklisted");
        require(!_isBlacklisted(to),   "SiHi: recipient is blacklisted");

        // 화이트리스트
        if (_isWhitelistEnabled() && from != address(0) && to != address(0)) {
            require(
                _isWhitelisted(from) || _isWhitelisted(to),
                "SiHi: not whitelisted"
            );
        }

        // 거래세 소각 (_calcBurnFee 가 모든 면제 로직 처리)
        if (from != address(0) && to != address(0)) {
            uint256 fee = _calcBurnFee(from, value);
            if (fee > 0) {
                totalBurned += fee;
                super._update(from, address(0), fee);    // 소각
                super._update(from, to, value - fee);    // 실제 전송
                emit BurnFeeApplied(from, fee, totalBurned);
                return;
            }
        }

        super._update(from, to, value);   // 일반 전송
    }
}