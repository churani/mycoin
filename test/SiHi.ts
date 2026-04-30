import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, NonceTooLowError } from "viem";  // 상단에 추가

describe("SiHi", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  // 임의 주소 자동 생성
  const [owner, alice, bob] = await viem.getWalletClients();

  // 네트워크만 가상이고 실제 sol호출
  // constructor: (address initialOwner, uint256 _maxBurnSupply)
  const TEST_MAX_BURN_SUPPLY = 500_000n * 10n ** 18n;   // 50만 SHI

  async function deploySiHi() {
      const maxBurnSupply = 500_000n * 10n ** 18n;  // 50만 SHI
      return viem.deployContract("SiHi", [
          owner.account.address,
          maxBurnSupply,                              // ← 두 번째 인자 추가
      ]);
  }

  it("constructor: maxBurnSupply = 0 이면 revert", async function () {
      await assert.rejects(
          viem.deployContract("SiHi", [owner.account.address, 0n])
      );
  });

  it("maxBurnSupply 가 정확히 저장되는지", async function () {
      const sihi = await deploySiHi();
      const stored = await sihi.read.maxBurnSupply();
      assert.equal(stored, TEST_MAX_BURN_SUPPLY);
  });

  it("totalBurned 초기값 = 0", async function () {
      const sihi = await deploySiHi();
      const burned = await sihi.read.totalBurned();
      assert.equal(burned, 0n);
  });

  // ════════════════════════════════════════════════════════════
  // 1. 배포 + 메타데이터
  // ════════════════════════════════════════════════════════════

  it("배포 직후 owner 가 INITIAL_SUPPLY (1,000,000 SHI) 보유", async function () {
    const sihi = await deploySiHi();
    const ownerBalance = await sihi.read.balanceOf([owner.account.address]);
    const initialSupply = await sihi.read.INITIAL_SUPPLY();
    assert.equal(ownerBalance, initialSupply);
    assert.equal(initialSupply, 1_000_000n * 10n ** 18n);
  });

  it("name = SiHi, symbol = SHI, decimals = 18", async function () {
    const sihi = await deploySiHi();
    assert.equal(await sihi.read.name(), "SiHi");
    assert.equal(await sihi.read.symbol(), "SHI");
    assert.equal(await sihi.read.decimals(), 18);
  });

  // ════════════════════════════════════════════════════════════
  // 2. transfer / approve / transferFrom
  // ════════════════════════════════════════════════════════════

  it("transfer: owner → alice 로 전송", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("transfer: 잔액 초과 시 revert", async function () {
    const sihi = await deploySiHi();
    const tooMuch = 999_999_999n * 10n ** 18n;
    await assert.rejects(
      sihi.write.transfer([bob.account.address, tooMuch], {
        account: alice.account,
      })
    );
  });

  it("approve + transferFrom: alice 가 bob 대신 전송", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;

    // 자동 결제 → 구독 서비스에 approve → 매월 자동으로 transferFrom
    // transfer        →  내가 직접 전송               owner → alice 에게 500 SHI 전송 (transfer)
    await sihi.write.transfer([alice.account.address, amount]);
    // approve         →  타인에게 출금 권한 부여        alice → bob 에게 500 SHI 사용 권한 부여 (approve)
    await sihi.write.approve([bob.account.address, amount], {
      account: alice.account,
    });
    // transferFrom    →  권한 받은 타인이 대신 출금      bob → alice 계좌에서 owner 에게 대신 전송 (transferFrom)
    await sihi.write.transferFrom(
      [alice.account.address, owner.account.address, amount],
      { account: bob.account }
    );
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, 0n);
  });

  it("approve 없이 transferFrom 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    await assert.rejects(
      sihi.write.transferFrom(
        [alice.account.address, bob.account.address, amount],
        { account: bob.account }
      )
    );
  });

  // ════════════════════════════════════════════════════════════
  // 3. burn
  // ════════════════════════════════════════════════════════════
  // 대부분 토큰 프로젝트:
  // 팀 물량 소각    →  팀 지갑에서 burn()
  // 유통량 소각     →  각자 본인이 burn()
  // 수수료 소각     →  컨트랙트가 자동으로 burn()

  it("burn: 자기 토큰 소각 후 totalSupply 감소", async function () {
    const sihi = await deploySiHi();
    const burnAmount = 1_000n * 10n ** 18n;
    const supplyBefore = await sihi.read.totalSupply();
    await sihi.write.burn([burnAmount]);
    const supplyAfter = await sihi.read.totalSupply();
    assert.equal(supplyAfter, supplyBefore - burnAmount);
  });

  it("burn: 잔액 초과 소각 시 revert", async function () {
    const sihi = await deploySiHi();
    const tooMuch = 999_999_999n * 10n ** 18n;
    await assert.rejects(sihi.write.burn([tooMuch]));
  });

  // ════════════════════════════════════════════════════════════
  // 4. mint (owner 만, MAX_SUPPLY 체크)
  // ════════════════════════════════════════════════════════════

  it("mint: owner 가 alice 에게 추가 발행", async function () {
    const sihi = await deploySiHi();
    const mintAmount = 1_000n * 10n ** 18n;
    await sihi.write.mint([alice.account.address, mintAmount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, mintAmount);
  });

  it("mint: owner 아닌 alice 가 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.mint([alice.account.address, 1_000n * 10n ** 18n], {
        account: alice.account,
      })
    );
  });

  it("mint: MAX_SUPPLY 초과 시 revert", async function () {
    const sihi = await deploySiHi();
    const maxSupply = await sihi.read.MAX_SUPPLY();
    const totalSupply = await sihi.read.totalSupply();
    const overAmount = maxSupply - totalSupply + 1n;
    await assert.rejects(
      sihi.write.mint([alice.account.address, overAmount])
    );
  });

  it("mint: MAX_SUPPLY 딱 맞게는 성공", async function () {
    const sihi = await deploySiHi();
    const maxSupply = await sihi.read.MAX_SUPPLY();
    const totalSupply = await sihi.read.totalSupply();
    const remaining = maxSupply - totalSupply;
    await sihi.write.mint([alice.account.address, remaining]);
    const newTotal = await sihi.read.totalSupply();
    assert.equal(newTotal, maxSupply);
  });

  // ════════════════════════════════════════════════════════════
  // 5. pause / unpause
  // ════════════════════════════════════════════════════════════

  it("pause: owner 가 정지 후 transfer 불가", async function () {
    const sihi = await deploySiHi();
    await sihi.write.pause();
    await assert.rejects(
      sihi.write.transfer([alice.account.address, 100n * 10n ** 18n])
    );
  });

  it("pause: owner 아닌 alice 가 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(sihi.write.pause({ account: alice.account }));
  });

  it("unpause: 정지 해제 후 transfer 정상", async function () {
    const sihi = await deploySiHi();
    const amount = 100n * 10n ** 18n;
    await sihi.write.pause();
    await sihi.write.unpause();
    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("paused(): 상태값 정확히 반환", async function () {
    const sihi = await deploySiHi();
    assert.equal(await sihi.read.paused(), false);
    await sihi.write.pause();
    assert.equal(await sihi.read.paused(), true);
    await sihi.write.unpause();
    assert.equal(await sihi.read.paused(), false);
  });

  // ════════════════════════════════════════════════════════════
  // 6. ownership
  // ════════════════════════════════════════════════════════════

  it("renounceOwnership: 비활성화 확인 (revert)", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(sihi.write.renounceOwnership());
  });

  it("transferOwnership: owner 가 alice 에게 이전", async function () {
    const sihi = await deploySiHi();
    await sihi.write.transferOwnership([alice.account.address]);
    const newOwner = await sihi.read.owner();
    assert.equal(newOwner.toLowerCase(), alice.account.address.toLowerCase());
  });

  it("transferOwnership 후 이전 owner 는 mint 불가", async function () {
    const sihi = await deploySiHi();
    await sihi.write.transferOwnership([alice.account.address]);
    await assert.rejects(
      sihi.write.mint([bob.account.address, 1_000n * 10n ** 18n])
    );
  });



  // ════════════════════════════════════════
  // 7. pause 중 동작 추가 검증
  // ════════════════════════════════════════
  it("pause 중 burn 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.pause();
    await assert.rejects(
      sihi.write.burn([100n * 10n ** 18n])
    );
  });

  it("pause 중 mint 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.pause();
    await assert.rejects(
      sihi.write.mint([alice.account.address, 100n * 10n ** 18n])
    );
  });

  it("pause 중 transferFrom 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 100n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.approve([bob.account.address, amount], {
      account: alice.account,
    });
    await sihi.write.pause();
    await assert.rejects(
      sihi.write.transferFrom(
        [alice.account.address, bob.account.address, amount],
        { account: bob.account }
      )
    );
  });


  // ════════════════════════════════════════
  // 8. 이벤트 검증
  // ════════════════════════════════════════

  it("transfer 시 Transfer 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.transfer([alice.account.address, amount]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Transfer",
      fromBlock: blockNumber + 1n,  // 배포 블록 제외
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.from?.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(events[0].args.to?.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(events[0].args.value, amount);
  });

  it("mint 시 Transfer 이벤트 발생 (from: zero address)", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    const blockNumber = await publicClient.getBlockNumber();
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    await sihi.write.mint([alice.account.address, amount]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Transfer",
      fromBlock: blockNumber + 1n,  // 배포 블록 제외
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.from?.toLowerCase(), zeroAddress);
    assert.equal(events[0].args.to?.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(events[0].args.value, amount);
  });

  it("burn 시 Transfer 이벤트 발생 (to: zero address)", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    const blockNumber = await publicClient.getBlockNumber();
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    await sihi.write.burn([amount]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Transfer",
      fromBlock: blockNumber + 1n,  // 배포 블록 제외
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.from?.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(events[0].args.to?.toLowerCase(), zeroAddress);
    assert.equal(events[0].args.value, amount);
  });

  it("approve 시 Approval 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.approve([alice.account.address, amount]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Approval",
      fromBlock: blockNumber + 1n,  // 배포 블록 제외
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.owner?.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(events[0].args.spender?.toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(events[0].args.value, amount);
  });


  // ════════════════════════════════════════
  // 9. allowance
  // ════════════════════════════════════════
  // 위 allowance 테스트 추가

  it("approve 후 allowance 정확히 반환", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;

    await sihi.write.approve([bob.account.address, amount], {
      account: alice.account,
    });

    const allowance = await sihi.read.allowance([
      alice.account.address,
      bob.account.address,
    ]);
    assert.equal(allowance, amount);
  });

  it("transferFrom 후 allowance 차감 확인", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;
    const sendAmount = 200n * 10n ** 18n;

    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.approve([bob.account.address, amount], {
      account: alice.account,
    });
    await sihi.write.transferFrom(
      [alice.account.address, owner.account.address, sendAmount],
      { account: bob.account }
    );

    const allowance = await sihi.read.allowance([
      alice.account.address,
      bob.account.address,
    ]);
    assert.equal(allowance, amount - sendAmount);  // 300 SHI 남아야 함
  });

  it("approve 0으로 allowance 취소", async function () {
    const sihi = await deploySiHi();
    const amount = 500n * 10n ** 18n;

    await sihi.write.approve([bob.account.address, amount], {
      account: alice.account,
    });
    await sihi.write.approve([bob.account.address, 0n], {
      account: alice.account,
    });

    const allowance = await sihi.read.allowance([
      alice.account.address,
      bob.account.address,
    ]);
    assert.equal(allowance, 0n);
  });

  // ════════════════════════════════════════
  // 10. 경계값
  // ════════════════════════════════════════
  // 위 경계값 테스트 추가
  it("transfer: 잔액 딱 맞게는 성공", async function () {
    const sihi = await deploySiHi();
    const balance = await sihi.read.balanceOf([owner.account.address]);

    // 전체 잔액 딱 맞게 전송
    await sihi.write.transfer([alice.account.address, balance]);

    const ownerBalance = await sihi.read.balanceOf([owner.account.address]);
    assert.equal(ownerBalance, 0n);
  });

  it("transfer: 0 전송 성공 (잔액 변화 없음)", async function () {
    const sihi = await deploySiHi();
    const balanceBefore = await sihi.read.balanceOf([alice.account.address]);

    await sihi.write.transfer([alice.account.address, 0n]);

    const balanceAfter = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(balanceBefore, balanceAfter);
  });

  it("burn: 잔액 딱 맞게 전액 소각", async function () {
    const sihi = await deploySiHi();
    const balance = await sihi.read.balanceOf([owner.account.address]);

    await sihi.write.burn([balance]);

    const balanceAfter = await sihi.read.balanceOf([owner.account.address]);
    assert.equal(balanceAfter, 0n);
  });


  // ════════════════════════════════════════
  // ownership 추가
  // ════════════════════════════════════════

  it("transferOwnership 후 새 owner 가 pause 가능", async function () {
    const sihi = await deploySiHi();
    await sihi.write.transferOwnership([alice.account.address]);

    // 새 owner(alice)가 pause 가능해야 함
    await sihi.write.pause({ account: alice.account });
    assert.equal(await sihi.read.paused(), true);
  });

  it("zero address 로 ownership 이전 시 revert", async function () {
    const sihi = await deploySiHi();
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    await assert.rejects(
      sihi.write.transferOwnership([zeroAddress])
    );
  });

  // ════════════════════════════════════════
  // 11. 블랙리스트
  // ════════════════════════════════════════

  it("blacklist: owner 가 alice 블랙리스트 등록", async function () {
    const sihi = await deploySiHi();
    await sihi.write.blacklist([alice.account.address]);
    const isBlacklisted = await sihi.read.isBlacklisted([alice.account.address]);
    assert.equal(isBlacklisted, true);
  });

  it("blacklist: owner 아닌 alice 가 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.blacklist([bob.account.address], {
        account: alice.account,
      })
    );
  });

  it("blacklist: 블랙리스트 주소 transfer 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.blacklist([alice.account.address]);
    await assert.rejects(
      sihi.write.transfer([bob.account.address, amount], {
        account: alice.account,
      })
    );
  });

  it("blacklist: 블랙리스트 주소 수신 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.blacklist([alice.account.address]);
    await assert.rejects(
      sihi.write.transfer([alice.account.address, amount])
    );
  });

  it("unBlacklist: 해제 후 transfer 정상", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.blacklist([alice.account.address]);
    await sihi.write.unBlacklist([alice.account.address]);
    await sihi.write.transfer([bob.account.address, amount], {
      account: alice.account,
    });
    const bobBalance = await sihi.read.balanceOf([bob.account.address]);
    assert.equal(bobBalance, amount);
  });

  it("unBlacklist: 등록 안된 주소 해제 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.unBlacklist([alice.account.address])
    );
  });

  it("blacklist: 이미 등록된 주소 재등록 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.blacklist([alice.account.address]);
    await assert.rejects(
      sihi.write.blacklist([alice.account.address])
    );
  });

  it("blacklist: zero address 등록 시 revert", async function () {
    const sihi = await deploySiHi();
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    await assert.rejects(
      sihi.write.blacklist([zeroAddress])
    );
  });

  it("blacklist: owner 블랙리스트 등록 시 Blacklisted 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.blacklist([alice.account.address]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Blacklisted",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.account?.toLowerCase(),
      alice.account.address.toLowerCase()
    );
  });

  it("blacklist: mint 시 블랙리스트 주소 수신 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.blacklist([alice.account.address]);
    await assert.rejects(
      sihi.write.mint([alice.account.address, 1_000n * 10n ** 18n])
    );
  });

  it("blacklist: burn 시 블랙리스트 주소 소각 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.blacklist([alice.account.address]);
    await assert.rejects(
      sihi.write.burn([amount], { account: alice.account })
    );
  });

  // ════════════════════════════════════════
  // 12. 화이트리스트
  // ════════════════════════════════════════

  it("whitelist: 기본값은 비활성화", async function () {
    const sihi = await deploySiHi();
    assert.equal(await sihi.read.whitelistEnabled(), false);
  });

  it("whitelist: owner 가 활성화", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableWhitelist();
    assert.equal(await sihi.read.whitelistEnabled(), true);
  });

  it("whitelist: owner 아닌 alice 가 활성화 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.enableWhitelist({ account: alice.account })
    );
  });

  it("whitelist: 이미 활성화 상태에서 재활성화 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableWhitelist();
    await assert.rejects(sihi.write.enableWhitelist());
  });

  it("whitelist: 활성화 시 미등록 주소 transfer revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.enableWhitelist();
    await assert.rejects(
      sihi.write.transfer([alice.account.address, amount])
    );
  });

  it("whitelist: 활성화 시 등록된 주소 transfer 성공", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.enableWhitelist();
    await sihi.write.addWhitelist([owner.account.address]);
    await sihi.write.addWhitelist([alice.account.address]);
    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("whitelist: 비활성화 후 미등록 주소 transfer 성공", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.enableWhitelist();
    await sihi.write.disableWhitelist();
    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("whitelist: owner 가 주소 등록", async function () {
    const sihi = await deploySiHi();
    await sihi.write.addWhitelist([alice.account.address]);
    assert.equal(await sihi.read.isWhitelisted([alice.account.address]), true);
  });

  it("whitelist: owner 아닌 alice 가 등록 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.addWhitelist([bob.account.address], {
        account: alice.account,
      })
    );
  });

  it("whitelist: 이미 등록된 주소 재등록 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.addWhitelist([alice.account.address]);
    await assert.rejects(
      sihi.write.addWhitelist([alice.account.address])
    );
  });

  it("whitelist: zero address 등록 시 revert", async function () {
    const sihi = await deploySiHi();
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    await assert.rejects(
      sihi.write.addWhitelist([zeroAddress])
    );
  });

  it("whitelist: 등록 해제 후 transfer revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.enableWhitelist();
    await sihi.write.addWhitelist([owner.account.address]);
    await sihi.write.addWhitelist([alice.account.address]);
    await sihi.write.transfer([alice.account.address, amount]);
    await sihi.write.removeWhitelist([alice.account.address]);
    await assert.rejects(
      sihi.write.transfer([bob.account.address, amount], {
        account: alice.account,
      })
    );
  });

  it("whitelist: mint 는 화이트리스트 무관하게 성공", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableWhitelist();
    await sihi.write.mint([alice.account.address, 1_000n * 10n ** 18n]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, 1_000n * 10n ** 18n);
  });

  it("whitelist: Whitelisted 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.addWhitelist([alice.account.address]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Whitelisted",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.account?.toLowerCase(),
      alice.account.address.toLowerCase()
    );
  });

  // ════════════════════════════════════════
  // 13. 거래세 소각
  // ════════════════════════════════════════

  it("burnFee: 기본 세율은 0", async function () {
    const sihi = await deploySiHi();
    assert.equal(await sihi.read.burnFeeRate(), 0n);
  });

  it("burnFee: owner 가 세율 설정", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%
    assert.equal(await sihi.read.burnFeeRate(), 200n);
  });

  it("burnFee: owner 아닌 alice 가 세율 설정 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.setBurnFeeRate([200n], { account: alice.account })
    );
  });

  it("burnFee: MAX_FEE_RATE 초과 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.setBurnFeeRate([1001n]) // 10.01%
    );
  });

  it("burnFee: MAX_FEE_RATE 딱 맞게는 성공", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([1000n]); // 10%
    assert.equal(await sihi.read.burnFeeRate(), 1000n);
  });

  it("burnFee: 세율 2% 적용 시 transfer 소각 확인", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%

    const amount = 1_000n * 10n ** 18n;
    const feeAmount = amount * 200n / 10_000n;   // 20 SHI 소각
    const sendAmount = amount - feeAmount;        // 980 SHI 전송

    const supplyBefore = await sihi.read.totalSupply();
    await sihi.write.transfer([alice.account.address, amount]);

    // alice 잔액 확인 (980 SHI)
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, sendAmount);

    // totalSupply 감소 확인 (20 SHI 소각)
    const supplyAfter = await sihi.read.totalSupply();
    assert.equal(supplyAfter, supplyBefore - feeAmount);
  });

  it("burnFee: 세율 0% 시 전액 전송", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;

    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount); // 전액 도착
  });

  it("burnFee: mint 시 세금 없음", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%

    const mintAmount = 1_000n * 10n ** 18n;
    await sihi.write.mint([alice.account.address, mintAmount]);

    // mint 는 세금 없이 전액 지급
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, mintAmount);
  });

  it("burnFee: burn 시 세금 없음", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%

    const burnAmount = 1_000n * 10n ** 18n;
    const supplyBefore = await sihi.read.totalSupply();
    await sihi.write.burn([burnAmount]);

    // burn 은 세금 없이 정확히 burnAmount 만 소각
    const supplyAfter = await sihi.read.totalSupply();
    assert.equal(supplyAfter, supplyBefore - burnAmount);
  });

  it("burnFee: 세율 변경 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.setBurnFeeRate([200n]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "BurnFeeRateChanged",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.oldRate, 0n);
    assert.equal(events[0].args.newRate, 200n);
  });

  it("burnFee: 세율 변경 후 이전 세율로 재변경", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%
    await sihi.write.setBurnFeeRate([100n]); // 1%
    assert.equal(await sihi.read.burnFeeRate(), 100n);
  });

  it("burnFee: 세율 0으로 변경 후 전액 전송", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setBurnFeeRate([200n]); // 2%
    await sihi.write.setBurnFeeRate([0n]);   // 0%

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([alice.account.address, amount]);
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount); // 전액 도착
  });


  // ════════════════════════════════════════
  // 14. vesting
  // ════════════════════════════════════════

  // 시간 이동 헬퍼 함수
  async function increaseTime(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await publicClient.request({
      method: "evm_mine" as any,
      params: [] as any,
    });
  }

  it("vesting: owner 가 스케줄 생성", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;

    // 컨트랙트에 토큰 전송 (vesting 물량)
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,      // cliff 없음
      1000n,   // 1000초 동안 베스팅
    ]);

    const schedule = await sihi.read.getVestingSchedule([alice.account.address]);
    assert.equal(schedule.totalAmount, amount);
    assert.equal(schedule.revoked, false);
  });

  it("vesting: owner 아닌 alice 가 생성 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await assert.rejects(
      sihi.write.createVesting([
        bob.account.address,
        amount,
        0n,
        1000n,
      ], { account: alice.account })
    );
  });

  it("vesting: cliff 기간 중 출금 불가", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      500n,    // cliff 500초
      1000n,
    ]);

    // cliff 기간 전 출금 시도
    await assert.rejects(
      sihi.write.releaseVesting({ account: alice.account })
    );
  });

  it("vesting: cliff 이후 출금 가능", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,      // cliff 없음
      1000n,
    ]);

    // 500초 경과 → 50% 해제
    await increaseTime(500);

    await sihi.write.releaseVesting({ account: alice.account });

    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.ok(aliceBalance > 0n);
  });

  it("vesting: 전체 기간 완료 후 전액 출금", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    // 1000초 경과 → 100% 해제
    await increaseTime(1000);

    await sihi.write.releaseVesting({ account: alice.account });

    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("vesting: 출금 후 잔여분만 재출금 가능", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    // 500초 후 1차 출금
    await increaseTime(500);
    await sihi.write.releaseVesting({ account: alice.account });

    // 500초 더 후 2차 출금
    await increaseTime(500);
    await sihi.write.releaseVesting({ account: alice.account });

    // 총 전액 수령
    const aliceBalance = await sihi.read.balanceOf([alice.account.address]);
    assert.equal(aliceBalance, amount);
  });

  it("vesting: owner 가 취소 시 미해제 물량 반환", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    // ownerBalanceBefore 를 vesting 생성 후에 기록
    const ownerBalanceBefore = await sihi.read.balanceOf([owner.account.address]);

    await sihi.write.revokeVesting([alice.account.address]);

    const schedule = await sihi.read.getVestingSchedule([alice.account.address]);
    assert.equal(schedule.revoked, true);

    // 취소 후 owner 잔액 = 취소 전 + 반환된 물량
    const ownerBalanceAfter = await sihi.read.balanceOf([owner.account.address]);
    assert.equal(ownerBalanceAfter, ownerBalanceBefore + amount);
  });

  it("vesting: 취소 후 출금 불가", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    await sihi.write.revokeVesting([alice.account.address]);

    await assert.rejects(
      sihi.write.releaseVesting({ account: alice.account })
    );
  });

  it("vesting: 중복 생성 시 revert", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount * 2n]);

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    await assert.rejects(
      sihi.write.createVesting([
        alice.account.address,
        amount,
        0n,
        1000n,
      ])
    );
  });

  it("vesting: VestingCreated 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const amount = 1_000n * 10n ** 18n;
    await sihi.write.transfer([sihi.address, amount]);
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.createVesting([
      alice.account.address,
      amount,
      0n,
      1000n,
    ]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "VestingCreated",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.beneficiary?.toLowerCase(),
      alice.account.address.toLowerCase()
    );
    assert.equal(events[0].args.totalAmount, amount);
  });





  // ════════════════════════════════════════
  // 15. staking
  // ════════════════════════════════════════

  it("staking: 기본값 비활성화", async function () {
    const sihi = await deploySiHi();
    assert.equal(await sihi.read.stakingEnabled(), false);
  });

  it("staking: owner 가 활성화", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    assert.equal(await sihi.read.stakingEnabled(), true);
  });

  it("staking: owner 아닌 alice 가 활성화 시도 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.enableStaking({ account: alice.account })
    );
  });

  it("staking: 비활성화 상태에서 stake 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.stake([1_000n * 10n ** 18n])
    );
  });

  it("staking: APR 설정", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setAprRate([1000n]); // 10%
    assert.equal(await sihi.read.aprRate(), 1000n);
  });

  it("staking: MAX_APR 초과 시 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.setAprRate([10001n])
    );
  });

  it("staking: stake 후 예치량 확인", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([1000n]); // 10%

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    const info = await sihi.read.getStakeInfo([owner.account.address]);
    assert.equal(info.stakedAmount, amount);
    assert.equal(await sihi.read.totalStaked(), amount);
  });

  it("staking: stake 후 컨트랙트 잔액 증가", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    const contractBalance = await sihi.read.balanceOf([sihi.address]);
    assert.equal(contractBalance, amount);
  });

  it("staking: 0 stake 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await assert.rejects(sihi.write.stake([0n]));
  });

  it("staking: unstake 후 토큰 반환", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([1000n]);

    const amount = 1_000n * 10n ** 18n;
    const balanceBefore = await sihi.read.balanceOf([owner.account.address]);
    await sihi.write.stake([amount]);
    await sihi.write.unstake([amount]);

    const balanceAfter = await sihi.read.balanceOf([owner.account.address]);
    assert.ok(balanceAfter >= balanceBefore); // 보상 포함이므로 >=
  });

  it("staking: 시간 경과 후 보상 발생", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([1000n]); // 10% APR

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    // 30일 경과
    await increaseTime(30 * 24 * 60 * 60);

    const reward = await sihi.read.pendingReward([owner.account.address]);
    assert.ok(reward > 0n);
  });

  it("staking: claimReward 후 보상 수령", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([1000n]);

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    // 365일 경과 → 10% 보상
    await increaseTime(365 * 24 * 60 * 60);

    const balanceBefore = await sihi.read.balanceOf([owner.account.address]);
    await sihi.write.claimReward();
    const balanceAfter = await sihi.read.balanceOf([owner.account.address]);

    assert.ok(balanceAfter > balanceBefore);
  });

  it("staking: 보상 없을 때 claimReward revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([0n]);  // APR 0 → 보상 없음

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    // APR 0 이므로 시간 경과해도 보상 없음
    await increaseTime(365 * 24 * 60 * 60);

    await assert.rejects(sihi.write.claimReward());
  });

  it("staking: unstake 초과 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    await assert.rejects(
      sihi.write.unstake([amount + 1n])
    );
  });

  it("staking: Staked 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    const blockNumber = await publicClient.getBlockNumber();

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Staked",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.account?.toLowerCase(),
      owner.account.address.toLowerCase()
    );
    assert.equal(events[0].args.amount, amount);
  });

  it("staking: RewardClaimed 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([1000n]);

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);
    await increaseTime(365 * 24 * 60 * 60);

    const blockNumber = await publicClient.getBlockNumber();
    await sihi.write.claimReward();

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "RewardClaimed",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.ok(events[0].args.reward > 0n);
  });

  it("staking: 비활성화 후 신규 stake revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.disableStaking();

    await assert.rejects(
      sihi.write.stake([1_000n * 10n ** 18n])
    );
  });

  it("staking: APR 0 이면 보상 없음", async function () {
    const sihi = await deploySiHi();
    await sihi.write.enableStaking();
    await sihi.write.setAprRate([0n]);

    const amount = 1_000n * 10n ** 18n;
    await sihi.write.stake([amount]);

    await increaseTime(365 * 24 * 60 * 60);

    const reward = await sihi.read.pendingReward([owner.account.address]);
    assert.equal(reward, 0n);
  });


  // ════════════════════════════════════════
  // 16. 거버넌스
  // ════════════════════════════════════════

  it("governance: 제안 생성", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["APR 을 20% 로 올리자"]);
    const proposal = await sihi.read.getProposal([1n]);
    assert.equal(proposal.id, 1n);
    assert.equal(proposal.description, "APR 을 20% 로 올리자");
    assert.equal(proposal.executed, false);
    assert.equal(proposal.canceled, false);
  });

  it("governance: 토큰 부족 시 제안 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.propose(["제안"], { account: alice.account })
    );
  });

  it("governance: 찬성 투표", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]);
    const proposal = await sihi.read.getProposal([1n]);
    assert.ok(proposal.forVotes > 0n);
  });

  it("governance: 반대 투표", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, false]);
    const proposal = await sihi.read.getProposal([1n]);
    assert.ok(proposal.againstVotes > 0n);
  });

  it("governance: 중복 투표 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]);
    await assert.rejects(sihi.write.vote([1n, true]));
  });

  it("governance: 토큰 없는 주소 투표 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await assert.rejects(
      sihi.write.vote([1n, true], { account: alice.account })
    );
  });

  it("governance: 투표 기간 종료 후 투표 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await increaseTime(3 * 24 * 60 * 60 + 1); // 3일 + 1초
    await assert.rejects(sihi.write.vote([1n, true]));
  });

  it("governance: 찬성 과반수 시 통과", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]); // owner 찬성
    await increaseTime(3 * 24 * 60 * 60 + 1);
    assert.equal(await sihi.read.proposalState([1n]), 1); // 통과
  });

  it("governance: 반대 과반수 시 부결", async function () {
    const sihi = await deploySiHi();

    // alice 에게 토큰 전송 (owner 보다 많이)
    const amount = 2_000_000n * 10n ** 18n;
    await sihi.write.mint([alice.account.address, 1_000_000n * 10n ** 18n]);

    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]);                             // owner 찬성
    await sihi.write.vote([1n, false], { account: alice.account }); // alice 반대

    await increaseTime(3 * 24 * 60 * 60 + 1);
    assert.equal(await sihi.read.proposalState([1n]), 2); // 부결
  });

  it("governance: 통과된 제안 실행", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]);
    await increaseTime(3 * 24 * 60 * 60 + 1);
    await sihi.write.executeProposal([1n]);
    const proposal = await sihi.read.getProposal([1n]);
    assert.equal(proposal.executed, true);
  });

  it("governance: 부결된 제안 실행 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.mint([alice.account.address, 1_000_000n * 10n ** 18n]);
    await sihi.write.propose(["제안"]);
    await sihi.write.vote([1n, true]);
    await sihi.write.vote([1n, false], { account: alice.account });
    await increaseTime(3 * 24 * 60 * 60 + 1);
    await assert.rejects(sihi.write.executeProposal([1n]));
  });

  it("governance: 제안 취소", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.cancelProposal([1n]);
    const proposal = await sihi.read.getProposal([1n]);
    assert.equal(proposal.canceled, true);
  });

  it("governance: 취소된 제안 투표 시 revert", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    await sihi.write.cancelProposal([1n]);
    await assert.rejects(sihi.write.vote([1n, true]));
  });

  it("governance: 투표 기간 설정", async function () {
    const sihi = await deploySiHi();
    await sihi.write.setVotingDuration([BigInt(7 * 24 * 60 * 60)]); // 7일
    assert.equal(
      await sihi.read.votingDuration(),
      BigInt(7 * 24 * 60 * 60)
    );
  });

  it("governance: 투표 기간 너무 짧으면 revert", async function () {
    const sihi = await deploySiHi();
    await assert.rejects(
      sihi.write.setVotingDuration([BigInt(60 * 60)]) // 1시간
    );
  });

  it("governance: 투표 여부 조회", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    assert.equal(
      await sihi.read.hasVoted([1n, owner.account.address]),
      false
    );
    await sihi.write.vote([1n, true]);
    assert.equal(
      await sihi.read.hasVoted([1n, owner.account.address]),
      true
    );
  });

  it("governance: ProposalCreated 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.propose(["제안"]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "ProposalCreated",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.proposalId, 1n);
    assert.equal(
      events[0].args.proposer?.toLowerCase(),
      owner.account.address.toLowerCase()
    );
  });

  it("governance: Voted 이벤트 발생", async function () {
    const sihi = await deploySiHi();
    await sihi.write.propose(["제안"]);
    const blockNumber = await publicClient.getBlockNumber();

    await sihi.write.vote([1n, true]);

    const events = await publicClient.getContractEvents({
      address: sihi.address,
      abi: sihi.abi,
      eventName: "Voted",
      fromBlock: blockNumber + 1n,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].args.proposalId, 1n);
    assert.equal(events[0].args.support, true);
    assert.ok(events[0].args.weight > 0n);
  });

});
