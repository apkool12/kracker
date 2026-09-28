// src/game/debug/DebugManager.ts
import { logger } from "./Logger";
import { debugConfig, DebugSettings } from "./DebugConfig";
import { LogLevel, LogCategory } from "./Logger";

export class DebugManager {
  private static instance: DebugManager;
  private scene: Phaser.Scene | null = null;
  // private keyboardInput: Phaser.Input.Keyboard.KeyboardPlugin | null = null;
  private isInitialized = false;

  // 키 입력 상태 추적 - 제거됨
  // private pressedKeys = new Set<string>();

  private constructor() {}

  static getInstance(): DebugManager {
    if (!DebugManager.instance) {
      DebugManager.instance = new DebugManager();
    }
    return DebugManager.instance;
  }

  // 초기화 (씬과 연결)
  initialize(scene: Phaser.Scene): void {
    this.scene = scene;
    // this.keyboardInput = scene.input.keyboard;

    if (!this.isInitialized) {
      this.syncLoggerWithConfig();
      this.isInitialized = true;

      logger.info(LogCategory.GAME, "DebugManager initialized");
      this.logDebugStatus();
    }
  }

  // 로거와 설정 동기화
  private syncLoggerWithConfig(): void {
    const config = debugConfig.get();

    // 로거 설정 업데이트
    logger.setDebugMode(config.enabled);
    logger.setLogLevel(config.logging.level);

    // 카테고리 설정
    Object.values(LogCategory).forEach((category) => {
      if (config.logging.enabledCategories.includes(category)) {
        logger.enableCategory(category);
      } else {
        logger.disableCategory(category);
      }
    });
  }

  // 디버그 기능들
  public toggleDebugPanel(): void {
    const isVisible = debugConfig.toggleDebugPanel();
    logger.info(LogCategory.UI, `Debug panel: ${isVisible ? "ON" : "OFF"}`);

    // UI 매니저에게 알림 (나중에 구현)
    this.scene?.events.emit("debug-panel-toggle", isVisible);
  }

  public toggleDebugMode(): void {
    const isEnabled = debugConfig.toggleDebugMode();
    logger.setDebugMode(isEnabled);
    logger.info(LogCategory.GAME, `Debug mode: ${isEnabled ? "ON" : "OFF"}`);

    // 설정 변경 후 다시 동기화
    this.syncLoggerWithConfig();
  }

  // 설정 업데이트 메서드들
  updateLogLevel(level: LogLevel): void {
    debugConfig.updateLogging({ level });
    logger.setLogLevel(level);
    logger.info(LogCategory.GAME, `Log level updated to: ${LogLevel[level]}`);
  }

  toggleCategory(category: LogCategory): boolean {
    const isEnabled = logger.toggleCategory(category);

    // 설정에도 반영
    const config = debugConfig.get();
    const categories = config.logging.enabledCategories;

    if (isEnabled && !categories.includes(category)) {
      categories.push(category);
    } else if (!isEnabled) {
      const index = categories.indexOf(category);
      if (index > -1) categories.splice(index, 1);
    }

    debugConfig.updateLogging({ enabledCategories: categories });

    logger.info(
      LogCategory.GAME,
      `Category ${category}: ${isEnabled ? "ON" : "OFF"}`
    );
    return isEnabled;
  }

  // 디버그 정보 출력
  logDebugStatus(): void {
    const config = debugConfig.get();
    const stats = logger.getStats();

    logger.info(LogCategory.GAME, "=== DEBUG STATUS ===");
    logger.info(
      LogCategory.GAME,
      `Debug Mode: ${config.enabled ? "ON" : "OFF"}`
    );
    logger.info(
      LogCategory.GAME,
      `Log Level: ${LogLevel[config.logging.level]}`
    );
    logger.info(
      LogCategory.GAME,
      `Enabled Categories: ${config.logging.enabledCategories.join(", ")}`
    );
    logger.info(LogCategory.GAME, `Total Logs: ${stats.total}`);
    logger.info(LogCategory.GAME, "===================");
  }

  logSystemInfo(): void {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screen: {
        width: window.screen?.width || 0,
        height: window.screen?.height || 0,
        colorDepth: window.screen?.colorDepth || 0,
      },
      window: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    };

