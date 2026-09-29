// src/game/GameScene.ts - NetworkManager 통합된 멀티플레이어 GameScene
import { Platform, Bullet, CHARACTER_PRESETS } from "./config";
import Player from "./player/Player";
import MapRenderer from "./MapRenderer";
import { MapLoader } from "./maps/MapLoader";
import { ParticleSystem } from "./particle";

import { NetworkManager } from "./managers/NetworkManager"; // ☆ 네트워크 매니저 추가
// import { DebugRenderer } from "./debug/DebugRenderer"; // ☆ 디버그 렌더러 제거

// 상수 및 설정
import {
  GAME_SETTINGS,
  UI_CONSTANTS,
  PLAYER_CONSTANTS,
  CAMERA_CONSTANTS,
  PERFORMANCE_CONSTANTS,
  GAME_STATE,
  MapKey,
  ColorPresetKey,
  ShadowPresetKey,
} from "./config/GameConstants";

// 매니저들
import { InputManager } from "./managers/InputManager";
import { UIManager } from "./managers/UIManager";
import { CameraManager } from "./managers/CameraManager";
import { ShadowManager } from "./managers/ShadowManager";
import { ShootingManager } from "./managers/ShootingManager";
import CollisionSystem from "./systems/CollisionSystem";
import { LightingSystem } from "./fx/Lighting";
import {
  RemotePlayerManager,
  type RemotePlayer,
} from "./remote/RemotePlayerManager";
// 증강 정의(JSON)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import AUGMENT_DEFS from "../data/augments.json";
import {
  getAugmentsForPlayer,
} from "../data/augments";
import { HIT_SOUND } from "../assets/audios/tracks";

// 멀티플레이어 타입 정의
export interface GamePlayer {
  id: string;
  name: string;
  team: number;
  color: string;
  isMe: boolean;
  accessory?: string;
}

interface GameData {
  players: GamePlayer[];
  myPlayerId: string;
  room: {
    roomId: string;
    gameMode: string;
    roomName: string;
  };
  startTime: number;
  // 🔢 서버가 내려주는 초기 스폰 인덱스 계획(선택 사항)
  spawnPlan?: Record<string, number>;
  // 🗺️ 서버가 내려주는 초기 스폰 좌표(선택 사항)
  spawnPositions?: Record<string, { x: number; y: number }>;
}

// 간단한 소리 재생 함수
let isPlayingHitSound = false;


function playHitSound() {
  if (!isPlayingHitSound) {
    isPlayingHitSound = true;
    try {
      const audio = new Audio(HIT_SOUND);
      audio.volume = 0.4;
      audio.play().catch(() => {
        isPlayingHitSound = false;
      });
      audio.onended = () => {
        isPlayingHitSound = false;
      };
    } catch (error) {
      console.warn("아파용 소리 재생 실패:", error);
      isPlayingHitSound = false;
    }
  }
}

export default class GameScene extends Phaser.Scene {
  // 기본 게임 요소들
  private player!: Player;

  private platforms: Platform[] = [];
  private bullets: Bullet[] = [];
  private mapRenderer!: MapRenderer;
  private particleSystem!: ParticleSystem;
  private bulletGroup!: Phaser.Physics.Arcade.Group;
  private platformGroup!: Phaser.Physics.Arcade.StaticGroup;

  // ☆ 멀티플레이어 관련
  private remotePlayerManager = new RemotePlayerManager(this);
  // bullet.ts/DebugRenderer 가 scene.remotePlayers 로 직접 접근하므로 같은 Map 인스턴스를 유지
  private remotePlayers: Map<string, RemotePlayer> =
    this.remotePlayerManager.remotePlayers;
  private myPlayerId: string | null = null;
  private gameData: GameData | null = null;
  private isMultiplayer: boolean = false;
  private networkManager!: NetworkManager; // ☆ 네트워크 매니저 추가
  
  // 스폰 위치 추적
  private usedSpawnPoints: Set<string> = new Set();

  // 로딩 모달 관련
  private isLoadingModalOpen: boolean = false;
  private expectedPlayerCount: number = 2; // 기본값

  // 매니저들
  private inputManager!: InputManager;
  private uiManager!: UIManager;
  private cameraManager!: CameraManager;
  private shadowManager!: ShadowManager;
  private shootingManager!: ShootingManager;
  // private debugRenderer!: DebugRenderer; // ☆ 디버그 렌더러 제거
  private collisionSystem!: CollisionSystem;

  // 씬 상태 관리
  private currentMapKey: MapKey = GAME_SETTINGS.DEFAULT_MAP as MapKey;
  private sceneState: any = GAME_STATE.SCENE_STATES.LOADING;
  private isInitialized: boolean = false;

  // 증강 스냅샷: playerId -> Record<augmentId, { id, startedAt }>
  private augmentByPlayer: Map<
    string,
    Record<string, { id: string; startedAt: number }>
  > = new Map();

  constructor() {
    super({ key: "GameScene" });
  }

  // 🆕 씬 초기화 상태 확인을 위한 public getter
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  //멀티관련
  private pendingMultiplayerData: GameData | null = null;

  preload(): void {
    this.load.svg("jungleBg", "/mapJungle-Bg.svg");
    // 추가 에셋들...
  }

  async create(data: any) {
    // 중복 호출 방지
    if (this.isInitialized) {
      return;
    }

    this.sceneState = GAME_STATE.SCENE_STATES.LOADING;

    // Phaser 는 shutdown() 메서드를 자동 호출하지 않는다 → 씬 이벤트에 연결
    this.hasShutDown = false;
    this.events.once("shutdown", this.shutdown, this);
    this.events.once("destroy", this.shutdown, this);

    try {
      // GameManager에 자신을 등록 (씬이 완전히 초기화된 후)
      const gameManager = this.game.registry.get("gameManager");
      if (gameManager) {
        gameManager.setGameScene(this);
      }

      // 맵 로더 초기화
      await MapLoader.initializeDefaultMaps();

      // 기본 설정
      this.cameras.main.setBackgroundColor(
        GAME_SETTINGS.RENDER.BACKGROUND_COLOR
      );

      // 맵 시스템 초기화
      // 맵: 씬 데이터 → 로비에서 고른 맵(gameState.room.mapKey) → 기본 맵
      await this.initializeMapSystem(data?.mapKey ?? readSelectedMapKey());

      // Physics Groups 초기화
      this.initializePhysicsGroups();

      // ☆ 네트워크 매니저 초기화
      this.networkManager = new NetworkManager(this);
      this.setupNetworkCallbacks();

      // 매니저들 초기화 (순서 중요)
      await this.initializeManagers();

      // 플레이어 생성
      this.createPlayer(data?.spawn);

      // 사격 시스템과 플레이어 연결
      this.shootingManager.setPlayer(this.player);

      // 충돌 시스템 초기화 및 주입 (사격 시스템의 총알 그룹 사용)
      this.collisionSystem = new CollisionSystem(
        this,
        this.shootingManager.getBulletGroup(),
        this.platformGroup
      );
      this.collisionSystem.setPlayer(this.player);
      this.collisionSystem.setNetworkManager(this.networkManager);
      this.collisionSystem.setRemotePlayers(this.remotePlayers);

      // 추가 데이터 처리
      this.processAdditionalData(data);

      // 파티클 시스템 초기화
      this.particleSystem = new ParticleSystem(this, true);

      // 분위기: 동적 조명(총알/섬광 광원 + 플랫폼 그림자) → 블룸 → 비네팅
      this.lighting = new LightingSystem(
        this,
        () => this.shootingManager?.getAllBullets() ?? [],
        () => this.mapRenderer?.getPlatforms() ?? []
      );
      // 개발 모드 디버그/E2E 용 씬 핸들 (프로덕션 빌드에선 제거됨)
      if (import.meta.env.DEV) (window as any).__scene = this;

      const fx = this.cameras.main.postFX;
      fx?.addBloom(0xffffff, 1, 1, 1, 0.9, 4);
      fx?.addVignette(0.5, 0.5, 0.92, 0.32);

      this.sceneState = GAME_STATE.SCENE_STATES.RUNNING;
      this.isInitialized = true;

      // 대기열에 멀티플레이 초기화 데이터가 있으면 지금 처리
      if (this.pendingMultiplayerData && !this.isMultiplayer && !this.isInitialized) {
        const queued = this.pendingMultiplayerData;
        this.pendingMultiplayerData = null;
        this.initializeMultiplayer(queued);
      }
    } catch (error) {
      this.sceneState = GAME_STATE.SCENE_STATES.ERROR;
    }
  }

