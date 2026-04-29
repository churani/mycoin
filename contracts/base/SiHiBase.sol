// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20}         from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {Ownable}       from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  SiHiBase
 * @notice 기본 ERC-20 + 공통 상수/이벤트

 함수마다 자문:

  ❓ owner 가 실수로 잘못된 값 넣으면?
  ❓ owner 가 악의로 최악의 값 넣으면?
  ❓ 외부 공격자가 이 함수 어떻게 악용?
  ❓ 가스 무한 소비 가능?
  ❓ revert 안 나야 하는데 나는 케이스?
  ❓ revert 나야 하는데 안 나는 케이스?
  ❓ 이벤트 빠지면 모니터링 못 함

 */
abstract contract SiHiBase is ERC20, ERC20Burnable, ERC20Pausable, Ownable {

    /// 초기 발행량: 1,000,000 SHI, 32바이트 256비트
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    /// 최대 발행량: 2,000,000 SHI
    uint256 public constant MAX_SUPPLY     = 2_000_000 * 10 ** 18;

    constructor(address initialOwner)
        ERC20("SiHi", "SHI")
        Ownable(initialOwner)
    {
        _mint(initialOwner, INITIAL_SUPPLY);
    }

    /// @notice owner 만 추가 발행
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "SiHi: MAX_SUPPLY exceeded");
        _mint(to, amount);
    }

    /// @notice owner 만 정지
    function pause() external onlyOwner { _pause(); }

    /// @notice owner 만 해제
    function unpause() external onlyOwner { _unpause(); }

    /// @notice owner 권한 포기 비활성화
    function renounceOwnership() public pure override {
        revert("SiHi: renounce disabled");
    }

    /// @notice 다중상속 충돌 해소 (하위에서 override)
    function _update(address from, address to, uint256 value)
        internal
        virtual
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}