# TypeScript 기초 (C 개발자를 위한 가이드)

> 블록체인 / SiHi 토큰 개발 과정에서 정리한 TypeScript 입문 노트

---

## 1. TypeScript 란?

```
JavaScript + 타입 검사 = TypeScript

C       → 컴파일 → 바이너리
TypeScript → 컴파일 → JavaScript → 실행
```

- 마이크로소프트가 만든 언어 (2012년)
- JS의 단점(타입 없음 → 버그 많음)을 보완
- 결국 JS로 변환돼서 실행됨

---

## 2. 타입 시스템

### 기본 타입

```typescript
// C                        TypeScript
int age = 20;           →   let age: number = 20;
char name[] = "SiHi";  →   let name: string = "SiHi";
int flag = 1;           →   let isActive: boolean = true;

// TypeScript 전용
let anything: any = 42;      // 뭐든 OK (비추천)
let nothing: void = undefined; // 반환값 없는 함수
```

### 타입 추론 (자주 씀)

```typescript
// 타입 명시 안 해도 자동으로 추론
let age = 20;        // number 로 자동 인식
let name = "SiHi";  // string 으로 자동 인식

age = "hello";  // ❌ 컴파일 에러! number 인데 string 대입
```

---

## 3. 함수

```c
// C
int add(int a, int b) {
    return a + b;
}
```

```typescript
// TypeScript - 일반 함수
function add(a: number, b: number): number {
    return a + b;
}

// 화살표 함수 (자주 쓰는 방식)
const add = (a: number, b: number): number => a + b;

// 반환값 없는 함수
function log(msg: string): void {
    console.log(msg);
}

// 선택적 매개변수 (? 붙이면 없어도 됨)
function greet(name: string, age?: number): string {
    return age ? `${name} (${age})` : name;
}
```

---

## 4. 배열

```c
// C
int arr[] = {1, 2, 3};
```

```typescript
// TypeScript
let arr: number[] = [1, 2, 3];
let names: string[] = ["Alice", "Bob"];

// 제네릭 방식 (같은 의미)
let arr: Array<number> = [1, 2, 3];

// 배열 메서드
arr.push(4);           // 끝에 추가
arr.pop();             // 끝에서 제거
arr.length;            // 길이
arr.map(x => x * 2);  // 각 요소 변환 → [2, 4, 6]
arr.filter(x => x > 1); // 조건 필터 → [2, 3]
```

---

## 5. 객체와 interface (C의 struct)

```c
// C
struct Token {
    char name[10];
    int supply;
};
struct Token sihi = {"SiHi", 1000000};
```

```typescript
// TypeScript - interface (구조 정의)
interface Token {
    name: string;
    supply: number;
    isActive: boolean;
    symbol?: string;   // ? = 선택적 필드
}

// 사용
const sihi: Token = {
    name: "SiHi",
    supply: 1_000_000,
    isActive: true
};

// 점(.)으로 접근
console.log(sihi.name);    // "SiHi"
console.log(sihi.supply);  // 1000000
```

---

## 6. BigInt (블록체인에서 필수!)

```typescript
// 일반 number - 큰 숫자 정밀도 손실!
1_000_000 * 10 ** 18  // ❌ 정밀도 손실

// BigInt - 아무리 큰 숫자도 정확하게
1_000_000n * 10n ** 18n  // ✅ 정확
//       ↑           ↑
//       n 붙이면 BigInt

// BigInt 연산
const a = 100n;
const b = 200n;
console.log(a + b);  // 300n
console.log(a * b);  // 20000n

// 주의: number 와 BigInt 혼용 불가
const c = 100n + 1;  // ❌ 에러!
const d = 100n + 1n; // ✅ OK
```

---

## 7. 가장 중요! 비동기 async/await

C는 함수 호출하면 즉시 결과가 나오지만,
블록체인/네트워크는 응답을 기다려야 해요.

```c
// C - 동기 (순서대로 즉시 실행)
int balance = getBalance();
printf("%d\n", balance);  // 바로 값 출력
```

```typescript
// TypeScript - 비동기

// ❌ await 없으면
const balance = sihi.read.balanceOf([addr]);
console.log(balance);
// Promise { <pending> } 출력
// 값이 아니라 "대기중" 객체가 출력됨!

// ✅ await 있으면
const balance = await sihi.read.balanceOf([addr]);
console.log(balance);
// 실제 값 출력!
```

### Promise 란?

```typescript
// 피자 주문에 비유
const 영수증 = 피자주문();        // 즉시 영수증(Promise) 받음
const 피자   = await 피자주문();  // 피자 나올 때까지 기다림

// Promise 3가지 상태
pending   → 아직 기다리는 중
fulfilled → 성공적으로 완료
rejected  → 실패 (에러 발생)
```