  // ☆ 네트워크 콜백 설정
  private setupNetworkCallbacks(): void {
    // 플레이어 움직임 수신
    this.networkManager.setPlayerMoveCallback((playerId, movement) => {
      this.remotePlayerManager.handleRemotePlayerMovement(playerId, movement);
    });

    // 플레이어 사격 수신
    this.networkManager.onPlayerShoot((playerId, shootData) => {
      this.remotePlayerManager.handleRemotePlayerShoot(playerId, shootData);
    });

    // 이알 충돌 수신
    this.networkManager.onBulletHit((hitData) => {
      this.handleBulletHit(hitData);
    });

    // 포즈(조준각 등) 수신
    this.networkManager.onPose((playerId, pose) => {
      this.remotePlayerManager.applyRemotePose(playerId, pose);
    });

    // 파티클 수신
    this.networkManager.onParticle((particleData) => {
      this.createRemoteParticle(particleData);
    });

    // 파티클 이벤트 전송 (bullet.ts에서 발생하는 이벤트)
    this.events.on("particle:create", (particleData: any) => {
      if (this.isMultiplayer && this.networkManager) {
        this.networkManager.sendParticle(particleData);
      }
    });

    // 게임 이벤트 수신
    this.networkManager.setGameEventCallback((event) => {
      this.handleGameEvent(event);
    });

    // 체력 업데이트 수신
    this.networkManager.setHealthUpdateCallback((data: any) => {
      this.handleHealthUpdate(data);
    });
    // 🆕 증강 스냅샷 수신
    this.networkManager.setAugmentSnapshotCallback((data: any) => {
      try {
        console.log("📦 증강 스냅샷 수신:", data);
        console.log("🔍 현재 myPlayerId:", this.myPlayerId);
        (data.players || []).forEach((p: any) => {
          this.augmentByPlayer.set(p.id, p.augments || {});
          console.log(`📦 플레이어 ${p.id} 증강 설정:`, p.augments);
          if (p.id === this.myPlayerId) {
            console.log("🎯 내 플레이어 증강 발견!");
          }
        });
        // 로컬 플레이어 무기/사격 파라미터 재적용
        try {
          this.shootingManager?.reapplyWeaponAugments?.();
        } catch {}
        // 점프/중력 재적용
        try {
          const eff: any = this.getAugmentAggregatedEffectsForPlayer(
            this.myPlayerId || ""
          );
          if (eff && this.player) {
            (this.player as any).setJumpHeightMultiplier?.(
              eff.player.jumpHeightMul || 1
            );
            (this.player as any).setExtraJumps?.(eff.player.extraJumps || 0);
            (this.player as any).setGravityMultiplier?.(
              eff.player.gravityMul || 1
            );
            (this.player as any).setMoveSpeedMultiplier?.(
              eff.player.moveSpeedMul || 1
            );
            try {
              console.log(
                `🏃‍♂️ 플레이어 이동속도 설정: ${eff.player.moveSpeedMul || 1}`
              );
            } catch {}
            (this.player as any).setBlinkEnabled?.(!!eff.player.blink);
            if ((eff.player.maxHealthDelta || 0) !== 0) {
              try {
                this.player.setMaxHealth(
                  100 + (eff.player.maxHealthDelta || 0)
                );
              } catch {}
            }
          }
        } catch {}
      } catch {}
    });

    // 플레이어 입장/퇴장
    this.networkManager.setPlayerJoinCallback((playerData) => {
      this.handlePlayerJoin(playerData);
    });

    this.networkManager.setPlayerLeaveCallback((playerId) => {
      this.handlePlayerLeave(playerId);
    });

    console.log("🌐 네트워크 콜백 설정 완료");
  }

  // 원격 파티클 생성 메서드
  private createRemoteParticle(particleData: any): void {
    if (!this.particleSystem) return;

    const { type, x, y, color, playerId } = particleData;
    console.log(
      `🎆 원격 파티클 수신: ${type} from ${playerId} at (${x}, ${y})`
    );

    switch (type) {
      case "jump":
        this.particleSystem.createJumpParticle(x, y, color);
        break;
      case "wallLeftJump":
        this.particleSystem.createWallLeftJumpParticle(x, y, color);
        break;
      case "wallRightJump":
        this.particleSystem.createWallRightJumpParticle(x, y, color);
        break;
      case "death":
        this.particleSystem.createDeathOxidationParticle(x, y);
        break;
      default:
        console.warn(`알 수 없는 파티클 타입: ${type}`);
    }
  }

  // 증강 집계 효과를 조회 (ShootingManager와 동일 규칙)
  private getAugmentAggregatedEffectsForPlayer(playerId: string): any {
    const res = getAugmentsForPlayer(this.augmentByPlayer, playerId);
    try {
      console.log("🛠️ 증강 적용(플레이어):", {
        playerId,
        res,
        moveSpeedMul: res?.player?.moveSpeedMul,
        hasAugments: this.augmentByPlayer.has(playerId),
        augmentCount: this.augmentByPlayer.get(playerId)
          ? Object.keys(this.augmentByPlayer.get(playerId)!).length
          : 0,
        myPlayerId: this.myPlayerId,
        augmentByPlayerSize: this.augmentByPlayer.size,
        allPlayerIds: Array.from(this.augmentByPlayer.keys()),
      });
    } catch {}
    return res as any;
  }

  // 원격 총알 정리 (수명이 다한 총알 제거)
  private cleanupRemoteBullets(): void {
    if (!this.shootingManager) return;

    const bullets: any[] = this.shootingManager.getAllBullets();
    const currentTime = Date.now();

    for (const b of bullets) {
      if (!b || !b._remote) continue;

      // 원격 총알의 수명 체크 (3초)
      const bulletAge = currentTime - (b.createdTime || currentTime);
      if (bulletAge > 3000) {
        // 수명이 다한 원격 총알 제거
        if (typeof b.destroy === "function") {
          b.destroy(true);
        }
        if (b.sprite && typeof b.sprite.destroy === "function") {
          b.sprite.destroy(true);
        }
        b._active = false;
        b._hitProcessed = true;
      }
    }
  }

  // ☆ 게임 이벤트 처리
  private handleGameEvent(event: any): void {
    switch (event.type) {
      case "status":
        // 상태이상(예: slow) 적용: 간단히 이동 속도 스케일을 일정 시간 낮춤
        try {
          const pid = event.playerId;
          const data = event.data || {};
          if (data.status === "slow") {
            if (pid === this.myPlayerId && this.player) {
              // 로컬 플레이어: 이동 속도 스케일 적용
              const mult = data.multiplier ?? 0.7;
              const ms = data.ms ?? 1500;
              (this.player as any).__speedMul = mult;
              setTimeout(() => {
                (this.player as any).__speedMul = 1.0;
              }, ms);
            }
          } else if (data.status === "stun") {
            if (pid === this.myPlayerId && this.player) {
              // 로컬 플레이어: 입력 비활성화로 스턴 구현
              const ms = data.ms ?? 500;
              this.setInputEnabled(false);
              setTimeout(() => {
                // 스턴 중 사망했다면 부활(alive) 이벤트가 입력을 다시 연다
                if ((this.player?.getHealth() ?? 0) > 0) this.setInputEnabled(true);
              }, ms);
            }
          } else if (data.status === "knockback") {
            if (pid === this.myPlayerId && this.player) {
              this.player.applyImpulse(Number(data.vx) || 0, Number(data.vy) || 0);
            }
          }
        } catch {}
        break;
      case "showHealthBar":
        // 체력바 표시 이벤트 처리
        const playerId = event.data?.playerId || event.playerId;
        const remotePlayer = this.remotePlayers.get(playerId);
        if (remotePlayer) {
          // 체력바 상시 표시로 변경
          // 체력 업데이트
          if (event.data?.health !== undefined) {
            remotePlayer.networkState.health = event.data.health;
          }
        } else {
          console.debug(`⚠️ 체력바 표시할 플레이어를 찾을 수 없음: ${playerId}`);
        }
        break;

      case "damage":
        // 데미지 이벤트 처리
        break;

      case "heal":
        // 힐 이벤트 처리
        break;

      case "respawn":
        // 리스폰 이벤트 처리
        break;

      case "powerup":
        // 파워업 이벤트 처리
        break;

      case "respawnAll":
        // 모든 플레이어를 스폰 위치로 이동
        try {
          // 서버에서 보낸 spawnIndex가 현재 플레이어에게만 적용
          if (event.data?.targetPlayerId && event.data.targetPlayerId !== this.myPlayerId) {
            return; // 다른 플레이어용 이벤트는 무시
          }
          
          // 스폰 위치 초기화 (새로운 라운드 시작)
          this.resetSpawnPoints();
          
          const spawns = this.mapRenderer?.getSpawns?.() || [];
          
          // 내 플레이어
          if (this.player && this.myPlayerId) {
            const myData = this.gameData?.players.find(
              (p) => p.id === this.myPlayerId
            );
            const mode = this.gameData?.room.gameMode || "개인전";
            const spawnIdx = Number(event.data?.spawnIndex ?? 0);
            let candidateSpawns = spawns;
            if (mode === "팀전") {
              const teamName = myData?.team === 1 ? "A" : "B";
              const teamFiltered = spawns.filter((s: any) => s.name === teamName);
              if (teamFiltered.length > 0) candidateSpawns = teamFiltered;
            }

            const chosen = candidateSpawns.length > 0
              ? candidateSpawns[Math.abs(spawnIdx) % candidateSpawns.length]
              : spawns[0];

            if (chosen) {
              this.setPlayerPosition(chosen.x, chosen.y);
            }
            // 새 라운드: 이전 라운드의 속도/슬로우가 이어지지 않도록 초기화
            this.player.resetVelocity();
            (this.player as any).__speedMul = 1.0;
            
            // 이름표 복구
            if (myData) this.tryCreateNameTag(myData.id, myData.name);
          }
          
          // 원격 플레이어는 각자 서버에서 받은 spawnIndex로 처리됨
          // (서버가 각 플레이어별로 개별 이벤트를 보내므로)
          
          // 라운드 사이 구간: 리스폰 시점이므로 여전히 betweenRounds 유지
          this.isBetweenRounds = true;
        } catch (e) {}
        break;

      case "dead":
        // 특정 플레이어 사망 방송 수신 시 해당 위치에서만 이펙트 생성 및 숨김
        try {
          const pid = event.playerId;
          const pos = event.data || {};
          if (pid === this.myPlayerId) {
            this.playerHide();
            try {
              this.uiManager.destroyNameTag(pid);
            } catch {}
            try {
              (this.shootingManager as any)?.ammoGraphics?.setVisible?.(false);
            } catch {}
            // 내 사망 이펙트
            this.createParticleEffect(
              pos.x ?? this.getPlayerX(),
              pos.y ?? this.getPlayerY(),
              true
            );
          } else {
            const rp = this.remotePlayers.get(pid);
            if (rp) {
              // 체력바는 계속 표시되도록 isVisible은 true로 유지
              // 대신 체력을 0으로 설정하여 렌더링에서 처리
              rp.networkState.health = 0;
              rp.isVisible = false; // 가시성 상태도 false로 설정
              const refs = rp.gfxRefs;
              refs?.body?.setVisible?.(false);
              refs?.face?.setVisible?.(false);
              refs?.accessory?.setVisible?.(false);
              refs?.leftArm?.setVisible?.(false);
              refs?.rightArm?.setVisible?.(false);
              refs?.leftLeg?.setVisible?.(false);
              refs?.rightLeg?.setVisible?.(false);
              refs?.gun?.setVisible?.(false);
              try {
                this.uiManager.destroyNameTag(pid);
              } catch {}
              // 사망 시에도 체력바는 계속 표시

              // 원격 사망 이펙트: 해당 좌표에서만 생성
              this.createParticleEffect(
                pos.x ?? rp.lastPosition.x,
                pos.y ?? rp.lastPosition.y,
                true
              );
            }
          }
        } catch (e) {}
        break;

      case "alive":
        try {
          const pid = event.playerId;
          if (pid === this.myPlayerId) {
            this.playerShow();
            this.setInputEnabled(true);
            try {
              const myData = this.gameData?.players.find((p) => p.id === pid);
              if (myData) this.tryCreateNameTag(pid, myData.name);
              (this.shootingManager as any)?.ammoGraphics?.setVisible?.(true);
            } catch {}
          } else {
            const rp = this.remotePlayers.get(pid);
            if (rp) {
              rp.isVisible = true;
              rp.networkState.health = 100; // 부활 시 체력 복구
              const refs = rp.gfxRefs;
              refs?.body?.setVisible?.(true);
              refs?.face?.setVisible?.(true);
              refs?.accessory?.setVisible?.(true);
              refs?.leftArm?.setVisible?.(true);
              refs?.rightArm?.setVisible?.(true);
              refs?.leftLeg?.setVisible?.(true);
              refs?.rightLeg?.setVisible?.(true);
              refs?.gun?.setVisible?.(true);
              try {
                const rpData = this.gameData?.players.find((p) => p.id === pid);
                if (rpData) this.tryCreateNameTag(pid, rpData.name);
              } catch {}
            }
          }
        } catch (e) {}
        break;

      default:
        console.warn(`알 수 없는 게임 이벤트 타입: ${event.type}`);
    }
  }

