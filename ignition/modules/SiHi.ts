import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * SiHi 토큰 배포 모듈
 *
 * 사용:
 *   npx hardhat ignition deploy ignition/modules/SiHi.ts --network sepolia
 *
 * 파라미터 변경 (선택):
 *   --parameters '{ "SiHiModule": { "maxBurnSupply": "300000000000000000000000" } }'
 */
export default buildModule("SiHiModule", (m) => {
  // 배포자 = owner (배포 시 자동 결정)
  const deployer = m.getAccount(0);

  // 최대 소각 한도 (기본: 50만 SHI = 총 발행의 50%)
  const maxBurnSupply = m.getParameter(
    "maxBurnSupply",
    500_000n * 10n ** 18n,
  );

  const sihi = m.contract("SiHi", [deployer, maxBurnSupply]);

  return { sihi };
});
