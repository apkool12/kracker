import Phaser from "phaser";

// 동적 조명: 화면을 살짝 어둡게 깔고, 총알/총구 화염/명중 섬광을 광원으로 삼아
// 플랫폼에 가려지면 그림자가 지도록 GPU(프래그먼트 셰이더)에서 계산한다.

const MAX_LIGHTS = 12;
const MAX_RECTS = 32;

const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

uniform vec2 uResolution;
uniform float uAmbient;
uniform int uLightCount;
uniform vec4 uLights[${MAX_LIGHTS}];      // x, y, radius, intensity (화면 픽셀)
uniform vec3 uLightColors[${MAX_LIGHTS}];
uniform int uRectCount;
uniform vec4 uRects[${MAX_RECTS}];        // x0, y0, x1, y1 (화면 픽셀)

// 선분 a→b 가 사각형 r 을 지나는지 (slab test)
bool segHitsRect(vec2 a, vec2 b, vec4 r) {
  vec2 d = b - a;
  vec2 inv = 1.0 / (d + vec2(1e-5));
  vec2 t0 = (r.xy - a) * inv;
  vec2 t1 = (r.zw - a) * inv;
  vec2 tmin = min(t0, t1);
  vec2 tmax = max(t0, t1);
  float enter = max(tmin.x, tmin.y);
  float exit = min(tmax.x, tmax.y);
  return enter <= exit && exit >= 0.0 && enter <= 1.0;
}

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  vec2 p = vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uResolution;

  vec3 light = vec3(uAmbient);
  vec3 glow = vec3(0.0);

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    float d = distance(p, L.xy);
    if (d > L.z) continue;
    float att = 1.0 - d / L.z;
    att = att * att * L.w;

    // 광원과 이 픽셀 사이를 플랫폼이 막으면 그림자 (픽셀이 속한 플랫폼 자체는 제외)
    float vis = 1.0;
    for (int j = 0; j < ${MAX_RECTS}; j++) {
      if (j >= uRectCount) break;
      vec4 r = uRects[j];
      bool inside = p.x >= r.x && p.x <= r.z && p.y >= r.y && p.y <= r.w;
      if (!inside && segHitsRect(L.xy, p, r)) { vis = 0.12; break; }
    }
    light += uLightColors[i] * att * vis;
    glow += uLightColors[i] * att * att * vis * 0.25; // 공기 중 산란광
  }

  gl_FragColor = vec4(base.rgb * light + glow, base.a);
}
`;

export class LightingPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  lights: number[] = [];
  colors: number[] = [];
  rects: number[] = [];
  ambient = 0.72;

  constructor(game: Phaser.Game) {
    super({ game, name: "Lighting", fragShader: FRAG });
  }

  onPreRender() {
    const r = this.renderer;
    this.set2f("uResolution", r.width, r.height);
    this.set1f("uAmbient", this.ambient);
    this.set1i("uLightCount", this.lights.length / 4);
    this.set1i("uRectCount", this.rects.length / 4);
    // 빈 배열은 업로드하지 않음 (count 로 루프를 끊음)
    if (this.lights.length) {
      this.set4fv("uLights", new Float32Array(this.lights));
      this.set3fv("uLightColors", new Float32Array(this.colors));
    }
    if (this.rects.length) this.set4fv("uRects", new Float32Array(this.rects));
  }
}

type Flash = { x: number; y: number; color: number; radius: number; intensity: number; life: number; ttl: number };

/**
 * 매 프레임 총알/섬광을 모아 LightingPipeline 에 넘긴다.
 * 총알이 새로 보이면 총구 화염, 사라지면 명중 섬광을 자동으로 만든다 (로컬/원격 공통).
 */
export class LightingSystem {
  private pipeline?: LightingPipeline;
  private flashes: Flash[] = [];
  private seen = new Map<string, { x: number; y: number; color: number }>();

  constructor(
    private scene: Phaser.Scene,
    private getBullets: () => Array<{ id: string; active: boolean; x: number; y: number; getConfig?: () => { color?: number } }>,
    private getPlatforms: () => Array<{ x: number; y: number; width: number; height: number }>
  ) {
    if (!(scene.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return; // Canvas 렌더러면 조명 없음
    const pipelines = scene.renderer.pipelines;
    if (!pipelines.getPostPipeline("Lighting")) pipelines.addPostPipeline("Lighting", LightingPipeline);
    scene.cameras.main.setPostPipeline("Lighting");
    this.pipeline = scene.cameras.main.getPostPipeline("Lighting") as LightingPipeline;
  }

  flash(x: number, y: number, color: number, radius: number, intensity: number, ttl: number) {
    this.flashes.push({ x, y, color, radius, intensity, life: ttl, ttl });
  }

  update(deltaMs: number) {
    const p = this.pipeline;
    if (!p) return;
    const cam = this.scene.cameras.main;
    const sx = (x: number) => (x - cam.worldView.x) * cam.zoom;
    const sy = (y: number) => (y - cam.worldView.y) * cam.zoom;

    // 총알 추적 → 총구 화염 / 명중 섬광
    const now = new Set<string>();
    for (const b of this.getBullets()) {
      if (!b.active) continue;
      now.add(b.id);
      const color = b.getConfig?.().color ?? 0xffaa00;
      if (!this.seen.has(b.id)) this.flash(b.x, b.y, 0xffe2a8, 240, 1.3, 120); // 총구 화염
      this.seen.set(b.id, { x: b.x, y: b.y, color });
    }
    for (const [id, last] of this.seen) {
      if (now.has(id)) continue;
      this.flash(last.x, last.y, last.color, 300, 1.6, 280); // 명중 섬광
      this.seen.delete(id);
    }

    const lights: number[] = [];
    const colors: number[] = [];
    const push = (x: number, y: number, radius: number, intensity: number, color: number) => {
      if (lights.length / 4 >= MAX_LIGHTS) return;
      lights.push(sx(x), sy(y), radius * cam.zoom, intensity);
      colors.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    };

    // 섬광 우선(짧고 강함), 남는 슬롯에 날아가는 총알
    this.flashes = this.flashes.filter((f) => (f.life -= deltaMs) > 0);
    for (const f of this.flashes) push(f.x, f.y, f.radius, f.intensity * (f.life / f.ttl), f.color);
    for (const [, b] of this.seen) push(b.x, b.y, 190, 1.1, b.color);

    p.lights = lights;
    p.colors = colors;
    p.rects = this.getPlatforms()
      .slice(0, MAX_RECTS)
      .flatMap((r) => [sx(r.x), sy(r.y), sx(r.x + r.width), sy(r.y + r.height)]);
  }

  destroy() {
    this.scene.cameras.main?.removePostPipeline?.("Lighting");
    this.pipeline = undefined;
  }
}
