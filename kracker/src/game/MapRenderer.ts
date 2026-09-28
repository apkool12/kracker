// src/game/MapRenderer.ts - 플랫폼을 물리 바디로 변경
import { GAME_CONFIG, Platform } from "./config";
import { MapData, MapLoader } from "./maps/MapLoader";
import { ShadowSystem } from "./shadow/ShadowSystem";

export default class MapRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private backgroundGraphics: Phaser.GameObjects.Graphics;
  private platforms: Platform[] = [];
  private currentMap?: MapData;
  private backgroundImages: Phaser.GameObjects.Image[] = [];
  private backgroundNoise?: Phaser.GameObjects.TileSprite;
  private crumbledPattern?: Phaser.GameObjects.Graphics;

  // ⭐ 물리 바디를 가진 플랫폼 그룹 추가
  private platformGroup: Phaser.Physics.Arcade.StaticGroup;

  // 그림자 시스템
  private shadowSystem: ShadowSystem;

  // 🎨 패럴랙스 배경을 위한 플레이어 위치 추적
  private lastPlayerX: number = 0;
  private lastPlayerY: number = 0;

  // 🎨 동적 배경 요소들을 위한 개별 사각형 객체들
  private dynamicSquares: Array<{
    graphics: Phaser.GameObjects.Graphics;
    baseX: number;
    baseY: number;
    speed: number;
    rotationSpeed: number;
    scaleSpeed: number;
    currentRotation: number;
    currentScale: number;
  }> = [];

  // 🌿 정글 요소들을 위한 그래픽 객체들
  private jungleElements: Phaser.GameObjects.Graphics[] = [];

  // 🌟 플랫폼 야광 효과들을 위한 맵
  private platformGlowEffects: Map<Platform, Phaser.GameObjects.Graphics> =
    new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();

    this.backgroundGraphics = scene.add.graphics();

    // ⭐ 플랫폼 물리 그룹 생성
    this.platformGroup = scene.physics.add.staticGroup();

    // 배경이 가장 뒤에 오도록 depth 설정
    this.backgroundGraphics.setDepth(-100);
    this.graphics.setDepth(0);

    // 그림자 시스템 초기화
    this.shadowSystem = new ShadowSystem(scene, {
      light: {
        angle: 90,
        color: 0x000a25,
        maxLength: 2000,
      },
      depth: -50,
      enabled: true,
    });

    console.log("MapRenderer with Physics Platforms created");
  }

  /** 맵 로드 */
  public async loadMapPreset(mapKey: string): Promise<void> {
    try {
      let mapData = MapLoader.getPreset(mapKey);
      if (!mapData) {
        mapData = await MapLoader.loadTiledPreset(mapKey);
      }

      this.currentMap = mapData;
      this.renderMap();

      console.log(`Map loaded: ${mapKey}`);
      this.updateShadows();
    } catch (error) {
      console.error(`Failed to load map ${mapKey}:`, error);
      throw error;
    }
  }

  /** 맵 렌더링 - 배경 + 플랫폼 */
  private renderMap(): void {
    if (!this.currentMap) return;

    // 기존 그래픽 클리어
    this.graphics.clear();
    this.backgroundGraphics.clear();

    // ⭐ 기존 플랫폼 물리 바디들 제거
    this.clearPlatforms();

    // 기존 배경 이미지들 제거
    this.clearBackgroundImages();

    // 배경 렌더링
    this.renderBackground();

    // ⭐ 플랫폼을 물리 바디로 생성
    this.platforms = this.currentMap.platforms;
    this.createPhysicsPlatforms();

    console.log("Rendered platforms:", this.platforms.length);
  }

  /** ⭐ 기존 플랫폼들 제거 */
  private clearPlatforms(): void {
    this.platformGroup.clear(true, true); // removeFromScene=true, destroyChild=true
  }

  /** ⭐ 물리 바디를 가진 플랫폼들 생성 */
  private createPhysicsPlatforms(): void {
    this.platforms.forEach((platform, index) => {
      // 1. 시각적 표현을 위한 그라데이션 그래픽
      this.drawPlatformGradient(platform);

      // 2. 충돌 감지를 위한 물리 바디 생성
      const platformSprite = this.scene.add.rectangle(
        platform.x + platform.width / 2, // 중심점 기준
        platform.y + platform.height / 2,
        platform.width,
        platform.height,
        0xc0c0c0, // 같은 색상
        0 // 투명하게 (시각적으로는 graphics가 담당)
      );

      // 물리 바디 설정
      platformSprite.setName(`platform_${index}`);
      platformSprite.setDepth(20); // 플랫폼 depth 설정

      // StaticGroup에 추가 (자동으로 물리 바디 생성됨)
      this.platformGroup.add(platformSprite);

      // 물리 바디 설정 세부 조정
      const body = platformSprite.body as Phaser.Physics.Arcade.StaticBody;
      if (body) {
        // 바디 크기를 정확히 설정
        body.setSize(platform.width, platform.height);
        body.updateFromGameObject();
      }
    });

    console.log(`Created ${this.platforms.length} physics platforms`);
  }

  /** ⭐ 플랫폼 그라데이션 그리기 */
  private drawPlatformGradient(platform: Platform): void {
    // 네이비 그린 계열의 어두운 플랫폼 색상 조합들
    const colorSchemes = [
      // 1. 네이비 그린 → 다크 네이비 그린 (깊이감 있는 그라데이션)
      { top: 0x1a4a2a, bottom: 0x0a1a1a },
      // 2. 다크 포레스트 → 네이비 포레스트 (어두운 숲 느낌)
      { top: 0x2d5a3a, bottom: 0x1a2a1a },
      // 3. 네이비 틸 → 다크 네이비 틸 (깊은 바다 느낌)
      { top: 0x1a4a3a, bottom: 0x0a1a2a },
      // 4. 다크 그린 → 네이비 그린 (어두운 정글 느낌)
      { top: 0x2d4a2a, bottom: 0x1a2a1a },
      // 5. 네이비 포레스트 → 다크 네이비 포레스트 (깊은 숲 느낌)
      { top: 0x1a3a2a, bottom: 0x0a1a1a },
    ];

    // 플랫폼 위치에 따라 다른 색상 스킴 선택 (다채롭게)
    const schemeIndex =
      Math.floor((platform.x + platform.y) / 200) % colorSchemes.length;
    const colorScheme = colorSchemes[schemeIndex];

    const topColor = colorScheme.top;
    const bottomColor = colorScheme.bottom;

    // 더 부드러운 그라데이션을 위해 픽셀 단위로 그리기
    const gradientSteps = Math.max(platform.height, 32); // 최소 32단계 보장
    const stepHeight = 1; // 1픽셀씩

    for (let i = 0; i < gradientSteps; i++) {
      const y = platform.y + i;
      const progress = i / (gradientSteps - 1);

      // 색상 보간
      const r1 = (topColor >> 16) & 0xff;
      const g1 = (topColor >> 8) & 0xff;
      const b1 = topColor & 0xff;

      const r2 = (bottomColor >> 16) & 0xff;
      const g2 = (bottomColor >> 8) & 0xff;
      const b2 = bottomColor & 0xff;

      const r = Math.round(r1 + (r2 - r1) * progress);
      const g = Math.round(g1 + (g2 - g1) * progress);
      const b = Math.round(b1 + (b2 - b1) * progress);

      const color = (r << 16) | (g << 8) | b;

      this.graphics.fillStyle(color);
      this.graphics.fillRect(platform.x, y, platform.width, stepHeight);
    }

    // 야광 효과 추가
    this.addGlowEffect(platform);
  }

  /** 🌟 플랫폼 야광 효과 추가 */
  private addGlowEffect(platform: Platform): void {
    // 야광 색상 (밝은 연두색 계열)
    const glowColors = [
      0x00ff00, // 밝은 연두색
      0x00ff44, // 네온 연두색
      0x00ff66, // 밝은 라임
      0x00ff88, // 밝은 민트
      0x00ffaa, // 매우 밝은 연두색
    ];

    const glowColor = glowColors[Math.floor(Math.random() * glowColors.length)];
    const glowAlpha = 0.5; // 야광 투명도 증가

    // 플랫폼 테두리 야광 효과
    const glowGraphics = this.scene.add.graphics();
    glowGraphics.setDepth(-10); // 플랫폼보다 뒤에

    // 외부 글로우 효과
    glowGraphics.lineStyle(4, glowColor, glowAlpha * 0.5);
    glowGraphics.strokeRect(
      platform.x - 2,
      platform.y - 2,
      platform.width + 4,
      platform.height + 4
    );

    // 내부 글로우 효과
    glowGraphics.lineStyle(2, glowColor, glowAlpha * 0.8);
    glowGraphics.strokeRect(
      platform.x + 1,
      platform.y + 1,
      platform.width - 2,
      platform.height - 2
    );

    // 플랫폼 모서리 강화 글로우
    const cornerSize = 8;
    glowGraphics.fillStyle(glowColor, glowAlpha * 0.6);

    // 네 모서리에 작은 글로우 사각형
    glowGraphics.fillRect(
      platform.x - 1,
      platform.y - 1,
      cornerSize,
      cornerSize
    );
    glowGraphics.fillRect(
      platform.x + platform.width - cornerSize + 1,
      platform.y - 1,
      cornerSize,
      cornerSize
    );
    glowGraphics.fillRect(
      platform.x - 1,
      platform.y + platform.height - cornerSize + 1,
      cornerSize,
      cornerSize
    );
    glowGraphics.fillRect(
      platform.x + platform.width - cornerSize + 1,
      platform.y + platform.height - cornerSize + 1,
      cornerSize,
      cornerSize
    );

    // 야광 효과를 플랫폼과 연결하여 관리
    if (!this.platformGlowEffects) {
      this.platformGlowEffects = new Map();
    }
    this.platformGlowEffects.set(platform, glowGraphics);
  }

  /** ⭐ 플랫폼 그룹 반환 (충돌 감지용) */
  public getPlatformGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.platformGroup;
  }

  // ===== 기존 메서드들 (변경 없음) =====

  /** 그림자 업데이트 */
  public updateShadows(): void {
    const camera = this.scene.cameras.main;
    const cameraInfo = {
      x: camera.scrollX,
      y: camera.scrollY,
      width: camera.width,
      height: camera.height,
    };

    this.shadowSystem.update(this.platforms, cameraInfo);
  }

  /** 총알/섬광 광원 위치 (null 이면 기본 방향광 그림자) */
  public setShadowPointLight(p: { x: number; y: number } | null): void {
    this.shadowSystem.setPointLight(p);
  }

  /** 그림자 강제 업데이트 */
  public forceShadowUpdate(): void {
    const camera = this.scene.cameras.main;
    const cameraInfo = {
      x: camera.scrollX,
      y: camera.scrollY,
      width: camera.width,
      height: camera.height,
    };

    this.shadowSystem.forceUpdate(this.platforms, cameraInfo);
  }

  /** 리사이즈 핸들러 */
  public handleResize(width: number, height: number): void {
    console.log(`MapRenderer resize: ${width}x${height}`);

    if (this.currentMap?.background) {
      this.backgroundGraphics.clear();
      this.clearBackgroundImages();
      this.renderBackground();
    }

    this.forceShadowUpdate();
  }

  // 그림자 시스템 제어 메서드들
  public setLightAngle(angle: number): void {
    this.shadowSystem.setLightAngle(angle);
  }

  public animateLightAngle(targetAngle: number, duration: number = 1000): void {
    this.shadowSystem.animateLightAngle(targetAngle, duration);
  }

  public setShadowColor(color: number): void {
    this.shadowSystem.setShadowColor(color);
  }

  public setShadowEnabled(enabled: boolean): void {
    this.shadowSystem.setEnabled(enabled);
  }

  public applyShadowPreset(
    preset: "morning" | "noon" | "evening" | "night"
  ): void {
    this.shadowSystem.applyPreset(preset);
  }

  public getShadowSystem(): ShadowSystem {
    return this.shadowSystem;
  }

  // ===== 배경 렌더링 메서드들 (기존과 동일) =====

  private clearBackgroundImages(): void {
    this.backgroundImages.forEach((img) => {
      if (img && img.scene) {
        img.destroy();
      }
    });
    this.backgroundImages = [];

    // 노이즈 이미지 정리
    if (this.backgroundNoise && this.backgroundNoise.scene) {
      this.backgroundNoise.destroy();
      this.backgroundNoise = undefined;
    }

    // 구겨진 패턴 정리
    if (this.crumbledPattern && this.crumbledPattern.scene) {
      this.crumbledPattern.destroy();
      this.crumbledPattern = undefined;
    }

    this.scene.children.getAll().forEach((child) => {
      if (
        child instanceof Phaser.GameObjects.Image &&
        (child.texture.key.startsWith("gradient_") ||
          child.texture.key.startsWith("gradient_overlay_"))
      ) {
        child.destroy();
      }
    });

    const textureManager = this.scene.textures;
    const keysToRemove: string[] = [];

    if (textureManager.list && typeof textureManager.list === "object") {
      Object.keys(textureManager.list).forEach((key: string) => {
        if (
          key.startsWith("gradient_") ||
          key.startsWith("gradient_overlay_")
        ) {
          keysToRemove.push(key);
        }
      });
    }

    keysToRemove.forEach((key: string) => {
      if (textureManager.exists(key)) {
        textureManager.remove(key);
      }
    });
  }

  private renderBackground(): void {
    if (!this.currentMap?.background) return;

    const { background } = this.currentMap;
    const width = this.scene.sys.game.canvas.width;
    const height = this.scene.sys.game.canvas.height;

    if (background.type === "solid" && background.color) {
      const color = this.hexToNumber(background.color);
      this.backgroundGraphics.fillStyle(color);
      this.backgroundGraphics.fillRect(0, 0, width, height);
    } else if (background.type === "gradient" && background.gradient) {
      this.backgroundGraphics.clear();
      this.renderGradientBackground(background.gradient, width, height);
    } else if (background.type === "image" && background.image) {
      const parallax =
        typeof background.parallax === "number" ? background.parallax : 0;

      if (this.scene.textures.exists(background.image as string)) {
        const bgImg = this.scene.add.image(0, 0, background.image as string);
        bgImg.setOrigin(0, 0);
        bgImg.setDisplaySize(width, height);
        bgImg.setDepth(-300);
        bgImg.setScrollFactor(parallax);
        this.backgroundImages.push(bgImg);
      }

      if (background.gradient) {
        this.renderGradientBackground(background.gradient, width, height);
      }
    } else if (background.type === "image+gradient") {
      if (background.image) {
        const parallax =
          typeof background.parallax === "number" ? background.parallax : 0;

        if (this.scene.textures.exists(background.image as string)) {
          const bgImg = this.scene.add.image(0, 0, background.image as string);
          bgImg.setOrigin(0, 0);
          bgImg.setDisplaySize(width, height);
          bgImg.setDepth(-300);
          bgImg.setScrollFactor(parallax);
          this.backgroundImages.push(bgImg);
        } else {
          this.backgroundGraphics.fillStyle(0x2d5a2d);
          this.backgroundGraphics.fillRect(0, 0, width, height);
        }
      }

      if (background.gradient) {
        this.renderDirectGradientOverlay(background.gradient, width, height);
      }
    }

    // 배경에 구겨진 사각형 패턴 추가 (입체감)
    this.addCrumbledSquaresPattern(width, height);

    // 배경에 노이즈 효과 추가
    this.addBackgroundNoise(width, height);

    // 정글 분위기 요소들 추가
    this.addJungleElements(width, height);
  }

  private renderDirectGradientOverlay(
    gradient: { top: string; bottom: string },
    width: number,
    height: number
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const linearGradient = ctx.createLinearGradient(0, 0, 0, height);
    linearGradient.addColorStop(0, gradient.top);
    linearGradient.addColorStop(1, gradient.bottom);

    ctx.fillStyle = linearGradient;
    ctx.fillRect(0, 0, width, height);

    const textureKey = `gradient_overlay_${gradient.top}_${gradient.bottom}_${width}_${height}`;

    if (this.scene.textures.exists(textureKey)) {
      this.scene.textures.remove(textureKey);
    }

    this.scene.textures.addCanvas(textureKey, canvas);

    const gradientImage = this.scene.add.image(0, 0, textureKey);
    gradientImage.setOrigin(0, 0);
    gradientImage.setDepth(-200);
    gradientImage.setScrollFactor(0);
    gradientImage.setAlpha(0.6);

    this.backgroundImages.push(gradientImage);
  }

  private renderGradientBackground(
    gradient: { top: string; bottom: string; direction?: string },
    width: number,
    height: number
  ): void {
    const textureKey = `gradient_${gradient.top}_${gradient.bottom}_${width}_${height}`;

    if (!this.scene.textures.exists(textureKey)) {
      this.createGradientTexture(textureKey, gradient, width, height);
    }

    const background = this.scene.add.image(0, 0, textureKey);
    background.setOrigin(0, 0);
    background.setDepth(-200);
    background.setScrollFactor(0);
    background.setBlendMode(Phaser.BlendModes.NORMAL);
    background.setAlpha(0.6);

    this.backgroundImages.push(background);
  }

  private createGradientTexture(
    key: string,
    gradient: { top: string; bottom: string },
    width: number,
    height: number
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const linearGradient = ctx.createLinearGradient(0, 0, 0, height);
    linearGradient.addColorStop(0, gradient.top);
    linearGradient.addColorStop(1, gradient.bottom);

    ctx.fillStyle = linearGradient;
    ctx.fillRect(0, 0, width, height);

    this.scene.textures.addCanvas(key, canvas);
  }

  /** 배경에 구겨진 사각형 패턴 추가 (입체감) - 강화된 버전 */
  private addCrumbledSquaresPattern(width: number, height: number): void {
    // 기존 패턴 정리
    if (this.crumbledPattern && this.crumbledPattern.scene) {
      this.crumbledPattern.destroy();
    }

    // 구겨진 사각형 패턴을 위한 그래픽 객체 생성
    this.crumbledPattern = this.scene.add.graphics();
    this.crumbledPattern.setDepth(-280); // 배경보다 뒤, 노이즈보다 뒤
    console.log("🎨 구겨진 사각형 패턴 생성됨");

    // 🎨 훨씬 더 많은 사각형과 배경에 녹아드는 색상으로 강화
    const squareCount = 80; // 35 → 80으로 대폭 증가
    const colors = [
      0x0a1f2a, // 배경색과 동일한 기본 톤
      0x0d2a3a, // 배경색보다 살짝 밝은 톤
      0x0f2f3f, // 배경색보다 조금 더 밝은 톤
      0x0a1a2a, // 배경색보다 살짝 어두운 톤
      0x0c252f, // 중간 어두운 톤
      0x0e2d3a, // 중간 밝은 톤
      0x0b1f2d, // 어두운 톤
      0x0d2835, // 밝은 톤
    ];

    for (let i = 0; i < squareCount; i++) {
      const size = Math.random() * 120 + 60; // 40-120 → 60-180으로 크기 증가
      const x = Math.random() * width;
      const y = Math.random() * height;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const alpha = Math.random() * 0.4 + 0.15; // 0.2-0.8 → 0.15-0.55로 투명도 감소 (더 은은하게)
      const rotation = Math.random() * Math.PI * 2; // 랜덤 회전

      // 구겨진 사각형 그리기
      this.crumbledPattern.fillStyle(color, alpha);

      // 🎨 더 복잡한 구겨진 모양을 위해 더 많은 세그먼트 사용
      const points = [];
      const segments = 12; // 8 → 12로 증가
      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2 + rotation;
        const radius = size / 2 + (Math.random() - 0.5) * 35; // 20 → 35로 구겨진 효과 증가
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        points.push({ x: px, y: py });
      }

      // 구겨진 사각형 채우기
      this.crumbledPattern.beginPath();
      this.crumbledPattern.moveTo(points[0].x, points[0].y);
      for (let j = 1; j < points.length; j++) {
        this.crumbledPattern.lineTo(points[j].x, points[j].y);
      }
      this.crumbledPattern.closePath();
      this.crumbledPattern.fill();
    }

    // 플랫폼 아래 조명 효과 추가
    this.addPlatformLighting(width, height);

    // 🎨 추가 레이어: 더 작고 배경에 녹아드는 사각형들로 깊이감 강화
    const smallSquareCount = 50; // 20 → 50으로 증가
    const brightColors = [
      0x0f2f3f, // 배경색보다 살짝 밝은 톤
      0x102f40, // 조금 더 밝은 톤
      0x0e2d3a, // 중간 밝기
      0x0d2a35, // 어두운 밝기
    ];

    for (let i = 0; i < smallSquareCount; i++) {
      const size = Math.random() * 50 + 20; // 작은 크기
      const x = Math.random() * width;
      const y = Math.random() * height;
      const color =
        brightColors[Math.floor(Math.random() * brightColors.length)];
      const alpha = Math.random() * 0.3 + 0.08; // 0.4+0.1 → 0.3+0.08로 더 은은한 투명도
      const rotation = Math.random() * Math.PI * 2;

      this.crumbledPattern.fillStyle(color, alpha);

      const points = [];
      const segments = 6;
      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2 + rotation;
        const radius = size / 2 + (Math.random() - 0.5) * 15;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        points.push({ x: px, y: py });
      }

      this.crumbledPattern.beginPath();
      this.crumbledPattern.moveTo(points[0].x, points[0].y);
      for (let j = 1; j < points.length; j++) {
        this.crumbledPattern.lineTo(points[j].x, points[j].y);
      }
      this.crumbledPattern.closePath();
      this.crumbledPattern.fill();
    }
  }

  /** 배경에 노이즈 효과 추가 */
  private addBackgroundNoise(width: number, height: number): void {
    // 노이즈 텍스처 생성
    const noiseKey = "background_noise";

    if (this.scene.textures.exists(noiseKey)) {
      this.scene.textures.remove(noiseKey);
    }

    // 노이즈 캔버스 생성
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = 256;
    canvas.height = 256;

    // 노이즈 패턴 생성
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 255;
      const alpha = Math.random() * 30 + 10; // 10-40 알파값으로 은은하게

      data[i] = noise; // R
      data[i + 1] = noise; // G
      data[i + 2] = noise; // B
      data[i + 3] = alpha; // A
    }

    ctx.putImageData(imageData, 0, 0);

    // Phaser 텍스처로 변환
    this.scene.textures.addCanvas(noiseKey, canvas);

    // 노이즈 오버레이 이미지 생성
    this.backgroundNoise = this.scene.add.tileSprite(
      0,
      0,
      width,
      height,
      noiseKey
    );
    this.backgroundNoise.setOrigin(0, 0);
    this.backgroundNoise.setDepth(-250); // 배경보다 앞, 다른 요소들보다 뒤
    this.backgroundNoise.setAlpha(0.5); // 0.3 → 0.5로 투명도 증가
    this.backgroundNoise.setScrollFactor(0.1); // 약간의 패럴랙스 효과

    // 🎨 동적 사각형들 생성 (개별적으로 움직이는 요소들)
    this.createDynamicSquares(width, height);
  }

  private hexToNumber(hex: string): number {
    const cleaned = hex.replace("#", "");
    return parseInt(cleaned, 16);
  }

  /** 🎨 동적 사각형들 생성 (개별적으로 움직이는 요소들) */
  private createDynamicSquares(width: number, height: number): void {
    // 기존 동적 사각형들 정리
    this.dynamicSquares.forEach((square) => square.graphics.destroy());
    this.dynamicSquares = [];

    const dynamicSquareCount = 30;
    const colors = [
      0x0a1f2a, // 배경색과 동일한 기본 톤
      0x0d2a3a, // 배경색보다 살짝 밝은 톤
      0x0f2f3f, // 배경색보다 조금 더 밝은 톤
      0x0a1a2a, // 배경색보다 살짝 어두운 톤
    ];

    for (let i = 0; i < dynamicSquareCount; i++) {
      const graphics = this.scene.add.graphics();
      graphics.setDepth(-270); // 구겨진 패턴보다 앞

      const size = Math.random() * 60 + 30; // 30-90 크기
      const x = Math.random() * width;
      const y = Math.random() * height;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const alpha = Math.random() * 0.4 + 0.1; // 0.1-0.5 투명도

      // 각 사각형마다 다른 움직임 속도 설정
      const speed = Math.random() * 0.5 + 0.1; // 0.1-0.6 속도
      const rotationSpeed = (Math.random() - 0.5) * 0.02; // -0.01 ~ 0.01 회전 속도
      const scaleSpeed = Math.random() * 0.001 + 0.0005; // 0.0005-0.0015 크기 변화 속도

      // 구겨진 사각형 그리기
      graphics.fillStyle(color, alpha);
      const points = [];
      const segments = 8;
      const rotation = Math.random() * Math.PI * 2;

      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2 + rotation;
        const radius = size / 2 + (Math.random() - 0.5) * 20;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        points.push({ x: px, y: py });
      }

      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      for (let j = 1; j < points.length; j++) {
        graphics.lineTo(points[j].x, points[j].y);
      }
      graphics.closePath();
      graphics.fill();

      // 동적 사각형 정보 저장
      this.dynamicSquares.push({
        graphics,
        baseX: x,
        baseY: y,
        speed,
        rotationSpeed,
        scaleSpeed,
        currentRotation: rotation,
        currentScale: 1.0,
      });
    }

    console.log("🎨 동적 사각형들 생성됨:", dynamicSquareCount);
  }

  // ===== 기존 접근 메서드들 =====

  public getPlatforms(): Platform[] {
    return this.platforms;
  }

  public getCurrentMap(): MapData | undefined {
    return this.currentMap;
  }

  public getSpawns() {
    return this.currentMap?.spawns || [];
  }

  public getMapSize(): { width: number; height: number } {
    if (!this.currentMap) {
      return { width: GAME_CONFIG.width, height: GAME_CONFIG.height };
    }
    return {
      width: this.currentMap.meta.width,
      height: this.currentMap.meta.height,
    };
  }

  /** 🎨 플레이어 위치 업데이트 (패럴랙스 효과용) */
  public updatePlayerPosition(playerX: number, playerY: number): void {
    const deltaX = playerX - this.lastPlayerX;
    const deltaY = playerY - this.lastPlayerY;

    // 디버깅: 플레이어 움직임 확인
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      // console.log("🎨 플레이어 움직임:", { deltaX, deltaY, playerX, playerY });
    }

    // 🎨 동적 사각형들 업데이트 (크기 변화만)
    this.updateDynamicSquares(deltaX, deltaY);

    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;
  }

  /** 🎨 동적 사각형들 업데이트 (크기 변화만) */
  private updateDynamicSquares(deltaX: number, deltaY: number): void {
    this.dynamicSquares.forEach((square, index) => {
      // 개별 크기 변화 효과 (호흡하는 듯한 효과)
      square.currentScale += Math.sin(Date.now() * square.scaleSpeed) * 0.01;
      square.graphics.setScale(square.currentScale);
    });
  }

  /** 리소스 정리 */
  public destroy(): void {
    this.clearBackgroundImages();
    this.clearPlatforms(); // ⭐ 플랫폼 물리 바디도 정리

    // 🎨 동적 사각형들 정리
    this.dynamicSquares.forEach((square) => square.graphics.destroy());
    this.dynamicSquares = [];

    // 🌿 정글 요소들 정리
    this.jungleElements.forEach((element) => element.destroy());
    this.jungleElements = [];

    // 🌟 플랫폼 야광 효과들 정리
    this.platformGlowEffects.forEach((glowGraphics) => glowGraphics.destroy());
    this.platformGlowEffects.clear();

    this.graphics?.destroy();
    this.backgroundGraphics?.destroy();
    this.shadowSystem?.destroy();

    console.log("MapRenderer destroyed");
  }

  /** 💡 플랫폼 아래 조명 효과 추가 */
  private addPlatformLighting(width: number, height: number): void {
    // 플랫폼 아래 조명 효과는 현재 구현하지 않음 (야광 효과로 대체)
    // 필요시 나중에 구현 가능
  }

  /** 🌿 정글 분위기 요소들 추가 */
  private addJungleElements(width: number, height: number): void {
    // 기존 정글 요소들 정리
    if (this.jungleElements) {
      this.jungleElements.forEach((element) => element.destroy());
      this.jungleElements = [];
    }

    this.jungleElements = [];

    // 🌿 나뭇잎들 추가
    this.addJungleLeaves(width, height);

    // 🌿 덩굴들 추가
    this.addJungleVines(width, height);

    // 🌿 정글 장식 요소들 추가
    this.addJungleDecorations(width, height);

    console.log("🌿 정글 요소들 생성됨");
  }

  /** 🌿 덩굴들 추가 */
  private addJungleVines(width: number, height: number): void {
    const vineCount = 8;
    const vineColors = [
      0x1a4a1a, // 어두운 초록
      0x2d5a2d, // 진한 초록
      0x3a6b3a, // 중간 초록
    ];

    for (let i = 0; i < vineCount; i++) {
      const startX = Math.random() * width;
      const startY = 0;
      const endY = Math.random() * (height * 0.8) + height * 0.2;
      const segments = Math.floor(Math.random() * 8) + 5;
      const color = vineColors[Math.floor(Math.random() * vineColors.length)];
      const alpha = Math.random() * 0.3 + 0.1;

      const vine = this.scene.add.graphics();
      vine.setDepth(-240);
      vine.setScrollFactor(0.05); // 약간의 패럴랙스

      vine.lineStyle(3, color, alpha);
      vine.beginPath();
      vine.moveTo(startX, startY);

      // 곡선 모양의 덩굴 그리기
      for (let j = 1; j <= segments; j++) {
        const progress = j / segments;
        const y = startY + (endY - startY) * progress;
        const x = startX + Math.sin(progress * Math.PI * 2) * 30;

        vine.lineTo(x, y);
      }

      vine.strokePath();

      // 덩굴에 작은 나뭇잎들 추가
      for (let j = 0; j < 3; j++) {
        const leafProgress = Math.random();
        const leafY = startY + (endY - startY) * leafProgress;
        const leafX = startX + Math.sin(leafProgress * Math.PI * 2) * 30;
        const leafSize = Math.random() * 15 + 8;

        vine.fillStyle(color, alpha * 0.7);
        vine.fillEllipse(leafX, leafY, leafSize, leafSize * 0.5);
      }

      this.jungleElements.push(vine);
    }
  }

  /** 🌿 정글 장식 요소들 추가 */
  private addJungleDecorations(width: number, height: number): void {
    const decorationCount = 12;
    const decorationColors = [
      0x2d5a2d, // 진한 초록
      0x3a6b3a, // 중간 초록
      0x4a7c4a, // 밝은 초록
      0x1a4a1a, // 어두운 초록
    ];

    for (let i = 0; i < decorationCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 25 + 10;
      const color =
        decorationColors[Math.floor(Math.random() * decorationColors.length)];
      const alpha = Math.random() * 0.3 + 0.1;
      const type = Math.floor(Math.random() * 3); // 0: 원형, 1: 삼각형, 2: 십자형

      const decoration = this.scene.add.graphics();
      decoration.setDepth(-245);
      decoration.setScrollFactor(0.08);

      decoration.fillStyle(color, alpha);

      switch (type) {
        case 0: // 원형 (열매나 꽃)
          decoration.fillCircle(x, y, size);
          decoration.lineStyle(1, color, alpha * 0.6);
          decoration.strokeCircle(x, y, size);
          break;
        case 1: // 삼각형 (나뭇잎)
          decoration.beginPath();
          decoration.moveTo(x, y - size);
          decoration.lineTo(x - size * 0.8, y + size * 0.5);
          decoration.lineTo(x + size * 0.8, y + size * 0.5);
          decoration.closePath();
          decoration.fill();
          break;
        case 2: // 십자형 (작은 꽃)
          decoration.fillCircle(x, y, size * 0.3);
          decoration.fillRect(x - size, y - size * 0.2, size * 2, size * 0.4);
          decoration.fillRect(x - size * 0.2, y - size, size * 0.4, size * 2);
          break;
      }

      this.jungleElements.push(decoration);
    }
  }


  /** 🌿 나뭇잎들 추가 */
  private addJungleLeaves(width: number, height: number): void {
    const leafCount = 15;
    const leafColors = [
      0x2d5a2d, // 진한 초록
      0x3a6b3a, // 중간 초록
      0x4a7c4a, // 밝은 초록
      0x5a8d5a, // 연한 초록
      0x1a4a1a, // 어두운 초록
    ];

    for (let i = 0; i < leafCount; i++) {
      const x = Math.random() * width;
      const y = Math.random() * (height * 0.7); // 상단 70% 영역에만
      const size = Math.random() * 40 + 20;
      const color = leafColors[Math.floor(Math.random() * leafColors.length)];
      const alpha = Math.random() * 0.4 + 0.2;
      const rotation = Math.random() * Math.PI * 2;

      const leaf = this.scene.add.graphics();
      leaf.setDepth(-250);
      leaf.setScrollFactor(0.1); // 패럴랙스 효과

      // 나뭇잎 모양 그리기 (타원형)
      leaf.fillStyle(color, alpha);
      leaf.fillEllipse(x, y, size, size * 0.6);

      // 나뭇잎 테두리
      leaf.lineStyle(1, color, alpha * 0.5);
      leaf.strokeEllipse(x, y, size, size * 0.6);

      // 나뭇잎 중앙 줄기
      leaf.lineStyle(1, color, alpha * 0.8);
      leaf.beginPath();
      leaf.moveTo(x, y - size * 0.3);
      leaf.lineTo(x, y + size * 0.3);
      leaf.strokePath();

      this.jungleElements.push(leaf);
    }
  }
}
