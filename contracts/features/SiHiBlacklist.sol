// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiBase} from "../base/SiHiBase.sol";

/**
 * @title  SiHiBlacklist
 * @notice 블랙리스트 기능
 */
abstract contract SiHiBlacklist is SiHiBase {

    mapping(address => bool) private _blacklist;

    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);

    // 오너주소나 컨트랙주소 블랙리스트 등록불가
    function blacklist(address account) external onlyOwner {
        require(account != address(0),                  "SiHi: zero address");
        require(account != owner(),                     "SiHi: cannot blacklist owner");
        require(account != address(this),               "SiHi: cannot blacklist contract");
        require(!_blacklist[account],                   "SiHi: already blacklisted");
        _blacklist[account] = true;
        emit Blacklisted(account);
    }


    function unBlacklist(address account) external onlyOwner {
        require(_blacklist[account], "SiHi: not blacklisted");
        _blacklist[account] = false;
        emit UnBlacklisted(account);
    }

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklist[account];
    }

    // _update 제거하고 modifier 방식으로 변경
    function _isBlacklisted(address account) internal view returns (bool) {
        return _blacklist[account];
    }
}