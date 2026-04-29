# SiHi (SHI) Token — Deployment Record

> Sepolia 테스트넷 배포 기록 + 메인넷 재현 가이드  
> 작성일: 2026-04-23

---

## 1. 토큰 사양

| 항목 | 값 |
|------|-----|
| 이름 (name) | `SiHi` |
| 심볼 (symbol) | `SHI` |
| decimals | `18` |
| 초기 발행 (INITIAL_SUPPLY) | `1,000,000 SHI` |
| 최대 발행 (MAX_SUPPLY) | `2,000,000 SHI` |
| 표준 | ERC-20 + Burnable + Pausable + Ownable |
| 추가 기능 | 블랙리스트 / 화이트리스트 / 거래세 소각 |
| 컴파일러 | Solidity `^0.8.28` |
| 라이선스 | MIT |

---

## 2. 컨트랙트 구조

```
contracts/
├── SiHi.sol                   ← 메인 컨트랙트 (조립)
├── base/
│   └── SiHiBase.sol           ← ERC20 + Burnable + Pausable + Ownable
└── features/
    └── SiHiGovernance.sol     ← mint / 블랙리스트 / 화이트리스트 / 거래세
```

### 기능별 책임

| 모듈 | 책임 |
|------|------|
| `SiHiBase` | ERC-20 표준 + 정지 + 소유권 + renounce 차단 |
| `SiHiGovernance` | mint(MAX_SUPPLY 체크) / 블랙리스트 / 화이트리스트 / burnFeeRate |
| `SiHi` (메인) | `_update()` 오버라이드 → 모든 전송 시 블랙/화이트/거래세 적용 |

---

## 3. Sepolia 배포 정보

> **TODO**: 실제 값으로 채우기

| 항목 | 값 |
|------|-----|
| 컨트랙트 주소 | `0xC8151A30b30d69ab5330d09c26d538ef6Be10c17` |
| 배포 트랜잭션 | `0xabf0ecdceedf152dc7cf75e590254e16746862f5d57dee67e59e4b3d6a6b9e31` |
| 배포 블록 | `10732695` |
| 배포 가스 사용량 | `0.055192425 gas` |
| Etherscan 링크 | `https://sepolia.etherscan.io/address/0xc8151a30b30d69ab5330d09c26d538ef6be10c17` |
| 검증 상태 | ✓ Verified |
| Owner 주소 | `0x18554351b6Ec3483AD540B7dC0f939170366f8B2` |

---

## 4. 환경 설정 (Hardhat 3 + viem)

### 필요한 keystore 변수

```bash
# RPC URL (Alchemy / Infura) 
npx hardhat keystore set SEPOLIA_RPC_URL

# 배포자 개인키 (테스트용 — 메인넷에선 별도 지갑)
npx hardhat keystore set SEPOLIA_PRIVATE_KEY

# Etherscan 검증용 API 키
npx hardhat keystore set ETHERSCAN_API_KEY
```

### hardhat.config.ts 의 networks 섹션

```typescript
sepolia: {
  type: "http",
  chainType: "l1",
  url: configVariable("SEPOLIA_RPC_URL"),
  accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
}
```

---

## 5. 배포 절차 (재현 가능)

### 5-1. 컴파일 + 테스트 (로컬)

```bash
cd /var/www/statble/mycoin

# 컴파일
npx hardhat compile

# 전체 테스트 (24개 케이스)
npx hardhat test
```

### 5-2. Sepolia 배포

```bash
# Ignition 모듈로 배포 (선언적)
npx hardhat ignition deploy ignition/modules/SiHi.ts \
  --network sepolia

# 또는 스크립트 직접 실행
npx hardhat run scripts/deploy.ts --network sepolia
```

### 5-3. Etherscan 소스 검증

```bash
npx hardhat verify --network sepolia \
  0xYourContractAddress \
  "0xInitialOwnerAddress"
```

### 5-4. MetaMask 토큰 등록

```
1. MetaMask → Sepolia 네트워크 선택
2. "Import Tokens" 클릭
3. 컨트랙트 주소 입력
4. SiHi (SHI) 자동 인식
5. 잔액 1,000,000 표시 확인
```

---

## 6. Uniswap V3 풀 정보

> **TODO**: 실제 값으로 채우기

| 항목 | 값 |
|------|-----|
| 풀 주소 | `0x18554351b6Ec3483AD540B7dC0f939170366f8B2` |
| 페어 | WETH / SHI |
| 수수료 등급 | 0.3% (3000) |
| 가격 범위 | Full Range |
| 초기 유동성 | `100,000 SHI + 0.05 WETH` |
| Position NFT ID | `____` |
| 풀 생성 트랜잭션 | `0x5c445835f4978984acabc58a5ae48e82929f3d16dc17efa883d53154fe584bd2` |

### Sepolia Uniswap V3 컨트랙트

```
UniswapV3Factory:               0x0227628f3F023bb0B980b67D528571c95c6DaC1c
NonfungiblePositionManager:     0x1238536071E1c677A632429e3655c799b22cDA52
SwapRouter02:                   0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
WETH9 (Sepolia):                0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
```

