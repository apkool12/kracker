// src/game/types/player.types.ts

// 게임 맵의 충돌용 플랫폼 사각형
export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 플레이어가 외부로 노출하는 상태 스냅샷
export interface PlayerState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  health: number;
  isGrounded: boolean;
  isJumping: boolean;
  isShooting: boolean;
  facingDirection: "left" | "right";
}

// 입력 스냅샷(키보드)
export interface KeyState {
  left: boolean;
  right: boolean;
  jump: boolean;
  shoot: boolean;
  crouch: boolean;
  blink?: boolean;
}

// 포인터(마우스) 스냅샷
export interface PointerState {
  x: number;
  y: number;
  angle: number; // 라디안
}

// 총구 위치/각도
export interface GunPose {
  x: number;
  y: number;
  angle: number; // 라디안
}

// Phaser Graphics 참조 모음(타입 간단화: any로 처리, 후에 정확 타입 넣어도 됨)
export interface GfxRefs {
  body: any; // Phaser.GameObjects.Arc | Circle 등
  face: any; // Phaser.GameObjects.Graphics
  leftArm: any; // Phaser.GameObjects.Graphics
  rightArm: any; // Phaser.GameObjects.Graphics
  leftLeg: any; // Phaser.GameObjects.Graphics
  rightLeg: any; // Phaser.GameObjects.Graphics
  gun: any; // Phaser.GameObjects.Graphics
  accessory?: any; // 장신구 Graphics (몸통과 같이 이동/스케일)
}

// 벽잡기 상태 블록(모듈 간 전달용, 필요 시 확장)
export interface WallGrabState {
  isWallGrabbing: boolean;
  wallGrabDirection: "left" | "right" | null;
  wallGrabTimer: number;
  maxWallGrabTime: number;
  wallSlideSpeed: number;
  wallJumpCooldown: number;
}

// 캐릭터 프리셋 키(기존 프로젝트 enum/union과 호환되게 string union로 둠)
export type CharacterPreset = string;

// 색상 팔레트(프로젝트의 CHARACTER_PRESETS 항목 한 개에 대응)
export interface CharacterColors {
  head: number; // 몸통/머리
  limbs: number; // 팔/다리 선
  gun?: number; // 총 라인(옵션)
}

// 포즈 스냅샷 타입
export type PoseSnapshot = {
  id: string; // playerId
  angle?: number; // 총/팔 조준 각도(라디안)
  facing?: "left" | "right"; // 좌우
  t: number; // Date.now()
};
