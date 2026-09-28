// src/game/managers/CameraManager.ts - 쉐이더 적용 버전
import { Debug } from "../debug/DebugManager";
import { LogCategory } from "../debug/Logger";

export interface CameraConfig {
  follow: {
    enabled: boolean;
    lerpX: number;
    lerpY: number;
    deadzone: {
      width: number;
      height: number;
    };
    offset: {
      x: number;
      y: number;
    };
  };
  bounds: {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom: {
    default: number;
    min: number;
    max: number;
    smooth: boolean;
    duration: number;
  };
  shake: {
    enabled: boolean;
    duration: number;
    intensity: number;
  };
  // ⭐ 새로운 쉐이더 설정 추가
  effects: {
    atmospheric: {
      enabled: boolean;
      intensity: number;
      speed: number;
    };
  };
}

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  follow: {
    enabled: true,
    lerpX: 0.08,
    lerpY: 0.08,
    deadzone: {
      width: 100,
      height: 60,
    },
    offset: {
      x: 0,
      y: 0,
    },
  },
  bounds: {
    enabled: true,
    x: 0,
    y: 0,
    width: 1280,
    height: 640,
  },
  zoom: {
    default: 1.0,
    min: 0.5,
    max: 3.0,
    smooth: true,
    duration: 500,
  },
  shake: {
    enabled: true,
    duration: 200,
    intensity: 0.02,
  },
  // ⭐ 기본 쉐이더 설정
  effects: {
    atmospheric: {
      enabled: false,
      intensity: 0.8,
      speed: 1.0,
    },
  },
};

export class CameraManager {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private config: CameraConfig;

  // 팔로우 대상
  private followTarget: Phaser.GameObjects.GameObject | null = null;

  // 카메라 상태
  private isShaking: boolean = false;
  private currentZoom: number = 1;

