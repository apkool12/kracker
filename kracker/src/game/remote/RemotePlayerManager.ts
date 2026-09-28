// src/game/remote/RemotePlayerManager.ts - 원격 플레이어 생성/동기화/렌더링 (GameScene에서 분리)
import type GameScene from "../GameScene";
import type { GamePlayer } from "../GameScene";
import { createCharacter, destroyCharacter } from "../render/character.core";
import { CharacterColors, GfxRefs } from "../types/player.types";
import { drawLimbs } from "../render/limbs";
import { updatePose, drawHealthBar } from "../render/character.pose";
import { sampleSnapshots, REMOTE_RENDER_DELAY_MS, TELEPORT_DISTANCE } from "../net/interpolation";
import { SHOOT_SOUND } from "../../assets/audios/tracks";

// ☆ 원격 플레이어 타입 수정 (그래픽 참조 포함)
export interface RemotePlayer {
  id: string;
  name: string;
  team: number;
  color: string;
  gfxRefs: GfxRefs; // ☆ 핵심: 그래픽 참조 저장
  lastPosition: { x: number; y: number };
  lastUpdate: number;
  isVisible: boolean;
  interpolation: {
    targetX: number;
    targetY: number;
    currentX: number;
    currentY: number;
    targetVX: number;
    targetVY: number;
    // 수신 스냅샷 버퍼 (수신 시각 기준, 최근 것이 뒤)
    buffer?: Array<{ t: number; x: number; y: number; vx: number; vy: number }>;
  };
  networkState: {
    isGrounded: boolean;
    isJumping: boolean;
    isCrouching: boolean;
    isWallGrabbing: boolean;
    facing: "left" | "right";
    health: number;
    mouseX: number; // 마우스 X 위치 추가
    mouseY: number; // 마우스 Y 위치 추가
  };
  // 파티클 상태 추적
  particleState: {
    hasDied: boolean; // 사망 파티클이 이미 생성되었는지
  };
  // 애니메이션 상태 (로컬 플레이어와 동일)
  animationState: {
    armSwing: number;
    legSwing: number;
    wobble: number;
    shootRecoil: number;
    lastShotTime: number;
    isShooting: boolean;
  };
  // 체력바 관련 속성
  hpBarGraphics?: any;
}

// 간단한 소리 재생 함수
let isPlayingShootSound = false;

function playShootSound(volume: number = 0.3) {
  if (!isPlayingShootSound) {
    isPlayingShootSound = true;
    try {
      const audio = new Audio(SHOOT_SOUND);
      audio.volume = volume;
      audio.play().catch(() => {
        isPlayingShootSound = false;
      });
      audio.onended = () => {
        isPlayingShootSound = false;
      };
    } catch (e) {
      console.warn("쏴용 소리 재생 실패:", e);
      isPlayingShootSound = false;
    }
  }
}

export class RemotePlayerManager {
  // GameScene/CollisionSystem/bullet.ts 가 동일한 Map 인스턴스를 공유
  public readonly remotePlayers: Map<string, RemotePlayer> = new Map();

  constructor(private scene: GameScene) {}

