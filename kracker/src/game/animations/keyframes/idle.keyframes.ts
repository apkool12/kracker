// src/game/animations/keyframes/idle.keyframes.ts

import { Animation, CharacterKeyframe, FacingDirection } from "../types";

/**
 * 오른쪽을 바라볼 때의 Idle 자세
 * - 오른쪽 다리가 앞다리 (무릎이 약간 굽음)
 * - 왼쪽 다리가 뒷다리 (거의 직선)
 */
const IDLE_RIGHT_BASE_KEYFRAME: CharacterKeyframe = {
  time: 0,
  leftLeg: {
    // 뒷다리 (왼쪽)
    hip: { x: -2, y: 10 },
    knee: { x: -8, y: 18 }, // 거의 직선
    foot: { x: -10, y: 25 },
  },
  rightLeg: {
    // 앞다리 (오른쪽)
    hip: { x: 10, y: 10 },
    knee: { x: 15, y: 17 }, // 무릎이 약간 앞으로
    foot: { x: 12, y: 25 },
  },
  leftArm: {
    hip: { x: -10, y: 0 }, // 어깨
    knee: { x: -15, y: 5 }, // 팔꿈치
    foot: { x: -30, y: 10 }, // 손
  },
  rightArm: {
    hip: { x: 10, y: 0 },
    knee: { x: 15, y: 5 },
    foot: { x: 30, y: 10 },
  },
};

/**
 * 왼쪽을 바라볼 때의 Idle 자세
 * - 왼쪽 다리가 앞다리 (무릎이 약간 굽음)
 * - 오른쪽 다리가 뒷다리 (거의 직선)
 */
const IDLE_LEFT_BASE_KEYFRAME: CharacterKeyframe = {
  time: 0,
  leftLeg: {
    // 앞다리 (왼쪽)
    hip: { x: -2, y: 10 },
    knee: { x: -15, y: 17 }, // 무릎이 약간 앞으로
    foot: { x: -12, y: 25 },
  },
  rightLeg: {
    // 뒷다리 (오른쪽)
    hip: { x: 10, y: 10 },
    knee: { x: 8, y: 18 }, // 거의 직선
    foot: { x: 10, y: 25 },
  },
  leftArm: {
    hip: { x: -10, y: 0 },
    knee: { x: -15, y: 5 },
    foot: { x: -30, y: 10 },
  },
  rightArm: {
    hip: { x: 10, y: 0 },
    knee: { x: 15, y: 5 },
    foot: { x: 30, y: 10 },
  },
};

/**
 * 호흡 애니메이션을 위한 키프레임들
 * 미세한 상하 움직임으로 살아있는 느낌 연출
 */
function createBreathingKeyframes(
  baseKeyframe: CharacterKeyframe
): CharacterKeyframe[] {
  const breathingAmplitude = 0.5; // 호흡 강도

  return [
    // 시작 (숨을 내쉰 상태)
    {
      ...baseKeyframe,
      time: 0.0,
    },
    // 중간 (숨을 들이마신 상태)
    {
      ...baseKeyframe,
      time: 0.5,
      leftLeg: {
        ...baseKeyframe.leftLeg,
        hip: {
          ...baseKeyframe.leftLeg.hip,
          y: baseKeyframe.leftLeg.hip.y - breathingAmplitude,
        },
      },
      rightLeg: {
        ...baseKeyframe.rightLeg,
        hip: {
          ...baseKeyframe.rightLeg.hip,
          y: baseKeyframe.rightLeg.hip.y - breathingAmplitude,
        },
      },
      leftArm: {
        ...baseKeyframe.leftArm,
        hip: {
          ...baseKeyframe.leftArm.hip,
          y: baseKeyframe.leftArm.hip.y - breathingAmplitude,
        },
      },
      rightArm: {
        ...baseKeyframe.rightArm,
        hip: {
          ...baseKeyframe.rightArm.hip,
          y: baseKeyframe.rightArm.hip.y - breathingAmplitude,
        },
      },
    },
    // 끝 (다시 숨을 내쉰 상태)
    {
      ...baseKeyframe,
      time: 1.0,
    },
  ];
}

/**
 * 오른쪽을 바라보는 Idle 애니메이션
 */
export const idleRightAnimation: Animation = {
  name: "idle-right",
  duration: 3.0, // 3초 주기로 호흡
  loop: true,
  keyframes: createBreathingKeyframes(IDLE_RIGHT_BASE_KEYFRAME),
  blendable: true,
  priority: 0,
};

/**
 * 왼쪽을 바라보는 Idle 애니메이션
 */
export const idleLeftAnimation: Animation = {
  name: "idle-left",
  duration: 3.0,
  loop: true,
  keyframes: createBreathingKeyframes(IDLE_LEFT_BASE_KEYFRAME),
  blendable: true,
  priority: 0,
};

/**
 * 방향에 따른 Idle 애니메이션 선택 헬퍼
 */
export function getIdleAnimation(facing: FacingDirection): Animation {
  return facing === "right" ? idleRightAnimation : idleLeftAnimation;
}

/**
 * 특정 시간에서의 Idle 키프레임 계산 (호흡 효과 포함)
 */
export function getIdleKeyframeAtTime(
  facing: FacingDirection,
  time: number
): CharacterKeyframe {
  const baseKeyframe =
    facing === "right" ? IDLE_RIGHT_BASE_KEYFRAME : IDLE_LEFT_BASE_KEYFRAME;
  const breathingOffset = Math.sin(time * ((2 * Math.PI) / 3)) * 0.5; // 3초 주기

  return {
    ...baseKeyframe,
    time,
    leftLeg: {
      ...baseKeyframe.leftLeg,
      hip: {
        ...baseKeyframe.leftLeg.hip,
        y: baseKeyframe.leftLeg.hip.y + breathingOffset,
      },
    },
    rightLeg: {
      ...baseKeyframe.rightLeg,
      hip: {
        ...baseKeyframe.rightLeg.hip,
        y: baseKeyframe.rightLeg.hip.y + breathingOffset,
      },
    },
    leftArm: {
      ...baseKeyframe.leftArm,
      hip: {
        ...baseKeyframe.leftArm.hip,
        y: baseKeyframe.leftArm.hip.y + breathingOffset,
      },
    },
    rightArm: {
      ...baseKeyframe.rightArm,
      hip: {
        ...baseKeyframe.rightArm.hip,
        y: baseKeyframe.rightArm.hip.y + breathingOffset,
      },
    },
  };
}

/**
 * Idle 애니메이션 컬렉션
 */
export const IdleAnimations = {
  right: idleRightAnimation,
  left: idleLeftAnimation,
} as const;
