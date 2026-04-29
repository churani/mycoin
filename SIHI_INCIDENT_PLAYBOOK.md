# SiHi — Incident Response Playbook

> 사고 대응 매뉴얼 + Sepolia 에서 실제 체험 가능한 11개 시나리오  
> 메인넷에서 사고 발생 시 즉시 참조

---

## 0. 비상 연락 / 첫 30초 액션

### 0-1. 사고 종류 식별

```
[ ] 본인 실수 (가스 부족, nonce 등)         → A 섹션
[ ] 누군가가 컨트랙트 공격 중                → B 섹션 (즉시 pause!)
[ ] owner 키 의심 (도난/유출)                → B-5
[ ] 가격 조작 / DEX 이상                     → B-7
```

### 0-2. 즉시 차단 명령 (가장 강력)

```bash
# 모든 transfer 정지 (1줄, 가장 빠름)
npx hardhat run scripts/ops/pause.ts --network mainnet -- pause
```

```
효과:
  ✓ 모든 transfer 즉시 차단 (mint, burn 도)
  ✓ Uniswap 풀 동작 정지 (스왑 불가)
  ✓ 추가 피해 방지
  ✗ 정상 사용자도 못 씀 → 빠른 원인 파악 필요
```

---

## A. 운영 사고 (5개)

---

## A-1. 가스 부족으로 트랜잭션 실패

### 상황

```
"Transaction reverted: out of gas"
"intrinsic gas too low"
```

### 원인

```
설정한 gasLimit < 실제 필요한 gas
  → EVM 이 중간에 멈춤
  → 가스는 소비됨 (환불 안 됨)
  → 트랜잭션은 실패 (상태 변경 X)
```

### Sepolia 에서 재현

```bash
# 의도적으로 gas 부족하게 호출
npx hardhat console --network sepolia
```

```typescript
const { viem } = await network.connect();
const sihi = await viem.getContractAt("SiHi", "0xC8151A...");

// gasLimit 너무 작게
await sihi.write.transfer(
  ["0xAlice...", 100n * 10n ** 18n],
  { gas: 21_000n }   // ← 의도적으로 부족
);
// → "out of gas" revert
```

### 즉시 대응

```typescript
// 1. 동일 트랜잭션 다시 시도 (gas 충분히)
await sihi.write.transfer(
  ["0xAlice...", 100n * 10n ** 18n],
  { gas: 100_000n }   // ← 넉넉하게
);

// 2. 또는 estimateGas 로 정확히
const estimated = await publicClient.estimateContractGas({
  address: sihi.address,
  abi: sihi.abi,
  functionName: "transfer",
  args: ["0xAlice...", 100n * 10n ** 18n],
});
const gasWithBuffer = (estimated * 120n) / 100n;  // 20% 여유
```

### 사후 분석 + 예방

```
- 모든 스크립트에 estimateGas 사용 (자동)
- viem/ethers 의 자동 추정 신뢰 (대부분 정확)
- 수동 설정 시 항상 20% 버퍼
```

---

## A-2. nonce 충돌 (pending 트랜잭션)

### 상황

```
"nonce too low"
"replacement transaction underpriced"

또는:
  지갑 트랜잭션이 한참 pending → 다음 트랜잭션 다 막힘
```

### 원인

```
이더리움 nonce = 지갑의 트랜잭션 순번 (0, 1, 2, ...)
  → 순서대로만 처리 가능
  → nonce=5 가 pending 이면 nonce=6, 7 모두 대기

원인:
  1. gas price 너무 낮음 → 채굴자가 안 집어감
  2. 동시에 여러 곳에서 트랜잭션 (스크립트 + MetaMask)
  3. 네트워크 혼잡
```

### Sepolia 에서 재현

```bash
# 1. 매우 낮은 gas price 로 트랜잭션 (영원히 pending)
```