  // ☆ 원격 플레이어 움직임 처리
  public handleRemotePlayerMovement(playerId: string, movement: any): void {
    const remotePlayer = this.remotePlayers.get(playerId);
    if (!remotePlayer) {
      console.warn(`⚠️ 원격 플레이어 ${playerId}를 찾을 수 없습니다`);
      return;
    }

    // 이전 상태 저장 (파티클 생성용)
    const wasGrounded = remotePlayer.networkState.isGrounded;
    const wasWallGrabbing = remotePlayer.networkState.isWallGrabbing;
    const wasWallDirection = remotePlayer.networkState.isWallGrabbing
      ? remotePlayer.networkState.facing === "left"
        ? "left"
        : "right"
      : null;

    // 네트워크 상태 업데이트 (체력은 healthUpdate 이벤트에서만 관리)
    remotePlayer.networkState = {
      isGrounded: movement.isGrounded,
      isJumping: movement.isJumping,
      isCrouching: movement.isCrouching,
      isWallGrabbing: movement.isWallGrabbing,
      facing: movement.facing,
      health: remotePlayer.networkState.health, // 기존 체력 유지
      mouseX:
        movement.mouseX ||
        remotePlayer.lastPosition.x + (movement.facing === "right" ? 50 : -50), // 마우스 위치 또는 방향 기반 추정
      mouseY: movement.mouseY || remotePlayer.lastPosition.y,
    };

    // 보간 타겟 설정
    remotePlayer.interpolation.targetX = movement.x;
    remotePlayer.interpolation.targetY = movement.y;
    remotePlayer.interpolation.targetVX = movement.vx;
    remotePlayer.interpolation.targetVY = movement.vy;
    remotePlayer.lastUpdate = Date.now();

    // 스냅샷 버퍼에 적재 (그리기/히트박스는 update 의 보간 위치 사용)
    const buf = (remotePlayer.interpolation.buffer ||= []);
    // 리스폰 등 순간이동이면 이전 궤적을 버려 미끄러지지 않게
    const prev = buf[buf.length - 1];
    if (prev && Math.hypot(movement.x - prev.x, movement.y - prev.y) > TELEPORT_DISTANCE) buf.length = 0;
    buf.push({ t: performance.now(), x: movement.x, y: movement.y, vx: movement.vx || 0, vy: movement.vy || 0 });
    if (buf.length > 20) buf.splice(0, buf.length - 20);

    // 가시성은 체력 상태에 따름 (사망자는 계속 숨김)
    remotePlayer.isVisible = (remotePlayer.networkState.health || 0) > 0;

    // 파티클 생성 로직
    this.handleRemotePlayerParticles(
      remotePlayer,
      wasGrounded,
      wasWallGrabbing,
      wasWallDirection
    );
  }

  // 포즈 적용 메서드
  public applyRemotePose(
    playerId: string,
    pose: {
      angle?: number;
      facing?: "left" | "right";
      mouseX?: number;
      mouseY?: number;
    }
  ) {
    const rp = this.remotePlayers.get(playerId);
    if (!rp) return;
    (rp as any).pose = {
      angle: pose.angle,
      facing: pose.facing ?? rp.networkState.facing,
      mouseX: pose.mouseX,
      mouseY: pose.mouseY,
      t: Date.now(),
    };
  }

  // ☆ 원격 플레이어 파티클 처리
  private handleRemotePlayerParticles(
    remotePlayer: RemotePlayer,
    wasGrounded: boolean,
    wasWallGrabbing: boolean,
    wasWallDirection: "left" | "right" | null
  ): void {
    const { x, y } = remotePlayer.lastPosition;
    const playerColor = this.parsePlayerColor(remotePlayer.color);

    // 점프 파티클: 지상에서 공중으로
    if (wasGrounded && !remotePlayer.networkState.isGrounded) {
      this.scene.getParticleSystem().createJumpParticle(x, y + 25, playerColor);
      // 네트워크로 파티클 이벤트 전송
      if (this.scene.isMultiplayerMode() && this.scene.getNetworkManager()) {
        this.scene.getNetworkManager().sendParticle({
          type: "jump",
          x: x,
          y: y + 25,
          color: remotePlayer.color,
          playerId: remotePlayer.id,
        });
      }
    }

    // 벽점프 파티클: 벽잡기에서 벽점프
    if (
      wasWallGrabbing &&
      !remotePlayer.networkState.isWallGrabbing &&
      wasWallDirection
    ) {
      if (wasWallDirection === "left") {
        this.scene.getParticleSystem().createWallLeftJumpParticle(x, y + 25, playerColor);
        // 네트워크로 파티클 이벤트 전송
        if (this.scene.isMultiplayerMode() && this.scene.getNetworkManager()) {
          this.scene.getNetworkManager().sendParticle({
            type: "wallLeftJump",
            x: x,
            y: y + 25,
            color: remotePlayer.color,
            playerId: remotePlayer.id,
          });
        }
      } else if (wasWallDirection === "right") {
        this.scene.getParticleSystem().createWallRightJumpParticle(x, y + 25, playerColor);
        // 네트워크로 파티클 이벤트 전송
        if (this.scene.isMultiplayerMode() && this.scene.getNetworkManager()) {
          this.scene.getNetworkManager().sendParticle({
            type: "wallRightJump",
            x: x,
            y: y + 25,
            color: remotePlayer.color,
            playerId: remotePlayer.id,
          });
        }
      }
    }

    // 사망 파티클: HP가 0이 되었을 때 (한 번만 생성)
    if (
      remotePlayer.networkState.health <= 0 &&
      !remotePlayer.particleState.hasDied
    ) {
      this.scene.getParticleSystem().createDeathOxidationParticle(x, y);
      remotePlayer.particleState.hasDied = true;
      // 네트워크로 파티클 이벤트 전송
      if (this.scene.isMultiplayerMode() && this.scene.getNetworkManager()) {
        this.scene.getNetworkManager().sendParticle({
          type: "death",
          x: x,
          y: y,
          playerId: remotePlayer.id,
        });
      }
    }

    // HP가 다시 올라가면 사망 상태 리셋
    if (remotePlayer.networkState.health > 0) {
      remotePlayer.particleState.hasDied = false;
    }
  }

