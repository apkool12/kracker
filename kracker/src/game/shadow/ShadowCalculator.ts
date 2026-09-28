import { Platform } from "../config";
import {
  LightConfig,
  CameraInfo,
  ShadowPolygon,
  ShadowCalculationResult,
} from "./ShadowTypes";

export class ShadowCalculator {
  private lightConfig: LightConfig;
  // 점광원(총알/섬광). 있으면 방향광 대신 이 위치 기준으로 그림자를 드리운다
  private pointLight: { x: number; y: number } | null = null;

  public setPointLight(p: { x: number; y: number } | null): void {
    this.pointLight = p;
  }

  constructor(lightConfig: LightConfig) {
    this.lightConfig = { ...lightConfig };
  }

  public updateLightConfig(newConfig: Partial<LightConfig>): void {
    this.lightConfig = { ...this.lightConfig, ...newConfig };
  }

  public calculateShadows(
    platforms: Platform[],
    camera: CameraInfo
  ): ShadowCalculationResult {
    const polygons: ShadowPolygon[] = [];
    let clippedCount = 0;

    // ðŸ”§ ë” ê¸´ ê·¸ë¦¼ìžë¥¼ ìœ„í•´ íˆ¬ì˜ ê±°ë¦¬ ì¦ê°€
    const shadowTargetY = camera.y + camera.height + 1000;

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      if (this.pointLight) {
        for (const poly of this.calculatePointLightShadow(platform, this.pointLight)) {
          polygons.push({ ...poly, platformId: `platform_${i}` });
        }
        continue;
      }
      const shadowPolygon = this.calculateLongTrapezoidShadow(
        platform,
        shadowTargetY
      );

      if (shadowPolygon) {
        if (this.isPolygonInView(shadowPolygon, camera)) {
          polygons.push({
            ...shadowPolygon,
            platformId: `platform_${i}`,
          });
        } else {
          clippedCount++;
        }
      }
    }

    return { polygons, clippedCount };
  }

  private isPolygonInView(polygon: ShadowPolygon, camera: CameraInfo): boolean {
    const points = polygon.points;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const buffer = 400; // ë” ë„“ì€ ë²„í¼
    const cameraRight = camera.x + camera.width + buffer;
    const cameraBottom = camera.y + camera.height + buffer;

    return !(
      maxX < camera.x - buffer ||
      minX > cameraRight ||
      maxY < camera.y - buffer ||
      minY > cameraBottom
    );
  }

  public getLightConfig(): LightConfig {
    return { ...this.lightConfig };
  }

  public setLightAngle(angle: number): void {
    this.lightConfig.angle = angle;
  }


  /** ðŸŽ¯ ë” ê¸´ ì‚¬ë‹¤ë¦¬ê¼´ ê·¸ë¦¼ìž ê³„ì‚° */
  private calculateLongTrapezoidShadow(
    platform: Platform,
    targetY: number
  ): ShadowPolygon | null {
    const topLeft = { x: platform.x, y: platform.y };
    const topRight = { x: platform.x + platform.width, y: platform.y };

    const angle = this.lightConfig.angle;
    const shadowLength = Math.min(
      targetY - platform.y,
      this.lightConfig.maxLength || 1500
    );

    let leftSlant: number;
    let rightSlant: number;

    if (Math.abs(angle - 90) < 15) {
      // ðŸŽ¯ ë” ê¸´ ì‚¬ë‹¤ë¦¬ê¼´: í”Œëž«í¼ ë„ˆë¹„ì˜ 35%ë¡œ ëŒ€í­ ì¦ê°€!
      const baseSlant = platform.width * 0.6; // 20% â†’ 35%ë¡œ ì¦ê°€
      const angleOffset = (angle - 90) * 0.05; // ê°ë„ ë³€í™”ë„ ë” í¬ê²Œ

      leftSlant = -baseSlant + angleOffset * platform.width;
      rightSlant = baseSlant + angleOffset * platform.width;
    } else {
      // ì¼ë°˜ ê°ë„ì—ì„œë„ ì‚¬ë‹¤ë¦¬ê¼´ íš¨ê³¼ ê°•í™”
      const lightDirection = this.getLightDirection();

      if (Math.abs(lightDirection.y) < 0.001) {
        const maxLength = this.lightConfig.maxLength || 1500;
        leftSlant = lightDirection.x > 0 ? maxLength : -maxLength;
        rightSlant = leftSlant;
      } else {
        const t = shadowLength / Math.abs(lightDirection.y);
        const baseOffset = t * lightDirection.x;

        // ðŸ”§ ì‚¬ë‹¤ë¦¬ê¼´ íš¨ê³¼ ì¶”ê°€ (ì¼ë°˜ ê°ë„ì—ì„œë„)
        const trapezoidEffect = platform.width * 0.15;
        leftSlant = baseOffset - trapezoidEffect;
        rightSlant = baseOffset + trapezoidEffect;
      }
    }

    const bottomLeft = {
      x: topLeft.x + leftSlant,
      y: targetY,
    };

    const bottomRight = {
      x: topRight.x + rightSlant,
      y: targetY,
    };

    // ðŸ”§ ìµœëŒ€ í™•ì‚° ì œí•œ ì™„í™” (ë” ë„“ì€ ê·¸ë¦¼ìž í—ˆìš©)
    const maxSpread = platform.width * 3.5; // 2.5 â†’ 3.5ë¡œ ì¦ê°€
    const currentSpread = Math.abs(bottomRight.x - bottomLeft.x);

    if (currentSpread > maxSpread) {
      const reduction = maxSpread / currentSpread;
      const centerX = (bottomLeft.x + bottomRight.x) / 2;

      bottomLeft.x = centerX - (centerX - bottomLeft.x) * reduction;
      bottomRight.x = centerX - (centerX - bottomRight.x) * reduction;
    }

    const points = [
      topLeft.x,
      topLeft.y,
      topRight.x,
      topRight.y,
      bottomRight.x,
      bottomRight.y,
      bottomLeft.x,
      bottomLeft.y,
    ];

    // ðŸŽ¯ ë””ë²„ê·¸: ì‚¬ë‹¤ë¦¬ê¼´ í¬ê¸° ì •ë³´
    const topWidth = platform.width;
    const bottomWidth = Math.abs(bottomRight.x - bottomLeft.x);
    const widthRatio = bottomWidth / topWidth;
    return { points };
  }


  /** 점광원 그림자: 플랫폼 네 변을 광원 반대 방향으로 길게 밀어낸 사각형들의 합집합 */
  private calculatePointLightShadow(
    platform: Platform,
    light: { x: number; y: number }
  ): ShadowPolygon[] {
    const { x, y, width: w, height: h } = platform;
    // 광원이 플랫폼 안이면 그림자 없음
    if (light.x > x && light.x < x + w && light.y > y && light.y < y + h) return [];
    const len = this.lightConfig.maxLength || 1500;
    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const far = (p: { x: number; y: number }) => {
      const dx = p.x - light.x;
      const dy = p.y - light.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * len, y: p.y + (dy / d) * len };
    };
    const out: ShadowPolygon[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      const fa = far(a);
      const fb = far(b);
      out.push({ points: [a.x, a.y, b.x, b.y, fb.x, fb.y, fa.x, fa.y] });
    }
    return out;
  }

  private getLightDirection(): { x: number; y: number } {
    const radian = (this.lightConfig.angle * Math.PI) / 180;
    return {
      x: Math.cos(radian),
      y: Math.sin(radian),
    };
  }
}