```typescript
await sihi.write.transfer(
  ["0xAlice...", 100n],
  { maxFeePerGas: 1n, maxPriorityFeePerGas: 0n }   // 1 wei
);
// → 영원히 pending

// 2. 다른 트랜잭션 시도 → 막힘
await sihi.write.mint(["0xBob...", 1000n]);
// → "nonce too low" 또는 pending 큐에 추가
```

### 즉시 대응 — 가속 (Speedup)

```typescript
// 같은 nonce 로 더 비싼 gas 로 재전송
const stuckNonce = 42;  // pending 트랜잭션의 nonce

await sihi.write.transfer(
  ["0xAlice...", 100n],
  {
    nonce: stuckNonce,                       // ← 같은 nonce
    maxFeePerGas: 50_000_000_000n,           // 50 gwei (충분히 높게)
    maxPriorityFeePerGas: 5_000_000_000n,    // 5 gwei
  }
);
// → 채굴자가 새 것을 집음 → 기존 pending 자동 폐기
```

### 즉시 대응 — 취소 (Cancel)

```typescript
// 같은 nonce 로 자기 자신에게 0 ETH (= 빈 트랜잭션)
await walletClient.sendTransaction({
  to: walletClient.account.address,    // 자기 자신
  value: 0n,                            // 0 ETH
  nonce: stuckNonce,
  maxFeePerGas: 50_000_000_000n,
  maxPriorityFeePerGas: 5_000_000_000n,
});
// → "아무것도 안 함" 트랜잭션이 nonce 자리 차지
// → 뒤에 막혀있던 것들 풀림
```

### MetaMask 에서 (UI)

```
1. 활동 탭 → pending 트랜잭션 클릭
2. "가속" 또는 "취소" 버튼
3. 가스비 자동 상향 후 재전송
```

---

## A-3. 가스 가격 폭등 시 대처

### 상황

```
NFT 민팅 / 큰 이벤트 시:
  base_fee 가 갑자기 200~500 gwei
  평소 30 gwei → 10배 비싸짐
```

### Sepolia 에서 재현

```typescript
// 현재 gas price 확인
const gasPrice = await publicClient.getGasPrice();
console.log("현재 gas:", Number(gasPrice) / 1e9, "gwei");

const block = await publicClient.getBlock();
console.log("base fee:", Number(block.baseFeePerGas!) / 1e9, "gwei");
```

### 즉시 대응 전략

```
1. 긴급하지 않으면 → 대기
   etherscan.io/gastracker 모니터링
   30분 ~ 몇 시간 후 정상화

2. 긴급하면 → maxFee 상향
   maxFeePerGas: 500_000_000_000n (500 gwei)
   maxPriorityFeePerGas: 2_000_000_000n (2 gwei)
   → 처리됨, 비싸게

3. base_fee 자동 추적
   const block = await publicClient.getBlock();
   const next_base = (block.baseFeePerGas! * 112n) / 100n;  // 다음 블록 추정
   const maxFee = next_base * 2n;  // 2배 여유
```

### 자동 회피 스크립트

```typescript
async function waitForLowGas(maxGwei: number) {
  while (true) {
    const gasPrice = await publicClient.getGasPrice();
    const gwei = Number(gasPrice) / 1e9;
    if (gwei <= maxGwei) {
      console.log(`✓ gas ${gwei.toFixed(1)} gwei — 진행`);
      return;
    }
    console.log(`현재 ${gwei.toFixed(1)} gwei (${maxGwei} 이하 대기)`);
    await new Promise(r => setTimeout(r, 60000));  // 1분 대기
  }
}

await waitForLowGas(30);  // 30 gwei 이하일 때까지 대기
await sihi.write.transfer(...);
```

---

## A-4. Owner 키 분실

### 상황

```
배포자 지갑의 시드구문 / 개인키 분실
  → mint 불가
  → pause/unpause 불가
  → blacklist/whitelist 변경 불가
  → 컨트랙트는 살아있지만 운영 불가
```