  // ☆ 원격 플레이어 사격 처리
  // GameScene.ts의 handleRemotePlayerShoot 함수 수정
  public handleRemotePlayerShoot(playerId: string, shootData: any): void {
    if (!this.scene.sys || !this.scene.sys.isActive()) return;
    const remotePlayer = this.remotePlayers.get(playerId);
    if (!remotePlayer) return;

    console.log(`사격 데이터 수신:`, shootData);

    // 원격 플레이어 쏴용 소리 재생 (랜덤) - 중복 방지 강화
    playShootSound(0.2); // 원격 플레이어 볼륨

    // 1. 씬 상태 확인
    if (!this.scene.scene || !this.scene.scene.add) {
      console.warn("씬이 초기화되지 않아 원격 사격 처리 불가");
      return;
    }

    // 2. 총구 위치 계산 (안전하게)
    const gunX = shootData.gunX || shootData.x;
    const gunY = shootData.gunY || shootData.y;

    console.log(
      `🎯 원격 총구 위치: (${gunX.toFixed(1)}, ${gunY.toFixed(1)}), 각도: ${(
        (shootData.angle * 180) /
        Math.PI
      ).toFixed(1)}도`
    );

    // 3. ShootingManager에서 원격 총알 생성 (안전하게)
    try {
      if (this.scene.getShootingManager()) {
        // 서버 색상을 16진수에서 숫자로 변환
        const serverColor = shootData.playerColor
          ? parseInt(shootData.playerColor.replace("#", ""), 16)
          : 0xff4444;

        this.scene.getShootingManager().createRemotePlayerBullet({
          gunX: gunX,
          gunY: gunY,
          angle: shootData.angle,
          color: serverColor, // 서버 색상 사용
          shooterId: playerId,
          targetX: shootData.targetX, // 마우스 목표 위치 전달
          targetY: shootData.targetY,
          bulletConfig: shootData.bulletConfig, // 서버 설정 사용
        });
      }
    } catch (error) {
      console.warn("원격 총알 생성 실패:", error);
    }

    // 4. 플레이어 방향 업데이트
    const deltaX = shootData.x - remotePlayer.lastPosition.x;
    remotePlayer.networkState.facing = deltaX < 0 ? "left" : "right";

    // 5. 사격 애니메이션 상태 업데이트
    remotePlayer.animationState.lastShotTime = Date.now();
    remotePlayer.animationState.shootRecoil += 1.0;
    remotePlayer.animationState.wobble += 1.0;
  }