  // ☆ 체력 업데이트 처리 (서버에서 받은 체력 동기화)
  private handleHealthUpdate(data: any): void {
    const { playerId, health, damage } = data;

    console.log(`💚 서버에서 체력 업데이트 수신:`, {
      playerId,
      health,
      damage,
    });

    if (playerId === this.myPlayerId) {
      const currentHealth = this.player.getHealth();
      const expectedHealth = health;

      // 서버 권위 체력 동기화 (서버 판정이 최우선)
      console.log(
        `💚 내 체력 동기화: ${currentHealth} -> ${expectedHealth} (서버 권위)`
      );

      // 체력을 직접 설정 (서버 값으로)
      this.player.setHealth(expectedHealth);

      // 서버에서 0 이하로 판정되면 강제 사망 처리
      if (expectedHealth <= 0) {
        console.log(`💀 서버 판정: 내 플레이어 사망 (체력 ${expectedHealth})`);
        this.setInputEnabled(false);
        this.playerHide();
      } else if (currentHealth <= 0 && expectedHealth > 0) {
        // 회복(리스폰) 시: 입력 활성화 + 캐릭터 표시
        console.log(`🔄 서버 판정: 내 플레이어 부활 (체력 ${expectedHealth})`);
        this.playerShow();
        this.setInputEnabled(true);
      }

      // 데미지 효과 (살아있을 때만)
      if (damage > 0 && expectedHealth > 0) {
        this.player.addWobble();
        this.player.setInvulnerable(1000);
      }

      console.log(`💚 내 체력 업데이트 완료: ${expectedHealth}/100`);

      // 디버그: 현재 모든 플레이어 체력 상태 출력
      this.logAllPlayerHealth();
    } else {
      // 원격 플레이어 체력 업데이트
      const remotePlayer = this.remotePlayers.get(playerId);
      if (remotePlayer) {
        const oldHealth = remotePlayer.networkState.health;
        remotePlayer.networkState.health = health;

        // 사망/부활 시 가시성 토글
        const shouldBeVisible = health > 0;
        remotePlayer.isVisible = shouldBeVisible;
        const refs = remotePlayer.gfxRefs;
        if (refs) {
          const vis = (v: boolean) => {
            refs.body?.setVisible?.(v);
            refs.face?.setVisible?.(v);
            refs.accessory?.setVisible?.(v);
            refs.leftArm?.setVisible?.(v);
            refs.rightArm?.setVisible?.(v);
            refs.leftLeg?.setVisible?.(v);
            refs.rightLeg?.setVisible?.(v);
            refs.gun?.setVisible?.(v);
          };
          vis(shouldBeVisible);

          // 사망/부활 로그
          if (health <= 0 && oldHealth > 0) {
            console.log(
              `💀 원격 플레이어 ${remotePlayer.name} 사망: 체력 ${health}`
            );
          } else if (health > 0 && oldHealth <= 0) {
            console.log(
              `🔄 원격 플레이어 ${remotePlayer.name} 부활: 체력 ${health}`
            );
          }
        }

        if (oldHealth !== health || damage > 0) {
          console.log(
            `💚 ${remotePlayer.name} 체력 업데이트: ${oldHealth} -> ${health}`
          );

          // 체력이 감소했으면 로그만 출력
          if (health < oldHealth) {
            console.log(
              `💚 ${remotePlayer.name} 체력 감소: ${oldHealth} -> ${health}`
            );
          }
        }

        // 디버깅: 원격 플레이어 체력 업데이트 확인
        console.log(
          `🔍 원격 플레이어 ${remotePlayer.name} 체력 업데이트 완료: ${health}/100`
        );
      } else {
        console.warn(`⚠️ 체력 업데이트할 플레이어를 찾을 수 없음: ${playerId}`);
      }
    }
  }

  // ☆ 플레이어 입장 처리
  private handlePlayerJoin(playerData: any): void {
    console.log(`👋 새 플레이어 입장: ${playerData.name}`);
    this.createRemotePlayer(playerData);

    // 로딩 모달 상태 업데이트
    this.updateLoadingModalState();
  }

  // ☆ 플레이어 퇴장 처리
  private handlePlayerLeave(playerId: string): void {
    if (this.remotePlayerManager.removeRemotePlayer(playerId)) {
      // 로딩 모달 상태 업데이트
      this.updateLoadingModalState();
    }
  }

  // ☆ 멀티플레이어 초기화 메서드 (네트워크 연결 추가)
  public initializeMultiplayer(gameData: GameData): void {
    // 이미 초기화 중이거나 완료된 경우 중복 실행 방지
    if (this.isMultiplayer || this.gameData) {
      console.log("⚠️ 멀티플레이어가 이미 초기화됨. 중복 실행 방지.", {
        isMultiplayer: this.isMultiplayer,
        hasGameData: !!this.gameData,
        isInitialized: this.isInitialized
      });
      return;
    }

    if (!this.isInitialized || !this.networkManager) {
      this.pendingMultiplayerData = gameData;
      console.log("⏳ Scene not ready. Queued multiplayer init.");
      return;
    }

    console.log("🎮 멀티플레이어 초기화:", gameData);

    this.gameData = gameData;
    this.myPlayerId = gameData.myPlayerId;
    this.isMultiplayer = true;
    this.expectedPlayerCount = gameData.players.length;

    // 스폰 포인트는 라운드/게임 시작 시 한 번만 초기화
    this.resetSpawnPoints();

    // 로딩 모달 열기
    this.isLoadingModalOpen = true;

    // ⭐ 네트워크 매니저 초기화
    this.networkManager.initialize(gameData.room.roomId, gameData.myPlayerId);
    // ⭐ 내 플레이어 데이터 찾기
    const myPlayerData = gameData.players.find((p) => p.id === this.myPlayerId);

    // 다른 플레이어들 생성
    gameData.players.forEach((playerData) => {
      if (playerData.id !== this.myPlayerId) {
        this.createRemotePlayer(playerData);
      }
    });

    // ⭐ 내 플레이어 설정
    if (myPlayerData) {
      this.setupMyPlayer(myPlayerData);
    }

    // ⭐ 플레이어 ID 설정 (중요!)
    if (this.player && this.myPlayerId) {
      this.player.setId(this.myPlayerId);
      console.log(`💚 플레이어 ID 설정: ${this.myPlayerId}`);
    }

    // ⭐ ShootingManager에 플레이어 ID 설정 (총알 소유자 식별용)
    if (this.shootingManager && this.myPlayerId) {
      this.shootingManager.setOwnerId(this.myPlayerId);
      console.log(`🔫 ShootingManager ownerId 설정: ${this.myPlayerId}`);
    }

    // UI에 플레이어 정보 표시
    this.updateMultiplayerUI();

    console.log(
      `✅ 멀티플레이어 초기화 완료 - 총 ${gameData.players.length}명`
    );
  }