### 예방 (사전 필수)

```
[ ] 시드구문 종이 백업 (금고)
[ ] 시드구문 별도 위치 백업 (집 + 회사)
[ ] 1Password / Bitwarden 같은 암호 관리자
[ ] 하드웨어 지갑 (Ledger / Trezor) 사용
[ ] Multisig (2-of-3) 로 단일 실패 지점 제거
```

### 사고 발생 시 (사실상 복구 불가)

```
시드구문 없으면:
  → 수학적으로 복구 불가 (이산로그 문제)
  → owner() 가 영구 잠김
  → totalSupply 변경 불가
  → 토큰 자체는 정상 유통 (transfer/burn OK)
  → mint 영구 비활성 → "캡 도달" 효과
  
→ 일부 프로젝트는 이걸 의도적으로 하기도 함 (탈중앙)
```

### 다중 백업 권장 패턴

```typescript
// 배포 직후 즉시 (testnet 에서):
// 1. 임시 배포자 → multisig 로 owner 이전
const multisig = "0xMultisigAddress";
await sihi.write.transferOwnership([multisig]);

// 2. multisig (Gnosis Safe 등) 가 mint, pause 등 결정
// 3. 단일 키 분실 시에도 안전
```

---

## A-5. Owner 키 유출

### 상황

```
시드구문 / 개인키가 유출됨:
  - 피싱 사이트에 입력
  - GitHub 에 실수 push
  - PC 해킹

→ 공격자가 owner 권한 행사 가능:
  - mint() 로 무한 발행 (MAX_SUPPLY 까지)
  - pause / unpause
  - 블랙리스트 무차별 추가
  - 전체 자산 이동
```

### 즉시 대응 (분 단위 결정)

```bash
# 1순위: 안전한 새 지갑 준비 (다른 PC, 새 시드구문)

# 2순위: 안전한 지갑으로 owner 이전 (공격자보다 먼저!)
npx hardhat run scripts/ops/transferOwner.ts \
  --network mainnet -- 0xNewSafeOwner
```

```typescript
// scripts/ops/transferOwner.ts
const sihi = await viem.getContractAt("SiHi", deployment.contractAddress);
await sihi.write.transferOwnership([newOwner]);
```

```
주의:
  ✗ 공격자가 먼저 transferOwnership 하면 영구 탈취
  ✗ renounceOwnership 하면 owner 영원히 잠김 (다행히 SiHi 는 차단됨)
  
→ 시드구문 유출 의심 즉시 → 1초라도 빨리 transferOwnership
→ 동시에 가스를 매우 높게 (priority fee 50+ gwei)
   공격자보다 빠른 처리 보장
```

### 사후 처리

```
1. 유출 경로 분석 (피싱? GitHub? 멀웨어?)
2. 공개 발표 (커뮤니티 신뢰)
3. Etherscan 에 컨트랙트 메타데이터 업데이트
   "Old owner deprecated, new owner: 0x..."
4. 보안 감사 재수행
```

---

## B. 보안 사고 (6개)

---

## B-6. 의심 주소 즉시 차단 (블랙리스트)

### 상황

```
특정 주소가 의심스러운 활동:
  - Phishing 사이트로 토큰 모아 옮김
  - 거래소 해킹 자금 입금
  - 스팸 / 봇 활동
```

### Sepolia 에서 재현

```typescript
// 1. alice 가 토큰 받음
await sihi.write.transfer([alice.address, 1000n * 10n ** 18n]);

// 2. owner 가 alice 블랙리스트 등록
await sihi.write.addToBlacklist([alice.address]);

// 3. alice 가 토큰 이동 시도 → revert
try {
  await sihi.write.transfer(
    [bob.address, 100n],
    { account: alice.account }
  );
} catch (e) {
  console.log("✓ 차단됨:", e.message);
  // "SiHi: sender is blacklisted"
}

// 4. 다른 사람이 alice 에게 보내는 것도 차단
try {
  await sihi.write.transfer([alice.address, 100n]);
} catch (e) {
  console.log("✓ 받기도 차단됨:", e.message);
  // "SiHi: recipient is blacklisted"
}
```