  // ☆ 원격 플레이어 생성 (완전히 새로운 구현)
  public createRemotePlayer(
    playerData: GamePlayer,
    spawnPoint: { x: number; y: number }
  ): void {
    // ☆ 핵심: 캐릭터 그래픽 생성
    const characterColors: CharacterColors = {
      head: this.parsePlayerColor(playerData.color),
      limbs: this.parsePlayerColor(playerData.color),
      gun: 0x333333,
    };

    // ☆ createCharacter 함수로 실제 그래픽 오브젝트들 생성
    const gfxRefs = createCharacter(
      this.scene,
      spawnPoint.x,
      spawnPoint.y,
      characterColors
    );

    // 원격 플레이어 객체 생성
    const remotePlayer: RemotePlayer = {
      id: playerData.id,
      name: playerData.name,
      team: playerData.team,
      color: playerData.color,
      gfxRefs: gfxRefs, // ☆ 그래픽 참조 저장
      lastPosition: { x: spawnPoint.x, y: spawnPoint.y },
      lastUpdate: Date.now(),
      isVisible: true,
      interpolation: {
        targetX: spawnPoint.x,
        targetY: spawnPoint.y,
        currentX: spawnPoint.x,
        currentY: spawnPoint.y,
        targetVX: 0,
        targetVY: 0,
      },
      networkState: {
        isGrounded: true,
        isJumping: false,
        isCrouching: false,
        isWallGrabbing: false,
        facing: "right",
        health: (playerData as any).health || 100, // 서버에서 받은 체력 정보 사용
        mouseX: spawnPoint.x + 50, // 기본 마우스 위치
        mouseY: spawnPoint.y,
      },
      particleState: {
        hasDied: false,
      },
      animationState: {
        armSwing: 0,
        legSwing: 0,
        wobble: 0,
        shootRecoil: 0,
        lastShotTime: 0,
        isShooting: false,
      },
      // 체력바 관련 속성 초기화
      hpBarGraphics: undefined,
    };

    // 그래픽 요소들의 가시성 확실히 설정 (로컬 플레이어와 동일한 depth)
    if (gfxRefs.body) {
      gfxRefs.body.setVisible(true);
      gfxRefs.body.setDepth(-3); // 로컬과 동일
    }
    if (gfxRefs.face) {
      gfxRefs.face.setVisible(true);
      gfxRefs.face.setDepth(-3); // 로컬과 동일
    }
    if (gfxRefs.leftArm) {
      gfxRefs.leftArm.setVisible(true);
      gfxRefs.leftArm.setDepth(-5); // 로컬과 동일
    }
    if (gfxRefs.rightArm) {
      gfxRefs.rightArm.setVisible(true);
      gfxRefs.rightArm.setDepth(-5); // 로컬과 동일
    }
    if (gfxRefs.leftLeg) {
      gfxRefs.leftLeg.setVisible(true);
      gfxRefs.leftLeg.setDepth(-5); // 로컬과 동일
    }
    if (gfxRefs.rightLeg) {
      gfxRefs.rightLeg.setVisible(true);
      gfxRefs.rightLeg.setDepth(-5); // 로컬과 동일
    }
    if (gfxRefs.gun) {
      gfxRefs.gun.setVisible(true);
      gfxRefs.gun.setDepth(-5); // 로컬과 동일
    }

    // 체력바 그래픽 객체 생성
    remotePlayer.hpBarGraphics = this.scene.add.graphics();
    remotePlayer.hpBarGraphics.setDepth(10); // UI 레이어

    // Map에 저장
    this.remotePlayers.set(playerData.id, remotePlayer);

    //원격 플레이어 생성 시 태그 만들기
    this.scene.getUIManager().createNameTag(playerData.id, playerData.name);
  }

  // ☆ 원격 플레이어들 업데이트
  public updateRemotePlayers(deltaTime: number): void {
    this.remotePlayers.forEach((remotePlayer) => {
      // 보간 처리
      this.interpolateRemotePlayer(remotePlayer, deltaTime);

      // 애니메이션 상태 업데이트 (로컬 플레이어와 동일한 로직)
      this.updateRemotePlayerAnimationState(remotePlayer, deltaTime);

      // 애니메이션 렌더링
      this.renderRemotePlayerAnimation(remotePlayer);
    });
  }

  // ☆ 원격 플레이어 위치 보간
  private interpolateRemotePlayer(
    remotePlayer: RemotePlayer,
    deltaTime: number
  ): void {
    const interpolation = remotePlayer.interpolation;
    const p = sampleSnapshots(interpolation.buffer, performance.now() - REMOTE_RENDER_DELAY_MS);
    if (p) {
      interpolation.currentX = p.x;
      interpolation.currentY = p.y;
    }

    // 실제 위치 업데이트
    remotePlayer.lastPosition = {
      x: interpolation.currentX,
      y: interpolation.currentY,
    };
  }

