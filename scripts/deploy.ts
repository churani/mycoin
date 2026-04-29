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
    console.log("배포 중...");
    const sihi = await viem.deployContract("SiHi", [
        deployer.account.address
    ]);

    console.log("═══════════════════════════════════════");
    console.log("✅ SiHi 배포 완료!");
    console.log("컨트랙트 주소:", sihi.address);
    console.log("Etherscan:", `https://sepolia.etherscan.io/address/${sihi.address}`);
    console.log("═══════════════════════════════════════");
}

main().catch(console.error);
