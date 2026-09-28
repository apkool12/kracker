

/** 빛 설정 */
export interface LightConfig {
  /** 빛 각도 (도 단위, 0=동쪽, 90=남쪽, 180=서쪽, 270=북쪽) */
  angle: number;
  /** 그림자 색상 (16진수) */
  color: number;
  /** 그림자 최대 길이 (픽셀) */
  maxLength: number;
}

/** 카메라 정보 */
export interface CameraInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 그림자 폴리곤 점들 */
export interface ShadowPolygon {
  points: number[]; // [x1, y1, x2, y2, x3, y3, x4, y4]
  platformId?: string; // 디버깅용
}

/** 그림자 계산 결과 */
export interface ShadowCalculationResult {
  polygons: ShadowPolygon[];
  clippedCount: number; // 화면 밖으로 나간 그림자 수
}

/** 🔧 수정된 기본 빛 설정 - 더 보기 쉽게 */
export const DEFAULT_LIGHT_CONFIG: LightConfig = {
  angle: 90, // 수직 (남쪽)
  color: 0x000000, // 🔧 수정: 검은색으로 변경 (더 명확하게 보임)
  maxLength: 800, // 🔧 수정: 적당한 길이
};

/** 그림자 렌더러 설정 */
export interface ShadowRendererConfig {
  light: LightConfig;
  depth: number;
  enabled: boolean;
}

/** 🔧 수정된 기본 그림자 설정 */
export const DEFAULT_SHADOW_CONFIG: ShadowRendererConfig = {
  light: DEFAULT_LIGHT_CONFIG,
  depth: -50, // 🔧 수정: 더 앞에 배치해서 잘 보이도록
  enabled: true,
};
