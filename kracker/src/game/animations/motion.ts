// 캐릭터별 움직임 상태 (로컬/원격 공통, 그래픽 refs 를 키로 사용)
// - 상태 전환 시 이전 포즈에서 짧게 크로스페이드
// - 점프/낙하는 상태 시작 시점부터의 경과 시간으로 재생
// - 걷기/달리기는 실제 이동 거리로 주기를 진행 (발 미끄러짐 방지)
// - 착지 찌그러짐 / 공중 늘어남 (squash & stretch)
import type { CharacterKeyframe, LimbKeyframe } from "./types/animation.types";

const BLEND_S = 0.12; // 상태 전환 크로스페이드 길이
const RUN_SPEED_REF = 300; // 이 속도(px/s)일 때 걷기 주기가 원래 속도로 재생

type MotionState = {
  type: string;
  since: number;
  lastT: number;
  lastX: number;
  stride: number; // 이동 거리 기반 걷기 시간
  last?: CharacterKeyframe;
  from?: CharacterKeyframe;
  fromT: number;
};

const motion = new WeakMap<object, MotionState>();

/** 이번 프레임 애니메이션 샘플 시각을 돌려준다 (상태/보폭 갱신 포함) */
export function motionTime(key: object, type: string, t: number, x: number): number {
  let st = motion.get(key);
  if (!st) {
    st = { type, since: t, lastT: t, lastX: x, stride: 0, fromT: -1 };
    motion.set(key, st);
  }
  if (st.type !== type) {
    st.from = st.last;
    st.fromT = t;
    st.type = type;
    st.since = t;
  }
  const dx = Math.abs(x - st.lastX);
  // 리스폰 같은 순간이동은 보폭에 넣지 않음
  if (dx < 200) st.stride += dx / RUN_SPEED_REF;
  st.lastX = x;
  st.lastT = t;

  if (type === "walking" || type === "running") return st.stride;
  if (type === "fall" || type.startsWith("jump")) return t - st.since;
  return t; // idle/crouch/wallGrab: 호흡 사인파는 절대 시간
}

/** 상태 전환 직후면 이전 포즈와 섞고, 이번 포즈를 기억한다 */
export function blendKeyframe(key: object, kf: CharacterKeyframe, t: number): CharacterKeyframe {
  const st = motion.get(key);
  if (!st) return kf;
  let out = kf;
  if (st.from && t - st.fromT < BLEND_S) {
    const k = smooth((t - st.fromT) / BLEND_S);
    out = lerpKeyframe(st.from, kf, k);
  }
  st.last = out;
  return out;
}

function smooth(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
}

function lerpLimb(a: LimbKeyframe, b: LimbKeyframe, k: number): LimbKeyframe {
  const l = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: p.x + (q.x - p.x) * k,
    y: p.y + (q.y - p.y) * k,
  });
  return { hip: l(a.hip, b.hip), knee: l(a.knee, b.knee), foot: l(a.foot, b.foot) };
}

export function lerpKeyframe(a: CharacterKeyframe, b: CharacterKeyframe, k: number): CharacterKeyframe {
  return {
    time: b.time,
    leftLeg: lerpLimb(a.leftLeg, b.leftLeg, k),
    rightLeg: lerpLimb(a.rightLeg, b.rightLeg, k),
    leftArm: lerpLimb(a.leftArm, b.leftArm, k),
    rightArm: lerpLimb(a.rightArm, b.rightArm, k),
  };
}

// ===== Squash & stretch =====
type BodyState = { wasGrounded: boolean; airVy: number; squash: number; lastMs: number };
const bodies = new WeakMap<object, BodyState>();

/** 몸 스케일 보정값: stretch(공중, 세로로 늘어남) / squash(착지, 눌림) */
export function squashStretch(
  key: object,
  vy: number,
  isGrounded: boolean
): { sx: number; sy: number; sink: number } {
  const now = performance.now();
  let st = bodies.get(key);
  if (!st) {
    st = { wasGrounded: isGrounded, airVy: 0, squash: 0, lastMs: now };
    bodies.set(key, st);
  }
  const dt = Math.min(0.05, (now - st.lastMs) / 1000);
  st.lastMs = now;

  if (!isGrounded) st.airVy = vy;
  if (isGrounded && !st.wasGrounded) {
    // 착지 순간: 떨어지던 속도에 비례해 눌림
    st.squash = Math.min(0.28, Math.max(0, st.airVy) / 2600);
  }
  st.wasGrounded = isGrounded;
  st.squash *= Math.exp(-dt * 14); // 탄성 있게 복원

  const stretch = isGrounded ? 0 : Math.min(0.12, Math.abs(vy) / 3200);
  return {
    sx: 1 - stretch * 0.6 + st.squash * 0.8,
    sy: 1 + stretch - st.squash,
    sink: st.squash * 20, // 눌린 만큼 몸을 내려 발이 땅에 붙어 보이게
  };
}
