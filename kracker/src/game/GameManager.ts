// src/game/GameManager.ts - 슬림화 완성본 (중복 제거)
import Phaser from "phaser";
import { GAME_CONFIG } from "./config";
import { initializeMaps } from "./maps/MapLoader";

// 🆕 외부 GameScene 사용
import GameScene from "./GameScene";
import { NetworkManager } from "./managers/NetworkManager";

// 🆕 디버그 시스템 import
import { Debug, debugManager } from "./debug/DebugManager";
import { LogCategory } from "./debug/Logger";

export default class GameManager {
  private parentElement: HTMLElement;
  private game: Phaser.Game | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // 기준 해상도 설정 (게임 월드의 기본 크기)
  private readonly BASE_WIDTH = 1920;
  private readonly BASE_HEIGHT = 1080;

  constructor(parentElement: HTMLElement) {
    this.parentElement = parentElement;
    Debug.log.info(LogCategory.GAME, "GameManager 생성됨");
  }

  async initialize(): Promise<void> {
    Debug.log.info(LogCategory.GAME, "게임 초기화 시작");

    // 맵 프리셋들 먼저 초기화
    await Debug.measureAsync("맵 초기화", async () => {
      await initializeMaps();
    });
    // 맵 로딩 중에 destroy() 됐다면 게임을 만들지 않는다 (언마운트 후 누수 방지)
    if (this.destroyed) return;

    // Phaser 게임 설정
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      width: this.BASE_WIDTH, // 기준 해상도로 설정
      height: this.BASE_HEIGHT,
      parent: this.parentElement,
      backgroundColor: GAME_CONFIG.backgroundColor,

      scene: GameScene, // 🆕 외부 GameScene 클래스 사용
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
          gravity: { y: 0, x: 0 }, // 커스텀 중력 사용
        },
      },
      scale: {
        mode: Phaser.Scale.FIT, // RESIZE 대신 FIT 모드 사용
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: this.BASE_WIDTH,
        height: this.BASE_HEIGHT,
        min: {
          width: this.BASE_WIDTH * 0.5, // 최소 크기 설정
          height: this.BASE_HEIGHT * 0.5,
        },
        max: {
          width: this.BASE_WIDTH, // 최대 크기 설정
          height: this.BASE_HEIGHT,
        },
      },
      input: {
        keyboard: true,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
    };

    try {
      this.game = new Phaser.Game(config);
      Debug.log.info(LogCategory.GAME, "Phaser 게임 인스턴스 생성됨");

      this.setupResizeHandler();
      this.setupGameEvents();

      Debug.log.info(LogCategory.GAME, "게임 초기화 성공");
    } catch (error) {
      Debug.log.error(LogCategory.GAME, "게임 초기화 실패", error);
      throw error;
    }
  }

  // 게임 이벤트 설정
  private setupGameEvents(): void {
    if (!this.game) return;

    // 게임 부팅 완료 이벤트
    this.game.events.on("boot", () => {
      Debug.log.info(LogCategory.GAME, "게임 부팅 완료");

      // 🆕 시스템 정보 로깅
      if (Debug.isEnabled()) {
        debugManager.logSystemInfo();
      }
    });

    // 게임 준비 완료 이벤트
    this.game.events.on("ready", () => {
      Debug.log.info(LogCategory.GAME, "게임 준비 완료");

      // 🆕 게임 매니저 디버그 정보 출력
      if (Debug.isEnabled()) {
        this.logDebugInfo();
      }
    });

    // 씬 관련 이벤트
    this.game.events.on("step", (time: number, delta: number) => {
      // 퍼포먼스 모니터링 (가끔씩만)
      if (Debug.isEnabled() && time % 10000 < delta) {
        // 10초마다
        debugManager.checkMemoryUsage();
      }
    });

    // 에러 이벤트
    this.game.events.on("destroy", () => {
      Debug.log.info(LogCategory.GAME, "게임 파괴됨");
    });

    Debug.log.debug(LogCategory.GAME, "게임 이벤트 설정 완료");
  }

  // 리사이즈 핸들러 설정
  private setupResizeHandler(): void {
    if (!this.game) return;

    // ResizeObserver로 부모 엘리먼트 크기 변화 감지
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          Debug.measure("화면 리사이즈", () => {
            this.handleResize(width, height);
          });
        }
      });

      this.resizeObserver.observe(this.parentElement);
      Debug.log.debug(LogCategory.GAME, "ResizeObserver 설정 완료");
    }

    // 윈도우 리사이즈 이벤트도 처리
    const handleWindowResize = () => {
      const rect = this.parentElement.getBoundingClientRect();
      Debug.measure("윈도우 리사이즈", () => {
        this.handleResize(rect.width, rect.height);
      });
    };

    window.addEventListener("resize", handleWindowResize);
    Debug.log.debug(LogCategory.GAME, "Window resize listener 설정 완료");

    // 정리 함수를 위해 저장
    (this as any)._windowResizeHandler = handleWindowResize;
  }

  // 실제 리사이즈 처리
  private handleResize(width: number, height: number): void {
    if (!this.game) return;

    Debug.log.trace(LogCategory.GAME, `게임 리사이즈: ${width}x${height}`);

    // Phaser의 FIT 모드가 자동으로 비율을 유지하면서 크기를 조정
    this.game.scale.setParentSize(width, height);
    this.game.scale.refresh();

    // 현재 씬에 리사이즈 이벤트 전달
    const scene = this.getGameScene();
    if (scene && typeof scene.resize === "function") {
      // FIT 모드에서는 실제 게임 화면 크기를 전달
      const gameSize = this.game.scale.gameSize;
      scene.resize(gameSize.width, gameSize.height);
    }
  }

  // 🆕 GameScene 접근 헬퍼
  private getGameScene(): GameScene | null {
    if (!this.game) return null;

    const scene = this.game.scene.getScene("GameScene") as GameScene;
    return scene || null;
  }

  // 🆕 공개 API 메서드들

  /**
   * 현재 게임 씬을 반환합니다
   */
  public getScene(): GameScene | null {
    return this.getGameScene();
  }

  /**
   * 씬이 완전히 준비되었는지 확인합니다
   */
  public isSceneReady(): boolean {
    const scene = this.getGameScene();
    return scene !== null && scene.getIsInitialized();
  }

  /**
   * 맵을 변경합니다
   */
  public async changeMap(mapKey: string): Promise<void> {
    const scene = this.getGameScene();
    if (scene) {
      await scene.changeMap(mapKey as any); // 타입 캐스팅으로 해결
      Debug.log.info(
        LogCategory.GAME,
        `GameManager에서 맵 변경 요청: ${mapKey}`
      );
    } else {
      Debug.log.warn(LogCategory.GAME, "GameScene을 찾을 수 없어 맵 변경 실패");
    }
  }

  /**
   * 특정 위치에 파티클 효과를 생성합니다
   */
  public createParticleEffect(
    x: number,
    y: number,
    fancy: boolean = false
  ): void {
    const scene = this.getGameScene();
    if (scene) {
      scene.createParticleEffect(x, y, fancy);
    }
  }

  /**
   * 현재 플레이어를 반환합니다
   */
  public getPlayer() {
    const scene = this.getGameScene();
    return scene?.getPlayer() || null;
  }

  /**
   * 현재 카메라 정보를 반환합니다
   */
  public getCameraInfo() {
    const scene = this.getGameScene();
    return scene?.getCamera() || null;
  }

  /**
   * 현재 맵 정보를 반환합니다
   */
  public getMapInfo() {
    const scene = this.getGameScene();
    return {
      currentMapKey: scene?.getCurrentMapKey() || null,
      mapRenderer: scene?.getMapRenderer() || null,
      platforms: scene?.getPlatforms() || [],
      bullets: scene?.getBullets() || [],
    };
  }

  // 🆕 디버그 유틸리티 메서드들
  public getDebugInfo() {
    const scene = this.getGameScene();
    return {
      gameManager: {
        isInitialized: !!this.game,
        parentSize: {
          width: this.parentElement.clientWidth,
          height: this.parentElement.clientHeight,
        },
        gameSize: this.game
          ? {
              width: this.game.scale.gameSize.width,
              height: this.game.scale.gameSize.height,
            }
          : null,
        baseResolution: {
          width: this.BASE_WIDTH,
          height: this.BASE_HEIGHT,
        },
      },
      scene: scene?.getDebugInfo() || null,
    };
  }

  public logDebugInfo(): void {
    const info = this.getDebugInfo();
    Debug.log.info(LogCategory.GAME, "=== GAME MANAGER DEBUG INFO ===");
    Debug.log.info(LogCategory.GAME, "게임 매니저 디버그 정보", info);
    Debug.log.info(LogCategory.GAME, "===============================");
  }

  // 🆕 게임 상태 확인
  public isInitialized(): boolean {
    return !!this.game;
  }

  // 🆕 퍼포먼스 모니터링
  public getPerformanceInfo() {
    if (!this.game) return null;

    return {
      fps: this.game.loop.actualFps,
      delta: this.game.loop.delta,
      frame: this.game.loop.frame,
      time: this.game.loop.time,
    };
  }

  public logPerformanceInfo(): void {
    const info = this.getPerformanceInfo();
    if (info) {
      Debug.log.performance("Frame Performance", info.delta);
      Debug.log.trace(LogCategory.PERFORMANCE, "Performance info", info);
    }
  }

  // 🆕 네트워크 매니저 접근
  public getNetworkManager(): NetworkManager | null {
    return this.getGameScene()?.getNetworkManager() || null;
  }

  // 🆕 GameScene 등록
  public setGameScene(scene: GameScene): void {
    this.gameScene = scene;
    Debug.log.info(LogCategory.GAME, "GameScene 등록됨");
  }

  // 정리
  private destroyed = false;
  destroy(): void {
    this.destroyed = true;
    Debug.log.info(LogCategory.GAME, "게임 매니저 종료 시작");

    // 리사이즈 옵저버 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
      Debug.log.debug(LogCategory.GAME, "ResizeObserver 정리 완료");
    }

    // 윈도우 이벤트 리스너 정리
    if ((this as any)._windowResizeHandler) {
      window.removeEventListener("resize", (this as any)._windowResizeHandler);
      delete (this as any)._windowResizeHandler;
      Debug.log.debug(LogCategory.GAME, "Window resize listener 정리 완료");
    }

    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      Debug.log.info(LogCategory.GAME, "게임 인스턴스 제거됨");
    }

    Debug.log.info(LogCategory.GAME, "게임 매니저 종료 완료");
  }

  getGame(): Phaser.Game | null {
    return this.game;
  }

  private gameScene: GameScene | null = null;
}
