import hre from "hardhat";

async function main() {
    const contractAddress = "0xc8151a30b30d69ab5330d09c26d538ef6be10c17";
    const deployerAddress = "0x18554351b6ec3483ad540b7dc0f939170366f8b2";

    console.log("검증 중...");

    await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [deployerAddress],
    });

    console.log("✅ 검증 완료!");
    console.log(`https://sepolia.etherscan.io/address/${contractAddress}#code`);
}

main().catch(console.error);