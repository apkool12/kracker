// src/game/render/character.pose.ts
import { squashStretch } from "../animations/motion";
import { CharacterColors, GfxRefs } from "../types/player.types";
import { renderBodyWithGradient, createGradientColors } from "./character.core";

/**
 * HP바를 머리 위에 그리기
 */
export function drawHealthBar(
  graphics: any,
  x: number,
  y: number,
  health: number,
  maxHealth: number,
  showTimer: number = 0
) {
  // 상시 표시로 변경 - 타이머 체크 제거

  const barWidth = 50;
  const barHeight = 6; // 높이 줄임
  const barX = x - barWidth / 2;
  const barY = y - 35; // 머리 위 35px로 조정

  // 체력 비율 계산
  const healthRatio = Math.max(0, Math.min(1, health / maxHealth));

  // 🎨 세련된 배경 (테두리 없는 미니멀 디자인)
  graphics.fillStyle(0x1a1a1a, 0.85);
  graphics.fillRoundedRect(barX, barY, barWidth, barHeight, 6);

  // HP바 배경 (미묘한 그라데이션 효과)
  graphics.fillStyle(0x2a2a2a, 0.6);
  graphics.fillRoundedRect(barX + 1, barY + 1, barWidth - 2, barHeight - 2, 5);

  // HP바 채우기 (체력에 따른 그라데이션 색상)
  let healthColor = 0x00ff88; // 밝은 초록색 (기본)
  let healthColorDark = 0x00cc66; // 어두운 초록색

  if (healthRatio <= 0.25) {
    healthColor = 0xff4444; // 밝은 빨간색 (25% 이하)
    healthColorDark = 0xcc3333; // 어두운 빨간색
  } else if (healthRatio <= 0.6) {
    healthColor = 0xffaa00; // 주황색 (25-60%)
    healthColorDark = 0xcc8800; // 어두운 주황색
  } else if (healthRatio <= 0.85) {
    healthColor = 0xffff44; // 노란색 (60-85%)
    healthColorDark = 0xcccc33; // 어두운 노란색
  }

  const fillWidth = barWidth * healthRatio;

  // 메인 체력바 (부드러운 그라데이션)
  graphics.fillStyle(healthColorDark);
  graphics.fillRoundedRect(barX + 1, barY + 1, fillWidth - 2, barHeight - 2, 5);

  // 하이라이트 효과 (미묘한 밝기 변화)
  graphics.fillStyle(healthColor);
  graphics.fillRoundedRect(
    barX + 1,
    barY + 1,
    fillWidth - 2,
    (barHeight - 2) * 0.6,
    5
  );

  // 🔥 위험 상태일 때 깜빡임 효과 (빨간색 애니메이션 유지)
  if (healthRatio <= 0.25) {
    const blinkAlpha = 0.4 + 0.6 * Math.sin(Date.now() * 0.008);
    graphics.setAlpha(blinkAlpha);
  } else {
    // 상시 표시 - 항상 완전 불투명
    graphics.setAlpha(1);
  }

  // ✨ 미묘한 하이라이트 효과
  graphics.fillStyle(0xffffff, 0.2);
  graphics.fillRoundedRect(barX + 1, barY + 1, fillWidth - 2, 1, 1);

  // ⚡ 위험 상태일 때 미묘한 효과
  if (healthRatio <= 0.25) {
    // 위험 상태일 때 미묘한 글로우 효과
    graphics.fillStyle(healthColor, 0.15);
    graphics.fillRoundedRect(
      barX - 2,
      barY - 2,
      barWidth + 4,
      barHeight + 4,
      8
    );

    // 작은 경고 표시 (미니멀한 점)
    const warningX = x;
    const warningY = barY - 18;
    graphics.fillStyle(0xff4444, 0.8);
    graphics.fillCircle(warningX, warningY, 2);
  } else if (healthRatio <= 0.5) {
    // 중간 체력일 때 미묘한 표시
    const indicatorX = x;
    const indicatorY = barY - 16;
    graphics.fillStyle(0xffaa44, 0.5);
    graphics.fillCircle(indicatorX, indicatorY, 1.5);
  }

  // ✨ 높은 체력일 때 미묘한 반짝임 효과
  if (healthRatio > 0.85) {
    const sparkleX = barX + Math.random() * barWidth;
    const sparkleY = barY + Math.random() * barHeight;
    graphics.fillStyle(0xffffff, 0.3);
    graphics.fillCircle(sparkleX, sparkleY, 0.8);
  }

  // 체력 수치 표시는 별도 Text 객체로 처리해야 하므로 제거
  // 대신 체력바에 더 많은 시각적 효과 추가
}

/**
 * 얼굴 그리기 (입체감 추가, 그림자 제거)
 */