  // 새로운 메서드
  private setupMyPlayer(playerData: GamePlayer): void {
    const spawns = this.mapRenderer.getSpawns();
    const planIndex = this.gameData?.spawnPlan?.[playerData.id];
    const serverSpawn = this.gameData?.spawnPositions?.[playerData.id];

    // 스폰 포인트 선택 (서버 제공 인덱스 우선)
    const spawnPoint = (() => {
      if (serverSpawn) return serverSpawn;
      const mode = this.gameData?.room.gameMode || "개인전";
      if (typeof planIndex === "number") {
        let candidates = spawns;
        if (mode === "팀전") {
          const teamName = playerData.team === 1 ? "A" : "B";
          const byTeam = spawns.filter((s: any) => s.name === teamName);
          if (byTeam.length > 0) candidates = byTeam;
        }
        return candidates.length > 0
          ? candidates[Math.abs(planIndex) % candidates.length]
          : spawns[0];
      }
      return (
        this.getOptimalSpawnPoint(
          spawns,
          mode,
          playerData.id,
          playerData.team
        ) || spawns[0]
      );
    })();

    // ⭐ 플레이어가 없으면 생성
    if (!this.player) {
      // 플레이어 생성 로직 (기존 create 메서드에서 플레이어 생성 부분 참조)
      console.log("🔧 플레이어가 없어서 새로 생성합니다.");
      // this.createPlayer(); // 플레이어 생성 메서드 호출
    }

    // ⭐ 스폰 위치 설정
    if (this.player && spawnPoint) {
      this.player.setPosition(spawnPoint.x, spawnPoint.y);
      this.player.setMultiplayerMode(true); // 멀티플레이어 모드 설정
      console.log(`✅ 내 플레이어 스폰: (${spawnPoint.x}, ${spawnPoint.y})`);
    }

    // 색상 설정
    this.setMyPlayerColor(playerData.color);
    this.player.accessory = playerData.accessory ?? "none";

    //내 플레이어 세팅 시 태그 만들기
    this.uiManager.createNameTag(playerData.id, playerData.name);
  }
  // ☆ 원격 플레이어 생성 (스폰 좌표 선택 후 RemotePlayerManager에 위임)
  private createRemotePlayer(playerData: GamePlayer): void {
    const spawns = this.mapRenderer.getSpawns();
    const planIndex = this.gameData?.spawnPlan?.[playerData.id];
    const serverSpawn = this.gameData?.spawnPositions?.[playerData.id];

    // 팀별 스폰 포인트 선택 (서버 제공 인덱스 우선)
    const spawnPoint = (() => {
      if (serverSpawn) return serverSpawn;
      const mode = this.gameData?.room.gameMode || "개인전";
      if (typeof planIndex === "number") {
        let candidates = spawns;
        if (mode === "팀전") {
          const teamName = playerData.team === 1 ? "A" : "B";
          const byTeam = spawns.filter((s: any) => s.name === teamName);
          if (byTeam.length > 0) candidates = byTeam;
        }
        return candidates.length > 0
          ? candidates[Math.abs(planIndex) % candidates.length]
          : spawns[0];
      }
      return (
        this.getOptimalSpawnPoint(
          spawns,
          mode,
          playerData.id,
          playerData.team
        ) || spawns[0]
      );
    })();

    this.remotePlayerManager.createRemotePlayer(playerData, spawnPoint);
  }

  // ☆ 내 플레이어 색상 설정
  private setMyPlayerColor(color: string): void {
    if (color && color !== "#888888") {
      const colorPreset = this.hexToColorPreset(color);
      this.player.setColorPreset(colorPreset);
      console.log(`🎨 내 플레이어 색상 설정: ${color} -> ${colorPreset}`);
    }
  }

  // ☆ 색상 코드를 프리셋으로 변환
  private hexToColorPreset(hexColor: string): ColorPresetKey {
    const colorMap: { [key: string]: ColorPresetKey } = {
      "#D76A6A": "빨간색",
      "#EE9841": "주황색",
      "#5A945B": "초록색",
      "#196370": "파란색",
      "#6C3FAF": "보라색",
      "#DF749D": "핑크색",
    };

    return colorMap[hexColor.toUpperCase()] || "기본";
  }

  // ☆ 로딩 모달 상태 업데이트
  private updateLoadingModalState(): void {
    if (!this.isLoadingModalOpen || !this.gameData) return;

    const currentPlayerCount = this.remotePlayers.size + 1; // 원격 플레이어 + 내 플레이어
    const expectedPlayerCount = this.expectedPlayerCount;

    console.log(`📊 로딩 상태: ${currentPlayerCount}/${expectedPlayerCount}`);

    // 모든 플레이어가 연결되면 로딩 모달 닫기
    if (currentPlayerCount >= expectedPlayerCount) {
      setTimeout(() => {
        this.isLoadingModalOpen = false;
        console.log("✅ 모든 플레이어 연결 완료 - 로딩 모달 닫힘");
      }, 2000); // 2초 후 닫기
    }
  }

  // 맵 시스템 초기화
  private async initializeMapSystem(mapKey?: MapKey): Promise<void> {
    this.mapRenderer = new MapRenderer(this);
    this.currentMapKey = mapKey || (GAME_SETTINGS.DEFAULT_MAP as MapKey);

    try {
      await this.mapRenderer.loadMapPreset(this.currentMapKey);
      this.platforms = this.mapRenderer.getPlatforms();
    } catch (error) {
      // 맵 로드 실패 처리
    }
  }

  // 매니저들 초기화
  private async initializeManagers(): Promise<void> {
    // 카메라 매니저
    this.cameraManager = new CameraManager(this, {
      follow: {
        enabled: true,
        lerpX: CAMERA_CONSTANTS.FOLLOW.LERP_X,
        lerpY: CAMERA_CONSTANTS.FOLLOW.LERP_Y,
        deadzone: {
          width: 50,
          height: 50,
        },
        offset: {
          x: CAMERA_CONSTANTS.FOLLOW.OFFSET_X,
          y: CAMERA_CONSTANTS.FOLLOW.OFFSET_Y,
        },
      },
      zoom: {
        default: CAMERA_CONSTANTS.ZOOM.DEFAULT,
        min: CAMERA_CONSTANTS.ZOOM.MIN,
        max: CAMERA_CONSTANTS.ZOOM.MAX,
        smooth: true,
        duration: CAMERA_CONSTANTS.ZOOM.SMOOTH_DURATION,
      },
      effects: {
        atmospheric: {
          enabled: false,
          intensity: 0.8,
          speed: 1.0,
        },
      },
    });

    const mapSize = this.mapRenderer.getMapSize();
    this.cameraManager.setBounds(0, 0, mapSize.width, mapSize.height);

    // UI 매니저
    this.uiManager = new UIManager(this, {
      position: {
        x: UI_CONSTANTS.POSITION.MARGIN,
        y: UI_CONSTANTS.POSITION.MARGIN,
        margin: UI_CONSTANTS.POSITION.LINE_HEIGHT,
      },
      styles: {
        defaultFont: UI_CONSTANTS.STYLES.DEFAULT_FONT,
        titleFont: UI_CONSTANTS.STYLES.TITLE_FONT,
        backgroundColor: UI_CONSTANTS.STYLES.BACKGROUND_COLOR,
        textColors: {
          title: UI_CONSTANTS.COLORS.WHITE,
          instruction: UI_CONSTANTS.COLORS.YELLOW,
          debug: UI_CONSTANTS.COLORS.ORANGE,
          status: UI_CONSTANTS.COLORS.GREEN,
          shadow: UI_CONSTANTS.COLORS.CYAN,
        },
        padding: {
          x: UI_CONSTANTS.POSITION.PADDING_X,
          y: UI_CONSTANTS.POSITION.PADDING_Y,
        },
      },
    });
    this.uiManager.initialize();
    // 디버그 텍스트 완전 제거를 위해 강제 재생성
    setTimeout(() => {
      this.uiManager.forceRecreate();
    }, 100);

    // 그림자 매니저
    this.shadowManager = new ShadowManager(this, this.mapRenderer);
    this.shadowManager.initialize();

    // ☆ 사격 매니저 초기화 (네트워크 연동)
    this.shootingManager = new ShootingManager(this, {
      fireRate: 300,
      damage: 25,
      accuracy: 0.95,
      recoil: 2.0,
      muzzleVelocity: 600, // 기본 속도 800 -> 600으로 감소
      magazineSize: 6,
      reloadTime: 1000,
    });
    this.shootingManager.initialize();

    // 플레이어 ID 설정 (총알 소유자 식별용)
    if (this.myPlayerId) {
      this.shootingManager.setOwnerId(this.myPlayerId);
    }

    // 사격 시스템 충돌 설정
    // 총알↔플랫폼 충돌은 CollisionSystem 한 곳에서만 처리 (유령/바운스 규칙 포함)

    // ☆ 사격 이벤트 콜백 설정 (네트워크 전송 추가)
    this.setupShootingCallbacks();

    // 입력 매니저 (마지막에 초기화 - 콜백 연결 후)
    this.inputManager = new InputManager(this);
    this.setupInputCallbacks();
    this.inputManager.initialize();

    // ☆ 디버그 렌더러 초기화 - 제거됨
    // this.debugRenderer = new DebugRenderer(this);

    // UI 상태 업데이트
    this.updateAllUI();

    // 🆕 ShootingManager에 증강 조회 연결
    try {
      this.shootingManager.setAugmentResolver((playerId: string) => {
        return this.augmentByPlayer.get(playerId);
      });
    } catch {}

    // 증강에 따른 플레이어 점프/중력 보정 적용 (로컬)
    try {
      const eff: any = this.getAugmentAggregatedEffectsForPlayer(
        this.myPlayerId || ""
      );
      if (eff && this.player) {
        (this.player as any).setJumpHeightMultiplier?.(
          eff.player.jumpHeightMul || 1
        );
        (this.player as any).setExtraJumps?.(eff.player.extraJumps || 0);
        (this.player as any).setGravityMultiplier?.(eff.player.gravityMul || 1);
        (this.player as any).setMoveSpeedMultiplier?.(
          eff.player.moveSpeedMul || 1
        );
        (this.player as any).setBlinkEnabled?.(!!eff.player.blink);
        if ((eff.player.maxHealthDelta || 0) !== 0) {
          try {
            this.player.setMaxHealth(100 + (eff.player.maxHealthDelta || 0));
          } catch {}
        }
      }
    } catch {}
  }