### 즉시 대응

```bash
# 단일 주소
npx hardhat run scripts/ops/blacklist.ts \
  --network mainnet -- add 0xSuspicious

# 다중 주소 (필요 시 batch 함수 추가 권장)
```

### 사후 분석

```
- 블랙리스트 사유 기록 (DB / 사내 위키)
- Etherscan 의 컨트랙트 페이지에 사유 공개
- 오탐 시 빠른 해제: removeFromBlacklist
```

---

## B-7. pause() 비상 정지

### 상황

```
다음 중 하나라도 발생:
  - 컨트랙트 버그 발견 (가격 조작, 무한 mint 등)
  - DEX 풀 가격 이상 (대량 매도/매수)
  - owner 키 유출 의심
  - 시스템 점검 필요
```

### Sepolia 에서 재현

```typescript
// 1. 정상 transfer 가능
await sihi.write.transfer([alice.address, 100n]);  // OK

// 2. owner 가 pause
await sihi.write.pause();
console.log("paused:", await sihi.read.paused());  // true

// 3. 누구나 transfer 시도 → revert
try {
  await sihi.write.transfer([alice.address, 100n]);
} catch (e) {
  console.log("✓ 정지됨:", e.message);
  // "EnforcedPause" (OpenZeppelin)
}

// 4. mint, burn 도 모두 정지
//    (모두 _update 통과 → ERC20Pausable 차단)

// 5. 정상화 후 unpause
await sihi.write.unpause();
console.log("paused:", await sihi.read.paused());  // false
```

### 즉시 대응

```bash
# 1초라도 빠르게
npx hardhat run scripts/ops/pause.ts --network mainnet -- pause
```

### pause 영향

```
정지되는 것:
  ✓ transfer / transferFrom
  ✓ mint / burn
  ✓ Uniswap 풀 동작 (스왑 불가)

정지 안 되는 것:
  - approve (출금 권한 부여만, 실제 이동 X)
  - 읽기 함수 (balanceOf, totalSupply)
  - 블랙리스트 / 화이트리스트 변경 (owner)
  - pause / unpause (owner)
```

### 정상화 절차

```
1. 원인 파악 (코드 분석, 로그 검토)
2. 픽스 결정 (코드 수정 가능? 운영 변경만?)
3. 커뮤니티 공지 (트위터, 디스코드)
4. 픽스 적용
5. unpause
6. 사후 보고서 작성
```

---

## B-8. mint 권한 탈취 시 — MAX_SUPPLY 효과

### 상황

```
공격자가 owner 키 탈취:
  → mint(공격자_주소, 무한대) 시도

SiHi 의 방어:
  require(totalSupply() + amount <= MAX_SUPPLY, "...");
  → MAX_SUPPLY (2,000,000) 까지만 발행 가능
  → 무한 발행 차단
```

### Sepolia 에서 재현 (공격 시뮬레이션)

```typescript
// 1. 공격자가 owner 키 가졌다고 가정
//    이미 INITIAL_SUPPLY (1,000,000) 발행됨
//    → MAX_SUPPLY 까지 1,000,000 더 가능

// 2. 공격자가 자기 주소로 mint
const attackAmount = 1_000_000n * 10n ** 18n;
await sihi.write.mint([attacker.address, attackAmount]);
// → 성공, attacker 가 1M SHI 보유

// 3. 또 mint 시도 → 차단!
try {
  await sihi.write.mint([attacker.address, 1n]);
} catch (e) {
  console.log("✓ MAX_SUPPLY 차단:", e.message);
  // "SiHi: MAX_SUPPLY exceeded"
}

// 4. 피해 한도: MAX_SUPPLY - INITIAL_SUPPLY = 1M SHI
//    무한 발행 시 (제한 없으면) → 모든 가치 0
//    제한 있으면 → 시장 충격은 있지만 한정적
```