    logger.info(LogCategory.GAME, "=== SYSTEM INFO ===");
    logger.info(LogCategory.GAME, "System information:", info);
    logger.info(LogCategory.GAME, "==================");
  }

  // 게임 상태 로깅
  logGameState(player?: any, camera?: any, map?: any): void {
    if (!debugConfig.get().enabled) return;

    const state: any = {
      timestamp: Date.now(),
      scene: this.scene?.scene.key || "unknown",
    };

    if (player) {
      state.player = {
        x: player.x || 0,
        y: player.y || 0,
        velocity: player.body?.velocity || player.velocity || { x: 0, y: 0 },
      };
    }

    if (camera) {
      state.camera = {
        x: camera.scrollX || camera.x || 0,
        y: camera.scrollY || camera.y || 0,
        zoom: camera.zoom || 1,
      };
    }

    if (map) {
      state.map = {
        key: map.key || "unknown",
        size: map.size || { width: 0, height: 0 },
        platforms: map.platforms?.length || 0,
      };
    }

    logger.debug(LogCategory.GAME, "Game state snapshot:", state);
  }

  // 퍼포먼스 측정
  measurePerformance<T>(operation: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    logger.logPerformance(operation, duration);
    return result;
  }

  async measureAsyncPerformance<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    logger.logPerformance(operation, duration);
    return result;
  }

  // 메모리 사용량 체크
  checkMemoryUsage(): void {
    if (!("memory" in performance)) {
      logger.warn(LogCategory.PERFORMANCE, "Memory API not available");
      return;
    }

    const memory = (performance as any).memory;
    const usedMB = memory.usedJSHeapSize / 1024 / 1024;
    const totalMB = memory.totalJSHeapSize / 1024 / 1024;
    const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;

    const config = debugConfig.get();
    const threshold = config.performance.warningThresholds.memoryMB;

    if (usedMB > threshold) {
      logger.warn(
        LogCategory.PERFORMANCE,
        `High memory usage: ${usedMB.toFixed(2)}MB (threshold: ${threshold}MB)`,
        { used: usedMB, total: totalMB, limit: limitMB }
      );
    } else {
      logger.trace(
        LogCategory.PERFORMANCE,
        `Memory usage: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB`
      );
    }
  }

  // 설정 관리
  getConfig(): DebugSettings {
    return debugConfig.get();
  }

  resetConfig(): void {
    debugConfig.reset();
    this.syncLoggerWithConfig();
    logger.info(LogCategory.GAME, "Debug configuration reset to defaults");
  }

  exportConfig(): string {
    return debugConfig.export();
  }

  importConfig(configJson: string): boolean {
    const success = debugConfig.import(configJson);
    if (success) {
      this.syncLoggerWithConfig();
      logger.info(
        LogCategory.GAME,
        "Debug configuration imported successfully"
      );
    } else {
      logger.error(LogCategory.GAME, "Failed to import debug configuration");
    }
    return success;
  }

  // 정리
  destroy(): void {
    this.scene = null;
    // this.keyboardInput = null; // 제거됨
    // this.pressedKeys.clear(); // 제거됨
    this.isInitialized = false;

    logger.info(LogCategory.GAME, "DebugManager destroyed");
  }

  // 편의 메서드들 - 외부에서 쉽게 사용할 수 있도록
  static log = {
    error: (category: LogCategory, message: string, data?: any) =>
      logger.error(category, message, data),
    warn: (category: LogCategory, message: string, data?: any) =>
      logger.warn(category, message, data),
    info: (category: LogCategory, message: string, data?: any) =>
      logger.info(category, message, data),
    debug: (category: LogCategory, message: string, data?: any) =>
      logger.debug(category, message, data),
    trace: (category: LogCategory, message: string, data?: any) =>
      logger.trace(category, message, data),

    // 특수 로그들
    player: (action: string, data?: any) =>
      logger.logPlayerAction(action, data),
    map: (event: string, data?: any) => logger.logMapEvent(event, data),
    performance: (operation: string, duration: number) =>
      logger.logPerformance(operation, duration),
  };
}

// 전역 인스턴스
export const debugManager = DebugManager.getInstance();

// 편의 함수들 - 기존 console.log를 쉽게 교체하기 위해
export const Debug = {
  // 로깅
  log: DebugManager.log,

  // 설정
  isEnabled: () => debugConfig.get().enabled,
  getConfig: () => debugConfig.get(),

  // 퍼포먼스
  measure: <T>(operation: string, fn: () => T): T =>
    debugManager.measurePerformance(operation, fn),
  measureAsync: <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    debugManager.measureAsyncPerformance(operation, fn),

  // 상태
  logGameState: (player?: any, camera?: any, map?: any) =>
    debugManager.logGameState(player, camera, map),

  // 토글
  toggleMode: () => debugManager.toggleDebugMode(),
  togglePanel: () => debugManager.toggleDebugPanel(),
  toggleCategory: (category: LogCategory) =>
    debugManager.toggleCategory(category),
};
