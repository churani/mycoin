// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiBlacklist} from "./SiHiBlacklist.sol";

/**
 * @title  SiHiWhitelist
 * @notice 화이트리스트 기능
 * 얼리버드 참여자만 먼저 민팅
 * 디스코드 커뮤니티 멤버만 허용
 * 프리세일 → 화이트리스트만, 퍼블릭세일 → 전체 허용 순서로 진행
 */
abstract contract SiHiWhitelist is SiHiBlacklist {

    mapping(address => bool) private _whitelist;
    bool private _whitelistEnabled;

    // 기능 자체를 on/off -  블록체인 외부에 알리는 로그 역할
    // emit은 먼저 선언해야 한다.
    event WhitelistEnabled();
    event WhitelistDisabled();
    event Whitelisted(address indexed account);
    event UnWhitelisted(address indexed account);


    // 트랜잭션 필요 (쓰기)
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

    // 트랜잭션 불필요 (읽기)
    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }

    function whitelistEnabled() external view returns (bool) {
        return _whitelistEnabled;
    }

    function _isWhitelistEnabled() internal view returns (bool) {
        return _whitelistEnabled;
    }

    function _isWhitelisted(address account) internal view returns (bool) {
        return _whitelist[account];
    }
}