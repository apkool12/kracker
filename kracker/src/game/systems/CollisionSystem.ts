// src/game/systems/CollisionSystem.ts - 벽 관통 방지 개선
import Rectangle = Phaser.Geom.Rectangle;
import Line = Phaser.Geom.Line;
import Intersects = Phaser.Geom.Intersects;

type ArcadeImage = Phaser.Physics.Arcade.Image;
type StaticBody = Phaser.Physics.Arcade.StaticBody;

export class CollisionSystem {
  private scene: Phaser.Scene;
  private bulletGroup: Phaser.Physics.Arcade.Group;
  private platformGroup: Phaser.Physics.Arcade.StaticGroup;
  private collider?: Phaser.Physics.Arcade.Collider;

  // Reusable geometry objects
  private _ccdLine: Phaser.Geom.Line = new Line();

  // 🔥 벽 관통 방지를 위한 더 엄격한 설정
  private readonly MIN_DELTA = 0.05; // 더 작은 최소 이동량
  private readonly EPS = 0.1;
  private networkManager?: any; // 네트워크 매니저 참조
  private remotePlayers?: Map<string, any>; // 원격 플레이어들 참조

  constructor(
    scene: Phaser.Scene,
    bulletGroup: Phaser.Physics.Arcade.Group,
    platformGroup: Phaser.Physics.Arcade.StaticGroup
  ) {
    this.scene = scene;
    this.bulletGroup = bulletGroup;
    this.platformGroup = platformGroup;

    console.log("🎯 CollisionSystem 생성됨 (개선된 벽 관통 방지)");

    // CCD 스윕은 매 프레임 update에서 수행
    this.scene.events.on("update", this._ccdSweep, this);
    // 폭발탄 범위 피해
    this.scene.events.on("bullet:explosion", this.onExplosion, this);

    // 일반 Arcade 충돌도 유지
    this.setupCollisions();
  }

  public getBulletGroup(): Phaser.Physics.Arcade.Group {
    return this.bulletGroup;
  }

  public registerBullet(bulletSprite: Phaser.Physics.Arcade.Image): void {
    if (!bulletSprite) return;
    // 관찰용 그룹(= this.bulletGroup)에 가입시켜서 CCD 스윕, 플랫폼 충돌, 플레이어 맞추기 로직에 포함
    this.bulletGroup.add(bulletSprite);
  }