  // ☆ 사격 시스템 콜백 설정 (네트워크 전송 추가)
  private setupShootingCallbacks(): void {
    // ☆ 사격시 네트워크로 전송
    this.shootingManager.onShot((recoil) => {
      if (this.isMultiplayer && this.player) {
        const gunPos = this.player.getGunPosition();
        // 마우스 목표 위치 계산
        const mouseX = this.input?.pointer1?.worldX || gunPos.x;
        const mouseY = this.input?.pointer1?.worldY || gunPos.y;

        const shootData = {
          x: gunPos.x,
          y: gunPos.y,
          angle: gunPos.angle,
          gunX: gunPos.x,
          gunY: gunPos.y,
          targetX: mouseX, // 마우스 목표 위치 추가
          targetY: mouseY,
        };

        this.networkManager.sendShoot(shootData);
      }
    });

    // ☆ 명중시 네트워크로 충돌 데이터 전송 (CollisionSystem에서 처리하므로 비활성화)
    // this.shootingManager.onHit((x, y) => {
    //   // 충돌 지점에서 플레이어 검색
    //   const hitPlayerId = this.findPlayerAtPosition(x, y);
    //   if (hitPlayerId && this.isMultiplayer) {
    //     this.networkManager.sendBulletHit({
    //       bulletId: `bullet_${Date.now()}`,
    //       targetPlayerId: hitPlayerId,
    //       x: x,
    //       y: y,
    //       damage: 25,
    //     });
    //   }

    //   Debug.log.debug(LogCategory.GAME, `이알 명중: (${x}, ${y})`);
    // });
  }

  private initializePhysicsGroups(): void {
    // 이알 그룹 생성
    this.bulletGroup = this.physics.add.group({
      runChildUpdate: true,
      allowGravity: true,
    });

    // 플랫폼 그룹 생성
    this.platformGroup = this.physics.add.staticGroup();

    // 플랫폼들을 Physics Group에 추가
    this.platforms.forEach((platform, index) => {
      const rect = this.add.rectangle(
        platform.x + platform.width / 2,
        platform.y + platform.height / 2,
        platform.width,
        platform.height,
        0x00ff00,
        0
      );

      this.physics.add.existing(rect, true);
      const body = rect.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(platform.width, platform.height);
      body.setOffset(0, 0);
      body.updateFromGameObject();
      this.platformGroup.add(rect);
    });

    console.log(
      `✅ Physics Groups 초기화 완료: bullets=${this.bulletGroup.children.size}, platforms=${this.platformGroup.children.size}`
    );
  }

  private createPlayer(spawnData?: { x: number; y: number }): void {
    // 게임 시작 시 스폰 위치 초기화
    this.resetSpawnPoints();
    
    const spawns = this.mapRenderer.getSpawns();
    let defaultSpawn = PLAYER_CONSTANTS.DEFAULT_SPAWN;
    
    try {
      if (!spawnData) {
        const me = (this.gameData?.players || []).find(
          (p) => p.id === this.myPlayerId
        );
        const optimalSpawn = this.getOptimalSpawnPoint(
          spawns,
          this.gameData?.room.gameMode || "개인전",
          this.myPlayerId!,
          me?.team
        );
        if (optimalSpawn) {
          defaultSpawn = optimalSpawn;
        }
      }
    } catch {}
    
    const spawnX = spawnData?.x ?? defaultSpawn.x;
    const spawnY = spawnData?.y ?? defaultSpawn.y;

    this.player = new Player(this, spawnX, spawnY, this.platforms, "기본");

    // 낙하 데미지 콜백 설정
    this.player.onFalloutDamage = (damage: number) => {
      if (this.networkManager && this.myPlayerId) {
        console.log(`💥 낙하 데미지 서버 전송: ${damage}`);
        this.networkManager.sendBulletHit({
          bulletId: `fallout_${Date.now()}`,
          targetPlayerId: this.myPlayerId,
          damage: damage,
          x: this.player.getPosition().x,
          y: this.player.getPosition().y,
        });
      }
    };

    // 멀티플레이어 모드 설정
    this.player.setMultiplayerMode(this.isMultiplayer);

    this.cameraManager.setFollowTarget(this.player as any);
  }

  private processAdditionalData(data?: any): void {
    if (!data) return;

    if (data.platforms) {
      this.platforms.push(...data.platforms);
    }

    if (data.bullets) {
      this.bullets.push(...data.bullets);
      // 디버그 총알 로드 로그 비활성화
      // Debug.log.debug(
      //   LogCategory.GAME,
      //   `추가 이알 ${data.bullets.length}개 로드됨`
      // );
    }
  }

  private setupInputCallbacks(): void {
    // 맵 전환 콜백
    this.inputManager.onMapChange(async (mapKey: string) => {
      await this.switchMap(mapKey as MapKey);
    });

    // 색상 변경 콜백
    this.inputManager.onColorChange((color: string) => {
      const colorKey = this.getColorPresetKey(color);
      (this.player as any)?.setColorPreset?.(colorKey);
      // 디버그 색상 변경 로그 비활성화
      // Debug.log.info(LogCategory.PLAYER, "색상 변경", color);
    });

    // 그림자 콜백들
    this.inputManager.onShadowAngleChange((angle: number) => {
      this.shadowManager.setLightAngle(angle);
    });

    this.inputManager.onShadowAnimate(() => {
      this.shadowManager.startDayCycleAnimation();
    });

    this.inputManager.onShadowToggle(() => {
      this.shadowManager.toggleShadows();
    });

    this.inputManager.onShadowPreset((preset: string) => {
      this.shadowManager.applyPreset(preset as ShadowPresetKey);
    });

    // UI 업데이트 콜백
    // UI 업데이트는 필요시에만

    // 입력 콜백 설정 완료
    // Debug.log.debug(LogCategory.INPUT, "입력 콜백 설정 완료");
  }

  private getColorPresetKey(colorName: string): ColorPresetKey {
    const colorMap: { [key: string]: ColorPresetKey } = {
      빨간색: "빨간색",
      주황색: "주황색",
      초록색: "초록색",
      파란색: "파란색",
      보라색: "보라색",
      핑크색: "핑크색",
      기본: "기본",
    };

    return colorMap[colorName] || "기본";
  }

  update(time: number, deltaTime: number): void {
    if (
      !this.isInitialized ||
      this.sceneState !== GAME_STATE.SCENE_STATES.RUNNING
    ) {
      return;
    }

    const dt = deltaTime / 1000;

    this.lighting?.update(deltaTime);
    // 총알/섬광이 있으면 그쪽을 광원으로 플랫폼 그림자 방향이 바뀜
    this.mapRenderer?.setShadowPointLight(this.lighting?.getDominantLight() ?? null);

    // 플레이어 업데이트
    if (this.player && this.player.update) {
      this.player.update(deltaTime);

      // ☆ 멀티플레이어 모드에서 내 플레이어 움직임 전송
      if (this.isMultiplayer) {
        this.sendMyPlayerMovement();
      }

      // ☆ 멀티플레이어 모드에서 내 포즈 전송(20Hz)
      if (this.isMultiplayer && this.player && this.networkManager) {
        this.networkManager.maybeSendPose(() => {
          const gun = this.player.getGunPosition(); // { x, y, angle }
          const st = this.player.getState();
          const mouseX = this.input?.pointer1?.worldX || gun.x;
          const mouseY = this.input?.pointer1?.worldY || gun.y;
          return {
            id: this.myPlayerId!,
            angle: gun.angle, // 라디안 그대로
            facing: st.facingDirection, // "left" | "right"
            mouseX: mouseX,
            mouseY: mouseY,
            t: Date.now(),
          };
        });
      }

      // ☆ 로컬 플레이어 파티클 전송 (콜백 방식으로 변경)
      if (this.isMultiplayer && this.networkManager) {
        // Player의 파티클 콜백 설정
        this.player.onParticleCreated = (
          type: string,
          x: number,
          y: number,
          color: number
        ) => {
          this.networkManager.sendParticle({
            type: type,
            x: x,
            y: y,
            color: color,
            playerId: this.myPlayerId,
          });
        };
      }
    }

    // ☆ 원격 플레이어들 업데이트 및 보간
    this.remotePlayerManager.updateRemotePlayers(deltaTime);

    // === [닉네임 태그 위치 갱신] =====================================
    // 내 플레이어: Player.getBounds()를 이용해 HP바 상단 근사치 계산
    if (this.player && this.myPlayerId && this.player.getHealth() > 0) {
      const b = this.player.getBounds();
      const x = b.x + b.width / 2;
      const hpBarTopY = b.y - 8;
      this.uiManager.updateNameTagPosition(this.myPlayerId, x, hpBarTopY);
    }

    // 원격 플레이어들: 현재 렌더 기준 좌표 사용 (사망자는 스킵)
    this.remotePlayers.forEach((rp) => {
      if (!rp.networkState || rp.networkState.health <= 0 || !rp.isVisible)
        return;
      const x = rp.lastPosition.x;
      const hpBarTopY = rp.lastPosition.y - 25;
      this.uiManager.updateNameTagPosition(rp.id, x, hpBarTopY);
    });

    // 그림자 시스템 업데이트
    if (this.mapRenderer) {
      this.mapRenderer.updateShadows();

      // 🎨 패럴랙스 배경 효과를 위한 플레이어 위치 업데이트
      if (this.player) {
        const playerState = this.player.getState();
        this.mapRenderer.updatePlayerPosition(
          playerState.position.x,
          playerState.position.y
        );
      }
    }

    // 사격 시스템 업데이트
    if (this.shootingManager) {
      this.shootingManager.update(); // 총알 업데이트 추가
    }

    // ☆ 디버그 렌더러 업데이트 - 제거됨
    // if (this.debugRenderer) {
    //   this.debugRenderer.update();
    // }

    // 게임 로직 업데이트
    this.updateGameLogic();

    // 퍼포먼스 모니터링
    this.updatePerformanceMonitoring(time, deltaTime);

    // 주기적 작업들
    this.updatePeriodicTasks(time, deltaTime);
  }

