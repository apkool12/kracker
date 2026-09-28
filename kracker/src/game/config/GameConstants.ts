// src/game/config/GameConstants.ts
// 게임 전반에서 사용되는 모든 상수들을 중앙 관리

// ===== 게임 기본 설정 =====
const GAME_SETTINGS = {
  // 화면 해상도
  RESOLUTION: {
    BASE_WIDTH: 1920,
    BASE_HEIGHT: 1080,
    MIN_SCALE: 0.5,
    MAX_SCALE: 1.0,
  },

  // 물리 엔진
  PHYSICS: {
    GRAVITY_X: 0,
    GRAVITY_Y: 0,
    DEBUG: false,
  },

  // 렌더링
  RENDER: {
    ANTIALIAS: true,
    PIXEL_ART: false,
    BACKGROUND_COLOR: "#0a0a1a", // 순수한 네이비 블루 배경
  },

  // 기본 맵
  DEFAULT_MAP: "level1",

  // 사용 가능한 맵들
  AVAILABLE_MAPS: ["level1", "level2"] as const, // data/maps.json 과 동일하게 유지
} as const;

// ===== UI 관련 상수 =====
const UI_CONSTANTS = {
  // 기본 스타일
  STYLES: {
    DEFAULT_FONT: "12px Arial",
    TITLE_FONT: "16px Arial",
    LARGE_FONT: "18px Arial",
    BACKGROUND_COLOR: "#000000",
    OPACITY: 0.8,
  },

  // 색상 팔레트
  COLORS: {
    WHITE: "#ffffff",
    BLACK: "#000000",
    RED: "#ff0000",
    GREEN: "#00ff00",
    BLUE: "#0000ff",
    YELLOW: "#ffff00",
    CYAN: "#00ffff",
    MAGENTA: "#ff00ff",
    ORANGE: "#ff9900",
    PURPLE: "#9900ff",
    LIME: "#00ff88",
    PINK: "#ff88cc",
  },

  // UI 위치
  POSITION: {
    MARGIN: 10,
    LINE_HEIGHT: 30,
    PADDING_X: 8,
    PADDING_Y: 4,
    LARGE_PADDING_X: 12,
    LARGE_PADDING_Y: 6,
  },

  // UI 계층 (z-index)
  DEPTH: {
    BACKGROUND: -100,
    GAME_OBJECTS: 0,
    EFFECTS: 100,
    UI: 1000,
    DEBUG: 2000,
    OVERLAY: 3000,
  },

  // UI 텍스트 메시지
  MESSAGES: {
    MAP_SWITCH: "Press 1, 2, 3 to switch maps",
    COLOR_CONTROLS: "Q:빨강 E:주황 R:초록 T:파랑 Y:보라 U:핑크 I:기본",
    SHADOW_CONTROLS:
      "그림자: 4,5,6(각도) 7(애니메이션) M,N,.,,(프리셋) BS(ON/OFF) 8,9,0(테스트)",
    DEBUG_CONTROLS:
      "디버그: F1(패널) F2(모드) F3(로그레벨) F4(슬로우모션) F12(스크린샷)",
    MAP_LOADING: "Map: Loading...",
    SHADOW_INITIALIZING: "그림자: 초기화 중...",
  },
} as const;

// ===== 플레이어 관련 상수 =====
const PLAYER_CONSTANTS = {
  // 기본 설정
  DEFAULT_SPAWN: {
    x: 400,
    y: 300,
  },

  // 색상 프리셋
  COLOR_PRESETS: {
    기본: { primary: 0x4a90e2, secondary: 0x357abd },
    빨간색: { primary: 0xd76a6a, secondary: 0xc0392b },
    주황색: { primary: 0xee9841, secondary: 0xe67e22 },
    초록색: { primary: 0x5a945b, secondary: 0x27ae60 },
    파란색: { primary: 0x196370, secondary: 0x2980b9 },
    보라색: { primary: 0x6c3faf, secondary: 0x8e44ad },
    핑크색: { primary: 0xdf749d, secondary: 0xc2185b },
  },

  // 크기
  SIZE: {
    WIDTH: 40,
    HEIGHT: 60,
    HALF_WIDTH: 20,
    HALF_HEIGHT: 30,
  },

  // 물리
  PHYSICS: {
    BOUNCE: 0.2,
    DRAG: 0.8,
    MAX_VELOCITY_X: 300,
    MAX_VELOCITY_Y: 500,
  },
} as const;