### 풀 생성 절차 (UI)

```
1. https://app.uniswap.org → MetaMask 연결 → Sepolia 선택
2. Pool → "+ New Position"
3. WETH + SHI 선택 (SHI 는 컨트랙트 주소로 import)
4. 수수료 0.3% 선택
5. Full Range 선택
6. 토큰 양 입력
7. Approve (3개 트랜잭션):
   - WETH approve
   - SHI approve
   - Mint Position
```

---

## 7. 가스 비용 (실측 vs 추정)

| 작업 | Sepolia 실측 | 메인넷 추정 (50 gwei 기준) |
|------|-------------|---------------------------|
| 컨트랙트 배포 | _____ gas | ~$60 |
| Etherscan 검증 | 무료 | 무료 |
| ETH → WETH wrap | ~50,000 gas | ~$5 |
| Uniswap Pool 생성 | ~3,000,000 gas | ~$300 |
| Position Mint | ~700,000 gas | ~$70 |
| 일반 transfer | ~50,000 gas | ~$5 |
| **메인넷 총비용 추정** | — | **~$500 + 유동성** |

> 가스 가격은 https://etherscan.io/gastracker 에서 실시간 확인  
> 새벽/주말이 가장 저렴 (보통 15~25 gwei)

---

## 8. 백업 / 비상 자료

### 8-1. 키 백업 위치

```
[ ] 배포자 개인키 (시드구문)
    위치: ____________________
    백업 매체: ____________________

[ ] Owner 권한 다중 백업
    1순위: ____________________
    2순위: ____________________
```

### 8-2. 컨트랙트 ABI 보관

```
artifacts/contracts/SiHi.sol/SiHi.json   ← Hardhat 자동 생성
→ 별도 위치 백업 권장 (DApp 연동 시 필요)
```

### 8-3. 백서 / 토큰 이코노믹스 문서

```
[ ] 백서 위치: ____________________
[ ] 분배 계획: ____________________
[ ] 베스팅 일정: ____________________
```

---

## 9. 메인넷 배포 체크리스트

배포 직전 검증 필수:

```
[ ] 컨트랙트 코드 100% 확정 (수정 불가)
[ ] 모든 테스트 통과 (npx hardhat test)
[ ] Slither 정적 분석 통과 (선택)
[ ] 외부 감사 완료 (선택, $5k~$50k)
[ ] Sepolia 에서 동일 코드 정상 동작 확인
[ ] 배포자 지갑에 ETH 충분 (최소 0.5 ETH 권장)
[ ] 가스 가격 확인 (30 gwei 이하 권장)
[ ] 키 백업 안전 보관
[ ] 비상 연락 채널 준비
```

---

## 10. 운영 변수 — 현재 상태 (Sepolia)

> **TODO**: 실제 값으로 채우기

| 변수 | 현재 값 | 변경 명령 |
|------|--------|----------|
| `paused()` | `false` | `pause()` / `unpause()` |
| `burnFeeRate` | `0` (0%) | `setBurnFeeRate(uint256)` |
| `whitelistEnabled` | `false` | `setWhitelistEnabled(bool)` |
| 블랙리스트 항목 수 | `0` | `addToBlacklist(address)` |
| 화이트리스트 항목 수 | `0` | `addToWhitelist(address)` |
| `totalSupply()` | `1,000,000 SHI` | `mint()` / `burn()` |
| `owner()` | `0x...` | `transferOwnership(address)` |

---

## 11. 향후 작업 추적

| 단계 | 상태 | 비고 |
|------|------|------|
| Sepolia 배포 | ✓ | |
| Etherscan 검증 | ✓ | |
| MetaMask 등록 | ✓ | |
| Uniswap 풀 생성 | ✓ | |
| 코드 자동화 (Hardhat 스크립트) | ☐ | 다음 작업 |
| 깊이 학습 리뷰 | ☐ | SIHI_DEEP_DIVE.md |
| 사고 대응 시나리오 | ☐ | SIHI_INCIDENT_PLAYBOOK.md |
| 외부 감사 | ☐ | 선택 |
| 메인넷 배포 | ☐ | 결정 후 |

---

## 12. 참고 링크

```
이 프로젝트:
  - 코드: /var/www/statble/mycoin/
  - 학습 자료: /var/www/statble/

Sepolia 도구:
  - Faucet: https://www.alchemy.com/faucets/ethereum-sepolia
  - Etherscan: https://sepolia.etherscan.io/
  - Uniswap: https://app.uniswap.org (Sepolia 선택)

이더리움 표준:
  - EIP-20: https://eips.ethereum.org/EIPS/eip-20
  - OpenZeppelin: https://docs.openzeppelin.com/contracts/

Uniswap V3:
  - Docs: https://docs.uniswap.org/contracts/v3/overview
```

---

_작성: 2026-04-23 | 다음 업데이트: 메인넷 배포 시_