### async 함수

```typescript
// await 는 async 함수 안에서만 사용 가능!

// ❌ 일반 함수에서 await 사용 불가
function getBalance() {
    const balance = await sihi.read.balanceOf([addr]); // 에러!
}

// ✅ async 함수에서 await 사용 가능
async function getBalance() {
    const balance = await sihi.read.balanceOf([addr]); // OK
    return balance;
}
```

---

## 8. 에러 처리

```c
// C
if (result < 0) {
    printf("에러!\n");
}
```

```typescript
// TypeScript - try/catch
try {
    const balance = await sihi.read.balanceOf([addr]);
    console.log(balance);
} catch (error) {
    console.error("에러 발생:", error);
}

// assert (테스트에서 사용)
import assert from "node:assert/strict";

assert.equal(a, b);           // a === b 아니면 실패
assert.rejects(promise);      // Promise 가 에러나야 통과
```

---

## 9. import / export (C의 헤더파일)

```c
// C
#include <stdio.h>
#include "mylib.h"
```

```typescript
// TypeScript
import assert from "node:assert/strict";     // 전체 가져오기
import { describe, it } from "node:test";    // 일부만 가져오기
import { network } from "hardhat";           // 외부 패키지

// 내보내기
export function add(a: number, b: number): number {
    return a + b;
}
export default class MyClass { ... }         // 기본 내보내기
```

---

## 10. 구조 분해 할당

```typescript
// 배열 구조 분해
const [owner, alice, bob] = await viem.getWalletClients();
// 풀어쓰면:
const wallets = await viem.getWalletClients();
const owner = wallets[0];
const alice = wallets[1];
const bob   = wallets[2];

// 객체 구조 분해
const { viem } = await network.create();
// 풀어쓰면:
const result = await network.create();
const viem = result.viem;
```

---

## 11. 템플릿 리터럴 (C의 printf)

```c
// C
printf("이름: %s, 잔액: %d\n", name, balance);
```

```typescript
// TypeScript
const name = "SiHi";
const balance = 1000n;

console.log(`이름: ${name}, 잔액: ${balance}`);
// 백틱(`) 사용, ${} 안에 변수/식 넣기
```

---

## 12. 실전 코드 읽기

지금까지 작성한 테스트 코드를 다시 보면:

```typescript
import assert from "node:assert/strict";   // 검증 도구
import { describe, it } from "node:test";  // 테스트 도구
import { network } from "hardhat";         // 블록체인 네트워크

describe("SiHi", async function () {       // 테스트 그룹 묶기

  const { viem } = await network.create(); // 가상 네트워크 생성
  const [owner, alice, bob] = await viem.getWalletClients(); // 지갑 3개

  // 매번 새로 배포하는 함수
  async function deploySiHi() {
    return viem.deployContract("SiHi", [owner.account.address]);
  }

  it("mint: MAX_SUPPLY 초과 시 revert", async function () {
    const sihi = await deploySiHi();                    // 배포 대기

    const maxSupply   = await sihi.read.MAX_SUPPLY();   // 조회 대기
    const totalSupply = await sihi.read.totalSupply();  // 조회 대기

    const overAmount = maxSupply - totalSupply + 1n;    // BigInt 연산

    await assert.rejects(                               // 에러 나야 통과
      sihi.write.mint([alice.account.address, overAmount])
    );
  });

});
```

---

## C vs TypeScript 핵심 비교표

| 개념 | C | TypeScript |
|---|---|---|
| 정수 | `int` | `number` |
| 문자열 | `char[]` | `string` |
| 불리언 | `int (0/1)` | `boolean` |
| 큰 정수 | 없음 | `BigInt (n)` |
| 구조체 | `struct` | `interface` |
| 포인터 | `*ptr` | 없음 (참조) |
| 메모리 관리 | 직접 | 자동 (GC) |
| 실행 방식 | 동기 | 비동기 (async/await) |
| 헤더파일 | `#include` | `import` |
| 출력 | `printf` | `console.log` |
| 에러 처리 | 반환값 체크 | `try/catch` |

---

## 다음 학습 목표

```
✅ 기본 타입
✅ 함수
✅ 배열 / 객체
✅ BigInt
✅ async/await
✅ import/export

📌 다음에 볼 것
- 제네릭 (Generic)
- 클래스 (Class)
- 배포 스크립트 작성
- .env 환경변수 설정
```

---

> 💡 C 를 아는 사람이 TypeScript 배울 때 가장 중요한 것:
> **"네트워크 호출은 무조건 await"** 이것만 기억하면 절반은 성공!
