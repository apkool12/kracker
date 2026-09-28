// server.ts
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
type Team = "A" | "B";
type Status = "waiting" | "playing" | "ended";
type Visibility = "public" | "private";

type Player = {
  id: string; // socket.id
  nickname: string;
  team?: Team;
  color?: string;
  ready: boolean;
  health?: number; // 체력 추가
  wins?: number; // 🆕 라운드 승리 스택
  // 🆕 활성 증강: augmentId -> { id, startedAt }
  augments?: Record<string, { id: string; startedAt: number }>;
  // 🆕 서버가 추적하는 마지막 위치(상태/넉백 계산용)
  x?: number;
  y?: number;
};

type Room = {
  roomId: string;
  hostId: string;
  max: number;
  status: Status;
  players: Record<string, Player>;
  visibility: Visibility; // 공개/비공개
  roomName: string; // 방 이름
  gameMode: string; // "팀전" 등
  createdAt: number;
  nextTeam: Team; // 다음 배정 예정 팀 ("A" 또는 "B")
  // 증강 관련 필드 추가
  currentRound: number;
  roundResults: Array<{
    round: number;
    players: Array<{
      id: string;
      nickname: string;
      color: string;
      wins: number;
    }>;
  }>;
  augmentSelections: Array<{
    round: number;
    selections: Record<string, string>; // playerId -> augmentId
    completionScheduled?: boolean; // 🆕 완료 방송 예약 여부
  }>;
  // 🆕 라운드 종료 브로드캐스트 지연 중 여부
  isRoundEnding?: boolean;
  // 라운드 진행 단계: 전투 중에만 데미지가 들어간다
  phase?: "fighting" | "roundEnd" | "augment";
};

const MAX_ROOMS = 5;
const TEAM_CAP = 3;
const MAX_HIT_DAMAGE = 100; // 낙하 등 클라가 보고하는 자기 피해의 상한
const WINS_TO_FINAL = 5;
const BASE_BULLET_DAMAGE = 25; // 클라 ShootingManager 기본 damage 와 동일
const BASE_MAX_HEALTH = 100;

// 증강 정의: 클라이언트와 같은 파일을 공유 (src/, dist/ 둘 다 같은 깊이)
type AugmentDef = {
  id: string;
  effects?: {
    bullet?: { damageMul?: number; damageAdd?: number };
    player?: { maxHealthDelta?: number };
  };
};
const AUGMENT_DEFS = new Map<string, AugmentDef>(
  (JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../kracker/src/data/augments.json"), "utf8")
  ) as AugmentDef[]).map((a) => [a.id, a])
);
const augEffects = (p: Player) =>
  Object.keys(p.augments || {}).map((id) => AUGMENT_DEFS.get(id)?.effects || {});

// 서버 권위 총알 데미지: 클라 buildBulletConfig 와 같은 공식
function bulletDamage(p: Player): number {
  let mul = 1;
  let add = 0;
  for (const e of augEffects(p)) {
    mul *= e.bullet?.damageMul ?? 1;
    add += e.bullet?.damageAdd ?? 0;
  }
  return Math.max(0, Math.round(BASE_BULLET_DAMAGE * mul + add));
}
function maxHealthOf(p: Player): number {
  return BASE_MAX_HEALTH + augEffects(p).reduce((s, e) => s + (e.player?.maxHealthDelta ?? 0), 0);
}

const str = (v: unknown, max: number, fallback = "") =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const COLOR_PRESETS = [
  "#D76A6A",
  "#EE9841",
  "#5A945B",
  "#196370",
  "#6C3FAF",
  "#DF749D",
];

const isHexColor = (s: string) => /^#?[0-9a-fA-F]{6}$/.test(s);
const normalizeHex = (s: string) => ("#" + s.replace("#", "")).toUpperCase();
const getUsedColors = (room: Room) =>
  new Set(
    Object.values(room.players).map((p) => (p.color || "").toLowerCase())
  );
const pickFirstFreeColor = (room: Room) => {
  const used = getUsedColors(room);
  return COLOR_PRESETS.find((c) => !used.has(c.toLowerCase())) ?? "#888888";
};

const toSafeRoom = (room: Room) => ({
  roomId: room.roomId,
  max: room.max,
  status: room.status,
  visibility: room.visibility,
  roomName: room.roomName,
  gameMode: room.gameMode,
  createdAt: room.createdAt,
  players: Object.values(room.players).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    color: p.color,
    team: p.team,
    ready: p.ready,
  })),
});

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map<string, Room>();

// ──────────────────────────────────────────────────────────────
// 맵 스폰 좌표(기본 level1)
// 클라이언트의 public/maps/level1.json과 동일하게 유지
const DEFAULT_SPAWNS: Array<{ name: "A" | "B"; x: number; y: number }> = [
  { name: "A", x: 165, y: 350 },
  { name: "B", x: 1755, y: 350 },
  { name: "A", x: 500, y: 100 },
  { name: "B", x: 1420, y: 100 },
  { name: "A", x: 375, y: 750 },
  { name: "B", x: 1545, y: 750 },
];

