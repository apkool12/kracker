// src/game/render/character.core.ts
import { CharacterColors, GfxRefs } from "../types/player.types";

/**
 * 색상에서 그라데이션 색상들을 생성하는 유틸리티
 * 검은색 대신 팔레트 색상에서 밝은 쪽으로만 조정
 */
export function createGradientColors(baseColor: number): {
  light: number;
  base: number;
  dark: number;
  shadow: number;
} {
  // 색상 분해
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;

  // 밝기 조정 함수 (팔레트 색상에서만 조정)
  const adjustBrightness = (factor: number) => {
    const newR = Math.min(255, Math.max(0, Math.round(r * factor)));
    const newG = Math.min(255, Math.max(0, Math.round(g * factor)));
    const newB = Math.min(255, Math.max(0, Math.round(b * factor)));
    return (newR << 16) | (newG << 8) | newB;
  };

  return {
    light: adjustBrightness(1.2), // 밝은 부분 (하이라이트)
    base: baseColor, // 기본 색상
    dark: adjustBrightness(0.74), // 어두운 부분 (그림자)
    shadow: adjustBrightness(0.52), // 깊은 그림자 / 외곽선
  };
}

/**
 * 캐릭터 그래픽 오브젝트 생성 (그라데이션과 입체감 추가)
 * - 팔/다리/총: Graphics
 * - 몸통: Graphics (원형 그라데이션)
 * - 얼굴: Graphics
 * - 기본 depth는 원본과 동일하게 설정
 */
export function createCharacter(
  scene: any,
  x: number,
  y: number,
  colors: CharacterColors
): GfxRefs {
  const leftArm = scene.add.graphics();
  const rightArm = scene.add.graphics();
  const leftLeg = scene.add.graphics();
  const rightLeg = scene.add.graphics();
  const gun = scene.add.graphics();

  // 몸통을 Graphics로 변경하여 그라데이션 적용
  const body = scene.add.graphics();
  const face = scene.add.graphics();

  // Depth (원본과 동일)
  body.setDepth(-3);
  face.setDepth(-3);
  leftArm.setDepth(-5);
  rightArm.setDepth(-5);
  leftLeg.setDepth(-5);
  rightLeg.setDepth(-5);
  gun.setDepth(-5);

  const refs: GfxRefs = {
    body,
    face,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    gun,
  };

  return refs;
}

/**
 * 몸통을 그라데이션으로 렌더링
 */
export function renderBodyWithGradient(
  body: any,
  x: number,
  y: number,
  radius: number,
  colors: CharacterColors
) {
  const c = createGradientColors(colors.head);
  body.clear();

  // 그림자색 원 위에 기본색 원을 왼쪽 위로 살짝 옮겨 겹침 → 오른쪽 아래 음영 초승달
  body.fillStyle(c.dark);
  body.fillCircle(x, y, radius);
  body.fillStyle(c.base);
  body.fillCircle(x - radius * 0.1, y - radius * 0.12, radius * 0.82);

  // 하이라이트 (왼쪽 위 광택)
  body.fillStyle(c.light, 0.55);
  body.fillEllipse(x - radius * 0.38, y - radius * 0.45, radius * 0.55, radius * 0.34);
  body.fillStyle(0xffffff, 0.35);
  body.fillCircle(x - radius * 0.45, y - radius * 0.5, radius * 0.1);

  // 외곽선 (어두운 배경에서도 실루엣이 또렷하게)
  body.lineStyle(2, c.shadow, 0.9);
  body.strokeCircle(x, y, radius);
}

/**
 * 팔다리를 그라데이션으로 렌더링
 */
export function renderLimbWithGradient(
  graphics: any,
  points: { x: number; y: number }[],
  colors: CharacterColors,
  thickness: number = 3
) {
  if (points.length < 2) return;

  const gradientColors = createGradientColors(colors.limbs);

  graphics.clear();

  // 메인 선
  graphics.lineStyle(thickness, gradientColors.base);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.strokePath();

  // 하이라이트 (위쪽 선)
  graphics.lineStyle(thickness * 0.6, gradientColors.light);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y - thickness * 0.3);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y - thickness * 0.3);
  }
  graphics.strokePath();

  // 그림자 (아래쪽 선)
  graphics.lineStyle(thickness * 0.6, gradientColors.dark);
  graphics.beginPath();
  graphics.moveTo(points[0].x, points[0].y + thickness * 0.3);
  for (let i = 1; i < points.length; i++) {
    graphics.lineTo(points[i].x, points[i].y + thickness * 0.3);
  }
  graphics.strokePath();
}

/**
 * 캐릭터 그래픽 오브젝트 제거
 */
export function destroyCharacter(refs: GfxRefs): void {
  tryDestroy(refs.gun);
  tryDestroy(refs.leftArm);
  tryDestroy(refs.rightArm);
  tryDestroy(refs.leftLeg);
  tryDestroy(refs.rightLeg);
  tryDestroy(refs.face);
  tryDestroy(refs.body);
}

function tryDestroy(obj: any) {
  if (obj && typeof obj.destroy === "function" && !obj._destroyed) {
    obj.destroy();
  }
}

/**
 * 몸통 색상 변경 유틸 (그라데이션 포함)
 */
export function setBodyColor(refs: GfxRefs, color: number) {
  if (refs.body && typeof refs.body.clear === "function") {
    // 현재 위치와 크기를 유지하면서 색상만 변경
    const x = refs.body.x || 0;
    const y = refs.body.y || 0;
    const radius = 20; // 기본 반지름

    renderBodyWithGradient(refs.body, x, y, radius, {
      head: color,
      limbs: color,
    });
  }
}
