// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiBlacklist} from "./SiHiBlacklist.sol";

/**
 * @title  SiHiWhitelist
 * @notice 화이트리스트 기능
 */
abstract contract SiHiWhitelist is SiHiBlacklist {

    mapping(address => bool) private _whitelist;
    bool private _whitelistEnabled;

    event WhitelistEnabled();
    event WhitelistDisabled();
    event Whitelisted(address indexed account);
    event UnWhitelisted(address indexed account);

    function enableWhitelist() external onlyOwner {
        require(!_whitelistEnabled, "SiHi: whitelist already enabled");
        _whitelistEnabled = true;
        emit WhitelistEnabled();
    }

    function disableWhitelist() external onlyOwner {
        require(_whitelistEnabled, "SiHi: whitelist already disabled");
        _whitelistEnabled = false;
        emit WhitelistDisabled();
    }

    function addWhitelist(address account) external onlyOwner {
        require(account != address(0), "SiHi: zero address");
        require(!_whitelist[account],  "SiHi: already whitelisted");
        _whitelist[account] = true;
        emit Whitelisted(account);
    }

    function removeWhitelist(address account) external onlyOwner {
        require(_whitelist[account], "SiHi: not whitelisted");
        _whitelist[account] = false;
        emit UnWhitelisted(account);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }

    function whitelistEnabled() external view returns (bool) {
        return _whitelistEnabled;
    }

    // _update 제거하고 internal view 함수로 변경
    function _isWhitelistEnabled() internal view returns (bool) {
        return _whitelistEnabled;
    }

    function _isWhitelisted(address account) internal view returns (bool) {
        return _whitelist[account];
    }
}