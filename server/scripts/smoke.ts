// 서버 스모크 테스트: 실제 서버를 띄우고 클라이언트 2개로 핵심 흐름을 검증한다.
// 실행: npm run smoke
import { spawn } from "child_process";
import assert from "assert";
import { io, Socket } from "socket.io-client";

const PORT = 4999;
const URL = `http://localhost:${PORT}`;

const srv = spawn("npx", ["ts-node", "src/server.ts"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "inherit"],
});
let serverDied = false;
srv.on("exit", () => (serverDied = true));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const connect = () =>
  new Promise<Socket>((res) => {
    const s = io(URL, { transports: ["websocket"] });
    s.on("connect", () => res(s));
  });
const call = (s: Socket, ev: string, payload: any) =>
  new Promise<any>((res) => s.emit(ev, payload, res));
const next = (s: Socket, ev: string, ms = 8000) =>
  new Promise<any>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting ${ev}`)), ms);
    s.once(ev, (d: any) => (clearTimeout(t), res(d)));
  });

async function main() {
  await new Promise<void>((r) => srv.stdout!.on("data", (d) => String(d).includes("server on") && r()));
  const a = await connect();
  const b = await connect();

  // 잘못된 페이로드로 서버가 죽지 않아야 한다
  for (const ev of ["room:create", "room:join", "room:info", "player:select", "input:move", "game:bulletHit", "augment:select", "chat:send"]) {
    a.emit(ev, null, () => {});
    a.emit(ev, { nickname: 123, roomId: 5, max: "x" }, () => {});
  }
  await sleep(200);
  assert(!serverDied, "server crashed on bad payload");

  const created = await call(a, "room:create", { nickname: "A", roomName: "t", gameMode: "팀전" });
  assert(created.ok, "create failed");
  const roomId = created.room.roomId;
  assert((await call(b, "room:join", { roomId, nickname: "B" })).ok, "join failed");
  await call(a, "player:setColor", { roomId, color: "#D76A6A" });
  await call(b, "player:setColor", { roomId, color: "#EE9841" });

  // 팀 변경이 서버에 반영된다
  assert((await call(b, "player:setTeam", { team: "A" })).ok, "setTeam failed");
  const info = await call(a, "room:info", { roomId });
  assert.equal(info.room.players.find((p: any) => p.id === b.id).team, "A");
  await call(b, "player:setTeam", { team: "B" });

  // 장신구: 목록에 있는 것만 허용, 방 상태에 반영
  assert.equal((await call(a, "player:setAccessory", { accessory: "hacked" })).ok, false);
  assert((await call(a, "player:setAccessory", { accessory: "crown" })).ok, "setAccessory failed");
  const accInfo = await call(b, "room:info", { roomId });
  assert.equal(accInfo.room.players.find((p: any) => p.id === a.id).accessory, "crown");

  assert((await call(a, "game:start", {})).ok, "start failed");

  // 방 밖의 소켓은 데미지를 줄 수 없다
  const outsider = await connect();
  outsider.emit("game:bulletHit", { roomId, playerId: a.id, hit: { targetPlayerId: b.id, damage: 100 } });
  // 음수 데미지(힐 치트)는 무시된다
  b.emit("game:bulletHit", { hit: { targetPlayerId: b.id, damage: -1000 } });
  await sleep(200);
  const hp = await call(a, "room:info", { roomId });
  assert.equal(hp.room.players.find((p: any) => p.id === b.id).health, 100, "spoofed/negative damage applied");

  // 클라가 보고한 데미지(100)는 무시되고 서버 공식(기본 25)이 적용된다
  const hpUpdate = next(b, "game:healthUpdate");
  a.emit("game:bulletHit", { hit: { targetPlayerId: b.id, damage: 100, bulletId: "collision_1" } });
  assert.equal((await hpUpdate).health, 75, "server should compute damage");

  // A가 B를 처치 → 라운드 결과 → 증강 단계
  const result = next(a, "round:result");
  for (let i = 0; i < 3; i++) a.emit("game:bulletHit", { hit: { targetPlayerId: b.id, bulletId: "collision_1" } });
  // 죽은 B는 반격할 수 없다
  b.emit("game:bulletHit", { hit: { targetPlayerId: a.id, damage: 100 } });
  const r = await result;
  assert.equal(r.players.find((p: any) => p.id === a.id).wins, 1, "winner not credited");
  assert.equal(r.players.find((p: any) => p.id === b.id).wins, 0, "dead shooter scored");
  const aug = await next(a, "round:augment");

  // 증강 선택 완료 → 다음 라운드. 기생충: 데미지 25-10=15, 이후 1초마다 3씩 흡수
  const complete = next(a, "augment:complete");
  assert((await call(a, "augment:select", { augmentId: "기생충", round: aug.round })).ok);
  assert((await call(b, "augment:select", { augmentId: "빨리뽑기", round: aug.round })).ok);
  await complete;
  await sleep(100);
  const hit = next(b, "game:healthUpdate");
  a.emit("game:bulletHit", { hit: { targetPlayerId: b.id, bulletId: "collision_2" } });
  assert.equal((await hit).health, 85, "parasite damage should be 15");
  await sleep(1150);
  const afterTick = await call(a, "room:info", { roomId });
  assert.equal(afterTick.room.players.find((p: any) => p.id === b.id).health, 82, "parasite tick");

  // 게임 중 B가 나가면 A는 갇히지 않고 게임이 끝난다
  const final = next(a, "game:final");
  b.disconnect();
  const fin = await final;
  assert.deepEqual(fin.winnerIds, [a.id], "remaining player should win");

  // 게임이 끝난 방은 다시 대기 상태
  const after = await call(a, "room:info", { roomId });
  assert.equal(after.room.status, "waiting");

  a.disconnect();
  outsider.disconnect();
  assert(!serverDied, "server died");
  console.log("SMOKE OK");
}

main()
  .catch((e) => {
    console.error("SMOKE FAIL:", e.message);
    process.exitCode = 1;
  })
  .finally(() => srv.kill());