  // 원격 플레이어 체력바 렌더링
  private renderRemotePlayerHealthBar(remotePlayer: RemotePlayer): void {
    if (!remotePlayer.hpBarGraphics) {
      console.warn(`⚠️ ${remotePlayer.name}의 체력바 그래픽이 없습니다`);
      return;
    }

    // HP바 그래픽 초기화
    remotePlayer.hpBarGraphics.clear();

    // HP바 그리기 (상시 표시)
    drawHealthBar(
      remotePlayer.hpBarGraphics,
      remotePlayer.lastPosition.x,
      remotePlayer.lastPosition.y,
      remotePlayer.networkState.health,
      100,
      0 // 타이머는 사용하지 않음
    );
  }

  // ☆ 원격 플레이어 애니메이션 렌더링
  private renderRemotePlayerAnimation(remotePlayer: RemotePlayer): void {
    const refs = remotePlayer.gfxRefs;
    if (!refs) {
      console.warn(`⚠️ ${remotePlayer.name}의 gfxRefs가 없습니다`);
      return;
    }

    // 가시성 체크 (사망 상태는 체력바 표시를 위해 제거)
    if (!remotePlayer.isVisible) {
      return;
    }

    const { x, y } = remotePlayer.lastPosition;
    const facing = remotePlayer.networkState.facing;
    const networkState = remotePlayer.networkState;

    // 사망 상태 체크
    const isDead = (remotePlayer.networkState.health || 0) <= 0;

    // ⭐ 몸통 위치 업데이트
    if (refs.body) {
      refs.body.setPosition(x, y);
      refs.body.setVisible(!isDead); // 사망 시 숨김
      refs.body.setDepth(-3); // 로컬과 동일
    }

    // 로컬 플레이어와 동일한 애니메이션 시스템 사용
    const characterColors: CharacterColors = {
      head: this.parsePlayerColor(remotePlayer.color),
      limbs: this.parsePlayerColor(remotePlayer.color),
      gun: 0x333333,
    };

    // 모든 그래픽 요소 가시성 설정 (사망 시 숨김)
    if (refs.leftArm) refs.leftArm.setVisible(!isDead);
    if (refs.rightArm) refs.rightArm.setVisible(!isDead);
    if (refs.leftLeg) refs.leftLeg.setVisible(!isDead);
    if (refs.rightLeg) refs.rightLeg.setVisible(!isDead);
    if (refs.gun) refs.gun.setVisible(!isDead);

    // 사망하지 않은 경우에만 포즈와 팔다리 렌더링
    if (!isDead) {
      // 로컬 플레이어와 동일한 렌더링 시스템 사용
      // 1. 포즈 업데이트 (몸통, 표정) - 로컬과 동일한 시스템 사용
      updatePose(refs, {
        x: x,
        y: y,
        wobble: remotePlayer.animationState.wobble,
        crouchHeight: networkState.isCrouching ? 1 : 0,
        baseCrouchOffset: 3,
        wallLean: networkState.isWallGrabbing
          ? facing === "right"
            ? 5
            : -5
          : 0,
        colors: characterColors,
        health: networkState.health,
        maxHealth: 100,
        isWallGrabbing: networkState.isWallGrabbing,
        velocityY: remotePlayer.interpolation.targetVY,
        isGrounded: networkState.isGrounded,
        facing,
      });

      // 2. 로컬과 동일한 팔다리 렌더링 시스템 사용
      const pose = (remotePlayer as any).pose;
      const mouseX = pose?.mouseX || x + (facing === "right" ? 50 : -50);
      const mouseY = pose?.mouseY || y;

      drawLimbs(refs, {
        x: x,
        y: y,
        mouseX: mouseX,
        mouseY: mouseY,
        armSwing: 0, // 원격은 애니메이션만 사용
        legSwing: 0,
        crouchHeight: networkState.isCrouching ? 1 : 0,
        baseCrouchOffset: 3,
        isWallGrabbing: networkState.isWallGrabbing,
        wallGrabDirection: networkState.isWallGrabbing ? facing : null,
        isGrounded: networkState.isGrounded,
        velocityX: remotePlayer.interpolation.targetVX, // 실제 속도 사용
        colors: characterColors,
        shootRecoil: 0,
        currentTime: Date.now() / 1000,
        currentFacing: facing,
        isJumping: networkState.isJumping, // 상승 중만 점프, 그 외 공중은 낙하 모션
      });
    }

    // 체력바 렌더링 (사망한 플레이어도 체력바는 표시)
    this.renderRemotePlayerHealthBar(remotePlayer);

    // 디버그: 주기적으로 위치 로그
    if (Date.now() % 5000 < 16) {
      console.log(
        `📍 ${remotePlayer.name} 위치: (${x.toFixed(1)}, ${y.toFixed(
          1
        )}) 상태: ${JSON.stringify(networkState)}`
      );
    }
  }

