# SiHi — Deep Dive (학습 리뷰 + 디테일)

> 전체 흐름은 알겠는데, 평소 안 보이는 디테일을 짚는 문서  
> 본인의 SiHi 코드 기반 분석

---

## 1. EVM 가스 모델

### 1-1. 가스란?

```
가스 = EVM 명령(opcode) 실행 비용 단위
1 트랜잭션 = N개 opcode 실행 = N개 가스 소비

총 비용 (wei) = gas_used × gas_price

예:
  transfer 50,000 gas × 30 gwei = 0.0015 ETH
```

### 1-2. opcode 별 가스 비용 (대표)

| opcode | 가스 | 의미 |
|--------|------|------|
| `ADD`, `SUB`, `MUL` | 3~5 | 산술 |
| `SLOAD` | 2,100 | 스토리지 읽기 |
| `SSTORE` (0→non-zero) | 20,000 | 스토리지 쓰기 (신규) |
| `SSTORE` (non-zero→non-zero) | 5,000 | 스토리지 쓰기 (수정) |
| `SSTORE` (non-zero→0) | 5,000 + 환불 15,000 | 스토리지 비우기 |
| `CALL` (외부 호출) | 2,600~ | 외부 컨트랙트 호출 |
| `LOG` (이벤트) | 375 + topic당 375 | 이벤트 발생 |

→ **스토리지 쓰기가 압도적으로 비쌈** (트랜잭션 비용의 80~90%)

### 1-3. SiHi 의 가스 사례

```solidity
function transfer(address to, uint256 amount) {
    _balances[msg.sender] -= amount;   // SSTORE: 5,000 gas
    _balances[to] += amount;           // SSTORE: 5,000 gas (또는 20,000 신규)
    emit Transfer(msg.sender, to, amount);  // LOG3: 375 + 375×3 = 1,500 gas
    // 그 외 검사 + opcode = ~10,000 gas
}
// 합계: ~25,000 gas (수신자 첫 받음 시 ~40,000)
```

```
새 주소가 처음 받을 때:
  → balance 0 → non-zero → 20,000 gas
  → "토큰 받기" 가 비싼 이유

기존 주소가 추가로 받을 때:
  → balance non-zero → non-zero → 5,000 gas
```

### 1-4. 가스 절감 패턴

```solidity
// BAD: 매번 storage 읽기 (SLOAD 2,100 × N)
for (uint i = 0; i < arr.length; i++) { ... }

// GOOD: 메모리에 캐싱
uint256 len = arr.length;  // SLOAD 한 번
for (uint i = 0; i < len; i++) { ... }
```

```solidity
// BAD: storage 변수 여러 번 수정
balance += a;
balance -= b;
balance += c;     // SSTORE 3번 = 15,000 gas

// GOOD: 메모리에서 계산 후 한 번 저장
uint256 newBal = balance + a - b + c;
balance = newBal;  // SSTORE 1번 = 5,000 gas
```

---

## 2. 이벤트와 로그

### 2-1. 본질

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
emit Transfer(msg.sender, to, amount);
```

```
저장 위치:
  ❌ 컨트랙트 storage (SSTORE) — 안 들어감
  ✓ 트랜잭션 영수증의 "로그" 영역

특징:
  - 컨트랙트 안에서 다시 못 읽음 (read 불가)
  - 가스 저렴 (375~1,500 gas)
  - 외부 (web3, viem, Etherscan) 에서 인덱싱/검색 가능
  - 트랜잭션이 포함된 블록에 영구 저장
```

### 2-2. indexed vs 일반

```solidity
event Transfer(
  address indexed from,    // ← topic (검색 가능)
  address indexed to,      // ← topic (검색 가능)
  uint256 value            // ← data (검색 불가, 작음)
);
```

```
indexed:
  - 32바이트 topic 으로 저장
  - "from = 0xABC 인 모든 transfer 검색" 가능
  - 최대 3개까지

일반 (data):
  - ABI 인코딩 후 저장
  - 큰 데이터 OK (string, bytes)
  - 검색 불가, 디코딩 후 사용