  public getPlatformGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.platformGroup;
  }

  public setPlayer(player: any): void {
    this.player = player;
  }

  public setNetworkManager(networkManager: any): void {
    this.networkManager = networkManager;
  }

  public setRemotePlayers(remotePlayers: Map<string, any>): void {
    this.remotePlayers = remotePlayers;
  }

  destroy() {
    console.log("🧹 CollisionSystem 정리 중...");
    this.scene.events.off("update", this._ccdSweep, this);
    this.scene.events.off("bullet:explosion", this.onExplosion, this);
    if (this.collider) {
      this.collider.destroy();
      this.collider = undefined;
    }
    console.log("✅ CollisionSystem 정리 완료");
  }

  private setupCollisions() {
    this.collider = this.scene.physics.add.collider(
      this.bulletGroup,
      this.platformGroup,
      ((obj1: any, obj2: any) => {
        let bulletSprite: ArcadeImage | null = null;
        let platformSprite: Phaser.GameObjects.GameObject | null = null;

        if ((obj1 as any)?.body?.isCircle) {
          bulletSprite = obj1 as ArcadeImage;
          platformSprite = obj2 as Phaser.GameObjects.GameObject;
        } else if ((obj2 as any)?.body?.isCircle) {
          bulletSprite = obj2 as ArcadeImage;
          platformSprite = obj1 as Phaser.GameObjects.GameObject;
        } else {
          if ((obj1 as any)?.getData?.("__isBullet"))
            bulletSprite = obj1 as ArcadeImage;
          if ((obj2 as any)?.getData?.("__isBullet"))
            bulletSprite = obj2 as ArcadeImage;
          platformSprite =
            bulletSprite === obj1 ? (obj2 as any) : (obj1 as any);
        }

        if (!bulletSprite) return;

        // 유령 탄: 플랫폼 충돌 무시
        if (bulletSprite.getData("__ghost")) {
          return;
        }

        if (bulletSprite.getData("__hitThisFrame")) {
          bulletSprite.setData("__hitThisFrame", false);
          return;
        }

        bulletSprite.setData("__hitThisFrame", true);
        this.onBulletHitPlatform(bulletSprite, platformSprite);
      }) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      ((obj1: any, obj2: any) => {
        const b = obj1?.getData?.("__isBullet") ? obj1 : obj2;
        if (b?.getData?.("__ghost")) return false;
        // 바운스 잔여가 있으면 Arcade 가 충돌면 기준으로 반사하도록
        const bounceLeft = b?.getData?.("__bounce") || 0;
        b?.body?.setBounce?.(bounceLeft > 0 ? 1 : 0);
        return true;
      }) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      this
    );

    console.log("🔗 충돌 감지 설정 완료");
  }

  /**
   * 🔥 개선된 CCD 스윕 - 벽 관통 방지 강화
   */
  private _ccdSweep = () => {
    const bullets = this.bulletGroup.getChildren() as ArcadeImage[];
    const platforms = this.platformGroup.getChildren();

    for (const b of bullets) {
      if (!b.active) continue;

      // 원격 총알은 충돌 감지에서 제외 (시각적 효과만)
      const bulletRef = b.getData && b.getData("__bulletRef");
      if (bulletRef && bulletRef._remote) continue;

      const curX = b.x;
      const curY = b.y;

      let prevX = b.getData("__prevX") as number | undefined;
      let prevY = b.getData("__prevY") as number | undefined;

      // 🔥 초기 스폰 시 안전성 검사
      if (prevX === undefined || prevY === undefined) {
        // 스폰 위치가 벽 내부인지 확인
        if (this.isInsideAnyPlatform(curX, curY, this.getBulletRadius(b))) {
          console.warn(
            `⚠️ 총알이 벽 내부에서 스폰됨! 즉시 제거: (${curX.toFixed(
              1
            )}, ${curY.toFixed(1)})`
          );
          b.setData("__hitThisFrame", true);
          this.onBulletHitPlatform(b, null);
          continue;
        }

        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
        continue;
      }

      // 이동량 체크
      const deltaX = Math.abs(curX - prevX);
      const deltaY = Math.abs(curY - prevY);
      if (deltaX < this.MIN_DELTA && deltaY < this.MIN_DELTA) {
        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
        continue;
      }

      // 이미 처리된 프레임 스킵
      if (b.getData("__hitThisFrame")) {
        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
        b.setData("__hitThisFrame", false);
        continue;
      }

      // 🔥 총알 ↔ 플레이어 충돌 체크 (모든 플레이어)
      let playerHit = false;

      // 원격 플레이어들 충돌 체크
      if (!playerHit && this.remotePlayers) {
        const playerIds = Array.from(this.remotePlayers.keys());
        for (let i = 0; i < playerIds.length; i++) {
          const playerId = playerIds[i];
          const remotePlayer = this.remotePlayers.get(playerId);

          if (!remotePlayer || (remotePlayer.networkState?.health || 0) <= 0)
            continue;

          const pos = remotePlayer.lastPosition;
          if (!pos) continue;

          const playerRadius = 25; // 원격 플레이어 반지름
          const dx = b.x - pos.x;
          const dy = b.y - pos.y;
          const bulletR = this.getBulletRadius(b);
          const rSum = playerRadius + bulletR;

          if (dx * dx + dy * dy <= rSum * rSum) {
            const hitIds: Set<string> = b.getData("__hitIds") || new Set();
            if (hitIds.has(playerId)) continue; // 관통 중인 같은 대상
            hitIds.add(playerId);
            b.setData("__hitIds", hitIds);

            playerHit = true;
            b.setData("__hitThisFrame", true);

            const bulletRef = b.getData("__bulletRef");
            const dmg = bulletRef?.getConfig
              ? bulletRef.getConfig().damage
              : 10;

            if (this.networkManager) {
              const hitData = {
                bulletId: `collision_${Date.now()}`,
                targetPlayerId: playerId,
                damage: dmg,
                x: b.x,
                y: b.y,
              };

              console.log(
                `💥 CollisionSystem: 원격 플레이어 맞음 - 플레이어: ${playerId}, 데미지: ${dmg}`
              );
              this.networkManager.sendBulletHit(hitData);
            }

            // 관통 잔여가 있으면 계속 날아감, 아니면 폭발/제거
            const pierceLeft = (b.getData("__pierce") as number) || 0;
            if (pierceLeft > 0) {
              b.setData("__pierce", pierceLeft - 1);
            } else {
              try {
                if (bulletRef?.hit) bulletRef.hit(b.x, b.y);
                else b.destroy(true);
              } catch (e) {
                b.destroy(true);
              }
            }
            break; // 한 프레임에 한 명
          }
        }
      }

      // 플레이어를 맞췄으면 다음 총알로
      if (playerHit) {
        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
        continue;
      }

      // 유령 탄은 벽 무시, 바운스 탄은 Arcade collider 가 반사 처리
      if (b.getData("__ghost") || (b.getData("__bounce") || 0) > 0) {
        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
        continue;
      }

      // 🔥 더 정밀한 스윕 검사
      const radius = this.getBulletRadius(b);
      let hitFound = false;

      // 🔥 다중 세그먼트 스윕 (빠른 총알도 놓치지 않음)
      const segments = this.calculateSweptSegments(
        prevX,
        prevY,
        curX,
        curY,
        radius
      );

      for (const segment of segments) {
        for (const p of platforms) {
          if (this.checkSegmentPlatformCollision(segment, p, radius)) {
            b.setData("__hitThisFrame", true);
            this.onBulletHitPlatform(b, p);
            hitFound = true;
            break;
          }
        }
        if (hitFound) break;
      }

      // 충돌이 없었을 때만 prev 갱신
      if (!hitFound) {
        b.setData("__prevX", curX);
        b.setData("__prevY", curY);
      }
    }
  };

  private onExplosion(e: { x: number; y: number; radius: number; damage: number; ownerId?: string | null; hitIds?: Set<string> }) {
    const myId = this.networkManager?.getNetworkStatus?.().myPlayerId;
    if (!this.networkManager || !this.remotePlayers || !myId) return;
    if (e.ownerId && e.ownerId !== myId) return;
    const splash = Math.round((e.damage || 0) * 0.5);
    if (splash <= 0) return;

    this.remotePlayers.forEach((rp, playerId) => {
      const pos = rp?.lastPosition;
      if (!pos || (rp.networkState?.health || 0) <= 0) return;
      if (e.hitIds?.has(playerId)) return; // 직격 대상은 이미 피격 처리됨
      const dx = pos.x - e.x;
      const dy = pos.y - e.y;
      const r = e.radius + 25;
      if (dx * dx + dy * dy > r * r) return;
      this.networkManager.sendBulletHit({
        bulletId: `explosion_${Date.now()}`,
        targetPlayerId: playerId,
        damage: splash,
        x: e.x,
        y: e.y,
      });
    });
  }

  /**
   * 🔥 총알 반지름 정확히 계산
   */
  private getBulletRadius(bullet: ArcadeImage): number {
    const diameterData = bullet.getData("diameter") as number | undefined;
    if (diameterData !== undefined) {
      return Math.max(1, diameterData * 0.5);
    }

    const body = bullet.body as Phaser.Physics.Arcade.Body;
    if (body && body.isCircle) {
      return Math.max(1, body.radius);
    }

    return Math.max(1, bullet.displayWidth * 0.5);
  }

  /**
   * 🔥 점이 어떤 플랫폼 내부에 있는지 확인
   */
  private isInsideAnyPlatform(x: number, y: number, radius: number): boolean {
    const platforms = this.platformGroup.getChildren();

    for (const p of platforms) {
      const body = (p as any).body as StaticBody | undefined;
      if (!body) continue;

      const left = (body as any).left ?? body.x;
      const right = (body as any).right ?? body.x + body.width;
      const top = (body as any).top ?? body.y;
      const bottom = (body as any).bottom ?? body.y + body.height;

      // 총알 중심이 플랫폼 내부에 있으면서 충분한 여유가 없으면 내부로 판단
      if (
        x > left + radius &&
        x < right - radius &&
        y > top + radius &&
        y < bottom - radius
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 🔥 스윕 경로를 여러 세그먼트로 분할 (빠른 총알 관통 방지)
   */
  private calculateSweptSegments(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    radius: number
  ): Array<{ startX: number; startY: number; endX: number; endY: number }> {
    const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);

    // 거리가 총알 반지름의 2배보다 크면 세그먼트로 분할
    const maxSegmentLength = radius * 2;
    const numSegments = Math.max(1, Math.ceil(distance / maxSegmentLength));

    const segments = [];
    for (let i = 0; i < numSegments; i++) {
      const t1 = i / numSegments;
      const t2 = (i + 1) / numSegments;

      segments.push({
        startX: startX + (endX - startX) * t1,
        startY: startY + (endY - startY) * t1,
        endX: startX + (endX - startX) * t2,
        endY: startY + (endY - startY) * t2,
      });
    }

    return segments;
  }

  /**
   * 🔥 세그먼트와 플랫폼 충돌 검사
   */
  private checkSegmentPlatformCollision(
    segment: { startX: number; startY: number; endX: number; endY: number },
    platform: any,
    radius: number
  ): boolean {
    const body = platform.body as StaticBody | undefined;
    if (!body) return false;

    const left = (body as any).left ?? body.x;
    const right = (body as any).right ?? body.x + body.width;
    const top = (body as any).top ?? body.y;
    const bottom = (body as any).bottom ?? body.y + body.height;

    // 플랫폼을 총알 반지름만큼 확장
    const expandedRect = new Rectangle(
      left - radius - this.EPS,
      top - radius - this.EPS,
      right - left + (radius + this.EPS) * 2,
      bottom - top + (radius + this.EPS) * 2
    );

    // 세그먼트 선분 생성
    this._ccdLine.setTo(
      segment.startX,
      segment.startY,
      segment.endX,
      segment.endY
    );

    // 🔥 시작점이 내부가 아니고, 교차하거나 끝점이 내부면 충돌
    const startInside = expandedRect.contains(segment.startX, segment.startY);
    const endInside = expandedRect.contains(segment.endX, segment.endY);
    const lineIntersects = Intersects.LineToRectangle(
      this._ccdLine,
      expandedRect
    );

    // 시작점이 이미 내부면 관통 중이므로 무시 (탈출 허용)
    if (startInside) {
      return false;
    }

    // 선분이 사각형과 교차하거나 끝점이 내부로 들어가면 충돌
    return lineIntersects || endInside;
  }

  /**
   * 총알이 플랫폼에 맞았을 때 처리
   */
  private onBulletHitPlatform = (
    bulletSprite: ArcadeImage,
    platformSprite: Phaser.GameObjects.GameObject | null
  ) => {
    if (!bulletSprite.active) return;

    // 유령 탄: 플랫폼 무시
    if (bulletSprite.getData("__ghost")) {
      return;
    }

    // 바운스 탄: 반사 후 생존 (횟수 감소)
    const bounceLeft = bulletSprite.getData("__bounce") as number | undefined;
    if (bounceLeft && bounceLeft > 0) {
      // 반사는 collider 의 setBounce(1) 로 Arcade 가 충돌면 기준 처리함
      bulletSprite.setData("__bounce", bounceLeft - 1);
      bulletSprite.setData("__hitThisFrame", false);
      return;
    }

    if (bulletSprite.getData("__handled")) return;
    bulletSprite.setData("__handled", true);
    // 총알 파괴
    try {
      const bulletData = bulletSprite.getData("__bulletRef");
      if (bulletData && typeof bulletData.hit === "function") {
        bulletData.hit(bulletSprite.x, bulletSprite.y);
      } else {
        bulletSprite.destroy(true);
      }
    } catch (error) {
      console.warn("총알 파괴 중 오류:", error);
    }
  };
 // 스폰 시 안전 거리

  private player?: any;
}

export default CollisionSystem;
