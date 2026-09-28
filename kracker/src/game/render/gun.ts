// src/game/render/gun.ts - 완전히 새로운 총구 로직
import { CharacterColors, GunPose } from "../types/player.types";

/**
 * 🔥 새로운 총 그리기 - 단순하게
 */
export function drawGun(
  gunGfx: any,
  armEndX: number,
  armEndY: number,
  gunAngle: number,
  isLeft: boolean,
  colors: CharacterColors,
  shootRecoil = 0
) {
  gunGfx.clear();

  // 총 색상을 몸통 색상과 동일하게 설정
  const gunColor = colors.head;
  const baseLength = 30;
  const gunLength = baseLength + shootRecoil * 3;
  const gunWidth = 4;

  // 총신 끝 위치 계산
  const gunEndX = armEndX + Math.cos(gunAngle) * gunLength;
  const gunEndY = armEndY + Math.sin(gunAngle) * gunLength;

  // 총신 그리기 (단순하게)
  gunGfx.lineStyle(gunWidth, gunColor);
  gunGfx.beginPath();
  gunGfx.moveTo(armEndX, armEndY);
  gunGfx.lineTo(gunEndX, gunEndY);
  gunGfx.strokePath();

  // 손잡이 그리기 (단순하게)
  const handleLength = 10;
  const handleAngle = gunAngle + (isLeft ? -Math.PI / 2 : Math.PI / 2);
  const handleEndX = armEndX + Math.cos(handleAngle) * handleLength;
  const handleEndY = armEndY + Math.sin(handleAngle) * handleLength;

  gunGfx.lineStyle(3, gunColor);
  gunGfx.beginPath();
  gunGfx.moveTo(armEndX, armEndY);
  gunGfx.lineTo(handleEndX, handleEndY);
  gunGfx.strokePath();
}

/**
 * 🔥 완전히 새로운 총구 위치 계산 - 단순하고 명확함
 */
export function getGunPosition(params: {
  x: number;
  y: number;
  mouseX: number;
  mouseY: number;
  crouchHeight: number;
  baseCrouchOffset: number;
}): GunPose {
  const { x, y, mouseX, mouseY, crouchHeight, baseCrouchOffset } = params;
  // 1. 기본 플레이어 위치 (웅크리기 적용)
  const crouchYOffset = crouchHeight * baseCrouchOffset;
  const basePlayerY = y + crouchYOffset;

  // 2. 마우스 방향 판정
  const mouseDirectionX = mouseX - x;
  const isPointingLeft = mouseDirectionX < 0;

  // 3. 🔥 핵심: 어깨는 플레이어 몸통 중심에서 고정된 위치
  const shoulderX = x + (isPointingLeft ? -15 : 15);
  const shoulderY = basePlayerY; // 어깨는 항상 몸통보다 8픽셀 위

  // 4. 마우스를 향한 각도 계산 (어깨에서 마우스로)
  const deltaX = mouseX - shoulderX;
  const deltaY = mouseY - shoulderY;
  let targetAngle = Math.atan2(deltaY, deltaX);

  // 6. 팔 끝 위치 계산 (어깨에서 각도 방향으로 팔 길이만큼)
  const armLength = 22;
  const armEndX = shoulderX + Math.cos(targetAngle) * armLength;
  const armEndY = shoulderY + Math.sin(targetAngle) * armLength;

  // 7. 총구 끝 위치 계산 (팔 끝에서 같은 각도로 총 길이만큼)
  const gunLength = 30;
  const gunTipX = armEndX + Math.cos(targetAngle) * gunLength;
  const gunTipY = armEndY + Math.sin(targetAngle) * gunLength;

  // 8. 🔥 중요: 검증 - Y좌표가 이상하게 고정되었는지 확인
  const expectedYRange = [basePlayerY - 50, basePlayerY + 50]; // 합리적인 Y 범위
  if (gunTipY < expectedYRange[0] || gunTipY > expectedYRange[1]) {
    console.warn(
      `⚠️  총구 Y좌표가 이상함: ${gunTipY.toFixed(2)} (예상 범위: ${
        expectedYRange[0]
      } ~ ${expectedYRange[1]})`
    );
  }

  const result = {
    x: gunTipX,
    y: gunTipY,
    angle: targetAngle,
  };

  return result;
}
/**
 * 🔥 단순한 총알 스폰 위치 계산
 */
export function calculateSafeBulletSpawn(
  gunX: number,
  gunY: number,
  angle: number,
  platforms: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [],
  safetyDistance: number = 8
): { x: number; y: number } {
  // 총구에서 발사 방향으로 약간 앞으로 이동
  const spawnX = gunX + Math.cos(angle) * safetyDistance;
  const spawnY = gunY + Math.sin(angle) * safetyDistance;

  return { x: spawnX, y: spawnY };
}

/**
 * 🔥 벽과의 거리 체크 (단순화)
 */
export function checkWallDistance(
  gunX: number,
  gunY: number,
  angle: number,
  platforms: Array<{ x: number; y: number; width: number; height: number }>,
  minDistance: number = 15
): { isSafe: boolean; distance: number } {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  // 총구에서 발사 방향으로 스캔
  for (let distance = 2; distance < 50; distance += 2) {
    const testX = gunX + dirX * distance;
    const testY = gunY + dirY * distance;

    for (const platform of platforms) {
      if (
        testX >= platform.x &&
        testX <= platform.x + platform.width &&
        testY >= platform.y &&
        testY <= platform.y + platform.height
      ) {
        return {
          isSafe: distance >= minDistance,
          distance,
        };
      }
    }
  }

  return { isSafe: true, distance: 50 };
}

/**
 * 총구가 벽 안에 있는지 체크
 */
export function isGunInsideWall(
  gunX: number,
  gunY: number,
  platforms: Array<{ x: number; y: number; width: number; height: number }>,
  margin: number = 5
): boolean {
  for (const platform of platforms) {
    if (
      gunX >= platform.x - margin &&
      gunX <= platform.x + platform.width + margin &&
      gunY >= platform.y - margin &&
      gunY <= platform.y + platform.height + margin
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 🔥 디버깅용 - 아주 단순한 총구 위치
 */
export function getSimpleGunPosition(
  playerX: number,
  playerY: number,
  mouseX: number,
  mouseY: number
): { x: number; y: number; angle: number } {
  const angle = Math.atan2(mouseY - playerY, mouseX - playerX);
  const distance = 35;

  return {
    x: playerX + Math.cos(angle) * distance,
    y: playerY + Math.sin(angle) * distance,
    angle: angle,
  };
}
