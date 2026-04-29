# SiHi (SHI) — Automation Scripts

> Hardhat 3 + viem 기반 배포 / 검증 / 운영 자동화 가이드  
> 메인넷 배포 시 그대로 재사용 가능

---

## 1. 자동화 범위

```
배포:    scripts/deploy.ts          → 컨트랙트 배포 + 콘솔 출력
검증:    npx hardhat verify          → 내장 명령 사용
풀 생성: scripts/createPool.ts      → Uniswap V3 풀 자동 생성
유동성: scripts/addLiquidity.ts    → 유동성 공급 자동화
운영:   scripts/ops/*.ts            → mint / pause / blacklist 등
모니터:  scripts/monitor.ts         → 실시간 이벤트 구독
```

---

## 2. 디렉토리 구조 (권장)

```
mycoin/
├── scripts/
│   ├── deploy.ts                    배포
│   ├── createPool.ts                Uniswap 풀 생성
│   ├── addLiquidity.ts              유동성 공급
│   ├── monitor.ts                   이벤트 모니터링
│   ├── ops/
│   │   ├── mint.ts                  mint 호출
│   │   ├── pause.ts                 pause / unpause
│   │   ├── blacklist.ts             블랙리스트 add/remove
│   │   ├── whitelist.ts             화이트리스트 add/remove
│   │   ├── setBurnFee.ts            거래세 설정
│   │   └── transferOwner.ts         소유권 이전
│   └── utils/
│       ├── addresses.ts             네트워크별 주소 상수
│       ├── abi.ts                   외부 ABI (Uniswap, WETH)
│       └── helpers.ts               공통 헬퍼
└── deployments/
    ├── sepolia.json                 Sepolia 배포 정보 저장
    └── mainnet.json                 메인넷 배포 정보 저장
```

---

## 3. 공통 유틸 — `scripts/utils/addresses.ts`

```typescript
/* 네트워크별 외부 컨트랙트 주소 */

export const ADDRESSES = {
  sepolia: {
    chainId: 11155111,
    UniswapV3Factory:           "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    NonfungiblePositionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
    SwapRouter02:               "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
    WETH9:                      "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
  mainnet: {
    chainId: 1,
    UniswapV3Factory:           "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    NonfungiblePositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    SwapRouter02:               "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    WETH9:                      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
} as const;

export function getAddresses(chainId: number) {
  if (chainId === 11155111) return ADDRESSES.sepolia;
  if (chainId === 1) return ADDRESSES.mainnet;
  throw new Error(`Unsupported chain: ${chainId}`);
}
```

---

## 4. 배포 스크립트 — `scripts/deploy.ts`

