// src/game/shadow/ShadowRenderer.ts - 블렌드 완전 제거 + 긴 사다리꼴
import { Platform } from "../config";
import { ShadowCalculator } from "./ShadowCalculator";
import {
  ShadowRendererConfig,
  DEFAULT_SHADOW_CONFIG,
  CameraInfo,
  LightConfig,
} from "./ShadowTypes";

// 그림자 캔버스 해상도 배율 (0.5 = 절반)
const SHADOW_RES = 0.5;
// 그림자 레이어 기본 투명도 (두 레이어가 교차할 때 합이 이 값)
const SHADOW_ALPHA = 0.5;

/** 폴리곤들을 흰색 마스크로 한 번에 채움 (블렌드 없는 단일 패스) */
function fillPolygons(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  polygons: Array<{ points: number[] }>,
  camera: CameraInfo
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(SHADOW_RES, 0, 0, SHADOW_RES, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  for (const polygon of polygons) {
    const pts = polygon.points;
    if (pts.length < 6) continue;
    ctx.moveTo(pts[0]! - camera.x, pts[1]! - camera.y);
    for (let j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j]! - camera.x, pts[j + 1]! - camera.y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export class ShadowRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private calculator: ShadowCalculator;
  private config: ShadowRendererConfig;

  // 🎯 블렌드 완전 제거: 단일 통합 패스 렌더링
  private shadowCanvas: HTMLCanvasElement | null = null;
  private shadowCtx: CanvasRenderingContext2D | null = null;
  private shadowTexture: Phaser.Textures.CanvasTexture | null = null;
  private shadowImage: Phaser.GameObjects.Image | null = null;

  // 성능 최적화
  private lastUpdateTime: number = 0;
  private updateThrottle: number = 100;
  private lastCameraHash: string = "";

  constructor(scene: Phaser.Scene, config?: Partial<ShadowRendererConfig>) {
    this.scene = scene;

    this.config = {
      ...DEFAULT_SHADOW_CONFIG,
      ...config,
      light: {
        ...DEFAULT_SHADOW_CONFIG.light,
        angle: 90,
        color: 0x1a1f26,
        maxLength: 1500, // 🔧 더 긴 그림자
        ...config?.light,
      },
    };

    // 기본 Graphics 객체 (호환성)
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(this.config.depth);
    this.graphics.setScrollFactor(1, 1);

    // 🎯 Canvas 기반 통합 그림자 시스템 초기화
    this.initializeCanvasShadowSystem();

    // 계산기 생성
    this.calculator = new ShadowCalculator(this.config.light);

    console.log("🎨 No-Blend Shadow Renderer created");
  }

  /** 🎯 Canvas 기반 블렌드 없는 그림자 시스템 */
  private initializeCanvasShadowSystem(): void {
    const width = Math.ceil(this.scene.sys.game.canvas.width * SHADOW_RES);
    const height = Math.ceil(this.scene.sys.game.canvas.height * SHADOW_RES);

    // Canvas 생성
    this.shadowCanvas = document.createElement("canvas");
    this.shadowCanvas.width = width;
    this.shadowCanvas.height = height;
    this.shadowCtx = this.shadowCanvas.getContext("2d");

    if (!this.shadowCtx) {
      console.error("❌ Canvas context 생성 실패");
      return;
    }

    // Phaser 텍스처로 등록
    const textureKey = "unified_shadow_texture";
    if (this.scene.textures.exists(textureKey)) {
      this.scene.textures.remove(textureKey);
    }

    this.shadowTexture = this.scene.textures.addCanvas(
      textureKey,
      this.shadowCanvas
    );

    // 그림자 이미지 생성
    this.shadowImage = this.scene.add.image(0, 0, textureKey);
    this.shadowImage.setOrigin(0, 0);
    this.shadowImage.setDepth(this.config.depth);
    this.shadowImage.setScrollFactor(0, 0); // 화면 고정
    this.shadowImage.setScale(1 / SHADOW_RES); // 절반 해상도로 그려 확대 (비용↓, 가장자리 부드럽게)
    this.shadowImage.setAlpha(SHADOW_ALPHA);
  }

  /** 그림자 업데이트 */
  public update(platforms: Platform[], camera: CameraInfo): void {
    if (!this.config.enabled || platforms.length === 0) {
      this.clear();
      return;
    }

    this.updatePointLayer(
      platforms.map((p) => this.normalizePlatform(p as any)),
      camera
    );

    const now = Date.now();
    const cameraHash = this.getCameraHash(camera);

    if (
      now - this.lastUpdateTime < this.updateThrottle &&
      cameraHash === this.lastCameraHash
    ) {
      return;
    }

    this.lastUpdateTime = now;
    this.lastCameraHash = cameraHash;

    const norm = platforms.map((p) => this.normalizePlatform(p as any));
    this.renderUnifiedShadows(norm, camera);
  }

  /** 강제 업데이트 */
  public forceUpdate(platforms: Platform[], camera: CameraInfo): void {
    if (!this.config.enabled) {
      this.clear();
      return;
    }

    this.lastUpdateTime = 0;
    this.lastCameraHash = "";

    const norm = platforms.map((p) => this.normalizePlatform(p as any));
    this.renderUnifiedShadows(norm, camera);
  }

  /** 🎯 블렌드 완전 제거 통합 그림자 렌더링 */
  private renderUnifiedShadows(
    platforms: Platform[],
    camera: CameraInfo
  ): void {
    if (!this.shadowCtx || !this.shadowTexture || !this.shadowImage) {
      return;
    }

    // 그림자 계산
    const result = this.calculator.calculateShadows(platforms, camera);
    if (result.polygons.length === 0) {
      this.clear();
      return;
    }

    // 🎯 Step 1: Canvas 클리어
    this.shadowCtx.clearRect(
      0,
      0,
      this.shadowCanvas!.width,
      this.shadowCanvas!.height
    );

    // 🎯 Step 2: 단일 패스로 모든 그림자를 하나의 모양으로 그리기
    this.shadowCtx.setTransform(SHADOW_RES, 0, 0, SHADOW_RES, 0, 0);
    this.shadowCtx.fillStyle = "#ffffff"; // 흰색 마스크
    this.shadowCtx.globalCompositeOperation = "source-over"; // 기본 합성

    // 🔧 방법 1: 모든 그림자를 한 번에 그리기 (블렌드 없음)
    this.shadowCtx.beginPath();

    let pathStarted = false;
    let renderedCount = 0;

    for (const polygon of result.polygons) {
      if (polygon.points.length >= 8) {
        // 카메라 오프셋 적용
        const offsetX = -camera.x;
        const offsetY = -camera.y;

        if (!pathStarted) {
          this.shadowCtx.moveTo(
            polygon.points[0] + offsetX,
            polygon.points[1] + offsetY
          );
          pathStarted = true;
        } else {
          // 새로운 서브패스 시작
          this.shadowCtx.moveTo(
            polygon.points[0] + offsetX,
            polygon.points[1] + offsetY
          );
        }

        // 폴리곤 그리기
        for (let j = 2; j < polygon.points.length; j += 2) {
          this.shadowCtx.lineTo(
            polygon.points[j] + offsetX,
            polygon.points[j + 1] + offsetY
          );
        }

        this.shadowCtx.closePath();
        renderedCount++;
      }
    }

    // 한 번에 모든 그림자 채우기
    this.shadowCtx.fill();
    this.shadowCtx.setTransform(1, 0, 0, 1, 0, 0);

    // 🎯 Step 3: 텍스처 업데이트 및 색상 적용
    this.shadowTexture.refresh();

    // 그림자 색상 틴트 적용
    this.shadowImage.setTint(this.config.light.color);
    this.shadowImage.setVisible(true);
  }

  /** 그림자 지우기 */
  public clear(): void {
    this.graphics.clear();

    if (this.shadowCtx && this.shadowCanvas) {
      this.shadowCtx.clearRect(
        0,
        0,
        this.shadowCanvas.width,
        this.shadowCanvas.height
      );
      this.shadowTexture?.refresh();
    }

    if (this.shadowImage) {
      this.shadowImage.setVisible(false);
    }
  }

  // ===== 점광원 그림자 레이어 (기본 그림자와 크로스페이드) =====
  private pointTarget: { x: number; y: number } | null = null;
  private pointPos: { x: number; y: number } | null = null; // 부드럽게 따라가는 위치
  private pointStrength = 0; // 0 = 기본 그림자만, 1 = 점광원 그림자만
  private pointDrawnKey = "";
  private pointLastMs = 0;
  private pointCalc?: ShadowCalculator;
  private pCanvas?: HTMLCanvasElement;
  private pCtx?: CanvasRenderingContext2D | null;
  private pTexture?: Phaser.Textures.CanvasTexture | null;
  private pImage?: Phaser.GameObjects.Image;

  /** 점광원 목표 (null 이면 기본 방향광 그림자로 서서히 복귀) */
  public setPointLight(p: { x: number; y: number } | null): void {
    this.pointTarget = p;
  }

  private ensurePointLayer(): boolean {
    if (this.pImage) return true;
    const w = this.shadowCanvas?.width;
    const h = this.shadowCanvas?.height;
    if (!w || !h) return false;
    this.pCanvas = document.createElement("canvas");
    this.pCanvas.width = w;
    this.pCanvas.height = h;
    this.pCtx = this.pCanvas.getContext("2d");
    const key = "point_shadow_texture";
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.pTexture = this.scene.textures.addCanvas(key, this.pCanvas);
    this.pImage = this.scene.add.image(0, 0, key);
    this.pImage.setOrigin(0, 0).setDepth(this.config.depth).setScrollFactor(0, 0);
    this.pImage.setScale(1 / SHADOW_RES).setAlpha(0).setTint(this.config.light.color);
    this.pointCalc = new ShadowCalculator(this.config.light);
    return true;
  }

  /** 매 프레임: 세기/위치를 부드럽게 보간하고 두 레이어 투명도를 교차 */
  private updatePointLayer(platforms: Platform[], camera: CameraInfo): void {
    if (!this.ensurePointLayer()) return;
    const now = performance.now();
    const dt = this.pointLastMs ? Math.min(0.1, (now - this.pointLastMs) / 1000) : 0;
    this.pointLastMs = now;

    const target = this.pointTarget;
    // 나타날 땐 빠르게(~80ms), 사라질 땐 천천히(~250ms)
    const tau = target ? 0.08 : 0.25;
    this.pointStrength += ((target ? 1 : 0) - this.pointStrength) * (1 - Math.exp(-dt / tau));
    if (target) {
      if (!this.pointPos || this.pointStrength < 0.02) this.pointPos = { ...target };
      else {
        const k = 1 - Math.exp(-dt / 0.06); // 광원이 바뀌어도 방향이 튀지 않게
        this.pointPos.x += (target.x - this.pointPos.x) * k;
        this.pointPos.y += (target.y - this.pointPos.y) * k;
      }
    }

    const base = SHADOW_ALPHA;
    this.shadowImage?.setAlpha(base * (1 - this.pointStrength));
    this.pImage!.setAlpha(base * this.pointStrength);
    this.pImage!.setVisible(this.pointStrength > 0.005 && this.config.enabled);
    if (this.pointStrength <= 0.005 || !this.pointPos || !this.pCtx) return;

    const key = `${Math.round(this.pointPos.x)},${Math.round(this.pointPos.y)},${Math.round(camera.x)},${Math.round(camera.y)}`;
    if (key === this.pointDrawnKey) return;
    this.pointDrawnKey = key;

    this.pointCalc!.setPointLight(this.pointPos);
    const result = this.pointCalc!.calculateShadows(platforms, camera);
    fillPolygons(this.pCtx, this.pCanvas!, result.polygons, camera);
    this.pTexture?.refresh();
  }

  /** 빛 각도 변경 */
  public setLightAngle(angle: number): void {
    this.calculator.setLightAngle(angle);
    this.config.light.angle = angle;

    this.lastUpdateTime = 0;
    this.lastCameraHash = "";
  }

  /** 빛 설정 변경 */
  public updateLightConfig(newConfig: Partial<LightConfig>): void {
    this.config.light = { ...this.config.light, ...newConfig };
    this.calculator.updateLightConfig(this.config.light);

    if (newConfig.color !== undefined) {
      this.lastUpdateTime = 0;
      this.lastCameraHash = "";
    }
  }

  /** 그림자 시스템 활성화/비활성화 */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (!enabled) {
      this.clear();
    } else {
      this.lastUpdateTime = 0;
      this.lastCameraHash = "";
    }

    if (this.shadowImage) {
      this.shadowImage.setVisible(enabled);
    }
  }

  /** 화면 크기 변경 처리 */
  public handleResize(width: number, height: number): void {
    // Canvas 크기 조정
    if (this.shadowCanvas) {
      this.shadowCanvas.width = Math.ceil(width * SHADOW_RES);
      this.shadowCanvas.height = Math.ceil(height * SHADOW_RES);
    }

    // 그림자 이미지 위치 재조정
    if (this.shadowImage) {
      this.shadowImage.setPosition(0, 0);
    }

    this.lastUpdateTime = 0;
    this.lastCameraHash = "";
  }

  /** 렌더링 depth 변경 */
  public setDepth(depth: number): void {
    this.config.depth = depth;
    this.graphics.setDepth(depth);

    if (this.shadowImage) {
      this.shadowImage.setDepth(depth);
    }
  }

  // ===== 헬퍼 메서드들 =====

  private getCameraHash(camera: CameraInfo): string {
    const x = Math.round(camera.x / 20) * 20;
    const y = Math.round(camera.y / 20) * 20;
    const w = Math.round(camera.width / 20) * 20;
    const h = Math.round(camera.height / 20) * 20;
    return `${x},${y},${w},${h}`;
  }

  private normalizePlatform(p: any): Platform {
    const width = Number(p.width ?? p.w);
    const height = Number(p.height ?? p.h);
    const x = Number(p.x);
    const y = Number(p.y);

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      console.warn("[ShadowRenderer] 잘못된 플랫폼 치수", {
        x,
        y,
        width,
        height,
        raw: p,
      });
    }

    return { ...p, x, y, width, height } as Platform;
  }

  public getConfig(): ShadowRendererConfig {
    return { ...this.config };
  }

  /** 리소스 정리 */
  public destroy(): void {
    if (this.graphics) {
      this.graphics.destroy();
    }

    if (this.shadowImage) {
      this.shadowImage.destroy();
      this.shadowImage = null;
    }
    this.pImage?.destroy();
    if (this.pTexture) this.scene.textures.remove("point_shadow_texture");
    this.pTexture = null;

    if (this.shadowTexture) {
      this.scene.textures.remove("unified_shadow_texture");
      this.shadowTexture = null;
    }

    this.shadowCanvas = null;
    this.shadowCtx = null;
  }
}