### 사후 대응

```
- 즉시 owner 이전 (A-5 참조)
- Uniswap 풀에 발생한 매도 압력 분석
- 거래소에 토큰 보내기 차단 요청
- 블랙리스트로 공격자 주소 즉시 차단
```

### 학습 포인트

```
MAX_SUPPLY 가 단순한 숫자 같지만
사실은 "공격 피해의 상한선"
→ 신중하게 결정 (너무 작으면 운영 제약, 너무 크면 무방어)
```

---

## B-9. Reentrancy 공격 시뮬레이션

### 공격 원리

```
A 컨트랙트의 withdraw() 가:
  1. ETH 전송  (call 호출)
  2. 잔액 차감

악성 B 컨트랙트가 ETH 받자마자 (1번 끝나기 전)
  → 다시 A.withdraw() 호출
  → 잔액 차감 안 됐으니 또 인출 가능
  → 반복 → 자금 모두 탈취
```

### SiHi 의 노출 여부

```
SiHi 는 ETH 받지 않음 (payable 함수 없음)
  → ETH reentrancy 위험 X

ERC-20 reentrancy:
  OpenZeppelin ERC-20 의 _update 가 CEI 패턴 준수
  → state 변경 후 emit Transfer (외부 호출 X)
  → reentrancy 위험 X

  단, 외부 컨트랙트와 상호작용 시 (예: hook):
    위험 가능성 있음
```

### Sepolia 에서 재현 (학습용)

```solidity
// VulnerableBank.sol (의도적 취약점)
contract VulnerableBank {
    mapping(address => uint256) public balances;
    
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        // ❌ 외부 호출 먼저
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        // ❌ 상태 변경 나중
        balances[msg.sender] = 0;
    }
}

// Attacker.sol
contract Attacker {
    VulnerableBank bank;
    
    constructor(address _bank) {
        bank = VulnerableBank(_bank);
    }
    
    function attack() external payable {
        bank.deposit{value: msg.value}();
        bank.withdraw();
    }
    
    receive() external payable {
        // ETH 받는 순간 다시 withdraw 호출
        if (address(bank).balance >= msg.value) {
            bank.withdraw();   // ← 재진입!
        }
    }
}
```

### 방어 패턴

```solidity
// 1. CEI (Checks-Effects-Interactions)
function withdraw() external {
    uint256 amount = balances[msg.sender];   // Checks
    balances[msg.sender] = 0;                 // Effects (먼저!)
    (bool ok, ) = msg.sender.call{value: amount}("");  // Interactions
    require(ok);
}

// 2. ReentrancyGuard
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Bank is ReentrancyGuard {
    function withdraw() external nonReentrant { ... }
}
```

---

## B-10. Front-running 시뮬레이션

### 공격 원리

```
공격자가 멤풀 (mempool, 미확정 트랜잭션 대기열) 모니터링
  → 큰 거래 발견
  → 같은 거래를 더 비싼 gas 로 먼저 실행
  → 가격 변동 후 자기 거래로 차익
```

### Sepolia 에서 재현 (DEX 슬리피지 공격)

```
시나리오:
  alice 가 Uniswap 에서 1 ETH → 1,000,000 SHI 매수 시도
  슬리피지 5% 허용 (최소 950,000 SHI)
  
공격자가 mempool 에서 봄:
  1. 공격자가 먼저 1 ETH → 1,000,000 SHI 매수 (가격 ↑)
  2. alice 의 거래 처리 (가격 더 ↑, alice 는 950,000 받음)
  3. 공격자 매도 (가격 ↓ 되기 전 빠짐, 차익 챙김)
```

### 우리 SiHi 코드 안의 front-running 위험