export function updateFace(
  refs: GfxRefs,
  params: {
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    isWallGrabbing?: boolean;
    colors: CharacterColors;
    facing?: "left" | "right";
    scaleY?: number;
  }
) {
  const { face } = refs;
  const { health, maxHealth, isWallGrabbing, colors } = params;
  const dir = params.facing === "left" ? -1 : 1;
  const sy = params.scaleY ?? 1;
  // 얼굴 좌표계: 오른쪽 기준으로 그리고, 왼쪽을 볼 땐 좌우 반전 (세로는 몸 스케일 따라감)
  face.clear();
  face.setPosition(params.x, params.y);
  face.setScale(dir, sy);
  const x = 0;
  const y = 0;

  // 얼굴 색상 (몸통보다 약간 밝게)
  const faceColors = createGradientColors(colors.head);

  // 얼굴 배경 (밝은 색상으로)
  face.fillStyle(faceColors.light);
  face.fillCircle(x + 3, y, 8);

  // 눈 (입체감 있는 검은색)
  face.fillStyle(0x000000);
  face.fillCircle(x, y - 5, 2.5); // 왼쪽 눈
  face.fillCircle(x + 6, y - 5, 2.5); // 오른쪽 눈

  // 눈 하이라이트 (흰색 반사)
  face.fillStyle(0xffffff);
  face.fillCircle(x - 0.5, y - 6, 1);
  face.fillCircle(x + 5.5, y - 6, 1);

  // 입 (체력에 따라 변화, 원래 로직으로)
  if (health > 50) {
    // 건강할 때: 미소 (웃기)
    face.lineStyle(2, 0x000000);
    face.beginPath();
    face.arc(x + 3, y + 2, 4, 0, Math.PI);
    face.strokePath();
  } else if (health > 20) {
    // 중간: 직선
    face.lineStyle(2, 0x000000);
    face.beginPath();
    face.moveTo(x, y + 2);
    face.lineTo(x + 6, y + 2);
    face.strokePath();
  } else {
    // 위험: 찡그림
    face.lineStyle(2, 0x000000);
    face.beginPath();
    face.arc(x + 3, y + 4, 4, Math.PI, Math.PI * 2);
    face.strokePath();
  }

  // 벽잡기 집중한 표정
  if (isWallGrabbing) {
    face.fillStyle(0x000000);
    face.fillRect(x - 2, y - 8, 4, 2); // 찡그린 이마
  }
}

/**
 * 몸(원) 위치/스케일/기울기 업데이트 (그라데이션 적용)
 */
export function updatePose(
  refs: GfxRefs,
  params: {
    x: number;
    y: number;
    wobble: number;
    crouchHeight: number;
    baseCrouchOffset: number;
    wallLean?: number; // 좌(-), 우(+)
    colors: CharacterColors;
    health: number;
    maxHealth: number;
    isWallGrabbing?: boolean;
    scaleOverride?: { x: number; y: number }; // 옵션
    velocityY?: number; // 있으면 착지 찌그러짐/공중 늘어남 적용
    isGrounded?: boolean;
    facing?: "left" | "right";
  }
) {
  const { body } = refs;
  const {
    x,
    y,
    wobble,
    crouchHeight,
    baseCrouchOffset,
    wallLean = 0,
    colors,
    health,
    maxHealth,
    isWallGrabbing,
    scaleOverride,
    velocityY,
    isGrounded = true,
    facing = "right",
  } = params;

  const crouchOffset = crouchHeight * baseCrouchOffset;
  const ss =
    velocityY === undefined
      ? { sx: 1, sy: 1, sink: 0 }
      : squashStretch(refs, velocityY, isGrounded);

  // 살짝 좌우/상하 흔들림 (+ 착지 시 눌린 만큼 가라앉음)
  const finalX = x + Math.sin(wobble) * 1 + wallLean;
  const finalY = y + Math.cos(wobble * 1.5) * 0.5 + crouchOffset + ss.sink;

  body.x = finalX;
  body.y = finalY;

  // 스케일(웅크리기 × squash/stretch)
  const scaleY = scaleOverride?.y ?? (1 - crouchHeight * 0.04) * ss.sy;
  const scaleX = scaleOverride?.x ?? (1 + crouchHeight * 0.005) * ss.sx;
  body.setScale(scaleX, scaleY);

  // 그라데이션으로 몸통 렌더링
  const radius = 20;
  renderBodyWithGradient(body, 0, 0, radius, colors);

  // 얼굴 갱신 (그라데이션 포함)
  updateFace(refs, {
    x: finalX,
    y: finalY,
    health,
    maxHealth,
    isWallGrabbing,
    colors,
    facing,
    scaleY,
  });
}