// ===== 카메라 관련 상수 =====
const CAMERA_CONSTANTS = {
  // 팔로우 설정
  FOLLOW: {
    LERP_X: 0.08,
    LERP_Y: 0.08,
    DEADZONE_WIDTH: 100,
    DEADZONE_HEIGHT: 60,
    OFFSET_X: 0,
    OFFSET_Y: 0,
  },

  // 줌 설정
  ZOOM: {
    DEFAULT: 1.0,
    MIN: 0.5,
    MAX: 3.0,
    STEP: 0.1,
    SMOOTH_DURATION: 500,
  },

  // 흔들기 설정
  SHAKE: {
    DEFAULT_DURATION: 200,
    DEFAULT_INTENSITY: 0.02,
    LIGHT_INTENSITY: 0.01,
    HEAVY_INTENSITY: 0.01,
  },

  // 이동 설정
  PAN: {
    DEFAULT_DURATION: 1000,
    FAST_DURATION: 500,
    SLOW_DURATION: 2000,
  },
} as const;

// ===== 그림자 관련 상수 =====
const SHADOW_CONSTANTS = {
  // 기본 프리셋
  PRESETS: {
    MORNING: {
      name: "아침",
      angle: 75,
      color: 0x1a1a2e,
      opacity: 0.6,
    },
    NOON: {
      name: "정오",
      angle: 90,
      color: 0x000a25,
      opacity: 0.8,
    },
    EVENING: {
      name: "저녁",
      angle: 105,
      color: 0x2d1b3d,
      opacity: 0.7,
    },
    NIGHT: {
      name: "밤",
      angle: 90,
      color: 0x050515,
      opacity: 0.9,
    },
  },

  // 하루 주기 설정
  DAY_CYCLE: {
    STEP_DURATION: 3000, // 각 단계별 시간 (ms)
    TRANSITION_TIME: 2000, // 전환 시간 (ms)
    TOTAL_DURATION: 12000, // 전체 주기 시간 (ms)
  },

  // 각도 범위
  ANGLES: {
    MIN: 45,
    MAX: 135,
    MORNING: 75,
    NOON: 90,
    EVENING: 105,
  },

  // 색상 팔레트
  COLORS: {
    DAWN: 0x1a1a2e, // 새벽
    MORNING: 0x2d2d4a, // 아침
    NOON: 0x000a25, // 정오
    AFTERNOON: 0x1a1a3e, // 오후
    EVENING: 0x2d1b3d, // 저녁
    DUSK: 0x3d2d4a, // 황혼
    NIGHT: 0x050515, // 밤
    MIDNIGHT: 0x020210, // 자정
  },

  // 테스트 색상
  TEST_COLORS: {
    RED: 0xff0000,
    GREEN: 0x00ff00,
    BLUE: 0x0000ff,
    YELLOW: 0xffff00,
    CYAN: 0x00ffff,
    MAGENTA: 0xff00ff,
  },
} as const;

// ===== 파티클 관련 상수 =====
const PARTICLE_CONSTANTS = {
  // 기본 설정
  DEFAULT: {
    COUNT: 20,
    SPEED: 100,
    SCALE: 0.5,
    ALPHA: 1.0,
    LIFETIME: 1000,
  },

  // 팬시 설정
  FANCY: {
    COUNT: 50,
    SPEED: 150,
    SCALE: 0.8,
    ALPHA: 0.9,
    LIFETIME: 1500,
  },

  // 색상
  COLORS: {
    FIRE: [0xff4444, 0xff8844, 0xffaa44],
    WATER: [0x4444ff, 0x44aaff, 0x88ccff],
    EARTH: [0x8b4513, 0xa0522d, 0xd2691e],
    AIR: [0xf0f8ff, 0xe6e6fa, 0xdcdcdc],
    MAGIC: [0x9932cc, 0xba55d3, 0xda70d6],
  },

  // 이펙트 타입
  EFFECTS: {
    EXPLOSION: "explosion",
    TRAIL: "trail",
    SPARKLE: "sparkle",
    SMOKE: "smoke",
    MAGIC: "magic",
  },
} as const;

