// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiGovernance} from "./features/SiHiGovernance.sol";
import {SiHiBase}       from "./base/SiHiBase.sol";

contract SiHi is SiHiGovernance {

    constructor(address initialOwner)
        SiHiBase(initialOwner)
    {}

    function _update(address from, address to, uint256 value)
        internal
        override(SiHiBase)  // ← SiHiBase 만
    {
        // 블랙리스트 체크
        require(!_isBlacklisted(from), "SiHi: sender is blacklisted");
        require(!_isBlacklisted(to),   "SiHi: recipient is blacklisted");

        // 화이트리스트 체크
        if (_isWhitelistEnabled()) {
            if (from != address(0) && to != address(0)) {
                require(
                    _isWhitelisted(from) || _isWhitelisted(to),
                    "SiHi: not whitelisted"
                );
            }
        }

        // 거래세 소각
        if (burnFeeRate > 0 && from != address(0) && to != address(0)) {
            uint256 feeAmount  = value * burnFeeRate / 10_000;
            uint256 sendAmount = value - feeAmount;
            super._update(from, address(0), feeAmount);
            super._update(from, to, sendAmount);
        } else {
            super._update(from, to, value);
        }
    }
}