  constructor(scene: Phaser.Scene, config?: Partial<CameraConfig>) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };

    Debug.log.info(LogCategory.CAMERA, "CameraManager 초기화됨");
  }

  // ⭐ 카메라 정보 가져오기 - 쉐이더 정보 추가
  getCameraInfo() {
    return {
      x: this.camera.scrollX,
      y: this.camera.scrollY,
      width: this.camera.width,
      height: this.camera.height,
      zoom: this.currentZoom,
      bounds: this.config.bounds.enabled
        ? {
            x: this.config.bounds.x,
            y: this.config.bounds.y,
            width: this.config.bounds.width,
            height: this.config.bounds.height,
          }
        : null,
      followTarget: this.followTarget?.name || null,
      isShaking: this.isShaking,
      // ⭐ 대기 효과 정보 추가
    };
  }

  // ⭐ 설정 업데이트 - 쉐이더 설정 포함
  updateConfig(newConfig: Partial<CameraConfig>): void {
    this.config = this.deepMerge(this.config, newConfig);

    Debug.log.info(LogCategory.CAMERA, "카메라 설정 업데이트됨", newConfig);
  }

  // === 기존 메서드들 (변경 없음) ===

  setFollowTarget(target: Phaser.GameObjects.GameObject): void {
    this.followTarget = target;

    if (this.config.follow.enabled) {
      this.camera.startFollow(
        target,
        true,
        this.config.follow.lerpX,
        this.config.follow.lerpY
      );

      this.camera.setDeadzone(
        this.config.follow.deadzone.width,
        this.config.follow.deadzone.height
      );

      if (
        this.config.follow.offset.x !== 0 ||
        this.config.follow.offset.y !== 0
      ) {
        this.camera.setFollowOffset(
          this.config.follow.offset.x,
          this.config.follow.offset.y
        );
      }

      Debug.log.info(LogCategory.CAMERA, "팔로우 대상 설정 완료", {
        target: target.name || "Unknown",
        lerp: { x: this.config.follow.lerpX, y: this.config.follow.lerpY },
        deadzone: this.config.follow.deadzone,
        offset: this.config.follow.offset,
      });
    }
  }

  setBounds(x: number, y: number, width: number, height: number): void {
    this.camera.setBounds(x, y, width, height);
    this.config.bounds = { enabled: true, x, y, width, height };
    Debug.log.info(
      LogCategory.CAMERA,
      `카메라 바운드 설정: ${width}x${height} at (${x}, ${y})`
    );
  }

  setBoundsToMap(mapSize: { width: number; height: number }): void {
    const minWidth = Math.max(mapSize.width, this.camera.width);
    const minHeight = Math.max(mapSize.height, this.camera.height);
    this.setBounds(0, 0, minWidth, minHeight);
  }

  shake(duration?: number, intensity?: number): void {
    if (!this.config.shake.enabled) {
      Debug.log.warn(LogCategory.CAMERA, "카메라 흔들기가 비활성화됨");
      return;
    }

    const shakeDuration = duration || this.config.shake.duration;
    const shakeIntensity = intensity || this.config.shake.intensity;

    this.isShaking = true;
    this.camera.shake(shakeDuration, shakeIntensity);

    this.scene.time.delayedCall(shakeDuration, () => {
      this.isShaking = false;
      Debug.log.debug(LogCategory.CAMERA, "카메라 흔들기 완료");
    });

    Debug.log.debug(
      LogCategory.CAMERA,
      `카메라 흔들기: ${shakeDuration}ms, 강도: ${shakeIntensity}`
    );
  }

  // 기존 유틸리티 메서드들...
  stopFollow(): void {
    this.camera.stopFollow();
    this.followTarget = null;
    Debug.log.info(LogCategory.CAMERA, "팔로우 중지됨");
  }

  panTo(x: number, y: number, duration: number = 1000): void {
    const wasFollowing = !!this.followTarget;
    if (wasFollowing) {
      this.camera.stopFollow();
    }

    this.scene.tweens.add({
      targets: this.camera,
      scrollX: x - this.camera.width / 2,
      scrollY: y - this.camera.height / 2,
      duration: duration,
      ease: "Power2",
      onComplete: () => {
        if (wasFollowing && this.followTarget) {
          this.setFollowTarget(this.followTarget);
        }
        Debug.log.debug(LogCategory.CAMERA, `카메라 이동 완료: (${x}, ${y})`);
      },
    });

    Debug.log.debug(LogCategory.CAMERA, `카메라 이동 시작: (${x}, ${y})`);
  }

  isInViewport(x: number, y: number, buffer: number = 0): boolean {
    const cam = this.camera;
    return (
      x >= cam.scrollX - buffer &&
      x <= cam.scrollX + cam.width + buffer &&
      y >= cam.scrollY - buffer &&
      y <= cam.scrollY + cam.height + buffer
    );
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.camera.scrollX) * this.camera.zoom,
      y: (worldY - this.camera.scrollY) * this.camera.zoom,
    };
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.camera.zoom + this.camera.scrollX,
      y: screenY / this.camera.zoom + this.camera.scrollY,
    };
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  getConfig(): CameraConfig {
    return { ...this.config };
  }

  removeBounds(): void {
    this.camera.removeBounds();
    this.config.bounds.enabled = false;
    Debug.log.info(LogCategory.CAMERA, "카메라 바운드 제거됨");
  }

  resetToTarget(duration: number = 500): void {
    if (!this.followTarget) {
      Debug.log.warn(LogCategory.CAMERA, "팔로우 대상이 없어 리셋할 수 없음");
      return;
    }

    const target = this.followTarget as any;
    const targetX = target.x || 0;
    const targetY = target.y || 0;

    this.panTo(targetX, targetY, duration);
  }

  updateFollowConfig(followConfig: Partial<CameraConfig["follow"]>): void {
    this.config.follow = { ...this.config.follow, ...followConfig };

    if (this.followTarget && this.config.follow.enabled) {
      this.setFollowTarget(this.followTarget);
    }

    Debug.log.debug(LogCategory.CAMERA, "팔로우 설정 업데이트됨", followConfig);
  }

  handleResize(width: number, height: number): void {
    Debug.log.debug(LogCategory.CAMERA, `카메라 리사이즈: ${width}x${height}`);

    this.camera.setViewport(0, 0, width, height);

    if (this.config.bounds.enabled) {
      const minWidth = Math.max(this.config.bounds.width, width);
      const minHeight = Math.max(this.config.bounds.height, height);

      if (
        minWidth !== this.config.bounds.width ||
        minHeight !== this.config.bounds.height
      ) {
        this.setBounds(
          this.config.bounds.x,
          this.config.bounds.y,
          minWidth,
          minHeight
        );
      }
    }
  }

  logDebugInfo(): void {
    const info = this.getCameraInfo();
    Debug.log.info(LogCategory.CAMERA, "=== CAMERA MANAGER DEBUG INFO ===");
    Debug.log.info(LogCategory.CAMERA, "카메라 정보", info);
    Debug.log.info(LogCategory.CAMERA, "카메라 설정", this.config);
    Debug.log.info(LogCategory.CAMERA, "================================");
  }
}
