// src/game/shadow/ShadowSystem.ts
import { Platform } from "../config";
import { ShadowRenderer } from "./ShadowRenderer";
import {
  ShadowRendererConfig,
  CameraInfo,
  LightConfig,
  DEFAULT_SHADOW_CONFIG,
} from "./ShadowTypes";

/**
 * 그림자 시스템 통합 관리 클래스
 * MapRenderer와 GameScene에서 사용하는 메인 인터페이스
 */
export class ShadowSystem {
  private renderer: ShadowRenderer;
  private isInitialized: boolean = false;

  constructor(scene: Phaser.Scene, config?: Partial<ShadowRendererConfig>) {
    this.renderer = new ShadowRenderer(scene, config);
    this.isInitialized = true;

    console.log("ShadowSystem initialized");
  }

  /** 매 프레임 업데이트 (GameScene.update에서 호출) */
  public update(platforms: Platform[], camera: CameraInfo): void {
    if (!this.isInitialized) return;

    this.renderer.update(platforms, camera);
  }

  /** 강제 업데이트 (맵 변경, 리사이즈 등에서 호출) */
  public forceUpdate(platforms: Platform[], camera: CameraInfo): void {
    if (!this.isInitialized) return;

    this.renderer.forceUpdate(platforms, camera);
  }

  /** 빛 각도 애니메이션 (동적 변경용) */
  public animateLightAngle(
    targetAngle: number,
    duration: number = 1000,
    easing: string = "Linear"
  ): void {
    if (!this.isInitialized) return;

    const currentAngle = this.renderer.getConfig().light.angle;
    const scene = (this.renderer as any).scene; // private 접근을 위한 임시 처리

    // Phaser Tween을 사용한 부드러운 각도 변경
    scene.tweens.add({
      targets: { angle: currentAngle },
      angle: targetAngle,
      duration: duration,
      ease: easing,
      onUpdate: (tween: any, target: any) => {
        this.renderer.setLightAngle(target.angle);
      },
      onComplete: () => {
        console.log(`Light angle animation completed: ${targetAngle}°`);
      },
    });
  }

  /** 빛 설정 변경 */
  public updateLightConfig(config: Partial<LightConfig>): void {
    if (!this.isInitialized) return;

    this.renderer.updateLightConfig(config);
  }

  /** 빛 각도 즉시 변경 */
  public setPointLight(p: { x: number; y: number } | null): void {
    this.renderer.setPointLight(p);
  }

  public setLightAngle(angle: number): void {
    if (!this.isInitialized) return;

    this.renderer.setLightAngle(angle);
  }

  /** 그림자 시스템 활성화/비활성화 */
  public setEnabled(enabled: boolean): void {
    if (!this.isInitialized) return;

    this.renderer.setEnabled(enabled);
  }

  /** 그림자 색상 변경 */
  public setShadowColor(color: number): void {
    this.updateLightConfig({ color });
  }

  /** 그림자 깊이(depth) 변경 */
  public setDepth(depth: number): void {
    if (!this.isInitialized) return;

    this.renderer.setDepth(depth);
  }

  /** 현재 설정 조회 */
  public getConfig(): ShadowRendererConfig {
    if (!this.isInitialized) return DEFAULT_SHADOW_CONFIG;

    return this.renderer.getConfig();
  }

  /** 그림자 지우기 */
  public clear(): void {
    if (!this.isInitialized) return;

    this.renderer.clear();
  }

  /** 리소스 정리 */
  public destroy(): void {
    if (this.renderer) {
      this.renderer.destroy();
    }
    this.isInitialized = false;

    console.log("ShadowSystem destroyed");
  }

  /** 디버그 정보 출력 */
  public debugInfo(): object {
    if (!this.isInitialized) return {};

    const config = this.getConfig();
    return {
      enabled: config.enabled,
      lightAngle: config.light.angle,
      shadowColor: `#${config.light.color.toString(16).padStart(6, "0")}`,
      depth: config.depth,
      maxLength: config.light.maxLength,
    };
  }

  /** 프리셋 적용 */
  public applyPreset(
    presetName: "morning" | "noon" | "evening" | "night"
  ): void {
    const presets = {
      morning: { angle: 75, color: 0x1a1a2e }, // 아침: 비스듬한 빛, 부드러운 그림자
      noon: { angle: 90, color: 0x000a25 }, // 정오: 수직 빛, 짙은 그림자
      evening: { angle: 105, color: 0x2d1b3d }, // 저녁: 반대 비스듬한 빛, 따뜻한 그림자
      night: { angle: 90, color: 0x050515 }, // 밤: 수직, 매우 어두운 그림자
    };

    const preset = presets[presetName];
    if (preset) {
      this.updateLightConfig(preset);
      console.log(`Applied shadow preset: ${presetName}`);
    }
  }
}
