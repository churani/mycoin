import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      // 개발 — optimizer 약하게 (코드 크기 + 디버깅 편의)
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      // 메인넷 배포용 — 실행 가스 절감 (자주 호출되는 transfer 등)
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          viaIR: true,   // 더 강한 최적화 (컴파일 느림, 결과 작음)
        },
      },
    },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
    hardhatOp:      { type: "edr-simulated", chainType: "op" },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL!,
      accounts: [process.env.SEPOLIA_PRIVATE_KEY!],
    },
  },
  // Hardhat 3 방식 ← etherscan 아님
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY!,
    },
  },
});