```
approve race condition (앞 SIHI_DEEP_DIVE 10-4 참조):
  alice → bob 100 SHI approve (이미)
  alice → bob 50 SHI 변경 시도
  bob 이 mempool 보고 100 transferFrom + 50 transferFrom = 150 가져감
  
방어:
  approve(0) → approve(50)  (단계 분리)
  또는 increaseAllowance / decreaseAllowance
```

### Sepolia 에서 직접 체험

```typescript
// 1. owner → bob 에게 100 SHI approve
await sihi.write.approve([bob.address, 100n * 10n ** 18n]);

// 2. owner 가 50 으로 줄이려고 함 (mempool 에 보냄)
const txPromise = sihi.write.approve([bob.address, 50n * 10n ** 18n]);

// 3. bob 이 mempool 모니터링 → 즉시 transferFrom(100)
await sihi.write.transferFrom(
  [owner.address, bob.address, 100n * 10n ** 18n],
  { account: bob.account, gas: 200000n }   // 가스 더 높게
);

// 4. owner 의 approve(50) 처리됨
await txPromise;

// 5. bob 또 transferFrom(50)
await sihi.write.transferFrom(
  [owner.address, bob.address, 50n * 10n ** 18n],
  { account: bob.account }
);

// 결과: owner 에서 150 SHI 빠져나감 (의도는 50 + 기존 100)
```

### 메인넷 방어

```
1. approve 변경 시 항상 0 먼저 → 새 값
2. Flashbots / MEV-Boost 사용 (private mempool)
3. Permit (EIP-2612) — 서명 기반, mempool 노출 X
```

---

## B-11. Approval 무한대 + drain 공격

### 공격 원리

```
악성 DApp 이 사용자에게 다음을 요청:
  approve(악성_컨트랙트, 2^256-1)   ← 무한대
  
사용자가 무심코 승인하면:
  악성_컨트랙트 가 언제든 transferFrom 으로
  사용자의 모든 토큰 인출 가능
```

### Sepolia 에서 재현

```typescript
// 1. alice 가 악성 DApp 에 무한 approve
const MAX = 2n ** 256n - 1n;
await sihi.write.approve(
  [malicious.address, MAX],
  { account: alice.account }
);

// 2. 악성 컨트랙트가 alice 잔액 모두 인출
const aliceBalance = await sihi.read.balanceOf([alice.address]);
await sihi.write.transferFrom(
  [alice.address, attacker.address, aliceBalance],
  { account: malicious.account }
);
console.log("✓ alice 잔액 모두 탈취:", aliceBalance);
```

### 방어 (사용자 측)

```typescript
// ❌ 위험: 무한 approve
await sihi.write.approve([dapp, MAX]);

// ✓ 안전: 필요한 양만
await sihi.write.approve([dapp, 100n * 10n ** 18n]);

// ✓ 더 안전: 사용 후 즉시 0 으로 회수
await sihi.write.approve([dapp, 0n]);
```

### 정기 점검 도구

```
revoke.cash → 본인이 어떤 컨트랙트에 approve 했는지 확인
            → 의심스러운 approve 즉시 revoke

Etherscan → "Token Approvals" 페이지
```

### 컨트랙트 측 대응 (선택)

```solidity
// 무한 approve 차단 (강력하지만 UX 안 좋음)
function approve(address spender, uint256 amount) public override returns (bool) {
    require(amount < type(uint128).max, "Approve too large");
    return super.approve(spender, amount);
}
```

---

## C. 사고 후 공통 절차

### C-1. 즉시 (사고 발생 ~ 1시간)

```
[ ] pause() 또는 즉각적 차단
[ ] 팀 비상 소집
[ ] 1차 원인 파악
[ ] 트위터 / 디스코드 공지 (간단히)
   "사고 인지, 조사 중. 자금 안전. 추가 공지 예정."
```

### C-2. 단기 (1시간 ~ 24시간)