```typescript
import { network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

async function main() {
  // {} 구조분해 - 객체에서 특정 키만 꺼냄
  const { viem } = await network.connect();
  // network.connect()가 { viem: ..., provider: ..., ... } 반환
  // 그 중 viem 키만 꺼내는 것

  // [] 구조분해 - 배열에서 순서로 꺼냄
  const [deployer] = await viem.getWalletClients();
  // getWalletClients()가 [지갑1, 지갑2, ...] 배열 반환
  // 첫 번째(인덱스 0)만 꺼내는 것

  // 일반 변수 - 반환값 그대로 받음
  const publicClient = await viem.getPublicClient();
  // 객체 하나를 통째로 받는 것

  console.log("════════════════════════════════════════════");
  console.log("  SiHi 배포 시작");
  console.log("════════════════════════════════════════════");
  console.log("배포자:    ", deployer.account.address);

  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("ETH 잔액:  ", Number(balance) / 1e18, "ETH");

  if (balance < 100000000000000000n) { // 0.1 ETH
    throw new Error("ETH 부족 (최소 0.1 ETH 권장)");
  }

  /* 배포 */
  console.log("\n배포 중...");
  const sihi = await viem.deployContract("SiHi", [deployer.account.address]);
  console.log("✓ 컨트랙트 주소:", sihi.address);

  /* 배포 정보 저장 
  {
    "network": "sepolia",
    "chainId": 11155111,
    "contractAddress": "0x1234...abcd",
    "owner": "0xabcd...1234",
    "deployedAt": "2025-04-28T12:00:00.000Z",
    "blockNumber": 7654321
  }
  */
  const chainId = await publicClient.getChainId();
  const networkName = chainId === 1 ? "mainnet" : "sepolia";

  const deployment = {
    network:        networkName,
    chainId,
    contractAddress: sihi.address,
    owner:          deployer.account.address,
    deployedAt:     new Date().toISOString(),
    blockNumber:    Number(await publicClient.getBlockNumber()),
  };

  if (!existsSync("deployments")) mkdirSync("deployments");
  writeFileSync(
    join("deployments", `${networkName}.json`),
    JSON.stringify(deployment, null, 2),
  );
  console.log(`✓ 배포 정보 저장: deployments/${networkName}.json`);

  /* 검증 안내 */
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Etherscan 검증 명령:");
  console.log(`npx hardhat verify --network ${networkName} ${sihi.address} ${deployer.account.address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### 실행

```bash
# Sepolia 배포
npx hardhat run scripts/deploy.ts --network sepolia

# 메인넷 배포
npx hardhat run scripts/deploy.ts --network mainnet
```

---

## 5. Uniswap V3 풀 생성 — `scripts/createPool.ts`

```typescript
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { encodeAbiParameters, parseAbi } from "viem";
import { getAddresses } from "./utils/addresses.js";

/* NonfungiblePositionManager ABI (필요한 함수만) */
const positionManagerAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
]);

async function main() {
  const { viem } = await network.connect();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  const addrs = getAddresses(chainId);

  /* 배포된 SiHi 주소 로드 */
  const networkName = chainId === 1 ? "mainnet" : "sepolia";
  const deployment = JSON.parse(
    readFileSync(`deployments/${networkName}.json`, "utf-8")
  );
  const sihi = deployment.contractAddress as `0x${string}`;

  /* 토큰 주소 정렬 (token0 < token1 필수) */
  const [token0, token1] =
    sihi.toLowerCase() < addrs.WETH9.toLowerCase()
      ? [sihi, addrs.WETH9]
      : [addrs.WETH9, sihi];

  /* 초기 가격 (1 ETH = 1,000,000 SHI 가정)
   *  sqrtPriceX96 = sqrt(price) * 2^96
   *  price = token1 / token0 (decimals 동일 시)
   *
   *  편의상 1:1 시작 (Full Range 풀이라 양쪽 둘 다 필요)
   */
  // sqrt(1) * 2^96 = 79228162514264337593543950336
  const sqrtPriceX96 = 79228162514264337593543950336n;
  const fee = 3000; // 0.3%

  console.log("Uniswap V3 풀 생성:");
  console.log("  token0:", token0);
  console.log("  token1:", token1);
  console.log("  fee   :", fee, "(0.3%)");

  const txHash = await signer.writeContract({
    address: addrs.NonfungiblePositionManager as `0x${string}`,
    abi:     positionManagerAbi,
    functionName: "createAndInitializePoolIfNecessary",
    args: [token0, token1, fee, sqrtPriceX96],
  });

  console.log("✓ 트랜잭션 hash:", txHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("✓ 풀 생성 완료 (블록", receipt.blockNumber, ")");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### 주의사항

```
1. sqrtPriceX96 계산이 핵심
   잘못된 초기 가격 → 풀 가격 왜곡
   온라인 계산기: https://uniswap-v3-calculator.netlify.app/

2. token0 < token1 정렬 필수
   주소 비교 안 하고 넣으면 INVALID_ARGUMENT revert

3. burnFeeRate > 0 상태에서 풀 생성 시
   풀 동작 자체에 영향 (수수료 자동 소각)
   → 테스트 풀은 burnFeeRate = 0 권장
```

---

## 6. 유동성 공급 — `scripts/addLiquidity.ts`

```typescript
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { parseAbi } from "viem";
import { getAddresses } from "./utils/addresses.js";

const positionManagerAbi = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

async function main() {
  const { viem } = await network.connect();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  const addrs = getAddresses(chainId);

  const networkName = chainId === 1 ? "mainnet" : "sepolia";
  const deployment = JSON.parse(
    readFileSync(`deployments/${networkName}.json`, "utf-8")
  );
  const sihi = deployment.contractAddress as `0x${string}`;

  /* 공급 양 */
  const sihiAmount = 100_000n * 10n ** 18n;  // 100,000 SHI
  const wethAmount = 5n * 10n ** 16n;        // 0.05 WETH

  /* 토큰 정렬 */
  const sihiIs0 = sihi.toLowerCase() < addrs.WETH9.toLowerCase();
  const [token0, token1] = sihiIs0
    ? [sihi, addrs.WETH9 as `0x${string}`]
    : [addrs.WETH9 as `0x${string}`, sihi];
  const [amount0, amount1] = sihiIs0
    ? [sihiAmount, wethAmount]
    : [wethAmount, sihiAmount];

  /* 1. WETH approve */
  console.log("[1/3] WETH approve...");
  await signer.writeContract({
    address: addrs.WETH9 as `0x${string}`,
    abi: erc20Abi,
    functionName: "approve",
    args: [addrs.NonfungiblePositionManager as `0x${string}`, wethAmount],
  });

  /* 2. SHI approve */
  console.log("[2/3] SHI approve...");
  await signer.writeContract({
    address: sihi,
    abi: erc20Abi,
    functionName: "approve",
    args: [addrs.NonfungiblePositionManager as `0x${string}`, sihiAmount],
  });

  /* 3. mint position (Full Range) */
  console.log("[3/3] mint position...");
  const tickLower = -887220;
  const tickUpper =  887220;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10분

  const txHash = await signer.writeContract({
    address: addrs.NonfungiblePositionManager as `0x${string}`,
    abi: positionManagerAbi,
    functionName: "mint",
    args: [{
      token0,
      token1,
      fee: 3000,
      tickLower,
      tickUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: signer.account.address,
      deadline,
    }],
  });

  console.log("✓ 트랜잭션 hash:", txHash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("✓ 유동성 공급 완료 (블록", receipt.blockNumber, ")");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

## 7. 운영 명령 — `scripts/ops/`

### 7-1. `scripts/ops/mint.ts`

```typescript
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { parseEther } from "viem";

async function main() {
  const recipient = process.argv[2] as `0x${string}`;
  const amountStr = process.argv[3];

  if (!recipient || !amountStr) {
    console.error("사용법: npx hardhat run scripts/ops/mint.ts -- <주소> <SHI양>");
    process.exit(1);
  }

  const { viem } = await network.connect();
  const [signer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const networkName = chainId === 1 ? "mainnet" : "sepolia";
  const deployment = JSON.parse(
    readFileSync(`deployments/${networkName}.json`, "utf-8")
  );

  const sihi = await viem.getContractAt("SiHi", deployment.contractAddress);

  const amount = parseEther(amountStr);
  console.log(`mint ${amountStr} SHI → ${recipient}`);

  const txHash = await sihi.write.mint([recipient, amount]);
  console.log("✓ tx:", txHash);

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("✓ 완료");
}

main().catch(console.error);
```

### 실행

```bash
npx hardhat run scripts/ops/mint.ts --network sepolia -- 0xRecipient 1000
```

### 7-2. `scripts/ops/pause.ts`

```typescript
import { network } from "hardhat";
import { readFileSync } from "node:fs";

async function main() {
  const action = process.argv[2]; // "pause" or "unpause"

  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const deployment = JSON.parse(
    readFileSync(`deployments/${chainId === 1 ? "mainnet" : "sepolia"}.json`, "utf-8")
  );

  const sihi = await viem.getContractAt("SiHi", deployment.contractAddress);

  if (action === "pause") {
    console.log("⚠️  PAUSE 실행 — 모든 전송 정지");
    await sihi.write.pause();
  } else if (action === "unpause") {
    console.log("✓ UNPAUSE 실행 — 전송 재개");
    await sihi.write.unpause();
  } else {
    console.error("사용법: ... pause|unpause");
    process.exit(1);
  }

  const status = await sihi.read.paused();
  console.log("현재 paused 상태:", status);
}

main().catch(console.error);
```

### 7-3. 다른 운영 스크립트 (패턴 동일)

```
scripts/ops/blacklist.ts       — 블랙리스트 add/remove
scripts/ops/whitelist.ts       — 화이트리스트 add/remove
scripts/ops/setBurnFee.ts      — 거래세 변경
scripts/ops/transferOwner.ts   — 소유권 이전
```

각각 위 패턴 그대로 응용:
1. process.argv 로 인자 받기
2. deployments/{network}.json 에서 컨트랙트 주소 로드
3. sihi.write.<함수>([인자]) 호출
4. tx hash 출력 + 영수증 대기

---

## 8. 모니터링 — `scripts/monitor.ts`

```typescript
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { formatEther } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const deployment = JSON.parse(
    readFileSync(`deployments/${chainId === 1 ? "mainnet" : "sepolia"}.json`, "utf-8")
  );

  const sihi = await viem.getContractAt("SiHi", deployment.contractAddress);

  console.log("실시간 SiHi 이벤트 모니터링 시작");
  console.log("Ctrl+C 로 종료\n");

  /* Transfer 이벤트 구독 */
  publicClient.watchContractEvent({
    address: sihi.address,
    abi: sihi.abi,
    eventName: "Transfer",
    onLogs: (logs) => {
      logs.forEach((log) => {
        const { from, to, value } = log.args;
        const amount = formatEther(value!);
        const tag = from === "0x0000000000000000000000000000000000000000"
          ? "🟢 MINT"
          : to   === "0x0000000000000000000000000000000000000000"
          ? "🔴 BURN"
          : "→ TRANSFER";
        console.log(`[${tag}] ${amount} SHI: ${from} → ${to}`);
      });
    },
  });

  /* Paused 이벤트 */
  publicClient.watchContractEvent({
    address: sihi.address,
    abi: sihi.abi,
    eventName: "Paused",
    onLogs: () => console.log("⚠️  컨트랙트 일시정지!"),
  });

  publicClient.watchContractEvent({
    address: sihi.address,
    abi: sihi.abi,
    eventName: "Unpaused",
    onLogs: () => console.log("✓ 컨트랙트 재개"),
  });

  /* 무한 대기 */
  await new Promise(() => {});
}

main().catch(console.error);
```

### 실행

```bash
npx hardhat run scripts/monitor.ts --network sepolia
```

→ 실시간으로 transfer/mint/burn/pause 이벤트 출력  
→ 별도 터미널에서 백그라운드 실행 권장

---

## 9. 한 번에 배포 + 풀 생성 + 유동성

### `scripts/deployFull.ts` (전체 자동화)

```typescript
import { network } from "hardhat";

async function main() {
  console.log("=== SiHi 전체 배포 시작 ===\n");

  /* 1. 컨트랙트 배포 */
  console.log("[1/3] 컨트랙트 배포...");
  await import("./deploy.js");

  /* 2. 풀 생성 */
  console.log("\n[2/3] Uniswap V3 풀 생성...");
  await import("./createPool.js");

  /* 3. 유동성 공급 */
  console.log("\n[3/3] 유동성 공급...");
  await import("./addLiquidity.js");

  console.log("\n=== ✓ 전체 완료 ===");
}

main().catch(console.error);
```

### 실행

```bash
npx hardhat run scripts/deployFull.ts --network sepolia
```

---

## 10. 메인넷 배포 시 주의사항

### 가스 가격 사전 확인

```typescript
const gasPrice = await publicClient.getGasPrice();
console.log("현재 가스:", Number(gasPrice) / 1e9, "gwei");

if (gasPrice > 50_000_000_000n) { // 50 gwei 초과
  console.error("⚠️  가스 가격 너무 높음. 새벽 시간대 추천.");
  process.exit(1);
}
```

### 배포 직전 확인 프롬프트

```typescript
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question("⚠️  메인넷에 배포합니다. 'YES' 입력: ");
rl.close();

if (answer !== "YES") {
  console.log("배포 취소");
  process.exit(0);
}
```

### 배포 후 즉시 검증 자동화

```typescript
/* deploy.ts 마지막에 추가 */
console.log("\nEtherscan 검증 시도 (60초 대기 후)...");
await new Promise(r => setTimeout(r, 60000));

const { execSync } = await import("node:child_process");
try {
  execSync(
    `npx hardhat verify --network ${networkName} ${sihi.address} ${deployer.account.address}`,
    { stdio: "inherit" }
  );
} catch (e) {
  console.warn("자동 검증 실패. 수동 검증 명령:");
  console.warn(`npx hardhat verify --network ${networkName} ${sihi.address} ${deployer.account.address}`);
}
```

---

## 11. 명령어 요약 (참조용)

| 작업 | 명령어 |
|------|-------|
| 배포 | `npx hardhat run scripts/deploy.ts --network sepolia` |
| 검증 | `npx hardhat verify --network sepolia <addr> <owner>` |
| 풀 생성 | `npx hardhat run scripts/createPool.ts --network sepolia` |
| 유동성 | `npx hardhat run scripts/addLiquidity.ts --network sepolia` |
| 전체 자동화 | `npx hardhat run scripts/deployFull.ts --network sepolia` |
| Mint | `npx hardhat run scripts/ops/mint.ts --network sepolia -- 0x... 1000` |
| Pause | `npx hardhat run scripts/ops/pause.ts --network sepolia -- pause` |
| Monitor | `npx hardhat run scripts/monitor.ts --network sepolia` |

---

## 12. 다음 단계

```
[ ] 위 스크립트 작성 + Sepolia 에서 테스트
[ ] 메인넷 배포 시 위 스크립트 그대로 사용
[ ] 추가 자동화 (필요 시):
    - 분배 스크립트 (CSV → 다중 mint)
    - 베스팅 컨트랙트 연동
    - DAO 거버넌스 통합
```

---

_작성: 2026-04-23 | 다음 문서: SIHI_DEEP_DIVE.md_