// ===== 애니메이션 관련 상수 =====
const ANIMATION_CONSTANTS = {
  // 이징 타입
  EASING: {
    LINEAR: "Linear",
    POWER1: "Power1",
    POWER2: "Power2",
    POWER3: "Power3",
    BACK: "Back",
    ELASTIC: "Elastic",
    BOUNCE: "Bounce",
    SINE: "Sine",
  },

  // 지속 시간
  DURATION: {
    INSTANT: 0,
    VERY_FAST: 150,
    FAST: 300,
    NORMAL: 500,
    SLOW: 1000,
    VERY_SLOW: 2000,
  },

  // 지연 시간
  DELAY: {
    NONE: 0,
    SHORT: 100,
    MEDIUM: 300,
    LONG: 500,
  },
} as const;

// ===== 퍼포먼스 관련 상수 =====
const PERFORMANCE_CONSTANTS = {
  // FPS 목표
  TARGET_FPS: 60,
  MIN_FPS: 30,

  // 업데이트 주기
  UPDATE_INTERVALS: {
    EVERY_FRAME: 0,
    EVERY_SECOND: 1000,
    EVERY_5_SECONDS: 5000,
    EVERY_10_SECONDS: 10000,
  },

  // 메모리 임계값 (MB)
  MEMORY_THRESHOLDS: {
    WARNING: 100,
    CRITICAL: 200,
    MAX: 500,
  },

  // 정리 설정
  CLEANUP: {
    BULLET_BUFFER: 100, // 화면 밖 여유 공간
    MAX_BULLETS: 1000,
    MAX_PARTICLES: 500,
  },
} as const;

// ===== 입력 관련 상수 =====
const INPUT_CONSTANTS = {
  // 키 반복 방지 시간 (ms)
  KEY_REPEAT_DELAY: 100,

  // 마우스 드래그 임계값
  DRAG_THRESHOLD: 5,

  // 더블클릭 시간 (ms)
  DOUBLE_CLICK_TIME: 300,

  // 터치 관련
  TOUCH: {
    TAP_THRESHOLD: 10,
    HOLD_TIME: 500,
    SWIPE_MIN_DISTANCE: 50,
    SWIPE_MAX_TIME: 300,
  },
} as const;

// ===== 디버그 관련 상수 =====
const DEBUG_CONSTANTS = {
  // 로그 레벨
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4,
  },

  // 로그 카테고리
  CATEGORIES: [
    "GAME",
    "SCENE",
    "PLAYER",
    "MAP",
    "SHADOW",
    "INPUT",
    "UI",
    "CAMERA",
    "PHYSICS",
    "PARTICLE",
    "PERFORMANCE",
  ] as const,

  // 색상 스타일
  COLORS: {
    ERROR:
      "color: #fff; background: #e74c3c; padding: 2px 4px; border-radius: 2px; font-weight: bold;",
    WARN: "color: #fff; background: #f39c12; padding: 2px 4px; border-radius: 2px; font-weight: bold;",
    INFO: "color: #fff; background: #3498db; padding: 2px 4px; border-radius: 2px; font-weight: bold;",
    DEBUG:
      "color: #fff; background: #2ecc71; padding: 2px 4px; border-radius: 2px; font-weight: bold;",
    TRACE:
      "color: #fff; background: #9b59b6; padding: 2px 4px; border-radius: 2px; font-weight: bold;",
  },

  // 히스토리 크기
  MAX_HISTORY: 1000,

  // 퍼포먼스 모니터링
  PERFORMANCE: {
    SAMPLE_SIZE: 60, // 1초간 샘플
    WARNING_THRESHOLD: 16, // 16ms = 60fps
    ERROR_THRESHOLD: 33, // 33ms = 30fps
  },
} as const;