```

### 2-3. 이벤트 검색 (viem 예제)

```typescript
const logs = await publicClient.getContractEvents({
  address: sihi.address,
  abi: sihi.abi,
  eventName: "Transfer",
  args: { from: "0xABC..." },  // ← indexed 만 필터 가능
  fromBlock: 0n,
  toBlock: "latest",
});
```

→ **indexed 안 붙은 필드는 args 로 필터 못 함**

### 2-4. SiHi 의 이벤트 활용

```
ERC20.Transfer       → mint/burn/transfer 모두 발생
ERC20Pausable.Paused → 일시정지 시
Ownable.OwnershipTransferred → 소유권 이전 시

→ 외부에서 컨트랙트 상태 변화 감시 가능
→ DApp UI 업데이트, 알림, 통계 등
```

---

## 3. 스토리지 슬롯 레이아웃

### 3-1. 32바이트 슬롯

```solidity
contract Example {
    uint256 a;      // slot 0
    uint128 b;      // slot 1 (16바이트)
    uint128 c;      // slot 1 (16바이트, b 와 packed!)
    uint256 d;      // slot 2
}
```

```
EVM 의 storage = 슬롯(32바이트) 배열
변수가 32바이트 미만이면 다음 변수와 packing 시도

같은 슬롯에 packing:
  → 같이 읽으면 SLOAD 1번 (가스 절약)
  → 한 쪽만 수정해도 SSTORE 1번 (영향 없음)
  → 둘 다 수정 시 SSTORE 1번 (절약)
```

### 3-2. mapping / 배열의 위치

```solidity
mapping(address => uint256) _balances;  // slot 0

// _balances[0xABC] 의 위치:
// keccak256(abi.encode(0xABC, uint256(0)))
//                              ↑ slot 번호
```

```
mapping:
  키마다 keccak256 으로 분산 저장
  → 충돌 사실상 불가능
  → 슬롯 번호는 선언 위치로 결정
```

### 3-3. 상속 시 슬롯 누적

```solidity
contract A {
    uint256 a;  // slot 0
}

contract B is A {
    uint256 b;  // slot 1
}

contract C is B {
    uint256 c;  // slot 2
}
```

```
SiHi 의 슬롯 레이아웃:
  ERC20:        _balances (mapping), _allowances (mapping), _totalSupply, _name, _symbol
  ERC20Pausable: (Pausable 상속) _paused (bool)
  Ownable:      _owner (address)
  SiHiGovernance: burnFeeRate, _blacklist (mapping), _whitelist (mapping), _whitelistEnabled
  SiHi:         (없음)

→ 부모 변수가 항상 자식 변수 앞에 옴
→ 업그레이드 가능 컨트랙트에선 슬롯 순서가 매우 중요
```

### 3-4. 왜 알아야 하는가

```
1. 가스 최적화 (packing 활용)
2. 업그레이드 가능 컨트랙트의 storage layout 호환성
3. delegatecall 시 caller 의 storage 사용 (기적적이거나 위험)
4. 디버깅 (storage 직접 조회)
```

---

## 4. 컴파일러 최적화

### 4-1. solc optimizer

`hardhat.config.ts` 의 production 프로파일:

```typescript
production: {
  version: "0.8.28",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,    // ← 핵심 숫자
    },
  },
},
```

### 4-2. runs 의 의미

```
runs = "이 코드가 평생 몇 번 호출될 것 같은가" 추정값

낮은 runs (예: 1):
  배포 가스 ↓ (코드 작아짐)
  실행 가스 ↑ (런타임 최적화 약함)
  → 배포만 하고 거의 안 부르는 컨트랙트용

높은 runs (예: 1000+):
  배포 가스 ↑ (인라이닝, 펼치기로 코드 큼)
  실행 가스 ↓ (런타임 최적화 강함)
  → 자주 호출되는 컨트랙트용

200 = 균형 (기본값)
```

### 4-3. SiHi 에 추천

```
ERC-20 토큰:
  → transfer 가 가장 많이 호출됨
  → runs = 1000~2000 추천 (실행 가스 절감)

배포는 한 번이고
사용은 평생 → 사용자 가스비 절약이 중요
```

### 4-4. via_ir (IR 우회 컴파일)

```typescript
settings: {
  viaIR: true,    // 더 강력한 최적화
  optimizer: { enabled: true, runs: 1000 },
},
```

```
viaIR:
  Solidity → Yul (중간 표현) → 바이트코드
  더 강력한 최적화 가능
  컴파일 시간 ↑↑
  복잡한 컨트랙트에서 효과 큼
