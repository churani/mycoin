# SiHi (SHI) Token

> ERC-20 기반 커스텀 토큰 컨트랙트 — Hardhat 3 + viem + TypeScript  
> 표준 ERC-20 + Burnable + Pausable + Mintable + Blacklist + Whitelist + Burn Fee

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity 0.8.28](https://img.shields.io/badge/Solidity-0.8.28-blue)](https://soliditylang.org/)
[![Hardhat 3](https://img.shields.io/badge/Hardhat-3.4-yellow)](https://hardhat.org/)
[![viem](https://img.shields.io/badge/viem-2.x-green)](https://viem.sh/)
[![Network](https://img.shields.io/badge/Network-Sepolia%20Verified-success)](https://sepolia.etherscan.io/)

---

## ✨ 핵심 기능

| 카테고리 | 기능 |
|---------|------|
| **표준 ERC-20** | `transfer`, `approve`, `transferFrom`, `balanceOf` |
| **소각 (Burnable)** | 누구나 자기 토큰 소각 가능 |
| **일시정지 (Pausable)** | owner 가 비상 시 모든 전송 정지 |
| **추가 발행 (Mintable)** | owner 만 가능 + `MAX_SUPPLY` 상한 |
| **블랙리스트** | 의심 주소 차단 (sender/recipient 양쪽) |
| **화이트리스트** | 옵션 활성화 시 허용 주소만 거래 가능 |
| **거래세 소각** | `burnFeeRate` 만큼 자동 소각 (basis points) |
| **renounce 차단** | owner 권한 영구 포기 비활성화 (실수/사고 방지) |

---

## 📊 토큰 사양

| 항목 | 값 |
|------|-----|
| 이름 (name) | `SiHi` |
| 심볼 (symbol) | `SHI` |
| decimals | `18` |
| 초기 발행 (`INITIAL_SUPPLY`) | `1,000,000 SHI` |
| 최대 발행 (`MAX_SUPPLY`) | `2,000,000 SHI` |
| 컴파일러 | Solidity `^0.8.28` |
| 표준 라이브러리 | OpenZeppelin Contracts 5.x |

---

## 🚀 빠른 시작

### 사전 준비

- Node.js `>= 22.10.0` (Hardhat 3 요구사항)
- npm `>= 10`

### 설치

```bash
git clone https://github.com/<your-username>/mycoin.git
cd mycoin
npm install
```

### 컴파일 + 테스트

```bash
# 컴파일
npx hardhat compile

# 전체 테스트 (24+ 케이스)
npx hardhat test

# Solidity 만 / TypeScript 만 분리 실행
npx hardhat test solidity
npx hardhat test nodejs
```

### 환경 변수 설정 (Sepolia 배포 시)

Hardhat 3 의 keystore 사용 (안전, 평문 저장 X):

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY
```

### Sepolia 배포

```bash
# Ignition 모듈로 배포
npx hardhat ignition deploy ignition/modules/SiHi.ts --network sepolia

# Etherscan 소스 검증
npx hardhat verify --network sepolia <contractAddress> <ownerAddress>
```

---

## 📍 Sepolia 배포 정보

| 항목 | 값 |
|------|-----|
| 컨트랙트 주소 | [`0xC8151A30b30d69ab5330d09c26d538ef6Be10c17`](https://sepolia.etherscan.io/address/0xc8151a30b30d69ab5330d09c26d538ef6be10c17) |
| 검증 상태 | ✓ Verified |
| Owner | `0x18554351b6Ec3483AD540B7dC0f939170366f8B2` |
| Uniswap V3 풀 | WETH / SHI (0.3%) — Full Range |

> **주의**: Sepolia 는 테스트넷입니다. SHI 는 실제 가치가 없습니다.

---

## 📂 디렉토리 구조

```
mycoin/
├── contracts/
│   ├── SiHi.sol                    메인 컨트랙트 (조립)
│   ├── base/
│   │   └── SiHiBase.sol            ERC20 + Burnable + Pausable + Ownable
│   └── features/
│       ├── SiHiGovernance.sol      mint + 블랙/화이트 + 거래세
│       └── SiHiBlacklist.sol       블랙리스트 모듈
├── test/
│   └── SiHi.ts                     viem 기반 테스트 (24+ 케이스)
├── ignition/
│   └── modules/
│       └── SiHi.ts                 Ignition 배포 모듈
├── scripts/
│   └── send-op-tx.ts               (Hardhat 3 기본 예제)
├── deployments/
│   └── sepolia.json                Sepolia 배포 정보 (자동 생성)
├── hardhat.config.ts               Hardhat 설정
├── package.json
├── tsconfig.json
│
├── README.md                       이 문서
├── SIHI_DEPLOYMENT.md              배포 회고 + 메인넷 재현 가이드
├── SIHI_AUTOMATION.md              자동화 스크립트 가이드
├── SIHI_DEEP_DIVE.md               EVM/가스/이벤트/스토리지 디테일
└── SIHI_INCIDENT_PLAYBOOK.md       사고 대응 + 11개 시나리오
```

---

## 📚 운영 문서

운영자가 알아야 할 모든 것 — **이 4개 문서가 핵심 가치**:

| 문서 | 내용 |
|------|------|
| [`SIHI_DEPLOYMENT.md`](./SIHI_DEPLOYMENT.md) | 배포 정보 / 환경 설정 / 메인넷 재현 가이드 |
| [`SIHI_AUTOMATION.md`](./SIHI_AUTOMATION.md) | Hardhat 스크립트로 배포 → 풀 생성 → 유동성 자동화 |
| [`SIHI_DEEP_DIVE.md`](./SIHI_DEEP_DIVE.md) | EVM 가스, 이벤트, 스토리지 슬롯, 다중상속 등 디테일 |
| [`SIHI_INCIDENT_PLAYBOOK.md`](./SIHI_INCIDENT_PLAYBOOK.md) | 사고 발생 시 대응 + Sepolia 에서 체험 가능한 11개 시나리오 |

---

## 🛡️ 보안 디자인

### 권한 모델

```
Owner (단일 EOA 또는 Multisig)
  ├─ mint(to, amount)        — MAX_SUPPLY 상한
  ├─ pause() / unpause()     — 비상 정지
  ├─ blacklist(addr)         — 의심 주소 차단
  ├─ whitelist 관리          — 화이트리스트 모드
  ├─ setBurnFeeRate(bps)     — 거래세 변경
  └─ transferOwnership(addr) — 소유권 이전
                ↓
                renounceOwnership() ← 차단됨 (영구 잠김 방지)
```

### 적용된 보안 패턴

- ✓ Checks-Effects-Interactions (OpenZeppelin 내부)
- ✓ Integer overflow 자동 방어 (Solidity 0.8+)
- ✓ Access Control (`onlyOwner`)
- ✓ MAX_SUPPLY 강제 (무한 발행 방지)
- ✓ Pausable 비상 정지
- ✓ renounceOwnership 차단
- ✓ 모든 전송은 `_update` 단일 진입점 통과 (블랙/화이트/거래세 검사)

자세한 분석은 [SIHI_INCIDENT_PLAYBOOK.md](./SIHI_INCIDENT_PLAYBOOK.md) 참조.

---

## 🔬 테스트

```bash
# 전체 테스트
npx hardhat test

# 특정 describe
npx hardhat test --grep "blacklist"
```

**테스트 커버리지**:

- 배포 + 메타데이터 (name/symbol/decimals/supply)
- transfer / approve / transferFrom (정상 + revert)
- burn (자기 토큰 + 잔액 초과 revert)
- mint (owner 만 + MAX_SUPPLY 검증)
- pause / unpause (정지 시 transfer 차단)
- ownership (renounce 차단 + transferOwnership)
- 블랙리스트 / 화이트리스트 / 거래세 — 추가 진행 중

---

## 🗺 로드맵

- [x] Hardhat 3 + viem 환경 셋업
- [x] SiHi 컨트랙트 (모듈화 + 다양한 기능)
- [x] 24+ 테스트 케이스
- [x] Sepolia 배포
- [x] Etherscan 소스 검증
- [x] MetaMask 토큰 등록
- [x] Uniswap V3 풀 생성 + 유동성 공급/회수
- [x] 운영 문서 4종 작성
- [ ] 배포 / 풀 자동화 스크립트
- [ ] 사고 대응 시나리오 Sepolia 실증
- [ ] 외부 보안 감사 (선택)
- [ ] 메인넷 배포

---

## 🔗 관련 프로젝트

이 프로젝트는 더 큰 학습 트랙의 일부입니다:

- **statble** — 블록체인 암호화를 C 로 바닥부터 구현
  - SHA-256, PBKDF2, secp256k1, ECDSA, Keccak-256, RLP
  - BIP-39 / BIP-32 마스터 키 생성
  - 모든 결과 Python 표준 라이브러리와 일치 검증

> Solidity 한 줄 (`transfer()`) 뒤에 어떤 수학과 비트 연산이 일어나는지  
> 이해하고 작성하는 것과 그렇지 않은 것의 차이.

---

## 📜 라이선스

[MIT License](./LICENSE) — 자유롭게 사용 / 수정 / 재배포 가능.

OpenZeppelin Contracts 도 MIT 이라 호환.

---

## 👤 작성자

**churani**

- GitHub: [@<your-username>](https://github.com/<your-username>)
- Email: churani.sj@gmail.com

---

## 🙏 참고 자료

- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat 3 Docs](https://hardhat.org/)
- [viem](https://viem.sh/)
- [EIP-20: ERC-20 Token Standard](https://eips.ethereum.org/EIPS/eip-20)
- [Uniswap V3](https://docs.uniswap.org/contracts/v3/overview)

---

_마지막 업데이트: 2026-04-23_