  // ☆ 내 플레이어 움직임 네트워크 전송
  private sendMyPlayerMovement(): void {
    if (!this.player || !this.networkManager) return;

    const playerState = this.player.getState();
    const movementData = {
      x: playerState.position.x,
      y: playerState.position.y,
      vx: playerState.velocity.x,
      vy: playerState.velocity.y,
      facing: playerState.facingDirection,
      isGrounded: playerState.isGrounded,
      isJumping: playerState.isJumping,
      isCrouching: playerState.isCrouching,
      isWallGrabbing: playerState.isWallGrabbing,
      // 체력은 healthUpdate 이벤트에서만 관리
    };

    this.networkManager.sendPlayerMovement(movementData);
  }

  private updateGameLogic(): void {
    this.cullBulletsOutsideViewport();
    this.clampPlayerInsideWorld();
    // 충돌 처리는 CollisionSystem에서 담당하므로 비활성화
    // this.detectBulletHitsAgainstPlayers();
    this.cleanupRemoteBullets();
  }

  private updatePeriodicTasks(time: number, deltaTime: number): void {
    // 디버그 게임 상태 로깅 비활성화
    // if (
    //   Debug.isEnabled() &&
    //   time % PERFORMANCE_CONSTANTS.UPDATE_INTERVALS.EVERY_5_SECONDS < deltaTime
    // ) {
    //   Debug.logGameState(this.player, this.cameraManager.getCameraInfo(), {
    //     key: this.currentMapKey,
    //     size: this.mapRenderer?.getMapSize(),
    //     platforms: this.platforms,
    //   });
    // }

    // 10초마다 메모리 체크
    if (
      time % PERFORMANCE_CONSTANTS.UPDATE_INTERVALS.EVERY_10_SECONDS <
      deltaTime
    ) {
      // debugManager.checkMemoryUsage();
    }
  }

  private updateAllUI(): void {
    if (!this.uiManager) return;

    // 맵 상태 업데이트
    const currentMap = this.mapRenderer?.getCurrentMap();
    if (currentMap) {
      this.uiManager.updateMapStatus(
        this.currentMapKey,
        currentMap.meta.name || currentMap.meta.key
      );
    }

    // 그림자 상태 업데이트
    const shadowStatus = this.shadowManager?.getShadowStatus();
    if (shadowStatus?.config) {
      this.uiManager.updateShadowStatus(shadowStatus.config);
    }

    // 디버그 UI 업데이트 로그 비활성화
    // Debug.log.trace(LogCategory.UI, "모든 UI 업데이트됨");
  }

  // 맵 전환
  private async switchMap(mapKey: MapKey): Promise<void> {
    if (mapKey === this.currentMapKey) return;

    if (!GAME_SETTINGS.AVAILABLE_MAPS.includes(mapKey)) {
      return;
    }
    this.sceneState = GAME_STATE.SCENE_STATES.TRANSITION;

    try {
      // 맵 전환
      this.currentMapKey = mapKey;
      await this.mapRenderer?.loadMapPreset(mapKey);
      this.platforms = this.mapRenderer?.getPlatforms() || [];

      // 카메라 바운드 업데이트
      const mapSize = this.mapRenderer.getMapSize();
      this.cameraManager.setBounds(0, 0, mapSize.width, mapSize.height);

      // 플레이어 위치 리셋
      this.resetPlayerPosition();

      // 그림자 강제 업데이트
      this.shadowManager.forceUpdate();

      // UI 업데이트
      this.updateAllUI();

      this.sceneState = GAME_STATE.SCENE_STATES.RUNNING;
    } catch (error) {
      this.sceneState = GAME_STATE.SCENE_STATES.ERROR;
    }
  }

  private resetPlayerPosition(): void {
    const spawns = this.mapRenderer?.getSpawns() || [];
    const playerSpawn =
      spawns.find((s) => s.name === "A") ||
      spawns[0] ||
      PLAYER_CONSTANTS.DEFAULT_SPAWN;

    if (this.player) {
      (this.player as any).setPosition?.(playerSpawn.x, playerSpawn.y);
      (this.player as any).resetVelocity?.();
      (this.player as any).updatePlatforms?.(this.platforms);
    }
  }

  private clampPlayerInsideWorld(): void {
    if (!this.player) return;

    const mapSize = this.mapRenderer.getMapSize();

    let px = this.getPlayerX();
    let py = this.getPlayerY();
    let clamped = false;

    // X축 경계 체크
    if (px - PLAYER_CONSTANTS.SIZE.HALF_WIDTH < 0) {
      px = PLAYER_CONSTANTS.SIZE.HALF_WIDTH;
      clamped = true;
    } else if (px + PLAYER_CONSTANTS.SIZE.HALF_WIDTH > mapSize.width) {
      px = mapSize.width - PLAYER_CONSTANTS.SIZE.HALF_WIDTH;
      clamped = true;
    }

    // Y축 경계 체크
    if (py - PLAYER_CONSTANTS.SIZE.HALF_HEIGHT < 0) {
      py = PLAYER_CONSTANTS.SIZE.HALF_HEIGHT;
      clamped = true;
    } else if (py + PLAYER_CONSTANTS.SIZE.HALF_HEIGHT > mapSize.height) {
      py = mapSize.height - PLAYER_CONSTANTS.SIZE.HALF_HEIGHT;
      clamped = true;
    }

    if (clamped) {
      this.setPlayerPosition(px, py);
      this.stopPlayerVelocityAtBounds(px, py, mapSize);
    }
  }

  private stopPlayerVelocityAtBounds(
    px: number,
    py: number,
    mapSize: { width: number; height: number }
  ): void {
    const p: any = this.player;

    // 바닥 경계 Y
    const bottomY = mapSize.height - PLAYER_CONSTANTS.SIZE.HALF_HEIGHT;

    // 바닥에 닿은 순간: 데미지 + 위로 튕김, 그리고 경계선 바로 안쪽으로 위치 조정
    if (py >= bottomY) {
      (this.player as any).applyBottomBoundaryHit?.(0.3, 600); // 30%, 600px/s 튕김
      this.setPlayerPosition(px, bottomY - 1); // 경계선 살짝 위로
      return; // 아래 '속도 0' 로직 건너뜀
    }

    // 플레이어 경계 검사 (통합된 헬퍼 함수 사용)
    this.checkPlayerBoundaries(p, px, py, mapSize);
  }

  // 플레이어 위치 접근 헬퍼
  private getPlayerX(): number {
    if (!this.player) return PLAYER_CONSTANTS.DEFAULT_SPAWN.x;
    if (typeof this.player.getX === "function") return this.player.getX();
    if ((this.player as any).x !== undefined) return (this.player as any).x;
    return PLAYER_CONSTANTS.DEFAULT_SPAWN.x;
  }

  private getPlayerY(): number {
    if (!this.player) return PLAYER_CONSTANTS.DEFAULT_SPAWN.y;
    if (typeof this.player.getY === "function") return this.player.getY();
    if ((this.player as any).y !== undefined) return (this.player as any).y;
    return PLAYER_CONSTANTS.DEFAULT_SPAWN.y;
  }

  private setPlayerPosition(x: number, y: number): void {
    if (!this.player) return;
    if (typeof this.player.setPosition === "function") {
      this.player.setPosition(x, y);
    } else {
      const p = this.player as any;
      if (p.x !== undefined) p.x = x;
      if (p.y !== undefined) p.y = y;
    }
  }

  // ===== 공개 API 메서드들 =====
  public addPlatform(platform: Platform): void {
    this.platforms.push(platform);
    // 디버그 플랫폼 추가 로그 비활성화
    // Debug.log.debug(LogCategory.MAP, "플랫폼 추가됨", platform);
  }

  public addBullet(bullet: Bullet): void {
    this.bullets.push(bullet);
    // 디버그 총알 추가 로그 비활성화
    // Debug.log.debug(LogCategory.GAME, "이알 추가됨", bullet);
  }

  public removeBullet(id: string): void {
    const bullet = this.bullets.find((b) => b.id === id);
    if (bullet && "gameObject" in bullet && bullet.gameObject) {
      (bullet.gameObject as any).destroy();
    }
    this.bullets = this.bullets.filter((b) => b.id !== id);
    // 디버그 총알 제거 로그 비활성화
    // Debug.log.debug(LogCategory.GAME, "이알 제거됨", { id });
  }