```

---

## 5. 다중 상속 + `_update` 오버라이드 동작 원리

### 5-1. SiHi 의 상속 구조

```
SiHi
 ↓
SiHiGovernance (mint, blacklist, whitelist, fee)
 ↓
SiHiBase
 ↓
ERC20 + ERC20Burnable + ERC20Pausable + Ownable
 ↓
ERC20  (모든 transfer 의 진입점)
```

### 5-2. C3 선형화 (Method Resolution Order)

```
contract SiHiBase is ERC20, ERC20Burnable, ERC20Pausable, Ownable { ... }

Solidity 가 만드는 호출 순서:
  ERC20Pausable._update → ERC20._update
  
super._update() 호출 시 → 다음 부모로 자동 전파
```

### 5-3. SiHi 의 `_update` 동작 추적

```solidity
// SiHi.sol
function _update(address from, address to, uint256 value)
    internal
    override(SiHiBase)
{
    require(!_isBlacklisted(from), "...");
    require(!_isBlacklisted(to),   "...");
    
    if (_isWhitelistEnabled()) { ... }
    
    if (burnFeeRate > 0) {
        super._update(from, address(0), feeAmount);  // ① 소각
        super._update(from, to, sendAmount);         // ② 실제 전송
    } else {
        super._update(from, to, value);              // ③ 일반 전송
    }
}
```

### 5-4. transfer 호출 시 흐름

```
sihi.transfer(alice, 100) 호출
  ↓
ERC20.transfer
  ↓
ERC20._transfer
  ↓
SiHi._update         ← 우리가 오버라이드한 것 (블랙/화이트/거래세)
  ↓ super._update
SiHiBase._update     ← (사용자가 정의했다면)
  ↓ super._update
ERC20Pausable._update ← paused 체크
  ↓ super._update
ERC20._update        ← 실제 _balances 업데이트
```

→ **모든 transfer/mint/burn 이 _update 한 곳을 통과**  
→ 검사를 한 곳에 모을 수 있음 (보안 패턴의 핵심)

### 5-5. override 의 의미

```solidity
function _update(...) internal override(SiHiBase) { ... }
//                                  ↑
//                          어느 부모를 오버라이드하는지 명시
```

```
override(부모1, 부모2, ...):
  컴파일러에게 "이 함수가 어떤 부모의 함수와 충돌하는지" 알려줌
  여러 부모가 같은 함수 정의했을 때 명시 필수

SiHi 의 경우:
  _update 가 SiHiBase 를 통해 ERC20 + ERC20Pausable 모두에 정의됨
  override(SiHiBase) 만으로 충분 (SiHiBase 가 두 부모 통합)
```

---

## 6. OpenZeppelin 내부 구조

### 6-1. ERC-20 의 핵심

```solidity
// node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol

contract ERC20 is IERC20 {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;
    string private _name;
    string private _symbol;
    
    function transfer(address to, uint256 value) public returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }
    
    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) revert ERC20InvalidSender(address(0));
        if (to == address(0)) revert ERC20InvalidReceiver(address(0));
        _update(from, to, value);
    }
    
    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            _totalSupply += value;        // mint
        } else {
            _balances[from] -= value;     // 차감
        }
        
        if (to == address(0)) {
            _totalSupply -= value;        // burn
        } else {
            _balances[to] += value;       // 가산
        }
        
        emit Transfer(from, to, value);
    }
}
```

### 6-2. 핵심 통찰

```
모든 토큰 이동 (mint, burn, transfer) 이 _update 한 함수 통과
  ↓
이 함수만 오버라이드하면 모든 흐름에 검사 추가 가능
  ↓
SiHi 가 정확히 이 패턴 사용 (블랙/화이트/거래세)
```

### 6-3. virtual / internal / public

```
virtual:    자식이 오버라이드 가능
internal:   같은 컨트랙트 + 자식만 호출 가능
public:     누구나 호출 가능

OpenZeppelin 패턴:
  public  → 표준 인터페이스 (transfer, approve)
  internal → 내부 구현 (_update, _mint, _burn)
            → 자식이 커스터마이즈
```

---

## 7. payable / call / delegatecall

### 7-1. payable

```solidity
function buy() external payable {  // ← payable 필수
    // msg.value 로 ETH 받음
}
```

```
payable 안 붙으면:
  → ETH 받는 즉시 revert
  → 토큰 컨트랙트는 보통 ETH 받을 일 없음 (Uniswap 통해)