  // ☆ 색상 파싱 헬퍼
  private parsePlayerColor(colorStr: string): number {
    if (typeof colorStr === "string" && colorStr.startsWith("#")) {
      return parseInt(colorStr.slice(1), 16);
    }
    return 0x4a90e2; // 기본 파란색
  }

  // ☆ 원격 플레이어 애니메이션 상태 업데이트 (로컬 플레이어와 동일한 로직)
  private updateRemotePlayerAnimationState(
    remotePlayer: RemotePlayer,
    deltaTime: number
  ): void {
    const anim = remotePlayer.animationState;
    const network = remotePlayer.networkState;
    const dt = deltaTime / 1000;
    const now = Date.now();
    const time = now * 0.01;

    // 부드러운 애니메이션 파라미터 업데이트
    if (network.isWallGrabbing) {
      // 벽잡기 시 팔을 벽 쪽으로 뻗기
      const wallDirection = network.facing === "right" ? 1 : -1;
      anim.armSwing = wallDirection * 15;
    } else if (network.isCrouching) {
      // 웅크리기 시 팔을 아래로
      anim.armSwing = Math.sin(time * 0.3) * 3;
    } else if (Math.abs(remotePlayer.interpolation.targetVX) > 10) {
      // 걷기/뛰기 시 팔 흔들기
      anim.armSwing = Math.sin(time * 0.5) * 8;
    } else {
      // 가만히 있을 때도 자연스러운 팔 움직임
      anim.armSwing = Math.sin(time * 0.2) * 3 + Math.sin(time * 0.1) * 2;
    }

    // 다리 애니메이션은 drawLimbs에서 자동 처리됨 (로컬과 동일)

    // 부드러운 흔들림
    anim.wobble = Math.sin(time * 0.3) * 0.5;
    anim.shootRecoil *= 0.8;

    // 사격 상태 업데이트
    anim.isShooting = now - anim.lastShotTime < 200;

    // 체력바는 상시 표시이므로 타이머 업데이트 제거

    // 마우스 위치가 없거나 오래된 경우 방향 기반으로 추정 업데이트
    const { x, y } = remotePlayer.lastPosition;
    if (
      !network.mouseX ||
      !network.mouseY ||
      now - remotePlayer.lastUpdate > 1000
    ) {
      // 방향 기반으로 마우스 위치 추정 (더 자연스러운 각도)
      const angle = Math.random() * Math.PI * 2; // 랜덤 각도
      const distance = 30 + Math.random() * 40; // 30-70 픽셀 거리
      network.mouseX = x + Math.cos(angle) * distance;
      network.mouseY = y + Math.sin(angle) * distance;
    }
  }

  // ☆ 원격 플레이어 제거 (퇴장). 제거했으면 true
  public removeRemotePlayer(playerId: string): boolean {
    const remotePlayer = this.remotePlayers.get(playerId);
    if (remotePlayer) {
      console.log(`👋 플레이어 퇴장: ${remotePlayer.name}`);

      // ☆ 그래픽 오브젝트들 제거
      if (remotePlayer.gfxRefs) {
        destroyCharacter(remotePlayer.gfxRefs);
      }

      // 체력바 그래픽 객체 제거
      if (remotePlayer.hpBarGraphics) {
        remotePlayer.hpBarGraphics.destroy();
      }

      //퇴장 시 태그 제거
      this.scene.getUIManager().destroyNameTag(playerId);

      this.remotePlayers.delete(playerId);
      return true;
    }
    return false;
  }

  // ☆ 원격 플레이어들 정리 (shutdown)
  public destroyAll(): void {
    const playerIds = Array.from(this.remotePlayers.keys());
    for (let i = 0; i < playerIds.length; i++) {
      const remotePlayer = this.remotePlayers.get(playerIds[i]);
      if (remotePlayer && remotePlayer.gfxRefs) {
        destroyCharacter(remotePlayer.gfxRefs);
      }
    }
    this.remotePlayers.clear();
  }
}
