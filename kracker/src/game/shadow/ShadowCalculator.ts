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


  /**
   * 점광원 그림자: 기존 사다리꼴을 광원 방향으로 드리운 것.
   * 광원에서 본 플랫폼의 양 끝 모서리(실루엣)에서 시작해, 광원→모서리 방향으로 뻗으며
   * 기존처럼 바깥쪽으로 폭의 0.6배씩 더 벌어진다. 광원이 바로 위면 기존 90° 사다리꼴과 같다.
   */
  private calculatePointLightShadow(
    platform: Platform,
    light: { x: number; y: number }
  ): ShadowPolygon[] {
    const { x, y, width: w, height: h } = platform;
    if (light.x > x && light.x < x + w && light.y > y && light.y < y + h) return [];
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dl = Math.hypot(cx - light.x, cy - light.y) || 1;
    const dx = (cx - light.x) / dl;
    const dy = (cy - light.y) / dl;

    // 광원에서 본 각도가 가장 작은/큰 모서리 = 실루엣 모서리
    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const angleOf = (c: { x: number; y: number }) => {
      const vx = c.x - light.x;
      const vy = c.y - light.y;
      return Math.atan2(dx * vy - dy * vx, dx * vx + dy * vy);
    };
    let a = corners[0]!;
    let b = corners[0]!;
    for (const c of corners) {
      if (angleOf(c) < angleOf(a)) a = c;
      if (angleOf(c) > angleOf(b)) b = c;
    }

    const len = this.lightConfig.maxLength || 1500;
    const spread = Math.hypot(b.x - a.x, b.y - a.y) * 0.6; // 기존: 양옆 폭*0.6
    const ray = (c: { x: number; y: number }, side: number) => {
      const vx = c.x - light.x;
      const vy = c.y - light.y;
      const d = Math.hypot(vx, vy) || 1;
      const ux = vx / d;
      const uy = vy / d;
      // 광선 방향으로 len, 그리고 바깥쪽(그림자 중심축에서 멀어지는 쪽)으로 spread
      return { x: c.x + ux * len + -uy * side * spread, y: c.y + uy * len + ux * side * spread };
    };
    const fa = ray(a, -1);
    const fb = ray(b, 1);

    return [{ points: [a.x, a.y, b.x, b.y, fb.x, fb.y, fa.x, fa.y] }];
  }

  private getLightDirection(): { x: number; y: number } {
    const radian = (this.lightConfig.angle * Math.PI) / 180;
    return {
      x: Math.cos(radian),
      y: Math.sin(radian),
    };
  }
}