function computeSpawnPositions(room: Room): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const entries = Object.entries(room.players);

  const byTeam = (team: Team) => DEFAULT_SPAWNS.filter((s) => s.name === team);
  const all = DEFAULT_SPAWNS.slice();

  if (room.gameMode === "팀전") {
    const teamAIds = entries.filter(([, p]) => p.team === "A").map(([id]) => id);
    const teamBIds = entries.filter(([, p]) => p.team === "B").map(([id]) => id);

    const aSpawns = byTeam("A");
    const bSpawns = byTeam("B");

    teamAIds.forEach((id, idx) => {
      const candidate = aSpawns.length > 0 ? aSpawns[idx % aSpawns.length] : all[idx % all.length];
      const base = candidate || all[0];
      const cycle = Math.floor(idx / Math.max(1, (aSpawns.length || all.length)));
      positions[id] = { x: base!.x + (cycle % 2 === 0 ? 10 * cycle : -10 * cycle), y: base!.y };
    });
    teamBIds.forEach((id, idx) => {
      const candidate = bSpawns.length > 0 ? bSpawns[idx % bSpawns.length] : all[idx % all.length];
      const base = candidate || all[0];
      const cycle = Math.floor(idx / Math.max(1, (bSpawns.length || all.length)));
      positions[id] = { x: base!.x + (cycle % 2 === 0 ? 10 * cycle : -10 * cycle), y: base!.y };
    });
  } else {
    entries.forEach(([id], idx) => {
      const base = all[idx % all.length] || all[0];
      const cycle = Math.floor(idx / Math.max(1, all.length));
      positions[id] = { x: base!.x + (cycle % 2 === 0 ? 10 * cycle : -10 * cycle), y: base!.y };
    });
  }

  return positions;
}

function safeRoomState(room: Room) {
  const players = Object.values(room.players).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    team: p.team,
    color: p.color,
    ready: p.ready,
    health: p.health || 100, // 체력 정보 포함
  }));
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    max: room.max,
    status: room.status,
    players,
    // 추가
    visibility: room.visibility,
    roomName: room.roomName,
    gameMode: room.gameMode,
  };
}

