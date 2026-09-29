// src/game/animations/keyframes/crouch.keyframes.ts

import { Animation, CharacterKeyframe, FacingDirection } from "../types";

/**
 * 웅크리기 시작 자세 (서있는 상태)
 */
const STANDING_KEYFRAME: CharacterKeyframe = {
  time: 0.0,
  leftLeg: {
    hip: { x: -10, y: 20 },
    knee: { x: -9, y: 21 },
    foot: { x: -10, y: 22 },
  },
  rightLeg: {
    hip: { x: 10, y: 20 },
    knee: { x: 9, y: 21 },
    foot: { x: 10, y: 22 },
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
 * 완전히 웅크린 자세 (방향에 따라 다리 복제)
 */
function createCrouchedKeyframe(facing: FacingDirection): CharacterKeyframe {
  // 기본 앉기 자세 (오른쪽 방향 기준)
  const baseCrouchPose = {
    leftLeg: {
      // 뒷다리 (짧고 올라간 위치)
      hip: { x: -10, y: 18 },
      knee: { x: -12, y: 15 }, // 무릎이 더 많이 구부러짐
      foot: { x: -15, y: 22 },
    },
    rightLeg: {
      // 앞다리 (짧고 올라간 위치)
      hip: { x: 10, y: 18 },
      knee: { x: 15, y: 15 }, // 무릎이 더 많이 구부러짐
      foot: { x: 18, y: 22 },
    },
    leftArm: {
      hip: { x: -10, y: 3 },
      knee: { x: -12, y: 8 },
      foot: { x: -20, y: 12 },
    },
    rightArm: {
      hip: { x: 10, y: 3 },
      knee: { x: 12, y: 8 },
      foot: { x: 20, y: 12 },
    },
  };

  if (facing === "right") {
    // 오른쪽 방향: 기본 자세 그대로
    return {
      time: 1.0,
      ...baseCrouchPose,
    };
  } else {
    // 왼쪽 방향: 다리 위치를 대칭으로 복제
    return {
      time: 1.0,
      leftLeg: {
        // 왼다리를 오른다리와 같게 복제 (X축 대칭)
        hip: { x: -10, y: 18 },
        knee: { x: -15, y: 15 }, // 오른다리 무릎과 대칭
        foot: { x: -18, y: 22 }, // 오른다리 발과 대칭
      },
      rightLeg: {
        // 오른다리를 왼다리와 같게 복제 (X축 대칭)
        hip: { x: 10, y: 18 },
        knee: { x: 12, y: 15 }, // 왼다리 무릎과 대칭
        foot: { x: 15, y: 22 }, // 왼다리 발과 대칭
      },
      leftArm: {
        hip: { x: -10, y: 3 },
        knee: { x: -12, y: 8 },
        foot: { x: -20, y: 12 },
      },
      rightArm: {
        hip: { x: 10, y: 3 },
        knee: { x: 12, y: 8 },
        foot: { x: 20, y: 12 },
      },
    };
  }
}

/**
 * 웅크리기 시작 애니메이션 (서있는 상태 → 웅크린 상태)
 */
export function createCrouchDownAnimation(facing: FacingDirection): Animation {
  return {
    name: `crouch-down-${facing}`,
    duration: 0.3,
    loop: false,
    keyframes: [
      STANDING_KEYFRAME,
      {
        ...STANDING_KEYFRAME,
        time: 0.5,
        leftLeg: {
          hip: { x: -10, y: 19 },
          knee: { x: -11, y: 18 },
          foot: { x: -14, y: 22 },
        },
        rightLeg: {
          hip: { x: 10, y: 19 },
          knee: { x: 11, y: 18 },
          foot: { x: 14, y: 22 },
        },
      },
      createCrouchedKeyframe(facing),
    ],
    priority: 20,
  };
}

/**
 * 일어서기 애니메이션 (웅크린 상태 → 서있는 상태)
 */
export function createStandUpAnimation(facing: FacingDirection): Animation {
  const crouchDown = createCrouchDownAnimation(facing);
  return {
    name: `stand-up-${facing}`,
    duration: 0.25,
    loop: false,
    keyframes: [...crouchDown.keyframes].reverse().map((kf, index, arr) => ({
      ...kf,
      time: index / (arr.length - 1),
    })),
    priority: 20,
  };
}

/**
 * 착지 후 앉기 자세 (충격 흡수를 위한 더 깊은 앉기 - 방향에 따라 다리 복제)
 */
function createLandingCrouchKeyframe(
  facing: FacingDirection
): CharacterKeyframe {
  // 기본 착지 앉기 자세 (오른쪽 방향 기준)
  const baseLandingCrouchPose = {
    leftLeg: {
      // 뒷다리 (충격 흡수 - 짧고 올라간 위치)
      hip: { x: -10, y: 20 },
      knee: { x: -15, y: 13 }, // 무릎이 더 많이 구부러짐
      foot: { x: -18, y: 22 },
    },
    rightLeg: {
      // 앞다리 (충격 흡수 - 짧고 올라간 위치)
      hip: { x: 10, y: 20 },
      knee: { x: 17, y: 13 }, // 무릎이 더 많이 구부러짐
      foot: { x: 21, y: 22 },
    },
    leftArm: {
      hip: { x: -10, y: 5 },
      knee: { x: -14, y: 10 },
      foot: { x: -22, y: 15 },
    },
    rightArm: {
      hip: { x: 10, y: 5 },
      knee: { x: 14, y: 10 },
      foot: { x: 22, y: 15 },
    },
  };

  if (facing === "right") {
    // 오른쪽 방향: 기본 자세 그대로
    return {
      time: 1.0,
      ...baseLandingCrouchPose,
    };
  } else {
    // 왼쪽 방향: 다리 위치를 대칭으로 복제
    return {
      time: 1.0,
      leftLeg: {
        // 왼다리를 오른다리와 같게 복제 (X축 대칭)
        hip: { x: -10, y: 20 },
        knee: { x: -17, y: 13 }, // 오른다리 무릎과 대칭
        foot: { x: -21, y: 22 }, // 오른다리 발과 대칭
      },
      rightLeg: {
        // 오른다리를 왼다리와 같게 복제 (X축 대칭)
        hip: { x: 10, y: 20 },
        knee: { x: 15, y: 13 }, // 왼다리 무릎과 대칭
        foot: { x: 18, y: 22 }, // 왼다리 발과 대칭
      },
      leftArm: {
        hip: { x: -10, y: 5 },
        knee: { x: -14, y: 10 },
        foot: { x: -22, y: 15 },
      },
      rightArm: {
        hip: { x: 10, y: 5 },
        knee: { x: 14, y: 10 },
        foot: { x: 22, y: 15 },
      },
    };
  }
}

/**
 * 착지 후 앉기 애니메이션 (충격 흡수)
 */
export function createLandingCrouchAnimation(
  facing: FacingDirection
): Animation {
  return {
    name: `landing-crouch-${facing}`,
    duration: 0.4, // 조금 더 빠른 앉기
    loop: false,
    keyframes: [
      STANDING_KEYFRAME,
      {
        ...STANDING_KEYFRAME,
        time: 0.3,
        leftLeg: {
          hip: { x: -10, y: 21 },
          knee: { x: -13, y: 17 },
          foot: { x: -18, y: 22 },
        },
        rightLeg: {
          hip: { x: 10, y: 21 },
          knee: { x: 13, y: 17 },
          foot: { x: 18, y: 22 },
        },
      },
      createLandingCrouchKeyframe(facing),
    ],
    priority: 25, // 높은 우선순위
  };
}

/**
 * 웅크린 상태에서의 Idle 애니메이션
 */
export function createCrouchIdleAnimation(facing: FacingDirection): Animation {
  const baseCrouchKeyframe = createCrouchedKeyframe(facing);

  return {
    name: `crouch-idle-${facing}`,
    duration: 2.5, // 조금 더 느린 호흡
    loop: true,
    keyframes: [
      baseCrouchKeyframe,
      {
        ...baseCrouchKeyframe,
        time: 0.5,
        leftLeg: {
          ...baseCrouchKeyframe.leftLeg,
          hip: {
            ...baseCrouchKeyframe.leftLeg.hip,
            y: baseCrouchKeyframe.leftLeg.hip.y + 3,
          },
        },
        rightLeg: {
          ...baseCrouchKeyframe.rightLeg,
          hip: {
            ...baseCrouchKeyframe.rightLeg.hip,
            y: baseCrouchKeyframe.rightLeg.hip.y + 3,
          },
        },
      },
      {
        ...baseCrouchKeyframe,
        time: 1.0,
      },
    ],
    blendable: true,
    priority: 5,
  };
}

/**
 * 특정 시간에서의 웅크린 키프레임 계산
 */
export function getCrouchKeyframeAtTime(
  facing: FacingDirection,
  time: number
): CharacterKeyframe {
  const baseKeyframe = createCrouchedKeyframe(facing);
  const breathingOffset = Math.sin(time * ((2 * Math.PI) / 2.5)) * 0.3; // 2.5초 주기

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
  };
}

/**
 * 크라우치 애니메이션 컬렉션
 */
export const CrouchAnimations = {
  crouchDownRight: createCrouchDownAnimation("right"),
  crouchDownLeft: createCrouchDownAnimation("left"),
  standUpRight: createStandUpAnimation("right"),
  standUpLeft: createStandUpAnimation("left"),
  crouchIdleRight: createCrouchIdleAnimation("right"),
  crouchIdleLeft: createCrouchIdleAnimation("left"),
  landingCrouchRight: createLandingCrouchAnimation("right"),
  landingCrouchLeft: createLandingCrouchAnimation("left"),
} as const;