SiHi 는 payable 함수 없음
  → 직접 ETH 받지 않음
  → ETH 보내려고 시도하면 자동 거부
```

### 7-2. call / delegatecall / staticcall

| 종류 | storage | msg.sender | 용도 |
|------|---------|-----------|------|
| `call` | 호출되는 컨트랙트의 storage | 호출자 | 일반 외부 호출 |
| `delegatecall` | **호출자의 storage** | **원본 호출자** | 프록시 패턴 (업그레이드) |
| `staticcall` | 호출되는 컨트랙트 (read-only) | 호출자 | view 함수 호출 |

### 7-3. 위험한 패턴

```solidity
// 위험: 외부 컨트랙트 호출 결과 안 챙기기
(bool ok, ) = target.call("");
// ok 체크 안 하면 → 실패해도 진행 → 버그

// 안전:
(bool ok, ) = target.call("");
require(ok, "call failed");
```

```
delegatecall 의 위험:
  타인 코드가 내 storage 를 마음대로 수정 가능
  → 프록시 패턴 외에는 거의 사용 금지
```

---

## 8. EIP-1559 (현재 가스 모델)

### 8-1. 옛날 방식 (EIP-1559 이전)

```
사용자 → "20 gwei 낼게요" → 채굴자 마음대로 정렬
→ 가스 가격 경쟁 → 갑자기 올라감 (혼잡)
```

### 8-2. EIP-1559 이후 (현재)

```
총 가스비 = (base_fee + priority_fee) × gas_used

base_fee:
  네트워크가 자동 결정 (블록마다 변동)
  → 75% 는 소각 (deflationary)
  → 25% 는 채굴자/validator 에게

priority_fee (= tip):
  사용자가 채굴자에게 직접 주는 팁
  → 빨리 처리해달라는 인센티브
  
max_fee = 사용자가 낼 의향이 있는 최대값
실제 차감 = base_fee + priority_fee (보통 max_fee 보다 적음)
```

### 8-3. 코드에서

```typescript
// viem 으로 transfer 시
await sihi.write.transfer([alice, 100n], {
  maxFeePerGas: 50_000_000_000n,        // 50 gwei (최대 의향)
  maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei (팁)
});

// 명시 안 하면 viem 이 자동으로 적정 값 추정
```

### 8-4. 메인넷 시 절약 방법

```
1. 비혼잡 시간 노리기 (새벽, 주말)
2. priority_fee 를 1~2 gwei 로 (긴급 아니면)
3. max_fee 를 base_fee 보다 약간만 높게
4. 가스 추적: https://etherscan.io/gastracker
```

---

## 9. 자주 헷갈리는 함수

### 9-1. ETH 전송 — `transfer` vs `send` vs `call`

```solidity
// ❌ transfer (legacy, 2300 gas 고정)
payable(addr).transfer(amount);
// 2300 gas 부족하면 실패
// 가스 가격 변동 시 위험

// ❌ send (legacy, bool 반환)
bool ok = payable(addr).send(amount);
// transfer 와 거의 같음, ok 체크 필요

// ✓ call (현재 표준)
(bool ok, ) = payable(addr).call{value: amount}("");
require(ok, "ETH transfer failed");
```

### 9-2. 토큰 전송 — `transfer` vs `transferFrom`

```solidity
sihi.transfer(to, 100);
// → msg.sender 가 본인 토큰을 to 에게 보냄

sihi.transferFrom(from, to, 100);
// → from 이 미리 approve 한 사람 (msg.sender) 가
//   from 의 토큰을 to 에게 보냄
// → DEX, 자동 결제 패턴
```

### 9-3. 함수 가시성

```solidity
function a() public  { }   // 어디서든 호출 가능
function b() external { }  // 외부에서만 (this.b() 도 외부 취급)
function c() internal { }  // 같은 컨트랙트 + 자식
function d() private { }   // 같은 컨트랙트만
```

```
external vs public:
  external 이 약간 가스 효율 (calldata 직접 사용)
  public 은 internal 에서도 호출 가능 (this.x() 같은 형태)
  외부 전용이면 external 권장
