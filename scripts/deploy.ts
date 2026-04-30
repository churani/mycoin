import { network } from "hardhat";

async function main() {
    const { viem } = await network.connect();
    const [deployer] = await viem.getWalletClients();

    console.log("배포자 주소:", deployer.account.address);

    // 잔액 확인
    const publicClient = await viem.getPublicClient();
    const balance = await publicClient.getBalance({
        address: deployer.account.address
    });
    console.log("잔액:", balance.toString(), "wei");

    // 배포
    // constructor: (address initialOwner, uint256 _maxBurnSupply)
    const maxBurnSupply = 500_000n * 10n ** 18n;   // 50만 SHI (총 발행의 50%)
    console.log("배포 중...");
    console.log("  initialOwner :", deployer.account.address);
    console.log("  maxBurnSupply:", maxBurnSupply.toString(), "wei (=", maxBurnSupply / 10n**18n, "SHI)");

    const sihi = await viem.deployContract("SiHi", [
        deployer.account.address,
        maxBurnSupply,
    ]);

    console.log("═══════════════════════════════════════");
    console.log("✅ SiHi 배포 완료!");
    console.log("컨트랙트 주소:", sihi.address);
    console.log("Etherscan:", `https://sepolia.etherscan.io/address/${sihi.address}`);
    console.log("═══════════════════════════════════════");
}

main().catch(console.error);
