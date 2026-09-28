// src/game/debug/DebugConfig.ts
import { LogLevel, LogCategory } from "./Logger";

export interface DebugSettings {
  // 전역 디버그 모드
  enabled: boolean;

  // 로깅 설정
  logging: {
    level: LogLevel;
    enabledCategories: LogCategory[];
    showTimestamp: boolean;
    showStackTrace: boolean;
  };

  // UI 디버그 설정
  ui: {
    showDebugPanel: boolean;
    showFPS: boolean;
    showPlayerInfo: boolean;
    showCameraInfo: boolean;
    showMapInfo: boolean;
    showPerformanceMetrics: boolean;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity: number;
  };

  // 게임 디버그 설정
  game: {
    showPlatformBounds: boolean;
    showPlayerBounds: boolean;
    showShadowBounds: boolean;
    showCameraBounds: boolean;
    slowMotion: boolean;
    slowMotionFactor: number;
  };

  // 퍼포먼스 모니터링
  performance: {
    enabled: boolean;
    trackFPS: boolean;
    trackMemory: boolean;
    trackUpdateTime: boolean;
    warningThresholds: {
      fps: number;
      updateTime: number; // ms
      memoryMB: number;
    };
  };

  // 키 바인딩
  keyBindings: {
    toggleDebugPanel: string;
    toggleDebugMode: string;
    cycleLogLevel: string;
    toggleSlowMotion: string;
    takeScreenshot: string;
  };
}

// 개발 환경 기본 설정 (디버그 비활성화)
const developmentConfig: DebugSettings = {
  enabled: false,

  logging: {
    level: LogLevel.ERROR,
    enabledCategories: [LogCategory.GAME],
    showTimestamp: false,
    showStackTrace: false,
  },

  ui: {
    showDebugPanel: false,
    showFPS: false,
    showPlayerInfo: false,
    showCameraInfo: false,
    showMapInfo: false,
    showPerformanceMetrics: false,
    position: "top-left",
    opacity: 0,
  },

  game: {
    showPlatformBounds: false,
    showPlayerBounds: false,
    showShadowBounds: false,
    showCameraBounds: false,
    slowMotion: false,
    slowMotionFactor: 1.0,
  },

  performance: {
    enabled: false,
    trackFPS: false,
    trackMemory: false,
    trackUpdateTime: false,
    warningThresholds: {
      fps: 30,
      updateTime: 33,
      memoryMB: 200,
    },
  },

  keyBindings: {
    toggleDebugPanel: "",
    toggleDebugMode: "",
    cycleLogLevel: "",
    toggleSlowMotion: "",
    takeScreenshot: "",
  },
};

// 프로덕션 환경 기본 설정
const productionConfig: DebugSettings = {
  enabled: false,

  logging: {
    level: LogLevel.ERROR,
    enabledCategories: [LogCategory.GAME],
    showTimestamp: false,
    showStackTrace: false,
  },

  ui: {
    showDebugPanel: false,
    showFPS: false,
    showPlayerInfo: false,
    showCameraInfo: false,
    showMapInfo: false,
    showPerformanceMetrics: false,
    position: "top-left",
    opacity: 0,
  },

  game: {
    showPlatformBounds: false,
    showPlayerBounds: false,
    showShadowBounds: false,
    showCameraBounds: false,
    slowMotion: false,
    slowMotionFactor: 1.0,
  },

  performance: {
    enabled: false,
    trackFPS: false,
    trackMemory: false,
    trackUpdateTime: false,
    warningThresholds: {
      fps: 30,
      updateTime: 33,
      memoryMB: 200,
    },
  },

  keyBindings: {
    toggleDebugPanel: "",
    toggleDebugMode: "",
    cycleLogLevel: "",
    toggleSlowMotion: "",
    takeScreenshot: "",
  },
};

export class DebugConfig {
  private static instance: DebugConfig;
  private settings: DebugSettings;
  private readonly storageKey = "game_debug_settings";

  private constructor() {
    // 환경에 따라 기본 설정 선택
    const isDevelopment =
      import.meta.env.DEV ||
      window.location.hostname === "localhost" ||
      window.location.search.includes("debug=true");

    this.settings = isDevelopment
      ? { ...developmentConfig }
      : { ...productionConfig };

    // 로컬 스토리지에서 설정 로드
    this.loadFromStorage();
  }

  static getInstance(): DebugConfig {
    if (!DebugConfig.instance) {
      DebugConfig.instance = new DebugConfig();
    }
    return DebugConfig.instance;
  }

  // 설정 접근자
  get(): DebugSettings {
    return { ...this.settings };
  }

  // 부분 설정 업데이트
  update(partial: Partial<DebugSettings>): void {
    this.settings = this.deepMerge(this.settings, partial);
    this.saveToStorage();
  }

  // 특정 섹션 업데이트
  updateLogging(logging: Partial<DebugSettings["logging"]>): void {
    this.settings.logging = { ...this.settings.logging, ...logging };
    this.saveToStorage();
  }

  updateUI(ui: Partial<DebugSettings["ui"]>): void {
    this.settings.ui = { ...this.settings.ui, ...ui };
    this.saveToStorage();
  }

  updateGame(game: Partial<DebugSettings["game"]>): void {
    this.settings.game = { ...this.settings.game, ...game };
    this.saveToStorage();
  }

  updatePerformance(performance: Partial<DebugSettings["performance"]>): void {
    this.settings.performance = {
      ...this.settings.performance,
      ...performance,
    };
    this.saveToStorage();
  }

  // 빠른 토글 메서드들
  toggleDebugMode(): boolean {
    this.settings.enabled = !this.settings.enabled;
    this.saveToStorage();
    return this.settings.enabled;
  }

  toggleDebugPanel(): boolean {
    this.settings.ui.showDebugPanel = !this.settings.ui.showDebugPanel;
    this.saveToStorage();
    return this.settings.ui.showDebugPanel;
  }

  toggleSlowMotion(): boolean {
    this.settings.game.slowMotion = !this.settings.game.slowMotion;
    this.saveToStorage();
    return this.settings.game.slowMotion;
  }

  cycleLogLevel(): LogLevel {
    const levels = [
      LogLevel.ERROR,
      LogLevel.WARN,
      LogLevel.INFO,
      LogLevel.DEBUG,
      LogLevel.TRACE,
    ];
    const currentIndex = levels.indexOf(this.settings.logging.level);
    const nextIndex = (currentIndex + 1) % levels.length;
    this.settings.logging.level = levels[nextIndex];
    this.saveToStorage();
    return this.settings.logging.level;
  }

  // 로컬 스토리지 연동
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("Failed to save debug settings to localStorage:", error);
    }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = this.deepMerge(this.settings, parsed);
      }
    } catch (error) {
      console.warn("Failed to load debug settings from localStorage:", error);
    }
  }

  // 설정 초기화
  reset(): void {
    localStorage.removeItem(this.storageKey);
    const isDevelopment =
      import.meta.env.DEV ||
      window.location.hostname === "localhost";
    this.settings = isDevelopment
      ? { ...developmentConfig }
      : { ...productionConfig };
  }

  // 설정 내보내기/가져오기 (디버깅용)
  export(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  import(settingsJson: string): boolean {
    try {
      const parsed = JSON.parse(settingsJson);
      this.settings = this.deepMerge(this.settings, parsed);
      this.saveToStorage();
      return true;
    } catch (error) {
      console.error("Failed to import debug settings:", error);
      return false;
    }
  }

  // 깊은 병합 유틸리티
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
}

// 전역 인스턴스
export const debugConfig = DebugConfig.getInstance();