```

---

## 10. 보안 패턴

### 10-1. Checks-Effects-Interactions

```solidity
// ❌ BAD: Reentrancy 가능
function withdraw() external {
    uint256 amount = balances[msg.sender];
    payable(msg.sender).call{value: amount}("");  // ← 외부 호출
    balances[msg.sender] = 0;                      // ← 상태 변경 (너무 늦음!)
}

// ✓ GOOD: Checks → Effects → Interactions
function withdraw() external {
    uint256 amount = balances[msg.sender];     // Checks
    require(amount > 0);
    
    balances[msg.sender] = 0;                  // Effects (먼저!)
    
    (bool ok, ) = payable(msg.sender).call{value: amount}("");  // Interactions
    require(ok);
}
```

### 10-2. Reentrancy Guard

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract X is ReentrancyGuard {
    function withdraw() external nonReentrant {
        // 외부 호출 도중 같은 함수 재진입 차단
    }
}
```

### 10-3. SiHi 의 보안 점검

| 패턴 | SiHi 적용 여부 |
|------|---------------|
| Checks-Effects-Interactions | ✓ (OpenZeppelin 내부) |
| Reentrancy Guard | △ (필요한 곳 없음, transfer 만) |
| Integer overflow | ✓ (Solidity 0.8+ 자동) |
| Access Control | ✓ (`onlyOwner`) |
| Pausable | ✓ |
| MAX_SUPPLY | ✓ (require 체크) |
| renounceOwnership 차단 | ✓ |
| Front-running | △ (approve race condition 주의) |

### 10-4. approve race condition

```
상황:
  alice → bob 에게 100 SHI approve (이미 됨)
  alice → bob 에게 50 SHI 으로 변경 시도
  
공격:
  bob 이 mempool 에서 alice 의 변경 트랜잭션 봄
  → 즉시 transferFrom(100) 실행 (가스 더 비싸게)
  → 변경 트랜잭션 처리됨 (50 으로)
  → bob 이 또 transferFrom(50) 실행
  → 결국 150 가져감 (의도는 50 이었는데)

해결:
  approve(0) 후 → approve(50)  (단계 분리)
  또는 increaseAllowance / decreaseAllowance 사용
```

---

## 11. 자주 쓰는 디버그 도구

### 11-1. console.log (Hardhat)

```solidity
import "hardhat/console.sol";

function transfer(...) {
    console.log("from:", msg.sender);
    console.log("to:", to);
    console.log("amount:", amount);
}
```

→ 테스트 실행 시 콘솔 출력 (메인넷에선 작동 X, 코드에서 제거 필수)

### 11-2. 가스 리포트

```bash
npx hardhat test --gas-report   # 일부 환경
```

→ 함수별 가스 사용량 표시

### 11-3. 정적 분석

```bash
# Slither (Python)
pip install slither-analyzer
slither contracts/SiHi.sol

# 출력 예:
#   - Reentrancy in withdraw() (HIGH)
#   - Unused state variable (LOW)
```

---

## 12. 핵심 요약

```
가스       → SSTORE 가 비쌈, 메모리 캐싱으로 절감
이벤트     → storage 아님, 로그 영역, indexed 만 검색 가능
스토리지   → 32바이트 슬롯, packing 활용
optimizer  → runs 높을수록 실행 가스 ↓
_update    → 모든 토큰 이동의 단일 진입점, 보안 검사 위치
EIP-1559   → base_fee + tip, 새벽이 저렴
보안       → CEI 패턴, ReentrancyGuard, approve race condition

→ 이게 ERC-20 운영자가 알아야 할 디테일의 80%
→ 나머지 20% 는 사고 대응 (다음 문서)
```

---

## 13. 더 깊이 파고 싶을 때

```
EVM 자체:
  - Ethereum Yellow Paper (정식 명세)
  - https://ethereum.org/en/developers/docs/evm/

가스 최적화:
  - Yul (Solidity 의 어셈블리)
  - SSTORE2 (대용량 저장)

보안:
  - SWC Registry: https://swcregistry.io/
  - Trail of Bits: building-secure-contracts

업그레이드 패턴:
  - UUPS / Transparent Proxy
  - OpenZeppelin Upgrades plugin
```

---

_작성: 2026-04-23 | 다음 문서: SIHI_INCIDENT_PLAYBOOK.md (사고 대응 + 테스트 시나리오)_