```
[ ] 정확한 원인 분석
[ ] 피해 규모 산정
[ ] 픽스 방안 결정
[ ] 상세 공지 (timeline 포함)
[ ] 거래소 / DEX 협력 요청 (필요 시)
```

### C-3. 중기 (1일 ~ 1주)

```
[ ] 픽스 구현 + 테스트
[ ] 외부 감사 (재발 방지)
[ ] 사후 보고서 작성 (post-mortem)
[ ] 보상 정책 (피해자 있는 경우)
```

### C-4. 장기

```
[ ] 보안 강화 (multisig, 정기 감사)
[ ] 모니터링 자동화 (이상 거래 알림)
[ ] 사고 기록 / 매뉴얼 업데이트
```

---

## D. 모니터링 자동화 권장

### D-1. 실시간 알림 (텔레그램/슬랙 봇)

```typescript
// 큰 transfer 감지 시 알림
publicClient.watchContractEvent({
  address: sihi.address,
  abi: sihi.abi,
  eventName: "Transfer",
  onLogs: (logs) => {
    logs.forEach(async (log) => {
      const value = log.args.value!;
      if (value > 100_000n * 10n ** 18n) {  // 100,000 SHI 이상
        await sendTelegramAlert(
          `🚨 큰 전송: ${formatEther(value)} SHI\n` +
          `  from: ${log.args.from}\n` +
          `  to: ${log.args.to}\n` +
          `  tx: ${log.transactionHash}`
        );
      }
    });
  },
});
```

### D-2. owner 활동 감지

```typescript
publicClient.watchContractEvent({
  address: sihi.address,
  abi: sihi.abi,
  eventName: "OwnershipTransferred",
  onLogs: () => sendTelegramAlert("⚠️  ownership transferred!"),
});

publicClient.watchContractEvent({
  address: sihi.address,
  abi: sihi.abi,
  eventName: "Paused",
  onLogs: () => sendTelegramAlert("⚠️  contract paused!"),
});
```

### D-3. Tenderly / OpenZeppelin Defender (외부 도구)

```
- 트랜잭션 실시간 모니터링
- 함수 호출 패턴 이상 감지
- 자동 대응 (조건 충족 시 pause)
- 멀티시그 통합

권장: 메인넷 배포 시 Defender 가입
```

---

## E. 테스트 시나리오 체크리스트 (Sepolia 에서 직접)

```
A. 운영 사고
[ ] A-1 가스 부족 재현 → estimateGas 로 해결
[ ] A-2 nonce 충돌 재현 → 가속 + 취소 둘 다 체험
[ ] A-3 가스 가격 변동 모니터링 + 자동 대기
[ ] A-4 (실행 X) — owner 백업 절차 정리
[ ] A-5 transferOwnership 으로 owner 이전 체험

B. 보안 사고
[ ] B-6 블랙리스트 add → transfer 차단 확인
[ ] B-7 pause → 모든 동작 정지 확인 → unpause
[ ] B-8 mint MAX_SUPPLY 초과 시도 → revert 확인
[ ] B-9 (선택) VulnerableBank + Attacker 배포 → reentrancy
[ ] B-10 approve race 재현 → 회수 시 0 먼저 패턴
[ ] B-11 무한 approve → drain 공격 → revoke.cash 사용

→ 모두 체험하면 메인넷에서 어떤 일이 일어나도 침착하게 대응 가능
```

---

## 핵심 마인드셋

```
1. "사고는 일어난다" 가정하고 준비
2. pause() 가 가장 강력한 카드 — 망설이지 말고 사용
3. 5초 망설임 = 수십~수백만 달러 차이
4. 멀티시그 + 모니터링 = 안전 2배
5. 매뉴얼 없으면 사고 시 panic — 반드시 사전 작성

→ 이 문서가 그 매뉴얼 역할
```

---

_작성: 2026-04-23 | 마지막 문서 (4/4)_
