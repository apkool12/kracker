// src/game/debug/DebugRenderer.ts
import Phaser from "phaser";

export class DebugRenderer {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private isDebugMode: boolean = false;
  private debugObjects: Map<string, Phaser.GameObjects.Graphics> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(1000); // 최상위 레이어에 표시
  }

  public update(): void {
    if (!this.isDebugMode) {
      this.clearAllDebugObjects();
      return;
    }

    this.renderPlatforms();
    this.renderBullets();
    this.renderPlayers();
  }

  private renderPlatforms(): void {
    // 플랫폼 렌더링 - GameScene의 platformGroup 사용
    const platformGroup = (this.scene as any).platformGroup;
    if (platformGroup && platformGroup.children) {
      // 기존 플랫폼 히트박스들 모두 제거
      this.clearTypeObjects("platform");

      platformGroup.children.entries.forEach((platform: any, index: number) => {
        this.drawHitbox(platform, `platform_${index}`);
      });
    }
  }

  private renderBullets(): void {
    // 총알 렌더링 - GameScene의 bulletGroup 사용
    const bulletGroup = (this.scene as any).bulletGroup;
    if (bulletGroup && bulletGroup.children) {
      // 기존 총알 히트박스들 모두 제거
      this.clearTypeObjects("bullet");

      bulletGroup.children.entries.forEach((bullet: any, index: number) => {
        this.drawHitbox(bullet, `bullet_${index}`);
      });
    }
  }

  private renderPlayers(): void {
    // 기존 플레이어 히트박스들 모두 제거
    this.clearTypeObjects("player");
    this.clearTypeObjects("remote_player");

    // 로컬 플레이어 렌더링 - 원형 히트박스 사용
    const localPlayer = (this.scene as any).player;
    if (localPlayer && localPlayer.getCircleBounds) {
      const circleBounds = localPlayer.getCircleBounds();
      this.drawCircleHitbox(circleBounds, "player");
    }

    // 원격 플레이어들 렌더링
    const remotePlayers = (this.scene as any).remotePlayers;
    if (remotePlayers) {
      let remoteIndex = 0;
      remotePlayers.forEach((remotePlayer: any) => {
        // 원격 플레이어는 lastPosition을 사용하여 원형 히트박스 그리기
        if (remotePlayer.lastPosition) {
          const circleBounds = {
            x: remotePlayer.lastPosition.x,
            y: remotePlayer.lastPosition.y,
            radius: 18, // 원격 플레이어도 18px 반지름으로 통일
          };
          this.drawCircleHitbox(circleBounds, `remote_player_${remoteIndex}`);
        }
        remoteIndex++;
      });
    }
  }

  private drawHitbox(object: any, type: string): void {
    if (!object.body) return;

    const key = `${type}_${object.name || object.x}_${object.y}`;

    // 기존 히트박스가 있으면 제거
    if (this.debugObjects.has(key)) {
      this.debugObjects.get(key)?.destroy();
      this.debugObjects.delete(key);
    }

    // 새로운 히트박스 생성 (사각형 - 플랫폼과 총알용)
    const hitbox = this.scene.add.graphics();
    hitbox.lineStyle(2, 0xff0000); // 빨간색 테두리
    hitbox.fillStyle(0xff0000, 0.3); // 빨간색 채우기, 투명도 0.3
    hitbox.fillRect(
      object.body.x,
      object.body.y,
      object.body.width,
      object.body.height
    );
    hitbox.strokeRect(
      object.body.x,
      object.body.y,
      object.body.width,
      object.body.height
    );
    hitbox.setDepth(1001); // 그래픽보다 위에 표시

    this.debugObjects.set(key, hitbox);
  }

  private drawCircleHitbox(
    circleBounds: { x: number; y: number; radius: number },
    type: string
  ): void {
    // 타입별로 고유한 키 생성
    const key = type;

    // 기존 히트박스가 있으면 제거
    if (this.debugObjects.has(key)) {
      this.debugObjects.get(key)?.destroy();
      this.debugObjects.delete(key);
    }

    // 새로운 원형 히트박스 생성
    const hitbox = this.scene.add.graphics();
    hitbox.lineStyle(2, 0xff0000); // 빨간색 테두리
    hitbox.fillStyle(0xff0000, 0.3); // 빨간색 채우기, 투명도 0.3
    hitbox.fillCircle(circleBounds.x, circleBounds.y, circleBounds.radius);
    hitbox.strokeCircle(circleBounds.x, circleBounds.y, circleBounds.radius);
    hitbox.setDepth(1001); // 그래픽보다 위에 표시

    this.debugObjects.set(key, hitbox);
  }

  private clearAllDebugObjects(): void {
    this.debugObjects.forEach((hitbox) => {
      hitbox.destroy();
    });
    this.debugObjects.clear();
  }

  private clearTypeObjects(type: string): void {
    const keysToRemove: string[] = [];
    this.debugObjects.forEach((hitbox, key) => {
      if (key.startsWith(type)) {
        hitbox.destroy();
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach((key) => this.debugObjects.delete(key));
  }

  public destroy(): void {
    this.clearAllDebugObjects();
    this.graphics.destroy();
  }

  public isDebugModeActive(): boolean {
    return this.isDebugMode;
  }
}