  // Getter 메서드들
  public getCamera() {
    return this.cameraManager.getCameraInfo();
  }
  public getPlayer(): Player {
    return this.player;
  }
  public getPlatforms(): Platform[] {
    return this.platforms;
  }
  public getBullets(): Bullet[] {
    return this.bullets;
  }
  public getMapRenderer(): MapRenderer {
    return this.mapRenderer;
  }
  public getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }
  public getCurrentMapKey(): MapKey {
    return this.currentMapKey;
  }
  public getSceneState(): any {
    return this.sceneState;
  }

  // ☆ 멀티플레이어 관련 Getter들
  public getRemotePlayers(): Map<string, RemotePlayer> {
    return this.remotePlayers;
  }

  // 로딩 모달 상태 getter
  public getLoadingModalState(): {
    isOpen: boolean;
    currentPlayers: number;
    expectedPlayers: number;
    roomName: string;
  } {
    return {
      isOpen: this.isLoadingModalOpen,
      currentPlayers: this.remotePlayers.size + 1,
      expectedPlayers: this.expectedPlayerCount,
      roomName: this.gameData?.room.roomName || "Unknown Room",
    };
  }
  public getMyPlayerId(): string | null {
    return this.myPlayerId;
  }
  public getGameData(): GameData | null {
    return this.gameData;
  }
  public isMultiplayerMode(): boolean {
    return this.isMultiplayer;
  }
  public getNetworkManager(): NetworkManager {
    return this.networkManager;
  }

  // 매니저 접근자들
  public getInputManager(): InputManager {
    return this.inputManager;
  }
  public getUIManager(): UIManager {
    return this.uiManager;
  }
  public getCameraManager(): CameraManager {
    return this.cameraManager;
  }
  public getShadowManager(): ShadowManager {
    return this.shadowManager;
  }
  public getShootingManager(): ShootingManager {
    return this.shootingManager;
  }

  // 파티클 효과
  public createParticleEffect(
    x: number,
    y: number,
    fancy: boolean = false
  ): void {
    // 씬 상태 확
    if (
      !this.scene ||
      !this.scene.add ||
      this.sceneState !== GAME_STATE.SCENE_STATES.RUNNING
    ) {
      console.warn("씬이 준비되지 않아 파티클 효과 생성 건너뜀");
      return;
    }

    try {
      if (fancy) {
        this.particleSystem.createFancyParticleExplosion(x, y);
      } else {
        // 플레이어 색상을 가져와서 파티클에 적용
        const playerColor = this.player?.getCurrentPreset
          ? (CHARACTER_PRESETS as any)[this.player.getCurrentPreset()]?.head ||
            0xee9841
          : 0xee9841;
        this.particleSystem.createParticleExplosion(x, y, playerColor);
      }
    } catch (error) {
      console.warn("파티클 효과 생성 중 오류:", error);
    }
  }

  // 맵 전환
  public async changeMap(mapKey: MapKey): Promise<void> {
    await this.switchMap(mapKey);
  }

  // UI 제어
  public toggleUI(): boolean {
    // UI 토글 기능은 필요시 구현
    return true;
  }
  public setUIVisible(visible: boolean): void {
    this.uiManager.setVisible(visible);
  }

  // 카메라 제어
  public panCameraTo(x: number, y: number, duration?: number): void {
    this.cameraManager.panTo(
      x,
      y,
      duration || CAMERA_CONSTANTS.PAN.DEFAULT_DURATION
    );
  }
  public shakeCamera(duration?: number, intensity?: number): void {
    this.cameraManager.shake(
      duration || CAMERA_CONSTANTS.SHAKE.DEFAULT_DURATION,
      intensity || CAMERA_CONSTANTS.SHAKE.DEFAULT_INTENSITY
    );
  }

  // 그림자 제어
  public setShadowPreset(preset: ShadowPresetKey): boolean {
    return this.shadowManager.applyPreset(preset);
  }
  public startShadowAnimation(): void {
    this.shadowManager.startDayCycleAnimation();
  }
  public stopShadowAnimation(): void {
    this.shadowManager.stopAnimation();
  }

  // 사격 시스템 제어
  public forceReload(): void {
    this.shootingManager?.forceReload();
  }

  public getAmmoStatus(): {
    current: number;
    max: number;
    isReloading: boolean;
  } {
    return {
      current: 0,
      max: 0,
      isReloading: false,
    };
  }

  // 입력 제어
  public setInputEnabled(enabled: boolean): void {
    this.inputManager?.setEnabled(enabled);
    if (this.player) this.player.inputLocked = !enabled;
  }

  // 화면 크기 변경 처리
  public resize(width: number, height: number): void {
    this.mapRenderer?.handleResize?.(width, height);
    this.cameraManager?.handleResize(width, height);
    this.uiManager?.handleResize(width, height);
    // this.shadowManager?.handleResize(width, height);
    this.shootingManager?.handleResize(width, height);
  }

  // 게임 상태 관리
  public pauseGame(): void {
    this.scene.pause();
    this.setInputEnabled(false);
    this.sceneState = GAME_STATE.SCENE_STATES.PAUSED;
  }

  public resumeGame(): void {
    this.scene.resume();
    this.setInputEnabled(true);
    this.sceneState = GAME_STATE.SCENE_STATES.RUNNING;
  }

  public resetScene(): void {
    this.sceneState = GAME_STATE.SCENE_STATES.TRANSITION;

    // 현재 맵 다시 로드
    this.changeMap(this.currentMapKey);
  }

  // 디버그 정보 가져오기
  public getDebugInfo() {
    return {
      scene: {
        name: this.scene.key,
        state: this.sceneState,
        isMultiplayer: this.isMultiplayer,
        playerCount: this.remotePlayers.size + 1,
      },
      constants: {
        gravity: this.physics.world.gravity.y,
      },
    };
  }

  // 개발자 도구
  public getDevTools() {
    const shootingTools = this.shootingManager?.getDebugTools();
    const networkTools = this.networkManager?.getDevTools();

    return {
      // 기존 도구들
      teleportPlayer: (x: number, y: number) => {
        this.setPlayerPosition(x, y);
      },

      logFullState: () => {
        this.logAllDebugInfo();
      },

      // 멀티플레이어 디버그 도구들
      listRemotePlayers: () => {
        const playerIds = Array.from(this.remotePlayers.keys());
        for (let i = 0; i < playerIds.length; i++) {
          const playerId = playerIds[i];
          const remote = this.remotePlayers.get(playerId);
          if (!remote) continue;
        }
      },

      forceNetworkSync: () => {
        if (this.isMultiplayer) {
          this.networkManager.forceSyncMovement({
            x: this.getPlayerX(),
            y: this.getPlayerY(),
            vx: 0,
            vy: 0,
            facing: "right",
            isGrounded: true,
            isJumping: false,
            isCrouching: false,
            isWallGrabbing: false,
            health: 100, // 기본 체력값 사용
          });
        }
      },
    };
  }

  // 모든 매니저의 디버그 정보 출력
  public logAllDebugInfo(): void {
    // 디버그 로깅 비활성화
    return;
  }

  // Phaser Scene 생명주기 - shutdown
  private lighting?: LightingSystem;
  private hasShutDown = false;
  shutdown(): void {
    // SHUTDOWN/DESTROY 둘 다 올 수 있으므로 한 번만
    if (this.hasShutDown) return;
    this.hasShutDown = true;
    try {
      this.lighting?.destroy();
      this.cameras?.main?.postFX?.clear();
    } catch {}
    this.lighting = undefined;

    // 상태 변경
    this.sceneState = GAME_STATE.SCENE_STATES.LOADING;

    //모든 이름표 정리
    this.uiManager?.destroyAllNameTags();

    // ☆ 네트워크 매니저 정리
    try {
      this.networkManager?.destroy();
    } catch (error) {
      // 네트워크 매니저 정리 중 에러
    }

    // ☆ 원격 플레이어들 정리
    try {
      this.remotePlayerManager.destroyAll();
    } catch (error) {
      // 원격 플레이어 정리 중 에러
    }

    // ☆ 충돌 시스템 정리
    try {
      this.collisionSystem?.destroy();
    } catch (error) {
      // 충돌 시스템 정리 중 에러
    }

    // 매니저들 정리 (순서 중요)
    try {
      this.shootingManager?.destroy();
      this.inputManager?.destroy();
      this.shadowManager?.destroy();
      this.uiManager?.destroy();
      // this.debugRenderer?.destroy(); // ☆ 디버그 렌더러 정리 - 제거됨
    } catch (error) {
      // 매니저 정리 중 에러
    }

    // 게임 오브젝트들 정리
    try {
      if (this.mapRenderer) {
        this.mapRenderer.destroy();
      }

      // 이알들 정리
      this.bullets.forEach((bullet) => {
        if ("gameObject" in bullet && bullet.gameObject) {
          (bullet.gameObject as any).destroy();
        }
      });
      this.bullets = [];
    } catch (error) {
      // 게임 오브젝트 정리 중 에러
    }

    // 상태 초기화
    this.isInitialized = false;
    this.frameCount = 0;
    this.performanceTimer = 0;
    this.isMultiplayer = false;
    this.myPlayerId = null;
    this.gameData = null;
  }

  // 디버그 도구들
  public getDebugTools() {
    return {
      // 테스트 기능들 제거
      // spawnTestObjects, stressTest, createTestRemotePlayer, simulateTestBullet 제거
    };
  }

  // 🆕 안전한 이름표 생성 헬퍼
  private canCreateText(): boolean {
    const add: any = (this as any)?.add;
    const isActive = (this as any)?.sys?.isActive?.() ?? true;
    return !!(
      add &&
      typeof add.text === "function" &&
      isActive &&
      this.sceneState === GAME_STATE.SCENE_STATES.RUNNING
    );
  }

  private tryCreateNameTag(playerId: string, name: string): void {
    if (!this.uiManager) return;
    if (this.canCreateText()) {
      this.uiManager.createNameTag(playerId, name);
    } else {
      setTimeout(() => {
        if (this.canCreateText()) {
          this.uiManager.createNameTag(playerId, name);
        }
      }, 50);
    }
  }
  private playerHide(): void {
    try {
      (this.player as any)?.setVisible?.(false);
    } catch {}
  }

  private playerShow(): void {
    try {
      (this.player as any)?.setVisible?.(true);
    } catch {}
  }

  // 플레이어 경계 검사 헬퍼
  private checkPlayerBoundaries(
    p: any,
    px: number,
    py: number,
    mapSize: { width: number; height: number }
  ): void {
    const leftBound = PLAYER_CONSTANTS.SIZE.HALF_WIDTH;
    const rightBound = mapSize.width - PLAYER_CONSTANTS.SIZE.HALF_WIDTH;
    const topBound = PLAYER_CONSTANTS.SIZE.HALF_HEIGHT;
    const bottomBound = mapSize.height - PLAYER_CONSTANTS.SIZE.HALF_HEIGHT;

    // Phaser 물리 시스템 사용 시
    if (p.body && p.body.velocity) {
      if (px <= leftBound && p.body.velocity.x < 0) {
        p.body.setVelocityX(0);
      }
      if (px >= rightBound && p.body.velocity.x > 0) {
        p.body.setVelocityX(0);
      }
      if (py <= topBound && p.body.velocity.y < 0) {
        p.body.setVelocityY(0);
      }
      if (py >= bottomBound && p.body.velocity.y > 0) {
        p.body.setVelocityY(0);
      }
    } else {
      // 커스텀 속도 시스템 사용 시
      if (p.vx !== undefined) {
        if (px <= leftBound && p.vx < 0) p.vx = 0;
        if (px >= rightBound && p.vx > 0) p.vx = 0;
      }
      if (p.vy !== undefined) {
        if (py <= topBound && p.vy < 0) p.vy = 0;
        if (py >= bottomBound && p.vy > 0) p.vy = 0;
      }
      if (p.velocity) {
        if (px <= leftBound && p.velocity.x < 0) p.velocity.x = 0;
        if (px >= rightBound && p.velocity.x > 0) p.velocity.x = 0;
        if (py <= topBound && p.velocity.y < 0) p.velocity.y = 0;
        if (py >= bottomBound && p.velocity.y > 0) p.velocity.y = 0;
      }
    }
  }

  // 🆕 모든 플레이어 체력 상태 로깅 (디버그용)
  private logAllPlayerHealth(): void {
    console.log("=== 모든 플레이어 체력 상태 ===");

    // 내 체력
    if (this.player) {
      const myHealth = this.player.getHealth();
      console.log(`💚 내 체력: ${myHealth}/100`);
    }

    // 원격 플레이어들 체력
    this.remotePlayers.forEach((remotePlayer, playerId) => {
      const health = remotePlayer.networkState.health;
      const name = remotePlayer.name || playerId;
      console.log(`💚 ${name}: ${health}/100`);
    });

    console.log("=============================");
  }

  // 🆕 라운드 사이 상태 설정 (RoundsGame에서 호출)
  public setBetweenRounds(value: boolean): void {
    this.isBetweenRounds = value;
  }

  // 스폰 위치 초기화 (게임 시작 시 또는 라운드 재시작 시 호출)
  public resetSpawnPoints(): void {
    this.usedSpawnPoints.clear();
  }

  // 스폰 위치 최적화를 위한 새로운 메서드
  private getOptimalSpawnPoint(
    spawns: any[],
    gameMode: string,
    playerId: string,
    team?: number
  ): any {
    if (spawns.length === 0) return null;

    if (gameMode === "팀전") {
      // 팀전: 팀별로 스폰 포인트 분산
      const teamSpawns = spawns.filter((s) => s.name === (team === 1 ? "A" : "B"));
      if (teamSpawns.length === 0) return spawns[0];

      // 사용되지 않은 팀 스폰 위치 우선 선택
      const availableTeamSpawns = teamSpawns.filter((spawn, index) => {
        const spawnKey = `${spawn.name}_${spawns.indexOf(spawn)}`;
        return !this.usedSpawnPoints.has(spawnKey);
      });

      if (availableTeamSpawns.length > 0) {
        // 사용 가능한 스폰 중에서 가장 멀리 떨어진 것 선택
        const selectedSpawn = this.getFarthestSpawnFromOthers(availableTeamSpawns, availableTeamSpawns[0]);
        // 선택된 스폰 위치를 사용된 것으로 표시
        const spawnKey = `${selectedSpawn.name}_${spawns.indexOf(selectedSpawn)}`;
        this.usedSpawnPoints.add(spawnKey);
        return selectedSpawn;
      }

      // 모든 팀 스폰이 사용 중이면 거리 기반으로 최적화
      const fallbackSpawn = this.getFarthestSpawnFromOthers(teamSpawns, teamSpawns[0]);
      const spawnKey = `${fallbackSpawn.name}_${spawns.indexOf(fallbackSpawn)}`;
      this.usedSpawnPoints.add(spawnKey);
      return fallbackSpawn;
    } else {
      // 개인전: 사용되지 않은 스폰 위치 우선 선택
      const availableSpawns = spawns.filter((spawn, index) => {
        const spawnKey = `${spawn.name}_${index}`;
        return !this.usedSpawnPoints.has(spawnKey);
      });

      if (availableSpawns.length > 0) {
        // 사용 가능한 스폰 중에서 가장 멀리 떨어진 것 선택
        const selectedSpawn = this.getFarthestSpawnFromOthers(availableSpawns, availableSpawns[0]);
        // 선택된 스폰 위치를 사용된 것으로 표시
        const spawnKey = `${selectedSpawn.name}_${spawns.indexOf(selectedSpawn)}`;
        this.usedSpawnPoints.add(spawnKey);
        return selectedSpawn;
      }

      // 모든 스폰이 사용 중이면 거리 기반으로 최적화
      const fallbackSpawn = this.getFarthestSpawnFromOthers(spawns, spawns[0]);
      const spawnKey = `${fallbackSpawn.name}_${spawns.indexOf(fallbackSpawn)}`;
      this.usedSpawnPoints.add(spawnKey);
      return fallbackSpawn;
    }
  }

  // 다른 플레이어들과 가장 멀리 떨어진 스폰 위치를 찾는 메서드
  private getFarthestSpawnFromOthers(availableSpawns: any[], preferredSpawn: any): any {
    if (availableSpawns.length <= 1) return preferredSpawn;

    // 현재 활성화된 플레이어들의 위치 수집
    const activePositions: { x: number; y: number }[] = [];
    
    // 내 플레이어 위치 추가
    if (this.player) {
      const myPos = this.player.getPosition();
      activePositions.push({ x: myPos.x, y: myPos.y });
    }
    
    // 원격 플레이어들의 위치 추가
    this.remotePlayers.forEach((remotePlayer) => {
      if (remotePlayer.isVisible) {
        activePositions.push({
          x: remotePlayer.lastPosition.x,
          y: remotePlayer.lastPosition.y
        });
      }
    });

    // 활성 플레이어가 없으면 선호하는 스폰 위치 반환
    if (activePositions.length === 0) return preferredSpawn;

    // 각 스폰 위치에서 활성 플레이어들과의 최소 거리 계산
    let bestSpawn = preferredSpawn;
    let maxMinDistance = 0;

    availableSpawns.forEach((spawn) => {
      let minDistance = Infinity;
      
      activePositions.forEach((pos) => {
        const distance = Math.sqrt(
          Math.pow(spawn.x - pos.x, 2) + Math.pow(spawn.y - pos.y, 2)
        );
        minDistance = Math.min(minDistance, distance);
      });

      // 더 멀리 떨어진 스폰 위치를 선택
      if (minDistance > maxMinDistance) {
        maxMinDistance = minDistance;
        bestSpawn = spawn;
      }
    });

    return bestSpawn;
  }

  // 라운드 결과/증강 선택 등 전투 비활성 구간 여부
  private isBetweenRounds: boolean = false;
  // 퍼포먼스 모니터링
  private performanceTimer: number = 0;
  private frameCount: number = 0;
  // ☆ 이알 충돌 처리
  private handleBulletHit(hitData: any): void {
    // 충돌 파티클
    this.createParticleEffect(hitData.x, hitData.y, true);

    if (hitData.targetPlayerId === this.myPlayerId) {
      // 내가 맞은 경우 - 서버에서 체력 업데이트를 기다림
      this.shakeCamera(200, 0.01);
      // 슬로우/스턴 등 상태이상 로컬 연출 (서버도 방송함)
      // 끈적여요: 슬로우
      try {
        const aug = this.augmentByPlayer.get(hitData.attackerId || "") || {};
        const defs: any[] = [] as any;
        // 서버가 상태이상 방송을 해주므로 여기서는 보수적으로 UI 연출만 유지
      } catch {}
    } else {
      // 원격 플레이어가 맞은 경우 - 서버에서 체력 업데이트를 기다림
      const rp = this.remotePlayers.get(hitData.targetPlayerId);
      if (rp) {
        console.log(
          `💥 원격 플레이어 ${rp.name} 맞음: ${hitData.damage} (서버에서 체력 업데이트 대기)`
        );
      }
    }
  }

  // ☆ 멀티플레이어 UI 업데이트
  private updateMultiplayerUI(): void {
    if (!this.gameData || !this.uiManager) return;

    const playerCount = this.gameData.players.length;
    const roomName = this.gameData.room.roomName;
  }

  private updatePerformanceMonitoring(time: number, deltaTime: number): void {
    this.frameCount++;

    // 경고 임계값 체크
    if (deltaTime > PERFORMANCE_CONSTANTS.UPDATE_INTERVALS.EVERY_FRAME) {
      const fps = 1000 / deltaTime;
    }
  }

  private cullBulletsOutsideViewport(): void {
    const cameraInfo = this.cameraManager.getCameraInfo();
    const buffer = PERFORMANCE_CONSTANTS.CLEANUP.BULLET_BUFFER;

    const bounds = {
      left: cameraInfo.x - buffer,
      right: cameraInfo.x + cameraInfo.width + buffer,
      top: cameraInfo.y - buffer,
      bottom: cameraInfo.y + cameraInfo.height + buffer,
    };

    const initialCount = this.bullets.length;
    this.bullets = this.bullets.filter((bullet) => {
      const inBounds =
        bullet.x >= bounds.left &&
        bullet.x <= bounds.right &&
        bullet.y >= bounds.top &&
        bullet.y <= bounds.bottom;

      if (!inBounds && "gameObject" in bullet && bullet.gameObject) {
        (bullet.gameObject as any).destroy();
      }

      return inBounds;
    });

    // 최대 이알 수 제한
    if (this.bullets.length > PERFORMANCE_CONSTANTS.CLEANUP.MAX_BULLETS) {
      const excess =
        this.bullets.length - PERFORMANCE_CONSTANTS.CLEANUP.MAX_BULLETS;
      this.bullets.splice(0, excess).forEach((bullet) => {
        if ("gameObject" in bullet && bullet.gameObject) {
          (bullet.gameObject as any).destroy();
        }
      });
    }
  }
}


// 로비에서 선택된 맵 키 (RoundsGame 이 sessionStorage 에 저장한 gameState)
function readSelectedMapKey(): MapKey | undefined {
  try {
    const key = JSON.parse(sessionStorage.getItem("gameState") || "null")?.room?.mapKey;
    return (GAME_SETTINGS.AVAILABLE_MAPS as readonly string[]).includes(key) ? key : undefined;
  } catch {
    return undefined;
  }
}