// ──────────────────────────────────────────────────────────────
// Socket.IO
// ──────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // 핸들러 예외가 프로세스를 죽이지 않도록 모든 socket.on 을 감싼다
  const on = socket.on.bind(socket);
  (socket as any).on = (ev: string, fn: (...a: any[]) => void) =>
    on(ev, (...args: any[]) => {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[HANDLER ERROR] ${ev} from ${socket.id}:`, e);
        const ack = args[args.length - 1];
        if (typeof ack === "function") ack({ ok: false, error: "BAD_REQUEST" });
      }
    });

  // 방 생성
  socket.on("room:create", (payload: any, ack?: Function) => {
    payload = payload || {};
    // 이미 들어가 있는 방이 있으면 먼저 나간다 (한 소켓이 방을 여러 개 점유하지 않도록)
    leaveAllRooms(socket);

    // 제한 초과 시 실패 응답
    if (rooms.size >= MAX_ROOMS) {
      return ack?.({ ok: false, error: "ROOM_LIMIT", max: MAX_ROOMS });
    }

    let roomId: string;
    do {
      roomId = Math.random().toString(36).slice(2, 7).toUpperCase();
    } while (rooms.has(roomId));

    const room: Room = {
      roomId,
      hostId: socket.id,
      max: Math.max(2, Math.min(16, num(payload.max) ?? 8)),
      status: "waiting",
      players: {},
      // 기본값 지정
      visibility: payload.visibility === "private" ? "private" : "public",
      roomName: str(payload.roomName, 30, "ROOM"),
      gameMode: str(payload.gameMode, 20, "팀전"),
      createdAt: Date.now(),
      nextTeam: "A", // 처음은 A로 시작
      // 증강 관련 필드 초기화
      currentRound: 0,
      roundResults: [],
      augmentSelections: [],
      isRoundEnding: false,
    };

    const player: Player = {
      id: socket.id,
      nickname: str(payload.nickname, 20, "Player"),
      ready: false,
      team: "A",
      health: 100,
      wins: 0,
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    room.players[socket.id] = player;

    room.nextTeam = "B";

    console.log(
      `[ROOM CREATE] ${player.nickname} (${socket.id}) -> ${roomId} (max=${room.max})`
    );

    ack?.({ ok: true, room: safeRoomState(room) });
    io.to(roomId).emit("room:update", safeRoomState(room));
  });

  // 4) 방 목록: 공개방만 + 필드 포함
  socket.on("room:list", (_: {}, ack?: Function) => {
    const list = [...rooms.values()]
      .filter((r) => r.visibility === "public" && r.status === "waiting")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3) //서버에서도 3개 제한
      .map((r) => ({
        roomId: r.roomId,
        max: r.max,
        players: safeRoomState(r).players,
        status: r.status,
        // 추가
        visibility: r.visibility,
        roomName: r.roomName,
        gameMode: r.gameMode,
        createdAt: r.createdAt,
      }));
    ack?.({ ok: true, rooms: list });
  });

  // 5) 방 정보 조회 (로비 새로고침용)
  socket.on("room:info", (payload: { roomId: string }, ack?: Function) => {
    const room = rooms.get(payload?.roomId);
    if (!room) return ack?.({ ok: false, error: "NOT_FOUND" });
    ack?.({ ok: true, room: safeRoomState(room) });
  });

  function pickTeamWithAlternation(room: Room, cap: number): Team | null {
    const countA = Object.values(room.players).filter(
      (p) => p.team === "A"
    ).length;
    const countB = Object.values(room.players).filter(
      (p) => p.team === "B"
    ).length;

    const order: Team[] = room.nextTeam === "A" ? ["A", "B"] : ["B", "A"];

    for (const t of order) {
      if (t === "A" && countA < cap) {
        room.nextTeam = "B"; // 다음은 반대로
        return "A";
      }
      if (t === "B" && countB < cap) {
        room.nextTeam = "A";
        return "B";
      }
    }
    return null; // 양쪽 다 꽉 참
  }

  // 방 참가
  socket.on("room:join", (payload: any, ack?: Function) => {
    const { roomId } = payload || {};
    const nickname = str(payload?.nickname, 20, "Player");

    const room = rooms.get(roomId);

    if (!room) {
      console.log(`[ROOM JOIN FAIL] ${socket.id} -> ${roomId} (NOT_FOUND)`);
      return ack?.({ ok: false, error: "NOT_FOUND" });
    }

    // 이미 이 방에 있으면 닉네임만 갱신
    const ex = room.players[socket.id];
    if (ex) {
      ex.nickname = nickname;
      ack?.({ ok: true, room: safeRoomState(room) });
      io.to(roomId).emit("room:update", safeRoomState(room));
      return;
    }

    if (room.status !== "waiting") {
      console.log(`[ROOM JOIN FAIL] ${socket.id} -> ${roomId} (IN_PROGRESS)`);
      return ack?.({ ok: false, error: "IN_PROGRESS" });
    }
    if (Object.keys(room.players).length >= room.max) {
      console.log(`[ROOM JOIN FAIL] ${socket.id} -> ${roomId} (FULL)`);
      return ack?.({ ok: false, error: "FULL" });
    }

    const player: Player = { id: socket.id, nickname, ready: false, health: 100, wins: 0 };

    // ✅ 팀전이면: 입장 전에 팀 슬롯을 먼저 확보 (실패 시 방에 흔적을 남기지 않음)
    if (room.gameMode === "팀전") {
      const team = pickTeamWithAlternation(room, TEAM_CAP);
      if (!team) {
        return ack?.({ ok: false, error: "FULL" });
      }
      player.team = team;
    }

    // 다른 방에 있었다면 먼저 나간 뒤 합류
    leaveAllRooms(socket);
    socket.join(roomId);
    room.players[socket.id] = player;

    console.log(
      `[ROOM JOIN] ${player.nickname} (${socket.id}) -> ${roomId} (${
        Object.keys(room.players).length
      }/${room.max})`
    );

    ack?.({ ok: true, room: safeRoomState(room) });
    io.to(roomId).emit("room:update", safeRoomState(room));
    io.to(roomId).emit("player:joined", {
      players: Object.values(room.players).map((player) => ({
        ...player,
        health: player.health || 100,
      })),
    });
  });

  // 방 나가기(수동)
  socket.on("room:leave", (_: {}, ack?: Function) => {
    const left = leaveAllRooms(socket);
    ack?.({ ok: true, left });
  });

  // Ready 토글
  socket.on("player:ready", (_: {}, ack?: Function) => {
    const rid = currentRoomIdOf(socket);
    if (!rid) return ack?.({ ok: false });
    const room = rooms.get(rid);
    if (!room) return ack?.({ ok: false });
    const p = room.players[socket.id];
    if (!p) return ack?.({ ok: false });

    p.ready = !p.ready;
    console.log(
      `[READY] ${p.nickname} (${socket.id}) -> ${rid} : ${
        p.ready ? "ON" : "OFF"
      }`
    );

    io.to(rid).emit("room:update", safeRoomState(room));

    // 전원 Ready면 시작 가능 알림
    const allReady =
      Object.values(room.players).length >= 2 &&
      Object.values(room.players).every((pp) => pp.ready);
    if (allReady) {
      console.log(`[READY ALL] room ${rid} is ready to start`);
      io.to(rid).emit("game:readyToStart");
    }
    ack?.({ ok: true, ready: p.ready });
  });

  // 팀/색 선택
  socket.on(
    "player:select",
    (payload: { team?: Team; color?: string }, ack?: Function) => {
      const rid = currentRoomIdOf(socket);
      if (!rid) return ack?.({ ok: false });
      const room = rooms.get(rid);
      if (!room) return ack?.({ ok: false });
      const p = room.players[socket.id];
      if (!p) return ack?.({ ok: false });

      if (payload?.team && !trySetTeam(room, p, payload.team))
        return ack?.({ ok: false, error: "TEAM_FULL" });

      if (typeof payload?.color === "string") {
        const used = new Set(
          Object.values(room.players)
            .map((x) => x.color)
            .filter(Boolean) as string[]
        );
        if (!used.has(payload.color)) p.color = payload.color; // 중복 최소 방지
      }

      console.log(
        `[SELECT] ${p.nickname} (${socket.id}) -> room ${rid} team=${
          p.team ?? "-"
        } color=${p.color ?? "-"}`
      );

      io.to(rid).emit("room:update", safeRoomState(room));
      ack?.({ ok: true });
    }
  );

  // 로비 팀 변경 (본인만)
  socket.on("player:setTeam", (payload: { team?: Team }, ack?: Function) => {
    const rid = currentRoomIdOf(socket);
    const room = rid ? rooms.get(rid) : undefined;
    const p = room?.players[socket.id];
    if (!room || !p || room.status !== "waiting") return ack?.({ ok: false });
    if (!trySetTeam(room, p, payload?.team))
      return ack?.({ ok: false, error: "TEAM_FULL" });
    io.to(room.roomId).emit("room:update", safeRoomState(room));
    ack?.({ ok: true });
  });

  // 로비 닉네임 변경
  socket.on("player:setNickname", (payload: { nickname?: string }, ack?: Function) => {
    const rid = currentRoomIdOf(socket);
    const room = rid ? rooms.get(rid) : undefined;
    const p = room?.players[socket.id];
    const nick = str(payload?.nickname, 20);
    if (!room || !p || !nick) return ack?.({ ok: false });
    p.nickname = nick;
    io.to(room.roomId).emit("room:update", safeRoomState(room));
    ack?.({ ok: true });
  });

  //플레이어 색
  socket.on("player:setColor", (payload: { color?: string }, ack?: Function) => {
    const color = payload?.color;
    const roomId = currentRoomIdOf(socket);
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) return ack?.({ ok: false, error: "NO_ROOM" });

    const me = room.players[socket.id];
    if (!me) return ack?.({ ok: false, error: "NOT_IN_ROOM" });

    // 간단한 검증
    const isHex = /^#?[0-9a-fA-F]{6}$/.test(color || "");
    if (!isHex) return ack?.({ ok: false, error: "INVALID_COLOR" });

    const hex = ("#" + String(color).replace("#", "")).toUpperCase();

    // (선택) 중복 금지: 다른 사람이 쓰는 색이면 거부
    const used = new Set(
      Object.values(room.players).map((p) => (p.color || "").toLowerCase())
    );
    const myCurrent = (me.color || "").toLowerCase();
    if (used.has(hex.toLowerCase()) && hex.toLowerCase() !== myCurrent) {
      return ack?.({ ok: false, error: "COLOR_TAKEN" });
    }

    me.color = hex;
    ack?.({ ok: true });

    // 로비가 구독 중인 room:update 로 전파 (player:updated 는 구독자가 없었음)
    io.to(room.roomId).emit("room:update", safeRoomState(room));
  });

  // 호스트만 게임 시작
  socket.on("game:start", (_: {}, ack?: Function) => {
    const rid = currentRoomIdOf(socket);
    if (!rid) return ack?.({ ok: false, error: "NO_ROOM" });
    const room = rooms.get(rid);
    if (!room) return ack?.({ ok: false, error: "NO_ROOM" });
    if (room.hostId !== socket.id)
      return ack?.({ ok: false, error: "NOT_HOST" });
    if (room.status !== "waiting")
      return ack?.({ ok: false, error: "IN_PROGRESS" });
    if (Object.keys(room.players).length < 2)
      return ack?.({ ok: false, error: "NOT_ENOUGH_PLAYERS" });

    // ✅ 전원 팔레트 색 선택 확인 (기본색 "#888888"은 미선택)
    const DEFAULT_SKIN = "#888888";
    const everyoneColored = Object.values(room.players).every(
      (p) => p.color && p.color !== DEFAULT_SKIN
    );
    if (!everyoneColored) {
      return ack?.({ ok: false, error: "COLOR_NOT_READY" });
    }

    // 새 게임: 방 단위 진행 상태 초기화
    room.status = "playing";
    room.phase = "fighting";
    room.currentRound = 0;
    room.roundResults = [];
    room.augmentSelections = [];
    room.isRoundEnding = false;
    Object.values(room.players).forEach((p) => {
      p.health = 100;
      p.wins = 0;
      p.augments = {};
    });
    console.log(`[GAME START] room ${rid} by host ${socket.id}`);

    // 게임 시작 시 모든 플레이어의 체력 정보 전송
    const playersWithHealth = Object.values(room.players).map((player) => ({
      ...player,
      health: player.health || 100,
    }));

    // 🔢 스폰 인덱스 사전 배정 (팀전은 팀별 인덱스, 개인전은 전체 인덱스)
    const spawnPlan: Record<string, number> = {};
    const entries = Object.entries(room.players);
    if (room.gameMode === "팀전") {
      const teamA = entries.filter(([, p]) => p.team === "A").map(([id]) => id);
      const teamB = entries.filter(([, p]) => p.team === "B").map(([id]) => id);
      teamA.forEach((id, idx) => (spawnPlan[id] = idx));
      teamB.forEach((id, idx) => (spawnPlan[id] = idx));
    } else {
      entries.forEach(([id], idx) => (spawnPlan[id] = idx));
    }

    io.to(rid).emit("game:started", {
      // ← "game:started"로 변경
      startTime: Date.now(), // ← "at" 대신 "startTime"
      room: safeRoomState(room),
      players: playersWithHealth, // ← 체력 정보가 포함된 플레이어 데이터
      spawnPlan, // 🔢 초기 스폰 인덱스 전달
      spawnPositions: computeSpawnPositions(room), // 🗺️ 초기 스폰 좌표 직접 전달
    });

    // 게임 시작 시 모든 플레이어의 현재 체력 정보를 각각 전송
    Object.entries(room.players).forEach(([playerId, player]) => {
      io.to(rid).emit("game:healthUpdate", {
        playerId: playerId,
        health: player.health || 100,
        damage: 0,
        timestamp: Date.now(),
      });
    });
    ack?.({ ok: true });
  });

  // 입력 중계(로그는 과다하니 기본 비활성)
  socket.on(
    "input:move",
    (data: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      facing: "L" | "R";
    }) => {
      const rid = currentRoomIdOf(socket);
      if (!rid) return;
      const x = num(data?.x);
      const y = num(data?.y);
      if (x === null || y === null) return;
      // 서버에 마지막 위치 저장(넉백 등 상태 계산용)
      const me = rooms.get(rid)?.players[socket.id];
      if (me) {
        me.x = x;
        me.y = y;
      }
      socket
        .to(rid)
        .emit("state:move", { id: socket.id, ...data, t: Date.now() });
    }
  );

  socket.on("input:shoot", (data: { x: number; y: number; angle: number }) => {
    const rid = currentRoomIdOf(socket);
    if (!rid) return;
    // 죽은 플레이어의 사격은 중계하지 않음
    if ((rooms.get(rid)?.players[socket.id]?.health ?? 0) <= 0) return;

    socket.to(rid).emit("state:shoot", {
      id: socket.id,
      ...data,
      t: Date.now(),
    });
  });

  // 원격 HP 반영용: 총알 피격 중계
  // 방/사수는 클라가 보낸 값이 아니라 소켓 기준으로 판정한다 (위조 방지)
  socket.on("game:bulletHit", (payload: { hit: any }) => {
    const hit = payload?.hit;
    const roomId = currentRoomIdOf(socket);
    if (!roomId || !hit) return;
    const room = rooms.get(roomId);
    if (!room || room.status !== "playing" || room.phase !== "fighting") return;

    const shooterId = socket.id;
    const shooter = room.players[shooterId];
    const targetId: string = hit.targetPlayerId;
    const target = room.players[targetId];
    if (!shooter || !target) return;
    // 죽은 사수의 총알은 무효 (자기 자신 낙하 데미지는 예외 없이 동일 규칙)
    if ((shooter.health ?? 100) <= 0) return;

    // 증강 효과는 상대를 맞췄을 때만 (낙하 데미지 등 자기 피격 제외)
    const isSelfHit = targetId === shooterId;
    const isSplash = String(hit.bulletId ?? "").startsWith("explosion_");
    const damage = isSelfHit
      ? Math.min(MAX_HIT_DAMAGE, Math.max(0, num(hit.damage) ?? 0))
      : isSplash
        ? Math.round(bulletDamage(shooter) * 0.5)
        : bulletDamage(shooter);
    const newHealth = applyDamage(room, targetId, damage);
    if (newHealth === null) return;
    const hx = num(hit.x) ?? target.x ?? 0;
    const hy = num(hit.y) ?? target.y ?? 0;

    if (!isSelfHit && newHealth > 0) {
      // 독걸려랑: DoT (초당 5뎀, 3틱) / 벌이야!: DoT (2초당 5뎀, 3틱)
      if (shooter.augments?.["독걸려랑"]) scheduleDot(room, targetId, 5, 3, 1000);
      if (shooter.augments?.["벌이야!"]) scheduleDot(room, targetId, 5, 3, 2000);
    }

    // ===== 서버 권위 상태이상/버프 처리 =====
    if (!isSelfHit && shooter.augments) {
      // 끈적여요: 둔화 (augments.json 기준 1500ms, 0.5)
      if (shooter.augments["끈적여요"]) {
        io.to(roomId).emit("game:event", {
          type: "status",
          playerId: targetId,
          data: { status: "slow", ms: 1500, multiplier: 0.5 },
        });
      }

      // 앗따거: 스턴(1000ms)
      if (shooter.augments["앗따거"]) {
        io.to(roomId).emit("game:event", {
          type: "status",
          playerId: targetId,
          data: { status: "stun", ms: 1000 },
        });
      }

      // 잠깐만: 넉백 (기본 임펄스 * 2)
      if (shooter.augments["잠깐만"]) {
        let dx = (target.x ?? hx) - hx;
        let dy = (target.y ?? hy) - hy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const impulseBase = 400 * 2;
        io.to(roomId).emit("game:event", {
          type: "status",
          playerId: targetId,
          data: {
            status: "knockback",
            vx: (dx / len) * impulseBase,
            vy: (dy / len) * impulseBase,
            ms: 0,
          },
        });
      }

      // 기생충: 라이프스틸(+15) — 살아있는 사수만
      if (shooter.augments["기생충"] && (shooter.health ?? 100) > 0) {
        shooter.health = Math.min(maxHealthOf(shooter), (shooter.health ?? 100) + 15);
        io.to(roomId).emit("game:healthUpdate", {
          playerId: shooterId,
          health: shooter.health,
          damage: 0,
          timestamp: Date.now(),
        });
      }
    }

    // 기존 충돌 이벤트도 전송
    io.to(roomId).emit("game:bulletHit", hit);
  });

  // 관절(포즈) 동기화: 조준 각도 등 — 방/발신자는 소켓 기준
  socket.on("pose:update", (payload: { pose: any }) => {
    const rid = currentRoomIdOf(socket);
    const pose = payload?.pose;
    if (!rid || !pose || typeof pose !== "object") return;
    socket.to(rid).emit("pose:update", { ...pose, id: socket.id });
  });

  // 파티클 이벤트 중계
  socket.on("particle:create", (payload: { particleData: any }) => {
    const rid = currentRoomIdOf(socket);
    const particleData = payload?.particleData;
    if (!rid || !particleData) return;
    socket.to(rid).emit("particle:create", particleData);
  });

  // 채팅
  socket.on("chat:send", (data: { message: string }) => {
    const rid = currentRoomIdOf(socket);
    const msg = str(data?.message, 200);
    if (!rid || !msg) return;
    io.to(rid).emit("chat:message", {
      id: socket.id,
      message: msg,
      t: Date.now(),
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 증강 선택 처리 (플레이어별 선택 결과 서버 보관)
  // ──────────────────────────────────────────────────────────────
  socket.on(
    "augment:select",
    (payload: { augmentId: string; round: number }, ack?: Function) => {
      const rid = currentRoomIdOf(socket);
      const room = rid ? rooms.get(rid) : undefined;
      if (!room) return ack?.({ ok: false, error: "NO_ROOM" });
      // 증강 선택 단계의 현재 라운드에만 선택 가능
      if (room.phase !== "augment" || payload?.round !== room.currentRound)
        return ack?.({ ok: false, error: "NOT_AUGMENT_PHASE" });
      const augmentId = str(payload?.augmentId, 50);
      if (!augmentId) return ack?.({ ok: false, error: "BAD_AUGMENT" });

      const sel = getRoundSelection(room);
      if (sel.selections[socket.id])
        return ack?.({ ok: false, error: "ALREADY_SELECTED" });
      sel.selections[socket.id] = augmentId;

      console.log(`[AUGMENT SELECT] room ${rid}, round ${room.currentRound}, ${socket.id} -> ${augmentId}`);

      // 진행 상황 브로드캐스트 (실시간 동기화)
      io.to(room.roomId).emit("augment:progress", {
        round: room.currentRound,
        selections: sel.selections,
        selectedCount: Object.keys(sel.selections).length,
        totalPlayers: Object.keys(room.players).length,
      });

      const allSelected = tryCompleteAugments(room);
      ack?.({ ok: true, allSelected });
    }
  );

  // 연결 종료: "disconnect" 시점엔 socket.rooms 가 이미 비어 있으므로 "disconnecting" 에서 정리
  socket.on("disconnecting", () => {
    console.log(`[DISCONNECT] ${socket.id}`);
    leaveAllRooms(socket);
  });
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function currentRoomIdOf(socket: any): string | null {
  const rid = [...socket.rooms].find((r) => r !== socket.id);
  return rid ?? null;
}

function trySetTeam(room: Room, p: Player, team: unknown): boolean {
  if (team !== "A" && team !== "B") return false;
  if (p.team === team) return true;
  const count = Object.values(room.players).filter((x) => x.team === team).length;
  if (count >= TEAM_CAP) return false;
  p.team = team;
  return true;
}

function leaveAllRooms(socket: any) {
  const joined = [...socket.rooms].filter((r) => r !== socket.id);
  const left: string[] = [];
  for (const rid of joined) {
    const room = rooms.get(rid);
    socket.leave(rid);
    if (!room) continue;

    const player = room.players[socket.id];
    console.log(`[ROOM LEAVE] ${player?.nickname || socket.id} left ${rid}`);

    delete room.players[socket.id];
    left.push(rid);

    const remaining = Object.keys(room.players);
    if (remaining.length === 0) {
      rooms.delete(rid);
      console.log(`[ROOM CLOSE] room ${rid} closed (empty)`);
      continue;
    }

    // 호스트가 나가면 다음 사람을 호스트로
    if (room.hostId === socket.id) {
      room.hostId = remaining[0]!;
      console.log(`[HOST SWITCH] room ${rid} -> ${room.hostId}`);
    }

    io.to(rid).emit("room:update", safeRoomState(room));
    io.to(rid).emit("player:left", { id: socket.id });

    // 게임 중 이탈: 혼자 남으면 게임 종료, 아니면 멈춘 단계를 다시 진행
    if (room.status === "playing") {
      if (remaining.length < 2) {
        finishGame(room);
      } else if (room.phase === "fighting") {
        checkRoundEnd(room);
      } else if (room.phase === "augment") {
        tryCompleteAugments(room);
      }
    }
  }
  return left;
}

// 데미지 적용 + 체력/사망 방송 + 라운드 종료 판정. 이미 죽었거나 전투 중이 아니면 null
function applyDamage(room: Room, targetId: string, damage: number): number | null {
  const target = room.players[targetId];
  if (!target || room.phase !== "fighting") return null;
  const current = target.health ?? 100;
  if (current <= 0) return null;

  const newHealth = Math.max(0, current - damage);
  target.health = newHealth;

  io.to(room.roomId).emit("game:healthUpdate", {
    playerId: targetId,
    health: newHealth,
    damage,
    timestamp: Date.now(),
  });
  io.to(room.roomId).emit("game:event", {
    type: "showHealthBar",
    playerId: targetId,
    data: { playerId: targetId, health: newHealth, duration: 3000 },
  });

  if (newHealth <= 0) {
    io.to(room.roomId).emit("game:event", {
      type: "dead",
      playerId: targetId,
      data: { x: target.x ?? 0, y: target.y ?? 0 },
    });
    checkRoundEnd(room);
  }
  return newHealth;
}

// 도트 데미지: 라운드가 바뀌면(체력 리셋 등) 자동 중단
function scheduleDot(room: Room, targetId: string, dmg: number, ticks: number, intervalMs: number) {
  const round = room.currentRound;
  const timer = setInterval(() => {
    if (
      rooms.get(room.roomId) !== room ||
      room.currentRound !== round ||
      applyDamage(room, targetId, dmg) === null
    ) {
      return clearInterval(timer);
    }
    if (--ticks <= 0 || (room.players[targetId]?.health ?? 0) <= 0) clearInterval(timer);
  }, intervalMs);
}

// 🔎 라운드 종료 판정 및 스케줄링 (3초 대기 후 방송)
function checkRoundEnd(room: Room) {
  if (room.phase !== "fighting" || room.isRoundEnding) return;
  const { shouldEnd, winners } = evaluateRoundEnd(room);
  if (!shouldEnd) return;
  room.isRoundEnding = true;
  room.phase = "roundEnd"; // 이 시점부터 추가 데미지/승리 누적 차단
  const round = room.currentRound;
  setTimeout(() => {
    room.isRoundEnding = false;
    if (rooms.get(room.roomId) !== room || room.status !== "playing" || room.currentRound !== round) return;
    winners.forEach((pid) => {
      const wp = room.players[pid];
      if (wp) wp.wins = (wp.wins || 0) + 1;
    });
    endRound(io, room);
  }, 3000);
}

function getRoundSelection(room: Room) {
  let sel = room.augmentSelections.find((s) => s.round === room.currentRound);
  if (!sel) {
    sel = { round: room.currentRound, selections: {}, completionScheduled: false };
    room.augmentSelections.push(sel);
  }
  return sel;
}

// 남아있는 모든 플레이어가 골랐으면 증강 적용 후 다음 라운드 시작
function tryCompleteAugments(room: Room): boolean {
  if (room.phase !== "augment") return false;
  const sel = getRoundSelection(room);
  const all = Object.keys(room.players).every((id) => sel.selections[id]);
  if (!all || sel.completionScheduled) return all;
  sel.completionScheduled = true;
  const rid = room.roomId;
  const round = room.currentRound;
  console.log(`[AUGMENT COMPLETE] room ${rid}, round ${round}`);

  io.to(rid).emit("augment:complete", { round, selections: sel.selections });

  // 서버 저장: 각 플레이어의 활성 증강 갱신
  Object.entries(sel.selections).forEach(([pid, augId]) => {
    const p = room.players[pid];
    if (!p) return;
    if (!p.augments) p.augments = {};
    p.augments[augId] = { id: augId, startedAt: Date.now() };
  });

  io.to(rid).emit("augment:snapshot", {
    players: Object.values(room.players).map((p) => ({ id: p.id, augments: p.augments || {} })),
    round,
    t: Date.now(),
  });

  // 전원 체력 회복(증강 최대 체력 반영) + 스폰 복귀 + 부활, 그리고 전투 재개
  Object.values(room.players).forEach((p) => {
    p.health = maxHealthOf(p);
    io.to(rid).emit("game:healthUpdate", { playerId: p.id, health: p.health, damage: 0, timestamp: Date.now() });
  });
  Object.keys(room.players).forEach((playerId, index) => {
    io.to(rid).emit("game:event", {
      type: "respawnAll",
      playerId: "server",
      data: { round, spawnIndex: index, targetPlayerId: playerId },
    });
  });
  Object.keys(room.players).forEach((playerId) => {
    io.to(rid).emit("game:event", { type: "alive", playerId, data: { round } });
  });
  room.phase = "fighting";
  return true;
}

// ──────────────────────────────────────────────────────────────
// 라운드 종료 판정 및 처리 헬퍼
// ──────────────────────────────────────────────────────────────
function evaluateRoundEnd(room: Room): {
  shouldEnd: boolean;
  winners: string[];
} {
  const players = Object.values(room.players);
  const alive = players.filter((p) => (p.health ?? 100) > 0);

  if (alive.length <= 1) {
    // 살아남은 사람이 1명이면 그 사람, 0명이면 빈 배열
    return { shouldEnd: true, winners: alive.map((p) => p.id) };
  }

  // 팀전인 경우에만: 살아남은 플레이어들이 모두 같은 팀이면 종료
  if (room.gameMode === "팀전") {
    const aliveTeams = new Set(alive.map((p) => p.team));
    if (aliveTeams.size === 1) {
      return { shouldEnd: true, winners: alive.map((p) => p.id) };
    }
  }

  return { shouldEnd: false, winners: [] };
}

function buildRoundResultPayload(
  room: Room
): Array<{ id: string; nickname: string; color: string; wins: number }> {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    color: p.color || "#888888",
    wins: p.wins || 0,
  }));
}

function endRound(io: Server, room: Room) {
  room.currentRound += 1;

  const payloadPlayers = buildRoundResultPayload(room);

  room.roundResults.push({
    round: room.currentRound,
    players: payloadPlayers,
  });

  // 결과 패널 표출 지시
  io.to(room.roomId).emit("round:result", {
    players: payloadPlayers,
    round: room.currentRound,
  });

  // 최종 승리 조건: 한 명이라도 wins >= 5 (팀전도 플레이어 wins로 판정)
  const isFinal = Object.values(room.players).some((p) => (p.wins || 0) >= WINS_TO_FINAL);
  const round = room.currentRound;

  setTimeout(() => {
    if (rooms.get(room.roomId) !== room || room.status !== "playing" || room.currentRound !== round) return;
    if (isFinal) {
      finishGame(room);
    } else {
      // 증강 선택 화면으로 전환
      room.phase = "augment";
      io.to(room.roomId).emit("round:augment", {
        players: Object.values(room.players).map((p) => ({
          id: p.id,
          nickname: p.nickname,
          color: p.color || "#888888",
        })),
        round: room.currentRound,
      });
    }
  }, 3000);
}

// 최종 결과 방송 후 방을 대기 상태로 되돌린다 (재시작/재입장 가능)
function finishGame(room: Room) {
  // 승자: 목표 승수 달성자, 없으면(상대 이탈 등) 남아있는 플레이어 중 최다 승
  const players = Object.values(room.players);
  const top = Math.max(0, ...players.map((p) => p.wins || 0));
  const winnerIds = players
    .filter((p) => (p.wins || 0) >= WINS_TO_FINAL || (top < WINS_TO_FINAL && (p.wins || 0) === top))
    .map((p) => p.id);
  io.to(room.roomId).emit("game:final", {
    round: room.currentRound,
    players: buildRoundResultPayload(room),
    winnerIds,
  });
  room.status = "waiting";
  delete room.phase;
  room.isRoundEnding = false;
  Object.values(room.players).forEach((p) => {
    p.ready = false;
    p.health = 100;
  });
}

// ──────────────────────────────────────────────────────────────
// HTTP
// ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, t: Date.now() }));

process.on("uncaughtException", (e) => console.error("[UNCAUGHT]", e));
process.on("unhandledRejection", (e) => console.error("[UNHANDLED]", e));

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => console.log(`Socket.IO server on :${PORT}`));
