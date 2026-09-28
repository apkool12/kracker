// 실행: npm run check:interp
import assert from "node:assert";
import { sampleSnapshots } from "../src/game/net/interpolation.ts";

const buf = [
  { t: 0, x: 0, y: 0, vx: 100, vy: 0 },
  { t: 50, x: 10, y: 0, vx: 100, vy: 0 },
  { t: 100, x: 20, y: 10, vx: 1000, vy: 0 },
];
assert.equal(sampleSnapshots(undefined, 0), null);
assert.deepEqual(sampleSnapshots(buf, -10), { x: 0, y: 0 }); // 버퍼 이전 → 첫 스냅샷
assert.deepEqual(sampleSnapshots(buf, 25), { x: 5, y: 0 }); // 사이 → 선형 보간
assert.deepEqual(sampleSnapshots(buf, 75), { x: 15, y: 5 });
assert.deepEqual(sampleSnapshots(buf, 150), { x: 70, y: 10 }); // 최신 이후 → 속도 외삽
assert.deepEqual(sampleSnapshots(buf, 10_000), { x: 120, y: 10 }); // 외삽은 100ms 상한
console.log("interpolation OK");