// ===== 맵 관련 상수 =====
const MAP_CONSTANTS = {
  // 기본 맵 크기
  DEFAULT_SIZE: {
    WIDTH: 1280,
    HEIGHT: 640,
  },

  // 최소/최대 크기
  SIZE_LIMITS: {
    MIN_WIDTH: 800,
    MIN_HEIGHT: 600,
    MAX_WIDTH: 4000,
    MAX_HEIGHT: 3000,
  },

  // 타일 크기
  TILE_SIZE: 32,

  // 스폰 포인트
  SPAWN_NAMES: ["A", "B", "C", "D"] as const,

  // 플랫폼 기본 설정
  PLATFORM_DEFAULTS: {
    WIDTH: 200,
    HEIGHT: 20,
    COLOR: 0x8b4513,
  },
} as const;

// ===== 게임 상태 관련 상수 =====
const GAME_STATE = {
  // 씬 상태
  SCENE_STATES: {
    LOADING: "loading",
    RUNNING: "running",
    PAUSED: "paused",
    TRANSITION: "transition",
    ERROR: "error",
  } as const,

  // 플레이어 상태
  PLAYER_STATES: {
    IDLE: "idle",
    MOVING: "moving",
    JUMPING: "jumping",
    FALLING: "falling",
    LANDED: "landed",
  } as const,

  // 게임 모드
  GAME_MODES: {
    NORMAL: "normal",
    DEBUG: "debug",
    SPECTATOR: "spectator",
    EDITOR: "editor",
  } as const,
} as const;

// ===== 유틸리티 함수들 =====
const UTILS = {
  // 색상 변환
  hexToRgb: (hex: number) => ({
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255,
  }),

  // RGB to Hex
  rgbToHex: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b,

  // 각도 변환
  degToRad: (degrees: number) => degrees * (Math.PI / 180),
  radToDeg: (radians: number) => radians * (180 / Math.PI),

  // 범위 제한
  clamp: (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max),

  // 선형 보간
  lerp: (start: number, end: number, factor: number) =>
    start + (end - start) * factor,

  // 거리 계산
  distance: (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),

  // 각도 계산
  angle: (x1: number, y1: number, x2: number, y2: number) =>
    Math.atan2(y2 - y1, x2 - x1),
} as const;

// ===== 타입 정의 =====
export type MapKey = (typeof GAME_SETTINGS.AVAILABLE_MAPS)[number];
export type ColorPresetKey = keyof typeof PLAYER_CONSTANTS.COLOR_PRESETS;
export type ShadowPresetKey = keyof typeof SHADOW_CONSTANTS.PRESETS;
export type LogCategory = (typeof DEBUG_CONSTANTS.CATEGORIES)[number];
export type SceneState =
  (typeof GAME_STATE.SCENE_STATES)[keyof typeof GAME_STATE.SCENE_STATES];
export type PlayerState =
  (typeof GAME_STATE.PLAYER_STATES)[keyof typeof GAME_STATE.PLAYER_STATES];
export type GameMode =
  (typeof GAME_STATE.GAME_MODES)[keyof typeof GAME_STATE.GAME_MODES];

// ===== 개별 내보내기 =====
export {
  GAME_SETTINGS,
  UI_CONSTANTS,
  PLAYER_CONSTANTS,
  CAMERA_CONSTANTS,
  SHADOW_CONSTANTS,
  PARTICLE_CONSTANTS,
  ANIMATION_CONSTANTS,
  PERFORMANCE_CONSTANTS,
  INPUT_CONSTANTS,
  DEBUG_CONSTANTS,
  MAP_CONSTANTS,
  GAME_STATE,
  UTILS,
};

// ===== 기본 내보내기 =====
export default {
  GAME_SETTINGS,
  UI_CONSTANTS,
  PLAYER_CONSTANTS,
  CAMERA_CONSTANTS,
  SHADOW_CONSTANTS,
  PARTICLE_CONSTANTS,
  ANIMATION_CONSTANTS,
  PERFORMANCE_CONSTANTS,
  INPUT_CONSTANTS,
  DEBUG_CONSTANTS,
  MAP_CONSTANTS,
  GAME_STATE,
  UTILS,
} as const;
