// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SiHiBase} from "../base/SiHiBase.sol";

/**
 * @title  SiHiBlacklist
 * @notice 블랙리스트 기능

    owner나 contract 블랙리스트 등록불가    
    _blacklist (mapping)
    ├── 0x1234... → true   (블랙리스트 O)
    ├── 0xabcd... → false  (블랙리스트 X)
    └── 0x5678... → true   (블랙리스트 O)
        
    블록체인
    ├── 블록
    │   ├── 트랜잭션
    │   │   ├── 상태 변경 → 컨트랙트 Storage에 반영
    │   │   └── 로그 (emit된 이벤트) ← 블록 안에 저장
    │   
    └── 컨트랙트 주소
        └── Storage (영구 저장, 누적)
            ├── slot[0] → _blacklist 데이터
            ├── slot[1] → _whitelist 데이터
            └── slot[2] → _whitelistEnabled 데이터

    로그를 storage에 저장하면?
    → 이력 쌓일수록 storage 비용 폭발
    → 누가 언제 추가됐는지 배열로 관리해야 함
    → 가스비 엄청남

    storage를 로그로 대체하면?
    → 컨트랙트 내부에서 읽을 수 없음
    → if (_whitelist[account]) 자체가 불가능

    emit
    한번 기록되면 수정/삭제 불가
    컨트랙트 내부에서는 읽을 수 없음 (오직 외부에서만 조회)
    storage보다 가스가 훨씬 저렴

    Etherscan Write Contract
        ↓
    WRITE 버튼 클릭
            ↓
    메타마스크 서명 요청 팝업
            ↓
    확인 클릭 (트랜잭션 전송)
            ↓
    블록체인 노드 검증/채굴
            ↓
    blacklist() 함수 실행
            ├── require 체크
            ├── _blacklist[account] = true
            └── emit Blacklisted(account)
            ↓
    완료 (성공 or 실패)

    * SiHiBlacklist is SiHiBase
    * 기능을 레이어로 쌓는 구조
    * 상위 레이어는 하위를 몰라야 한다는 단방향 의존성 원칙. 계단식 상속(순환 의존성 위험)
    * 하위 레이어는 상위 레이어 몰라도 문제 없음
 */
abstract contract SiHiBlacklist is SiHiBase {

    mapping(address => bool) private _blacklist;

    // 로그 기록
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);

    function blacklist(address account) external onlyOwner {
        require(account != address(0),     "SiHi: zero address");
        require(account != owner(),        "SiHi: cannot blacklist owner");
        require(account != address(this),  "SiHi: cannot blacklist contract");
        require(!_blacklist[account],      "SiHi: already blacklisted");

        // transaction - verify - save to storage + emit
        _blacklist[account] = true;       // storage에 저장
        // write logs to transaction Receipt
        emit Blacklisted(account);        // 블록체인 로그로 전파
    }

    function unBlacklist(address account) external onlyOwner {
        require(_blacklist[account], "SiHi: not blacklisted");
        _blacklist[account] = false;  // storage 변경 → 컨트랙트가 상태 기억
        emit UnBlacklisted(account);  // 로그 기록 → 외부에 이력 기록
    }

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklist[account];
    }

    // 내부에서 체크 로직 확장을 위해 미리 구현
    function _isBlacklisted(address account) internal view returns (bool) {
        return _blacklist[account];
    }
}