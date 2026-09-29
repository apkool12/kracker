// src/game/player/Player.ts - 수정된 플레이어 사격 시스템
import {
  CharacterPreset,
  CharacterColors,
  GfxRefs,
  KeyState,
  Platform,
  PlayerState,
  WallGrabState,
} from "../types/player.types";

import { ParticleSystem } from "../particle";

import {
  createCharacter,
  destroyCharacter,
  setBodyColor,
} from "../render/character.core";

import { updatePose, drawHealthBar } from "../render/character.pose";
import { drawLimbs } from "../render/limbs";
import { getGunPosition as computeGunPos } from "../render/gun";

import { setupKeyboard, getKeyState, KeysHandle } from "../input/keyboard";
import { setupPointer, PointerHandle } from "../input/pointer";

import { applyGravity } from "../physics/gravity";
import { integrate, dampen } from "../physics/kinematics";
import {
  resolveCollisions,
  computePlayerBounds,
} from "../physics/collisions";

import {
  checkWallCollision,
  updateWallGrab,
  performWallJump,
} from "../mechanics/wallgrab";

// 기존 config / Bullet 의존성은 유지
import { GAME_CONFIG, CHARACTER_PRESETS, GameUtils } from "../config";
import { Bullet } from "../bullet";

export default class Player {
  // Phaser scene
  private scene: any;

  private particleSystem!: ParticleSystem;

  // 멀티플레이어 ID
  private id?: string;

  // 멀티플레이어 모드 여부
  private isMultiplayer = false;

  // 그래픽 참조
  private gfx!: GfxRefs;

  // HP바 그래픽 객체
  private hpBarGraphics!: any;

  // 위치/속도/상태
  private x: number;
  private y: number;
  private velocityX = 0;
  private velocityY = 0;

  private health = 100;
  private maxHealth = 100;

  private isGrounded = false;
  private isJumping = false;
  private isShooting = false;
  private facingDirection: "left" | "right" = "right";

  // 착지 애니메이션 추적
  private landTime = 0; // 착지한 시간
  private isLanding = false; // 착지 애니메이션 중인지
  private jumpStartTime = 0; // 점프 시작 시간
  private lastLandingTime = 0; // 마지막 착지 시간 (쿨다운용)
  private isLandingCrouch = false; // 착지 후 자동 앉기 상태
  private landingCrouchStartTime = 0; // 착지 앉기 시작 시간
  private landingCrouchDuration = 0.3; // 착지 앉기 지속시간
  private jumpStartY = 0; // 점프 시작 Y 위치

  // 플랫폼
  private platforms: Platform[];

  // 벽잡기/벽점프 상태
  private wall: WallGrabState = {
    isWallGrabbing: false,
    wallGrabDirection: null,
    wallGrabTimer: 0,
    maxWallGrabTime: 2000,
    wallSlideSpeed: 50,
    wallJumpCooldown: 0,
  };
  private wallJumpForce = { x: 600, y: -650 };

  // 웅크리기
  private isCrouching = false;
  private crouchHeight = 0;
  private crouchTransitionSpeed = 0.5; // 더 부드러운 전환
  private baseCrouchOffset = 3;

  // 애니메이션 파라미터
  private lastMovementState: "idle" | "walking" | "crouching" | "wallgrab" =
    "idle";
  private armSwing = 0;
  private legSwing = 0;
  private wobble = 0;
  private shootRecoil = 0;

  // 동적 색상 그라데이션 관련
  private colorAnimationTime = 0;
  private colorAnimationSpeed = 0.02;
  private dynamicColors: number[] = [];
  private isGameScene = false;

  // 입력 핸들
  private keysHandle: KeysHandle | null = null;
  private pointerHandle: PointerHandle | null = null;

  // 마우스/총
  private mouseX = 0;

  // 멀티플레이어 파티클 콜백
  public onParticleCreated?: (
    type: string,
    x: number,
    y: number,
    color: number
  ) => void;

  // 낙하 데미지 콜백
  public onFalloutDamage?: (damage: number) => void;
  private mouseY = 0;

  private lastShotTime = 0;
  private shootCooldown = 150;
  private bullets: Bullet[] = [];

  // 프리셋/색상
  private colorPreset: CharacterPreset = "기본";
  private colors: CharacterColors;

  // 무적
  private invulnerable = false;
  private invulnerabilityTimer = 0;

  // 쿨다운(연속 판정 방지)
  private falloutCooldownMs = 600;
  private lastFalloutAt = 0;

  // 체력바 표시 타이머 (새로운 시스템에서는 사용하지 않음)

  constructor(
    scene: any,
    x: number,
    y: number,
    platforms: Platform[],
    preset: CharacterPreset = "기본"
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.platforms = platforms;

    // 게임 씬인지 확인 (GameScene에서만 동적 색상 적용)
    this.isGameScene =
      scene.constructor.name === "GameScene" ||
      scene.scene?.key === "GameScene";

    this.colorPreset = preset;
    this.colors = (CHARACTER_PRESETS as any)[preset] as CharacterColors;
    this.particleSystem = new ParticleSystem(this.scene, false);

    // 동적 색상 초기화
    this.baseColor = this.colors.head;
    this.dynamicColors = [
      0xff6b35, // 주황색
      0xff8e53, // 밝은 주황
      0xffa726, // 연한 주황
      0xffb74d, // 더 연한 주황
      0xffcc02, // 금색
      0xffd54f, // 밝은 금색
      0xffe082, // 연한 금색
      0xffecb3, // 매우 연한 금색
    ];

    // 그래픽 생성
    this.gfx = createCharacter(this.scene, this.x, this.y, this.colors);

    // HP바 그래픽 객체 생성
    this.hpBarGraphics = this.scene.add.graphics();
    this.hpBarGraphics.setDepth(1000); // 다른 UI보다 위에 표시

    // 입력 초기화
    this.keysHandle = setupKeyboard(this.scene);

    // 포인터 (왼클릭 시 사격)
    this.pointerHandle = setupPointer(this.scene, {
      getCamera: () => this.scene.cameras?.main,
    });

    // 총알 리소스
    Bullet.preload(this.scene);

    // 초기 포즈 반영
    updatePose(this.gfx, {
      x: this.x,
      y: this.y,
      wobble: this.wobble,
      crouchHeight: this.crouchHeight,
      baseCrouchOffset: this.baseCrouchOffset,
      wallLean: 0,
      colors: this.colors,
      health: this.health,
      maxHealth: this.maxHealth,
      isWallGrabbing: this.wall.isWallGrabbing,
    });
  }

  // ========== 내부 유틸 ==========

  // 장신구 id (로비에서 선택)
  public accessory = "none";

  // 넉백 등 외부 충격 (px/s)
  public applyImpulse(vx: number, vy: number): void {
    this.velocityX += vx;
    this.velocityY += vy;
    if (vy < 0) this.isGrounded = false;
  }

  // 사망/스턴/라운드 전환 중 입력 차단 (GameScene.setInputEnabled 가 제어)
  public inputLocked = false;

  private readInputs(): KeyState {
    const k = getKeyState(this.inputLocked ? null : this.keysHandle);
    // 포인터 좌표
    const pos = this.pointerHandle?.getPointer() ?? {
      x: this.mouseX,
      y: this.mouseY,
    };
    this.mouseX = pos.x;
    this.mouseY = pos.y;

    // 포인터 각도에 따라 바라보는 방향(벽잡기 중 아닐 때만)
    if (!this.wall.isWallGrabbing) {
      const deltaX = this.mouseX - this.x;
      this.facingDirection = deltaX < 0 ? "left" : "right";
    }

    return k;
  }

  private updateInvulnerability(deltaMs: number) {
    if (!this.invulnerable) {
      // 알파 원복
      this.gfx.body?.setAlpha?.(1);
      return;
    }
    this.invulnerabilityTimer -= deltaMs;
    if (this.invulnerabilityTimer <= 0) {
      this.invulnerable = false;
      this.invulnerabilityTimer = 0;
      this.gfx.body?.setAlpha?.(1);
      return;
    }
    const alpha = Math.sin(this.invulnerabilityTimer * 0.02) > 0 ? 1 : 0.5;
    this.gfx.body?.setAlpha?.(alpha);
  }

  private updateDynamicColor(deltaMs: number) {
    // 게임 씬에서만 동적 색상 적용
    if (!this.isGameScene) {
      return;
    }

    // 움직임 상태에 따라 색상 변화 속도 조절
    let speedMultiplier = 1;
    if (this.lastMovementState === "walking") {
      speedMultiplier = 2;
    } else if (this.lastMovementState === "wallgrab") {
      speedMultiplier = 3;
    } else if (this.isShooting) {
      speedMultiplier = 4;
    }

    this.colorAnimationTime +=
      deltaMs * this.colorAnimationSpeed * speedMultiplier;

    // 색상 배열에서 현재 색상 선택
    const colorIndex =
      Math.floor(this.colorAnimationTime) % this.dynamicColors.length;
    const nextColorIndex = (colorIndex + 1) % this.dynamicColors.length;

    const progress =
      this.colorAnimationTime - Math.floor(this.colorAnimationTime);

    // 색상 보간
    const currentColor = this.dynamicColors[colorIndex];
    const nextColor = this.dynamicColors[nextColorIndex];

    const r1 = (currentColor >> 16) & 0xff;
    const g1 = (currentColor >> 8) & 0xff;
    const b1 = currentColor & 0xff;

    const r2 = (nextColor >> 16) & 0xff;
    const g2 = (nextColor >> 8) & 0xff;
    const b2 = nextColor & 0xff;

    const r = Math.round(r1 + (r2 - r1) * progress);
    const g = Math.round(g1 + (g2 - g1) * progress);
    const b = Math.round(b1 + (b2 - b1) * progress);

    const interpolatedColor = (r << 16) | (g << 8) | b;

    // 몸통 색상 업데이트
    if (this.gfx.body && typeof this.gfx.body.setFillStyle === "function") {
      this.gfx.body.setFillStyle(interpolatedColor);
    }
  }

  private updateCrouch(key: KeyState) {
    // 착지 앉기 상태가 활성화되어 있으면 강제로 앉기
    if (this.isLandingCrouch) {
      this.isCrouching = true;
    }
    // 벽잡기 중에는 웅크리기 불가
    else if (key.crouch && this.isGrounded && !this.wall.isWallGrabbing) {
      this.isCrouching = true;
      // 수동으로 웅크리기 키를 누르면 착지 앉기 취소
      this.isLandingCrouch = false;
      this.landingCrouchStartTime = 0;
    } else {
      this.isCrouching = false;
    }

    // 부드러운 전환 (프레임레이트와 무관: 시간 상수 60ms)
    const k = 1 - Math.exp(-this.lastDeltaMs / 60);
    this.crouchHeight += ((this.isCrouching ? 1 : 0) - this.crouchHeight) * k;
    if (Math.abs(this.crouchHeight - (this.isCrouching ? 1 : 0)) < 0.002)
      this.crouchHeight = this.isCrouching ? 1 : 0;
  }

  // ========== 메인 업데이트 루프 ==========

  private lastDeltaMs = 16.7;

  update(deltaMs: number): PlayerState {
    const dt = deltaMs / 1000;
    this.lastDeltaMs = deltaMs;

    // 1) 무적 처리
    this.updateInvulnerability(deltaMs * 3);

    // 2) 동적 색상 업데이트
    this.updateDynamicColor(deltaMs);

    // 2) 입력 스냅샷
    const key = this.readInputs();
    const justPressedJump = !!key.jump && !this.prevJumpPressed;
    this.prevJumpPressed = !!key.jump;

    // 3) 벽 상태 판단/갱신 (다른 처리보다 먼저)
    const bounds = computePlayerBounds(this.x, this.y, this.crouchHeight);
    const wallDir = checkWallCollision(bounds, this.platforms, this.velocityX, {
      x: this.x,
      y: this.y,
      crouchHeight: this.crouchHeight,
    });
    const wallStateIn = {
      ...this.wall,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      isGrounded: this.isGrounded,
    };
    const wallStateOut = updateWallGrab(wallStateIn, key, wallDir, deltaMs);
    this.wall = {
      isWallGrabbing: wallStateOut.isWallGrabbing,
      wallGrabDirection: wallStateOut.wallGrabDirection,
      wallGrabTimer: wallStateOut.wallGrabTimer,
      maxWallGrabTime: wallStateOut.maxWallGrabTime,
      wallSlideSpeed: wallStateOut.wallSlideSpeed,
      wallJumpCooldown: wallStateOut.wallJumpCooldown,
    };
    this.velocityX = wallStateOut.velocityX;
    this.velocityY = wallStateOut.velocityY;

    // 착지 감지 (벽잡기 업데이트 후)
    const wasGrounded = this.isGrounded;
    this.isGrounded = wallStateOut.isGrounded;

    // 앉기 상태에서 isGrounded 판정 안정화
    if (this.isCrouching && !this.isGrounded && wasGrounded) {
      // 앉기 상태에서 착지 상태가 해제되었을 때, 약간의 여유를 두고 다시 체크
      const bounds = computePlayerBounds(this.x, this.y + 2, this.crouchHeight);
      let hasGroundContact = false;

      for (const platform of this.platforms) {
        const platBounds = {
          left: platform.x,
          right: platform.x + platform.width,
          top: platform.y,
          bottom: platform.y + platform.height,
        };

        if (
          bounds.right > platBounds.left &&
          bounds.left < platBounds.right &&
          bounds.bottom > platBounds.top &&
          bounds.top < platBounds.bottom
        ) {
          hasGroundContact = true;
          break;
        }
      }

      if (hasGroundContact) {
        this.isGrounded = true;
      }
    }

    // 체력바는 상시 표시이므로 타이머 업데이트 제거

    // HP바 렌더링
    this.renderHealthBar();

    // 4) 웅크리기
    this.updateCrouch(key);

    // 5) 좌우 이동/점프 (벽잡기 아닐 때만)
    if (!this.wall.isWallGrabbing) {
      const moveMul = this.isCrouching ? 0.5 : 1;

      // 블링크 (Shift 키): 증강으로 허용 + 1초 쿨타임
      if (this.blinkEnabled && key.blink) {
        const nowMs = Date.now();
        if (nowMs - this.lastBlinkAt >= this.blinkCooldownMs) {
          this.performBlink(this.facingDirection === "right" ? 1 : -1);
          this.lastBlinkAt = nowMs;
        }
      }

      if (key.left && !key.right) {
        const speedMul = (this as any).__speedMul ?? 1.0;
        this.velocityX =
          -GAME_CONFIG.playerSpeed * moveMul * speedMul * this.moveSpeedMul;
        this.legSwing += 0.3;
      } else if (key.right && !key.left) {
        const speedMul = (this as any).__speedMul ?? 1.0;
        this.velocityX =
          GAME_CONFIG.playerSpeed * moveMul * speedMul * this.moveSpeedMul;
        this.legSwing += 0.3;
      } else {
        // 60fps 기준 0.8 감쇠를 프레임레이트와 무관하게 적용
        this.velocityX = dampen(this.velocityX, Math.pow(0.8, deltaMs / (1000 / 60)), 10);
      }

      // 점프 처리: 지상/공중(추가 점프) 모두 지원
      if (justPressedJump) {
        if (this.isGrounded) {
          this.performJump();
        } else if (this.remainingExtraJumps > 0) {
          this.performJump();
          this.remainingExtraJumps -= 1;
        }
      }
    } else {
      // 벽점프 입력
      if (key.jump && this.wall.isWallGrabbing) {
        // 벽점프 전 방향 저장
        const wallDirection = this.wall.wallGrabDirection;

        const jumped = performWallJump(
          {
            ...this.wall,
            velocityX: this.velocityX,
            velocityY: this.velocityY,
            isGrounded: this.isGrounded,
          },
          this.wallJumpForce,
          200
        );
        this.wall = {
          isWallGrabbing: jumped.isWallGrabbing,
          wallGrabDirection: jumped.wallGrabDirection,
          wallGrabTimer: jumped.wallGrabTimer,
          maxWallGrabTime: jumped.maxWallGrabTime,
          wallSlideSpeed: jumped.wallSlideSpeed,
          wallJumpCooldown: jumped.wallJumpCooldown,
        };
        this.velocityX = jumped.velocityX;
        this.velocityY = jumped.velocityY;
        this.isGrounded = jumped.isGrounded;

        this.isJumping = true;
        this.jumpStartTime = Date.now() / 1000; // 벽점프 시작 시간 기록
        this.jumpStartY = this.y; // 벽점프 시작 Y 위치 저장
        // console.log(
        //   "🎯 벽점프 시작! jumpStartTime:",
        //   this.jumpStartTime.toFixed(2)
        // );
        this.wobble += 2.0;
        this.shootRecoil += 1.0;

        // 저장된 방향으로 파티클 생성
        if (wallDirection === "left") {
          this.particleSystem.createWallLeftJumpParticle(
            this.x,
            this.y + 25,
            this.colors.head
          );

          // 멀티플레이어 파티클 전송
          if (this.onParticleCreated) {
            this.onParticleCreated(
              "wallLeftJump",
              this.x,
              this.y + 25,
              this.colors.head
            );
          }
        } else if (wallDirection === "right") {
          this.particleSystem.createWallRightJumpParticle(
            this.x,
            this.y + 25,
            this.colors.head
          );

          // 멀티플레이어 파티클 전송
          if (this.onParticleCreated) {
            this.onParticleCreated(
              "wallRightJump",
              this.x,
              this.y + 25,
              this.colors.head
            );
          }
        }
        // // 연출(선택): 카메라 흔들기
        // this.scene.cameras?.main?.shake?.(90, 0.006);
      }
    }

    // 6) 중력 (벽잡기면 updateWallGrab에서 제한됨)
    const gravityActive = !this.isGrounded && !this.wall.isWallGrabbing;
    this.velocityY = applyGravity(
      this.velocityY,
      dt,
      GAME_CONFIG.gravity * this.gravityMul,
      600,
      gravityActive
    );

    // 7) 적분
    const next = integrate(this.x, this.y, this.velocityX, this.velocityY, dt);
    this.x = next.x;
    this.y = next.y;

    // 8) 충돌 해결
    const resolver = resolveCollisions(
      this.x,
      this.y,
      this.velocityX,
      this.velocityY,
      this.platforms,
      this.crouchHeight
    );
    this.x = resolver.x;
    this.y = resolver.y;
    this.velocityX = resolver.vx;
    this.velocityY = resolver.vy;

    this.isGrounded = resolver.isGrounded;

    if (!wasGrounded && this.isGrounded) {
      // 착지
      this.isJumping = false;
      // 추가 점프 회복
      this.remainingExtraJumps = this.extraJumpsAllowed;
      // 벽잡기 해제
      if (this.wall.isWallGrabbing) {
        this.wall.isWallGrabbing = false;
        this.wall.wallGrabDirection = null;
        this.wall.wallGrabTimer = 0;
      }
      this.wobble += 0.5;

      // 착지 이펙트 생성 (쿨다운 체크)
      const currentTime = Date.now() / 1000;
      const timeSinceLastLanding = currentTime - this.lastLandingTime;

      // 0.3초 쿨다운으로 중복 이펙트 방지
      if (timeSinceLastLanding > 0.3) {
        // 점프 시작 위치보다 더 내려갔을 때만 이벤트 발생
        const fallDistance = this.jumpStartY - this.y;
        if (fallDistance > 10) {
          // 10픽셀 이상 내려갔을 때만
          this.landTime = currentTime; // 현재 시간 기록
          this.isLanding = true;
          this.lastLandingTime = currentTime;

          // 점프 시작 시간부터 착지까지의 시간 계산
          const timeSinceJumpStart = currentTime - this.jumpStartTime;

          // 착지할 때마다 이펙트 생성 (크기는 점프 시간에 따라 조절)
          let effectScale = 0.6; // 기본 크기

          if (timeSinceJumpStart > 2.0) {
            effectScale = 1.0; // 긴 점프 후 큰 이펙트
          } else if (timeSinceJumpStart > 1.0) {
            effectScale = 0.8; // 중간 점프 후 중간 이펙트
          } else if (timeSinceJumpStart > 0.5) {
            effectScale = 0.7; // 짧은 점프 후 작은 이펙트
          }

          // 착지 이펙트 생성
          this.particleSystem.createLandingParticle(
            this.x,
            this.y + 25,
            this.colors.head,
            effectScale
          );

          // 착지 후 자동 앉기 시작 (더 긴 지속시간으로 안정화)
          this.isLandingCrouch = true;
          this.landingCrouchStartTime = currentTime;
          this.landingCrouchDuration = 0.15; // 0.15초로 증가
        }
      }
    }

    // 착지 상태 리셋 (착지 후 1.5초 후)
    if (this.isLanding && this.landTime > 0) {
      const timeSinceLand = Date.now() / 1000 - this.landTime;
      if (timeSinceLand > 1.5) {
        this.isLanding = false;
        this.landTime = 0;
      }
    }

    // 착지 앉기 상태 업데이트
    if (this.isLandingCrouch && this.landingCrouchStartTime > 0) {
      const timeSinceCrouchStart =
        Date.now() / 1000 - this.landingCrouchStartTime;
      if (timeSinceCrouchStart > this.landingCrouchDuration) {
        this.isLandingCrouch = false;
        this.landingCrouchStartTime = 0;
      }
    }

    // 9) 애니메이션 파라미터
    this.armSwing += 0.1;

    if (this.wall.isWallGrabbing) {
      this.legSwing *= 0.9;
    } else if (!this.isCrouching && Math.abs(this.velocityX) > 10) {
      this.legSwing += 0.3;
    } else if (!this.isCrouching) {
      this.legSwing *= 0.9;
      if (Math.abs(this.legSwing) < 0.1) this.legSwing = 0;
    }

    this.wobble *= 0.95;
    this.shootRecoil *= 0.8;

    const now = Date.now();
    this.isShooting = now - this.lastShotTime < 200;

    // 10) 렌더링
    const wallLean = this.wall.isWallGrabbing
      ? this.wall.wallGrabDirection === "left"
        ? -3
        : 3
      : 0;

    updatePose(this.gfx, {
      x: this.x,
      y: this.y,
      wobble: this.wobble,
      crouchHeight: this.crouchHeight,
      baseCrouchOffset: this.baseCrouchOffset,
      wallLean,
      colors: this.colors,
      health: this.health,
      maxHealth: this.maxHealth,
      isWallGrabbing: this.wall.isWallGrabbing,
      velocityY: this.velocityY,
      isGrounded: this.isGrounded,
      facing: this.facingDirection,
      aimX: this.mouseX,
      aimY: this.mouseY,
      accessory: this.accessory,
    });

    drawLimbs(this.gfx, {
      x: this.x,
      y: this.y,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      armSwing: this.armSwing,
      legSwing: this.legSwing,
      crouchHeight: this.crouchHeight,
      baseCrouchOffset: this.baseCrouchOffset,
      isWallGrabbing: this.wall.isWallGrabbing,
      wallGrabDirection: this.wall.wallGrabDirection,
      isGrounded: this.isGrounded,
      velocityX: this.velocityX,
      colors: this.colors,
      shootRecoil: this.shootRecoil,
      // 새로 추가된 파라미터들
      currentTime: Date.now() / 1000,
      currentFacing: this.facingDirection,
      isJumping: this.isJumping, // 점프 상태 추가
      isLanding: this.isLanding, // 착지 상태 추가
      landTime: this.landTime, // 착지 시간 추가
    });

    // 11) 탄환 정리
    this.bullets = this.bullets.filter((b) => b.active);

    // 낙하사망 리스폰 (싱글플레이어 모드에서만)
    if (this.y > 1200 && !this.isMultiplayer) this.respawn();

    return this.getState();
  }

  // ========== 공개 API (원래 Player.ts 호환) ==========

  public getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
  public getX(): number {
    return this.x;
  }
  public getY(): number {
    return this.y;
  }
  public getVelocity(): { x: number; y: number } {
    return { x: this.velocityX, y: this.velocityY };
  }

  public getState(): PlayerState & {
    isCrouching: boolean;
    isWallGrabbing: boolean;
    wallGrabDirection: "left" | "right" | null;
  } {
    return {
      position: { x: Math.round(this.x), y: Math.round(this.y) },
      velocity: {
        x: Math.round(this.velocityX),
        y: Math.round(this.velocityY),
      },
      health: this.health,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
      isShooting: this.isShooting,
      facingDirection: this.facingDirection,
      // 확장
      isCrouching: this.isCrouching,
      isWallGrabbing: this.wall.isWallGrabbing,
      wallGrabDirection: this.wall.wallGrabDirection,
    } as any;
  }

  public setPosition(x: number, y: number): void {
    const oldX = this.x;
    const oldY = this.y;
    this.x = x;
    this.y = y;
    console.log(
      `🎯 setPosition: (${oldX.toFixed(1)}, ${oldY.toFixed(
        1
      )}) -> (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`
    );
    updatePose(this.gfx, {
      x: this.x,
      y: this.y,
      wobble: this.wobble,
      crouchHeight: this.crouchHeight,
      baseCrouchOffset: this.baseCrouchOffset,
      colors: this.colors,
      health: this.health,
      maxHealth: this.maxHealth,
      isWallGrabbing: this.wall.isWallGrabbing,
    });
  }

  public getBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  } {
    const radius = 25;
    const heightReduction = this.crouchHeight * 10;
    const crouchYOffset = this.crouchHeight * 15;

    const width = 50;
    const height = 50 - heightReduction;

    const x = this.x - radius;
    const y = this.y - radius + crouchYOffset;

    return { x, y, width, height, radius };
  }

  public getCircleBounds(): {
    x: number;
    y: number;
    radius: number;
  } {
    const radius = 18; // 더 작은 반지름으로 조정
    const heightReduction = this.crouchHeight * 6; // 앉기 시 높이 감소 줄임
    const crouchYOffset = this.crouchHeight * 3; // Y 오프셋 더 줄임

    return {
      x: this.x,
      y: this.y - crouchYOffset, // Y값을 30px 올려서 플랫폼에 박히는 문제 해결
      radius: Math.max(radius - heightReduction, 12), // 최소 반지름 보장
    };
  }

  public resetVelocity(): void {
    this.velocityX = 0;
    this.velocityY = 0;
    this.isGrounded = false;
    this.isJumping = false;
    // 벽잡기 리셋
    this.wall.isWallGrabbing = false;
    this.wall.wallGrabDirection = null;
    this.wall.wallGrabTimer = 0;
  }

  public updatePlatforms(platforms: Platform[]): void {
    this.platforms = platforms;
  }

  public heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.wobble += 0.3;
  }
  public setMaxHealth(maxHealth: number): void {
    this.maxHealth = maxHealth;
    this.health = Math.min(this.health, maxHealth);
  }
  public takeDamage(damage: number): void {
    if (this.invulnerable || damage <= 0) return;

    // 서버에서 체력을 관리하므로 로컬에서는 시각적 효과만 적용
    // 실제 체력 감소는 서버의 healthUpdate 이벤트에서 처리됨

    // 시각적 효과 적용
    this.wobble += 1;
    this.setInvulnerable(1000);

    console.log(
      `💚 로컬 플레이어 데미지 효과 적용 (서버에서 체력 관리) - 데미지: ${damage}`
    );
  }
  public getHealth(): number {
    return this.health;
  }
  public setHealth(health: number): void {
    const oldHealth = this.health;
    this.health = Math.max(0, Math.min(this.maxHealth, health));

    // 체력이 변경되었으면 로그 출력
    if (oldHealth !== this.health) {
      console.log(`💚 내 체력 변경: ${oldHealth} -> ${this.health}`);

      // 체력이 0이 되었을 때 사망 처리 (서버에서 체력이 0으로 설정된 경우)
      if (this.health <= 0 && oldHealth > 0) {
        console.log(`💀 플레이어 사망 처리`);
        // 사망 파티클/브로드캐스트는 서버 dead 이벤트에서 처리
      }
    }
  }
  public isAlive(): boolean {
    return this.health > 0;
  }
  public isInvulnerable(): boolean {
    return this.invulnerable;
  }
  public setInvulnerable(duration: number): void {
    this.invulnerable = true;
    this.invulnerabilityTimer = duration;
  }
  public addWobble(): void {
    this.wobble += 1;
  }

  // 새로운 체력바 시스템에서는 타이머가 필요 없음

  public getId(): string | undefined {
    return this.id;
  }

  public setId(id: string): void {
    this.id = id;
  }

  public setMultiplayerMode(isMultiplayer: boolean): void {
    this.isMultiplayer = isMultiplayer;
  }

  // ===== 증강 기반 이동 파라미터 =====
  private jumpHeightMul: number = 1;
  private extraJumpsAllowed: number = 0;
  private remainingExtraJumps: number = 0;
  private gravityMul: number = 1;
  private prevJumpPressed: boolean = false;
  private moveSpeedMul: number = 1;

  public setJumpHeightMultiplier(mult: number): void {
    this.jumpHeightMul = Math.max(0.2, mult || 1);
    try {
      console.log(`🧩 증강 함수 발동: 점프 높이 배율 = x${this.jumpHeightMul}`);
    } catch {}
  }
  public setExtraJumps(n: number): void {
    this.extraJumpsAllowed = Math.max(0, Math.floor(n || 0));
    this.remainingExtraJumps = this.isGrounded
      ? this.extraJumpsAllowed
      : Math.min(this.remainingExtraJumps, this.extraJumpsAllowed);
    try {
      console.log(`🧩 증강 함수 발동: 추가 점프 = ${this.extraJumpsAllowed}`);
    } catch {}
  }
  public setGravityMultiplier(mult: number): void {
    this.gravityMul = Math.max(0.1, mult || 1);
    try {
      console.log(`🧩 증강 함수 발동: 중력 배율 = x${this.gravityMul}`);
    } catch {}
  }
  public setMoveSpeedMultiplier(mult: number): void {
    this.moveSpeedMul = Math.max(0.3, mult || 1);
    try {
      console.log(`🧩 증강 함수 발동: 이동 속도 배율 = x${this.moveSpeedMul}`);
    } catch {}
  }

  private performJump(): void {
    this.velocityY = -GAME_CONFIG.jumpSpeed * this.jumpHeightMul;
    this.isJumping = true;
    this.isGrounded = false;
    this.jumpStartTime = Date.now() / 1000;
    this.jumpStartY = this.y;

    // 착지 앉기 상태 취소 및 앉기 상태 해제
    this.isLandingCrouch = false;
    this.landingCrouchStartTime = 0;
    this.isCrouching = false;

    this.wobble += 1;
    this.particleSystem.createJumpParticle(
      this.x,
      this.y + 25,
      this.colors.head
    );
    if (this.onParticleCreated) {
      this.onParticleCreated("jump", this.x, this.y + 25, this.colors.head);
    }
  }

  private blinkEnabled: boolean = false;
  private lastBlinkAt: number = 0;
  private blinkCooldownMs: number = 2000; // 2초 쿨타임
  private performBlink(direction: -1 | 1): void {
    // 간단한 텔레포트: 150px + 충돌 보정은 생략
    const distance = 150;
    this.x += distance * direction;
    try {
      this.particleSystem.createFancyParticleExplosion(this.x, this.y);
    } catch {}
  }

  // 🆕 마우스 위치로 텔레포트 (X축만, 짧은 거리)
  private performBlinkToMouse(mouseX: number, mouseY: number): void {
    // 현재 위치에서 짧은 거리만 이동 (최대 100px)
    const currentX = this.x;
    const targetX = mouseX;
    const distance = targetX - currentX;
    const maxDistance = 100; // 최대 이동 거리

    let newX = currentX;
    if (Math.abs(distance) > maxDistance) {
      // 최대 거리를 넘으면 방향에 따라 제한
      newX = currentX + (distance > 0 ? maxDistance : -maxDistance);
    } else {
      newX = targetX;
    }

    // X축으로만 텔레포트 (Y축은 현재 위치 유지)
    this.setPosition(newX, this.y);

    try {
      // 현재 위치에서 파티클 생성 (이동 전 위치)
      this.particleSystem.createSimpleTeleportParticle(
        currentX,
        this.y,
        this.colors.head
      );
      console.log(
        `🎯 텔레포트: ${currentX.toFixed(1)} -> ${newX.toFixed(
          1
        )} (거리: ${Math.abs(newX - currentX).toFixed(1)}px)`
      );
    } catch {}
  }

  public setBlinkEnabled(enabled: boolean): void {
    this.blinkEnabled = !!enabled;
    try {
      console.log(
        `🧩 증강 함수 발동: 블링크 ${this.blinkEnabled ? "ON" : "OFF"}`
      );
    } catch {}
  }

  // 🆕 마우스 위치로 블링크 실행 (X축만)
  public performBlinkToMousePosition(mouseX: number, mouseY: number): void {
    if (!this.blinkEnabled) return;

    const nowMs = Date.now();
    if (nowMs - this.lastBlinkAt >= this.blinkCooldownMs) {
      console.log(
        `🎯 X축 블링크 실행: 현재 X (${this.x.toFixed(
          1
        )}) -> 목표 X (${mouseX.toFixed(1)})`
      );
      this.performBlinkToMouse(mouseX, mouseY);
      this.lastBlinkAt = nowMs;
    }
  }

  // HP바 렌더링
  private renderHealthBar(): void {
    if (!this.hpBarGraphics) return;

    // HP바 그래픽 초기화
    this.hpBarGraphics.clear();

    // 상시 체력바 표시
    drawHealthBar(
      this.hpBarGraphics,
      this.x,
      this.y,
      this.health,
      this.maxHealth,
      0 // 타이머는 사용하지 않음
    );
  }

  public setMapBounds(width: number, height: number): void {
    this.x = Math.max(25, Math.min(width - 25, this.x));
    // 멀티플레이어 모드에서는 respawn하지 않음 (서버에서 관리)
    if (this.y > height + 100 && !this.isMultiplayer) this.respawn();
  }

  public getBody(): any {
    return this.gfx.body;
  }

  // 🆕 가시성 토글 (GameScene에서 사망/부활 처리용)
  public setVisible(visible: boolean): void {
    try {
      this.gfx.body?.setVisible?.(visible);
      this.gfx.face?.setVisible?.(visible);
      this.gfx.accessory?.setVisible?.(visible);
      this.gfx.leftArm?.setVisible?.(visible);
      this.gfx.rightArm?.setVisible?.(visible);
      this.gfx.leftLeg?.setVisible?.(visible);
      this.gfx.rightLeg?.setVisible?.(visible);
      this.gfx.gun?.setVisible?.(visible);
    } catch {}
  }

  public setColorPreset(preset: CharacterPreset): void {
    this.colorPreset = preset;
    this.colors = (CHARACTER_PRESETS as any)[preset] as CharacterColors;
    setBodyColor(this.gfx, this.colors.head);
  }
  public getCurrentPreset(): CharacterPreset {
    return this.colorPreset;
  }
  public getAvailablePresets(): CharacterPreset[] {
    return GameUtils.getAllPresets();
  }

  public getBullets(): Bullet[] {
    return this.bullets;
  }
  public clearBullets(): void {
    this.bullets.forEach((b) => b.destroy());
    this.bullets = [];
  }

  public setShootCooldown(cooldown: number): void {
    this.shootCooldown = cooldown;
  }
  public getShootCooldown(): number {
    return this.shootCooldown;
  }
  public canShoot(): boolean {
    return Date.now() - this.lastShotTime >= this.shootCooldown;
  }

  public isCrouchingState(): boolean {
    return this.isCrouching;
  }
  public getCrouchHeight(): number {
    return this.crouchHeight;
  }
  public setCrouchTransitionSpeed(speed: number): void {
    this.crouchTransitionSpeed = Math.max(0.01, Math.min(1, speed));
  }
  public forceCrouch(c: boolean): void {
    this.isCrouching = c;
  }

  public isWallGrabbingState(): boolean {
    return this.wall.isWallGrabbing;
  }
  public getWallGrabDirection(): "left" | "right" | null {
    return this.wall.wallGrabDirection;
  }
  public getWallGrabTimer(): number {
    return this.wall.wallGrabTimer;
  }
  public setWallGrabTime(time: number): void {
    this.wall.maxWallGrabTime = Math.max(500, time);
  }
  public setWallSlideSpeed(speed: number): void {
    this.wall.wallSlideSpeed = Math.max(10, Math.min(200, speed));
  }
  public setWallJumpForce(x: number, y: number): void {
    this.wallJumpForce.x = Math.max(200, Math.abs(x));
    this.wallJumpForce.y = -Math.max(200, Math.abs(y));
  }
  public getWallJumpForce(): { x: number; y: number } {
    return { ...this.wallJumpForce };
  }
  public setWallJumpCooldown(cooldown: number): void {
    this.wall.wallJumpCooldown = Math.max(0, cooldown);
  }
  public getWallJumpCooldown(): number {
    return this.wall.wallJumpCooldown;
  }
  public forceReleaseWall(): void {
    this.wall.isWallGrabbing = false;
    this.wall.wallGrabDirection = null;
    this.wall.wallGrabTimer = 0;
  }

  public getGunPosition(): { x: number; y: number; angle: number } {
    // 🔥 혹시 this.mouseX나 this.mouseY가 잘못된 값인지 확인
    if (!isFinite(this.mouseX) || !isFinite(this.mouseY)) {
      console.error(
        `❌ 마우스 좌표가 잘못됨! mouseX: ${this.mouseX}, mouseY: ${this.mouseY}`
      );
      // 기본값으로 대체
      return { x: this.x + 30, y: this.y, angle: 0 };
    }

    const result = computeGunPos({
      x: this.x,
      y: this.y,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      crouchHeight: this.crouchHeight,
      baseCrouchOffset: this.baseCrouchOffset,
    });

    // 🔥 결과값 검증
    if (!isFinite(result.x) || !isFinite(result.y)) {
      console.error(`❌ computeGunPos가 잘못된 값을 반환했습니다!`, result);
      // 안전한 기본값 반환
      const angle = Math.atan2(this.mouseY - this.y, this.mouseX - this.x);
      return {
        x: this.x + Math.cos(angle) * 30,
        y: this.y + Math.sin(angle) * 30,
        angle: angle,
      };
    }

    return result;
  }

  private respawn(): void {
    this.x = 150;
    this.y = 800;
    this.velocityX = 0;
    this.velocityY = 0;
    this.health = this.maxHealth;
    this.isGrounded = false;
    this.isJumping = false;
    this.isCrouching = false;
    this.crouchHeight = 0;
    this.wobble = 2;

    // 벽 상태 초기화
    this.wall.isWallGrabbing = false;
    this.wall.wallGrabDirection = null;
    this.wall.wallGrabTimer = 0;
    this.wall.wallJumpCooldown = 0;

    this.bullets.forEach((b) => b.destroy());
    this.bullets = [];
  }

  // 화면 바닥 경계에 닿았을 때 호출
  public applyBottomBoundaryHit(damageRatio = 0.3, bounceSpeed = 900): void {
    const now = Date.now();
    if (now - this.lastFalloutAt < this.falloutCooldownMs) return; // 중복 방지

    // 사망 상태면 낙사 데미지 무시
    if (this.health <= 0) return;

    const dmg = Math.max(1, Math.round(this.maxHealth * damageRatio));

    // 서버에 낙하 데미지 전송 (로컬 데미지 처리 제거)
    if (this.onFalloutDamage) {
      this.onFalloutDamage(dmg);
    }

    // 시각적 효과만 적용
    this.takeDamage(dmg);

    this.velocityY = -Math.abs(bounceSpeed); // 위로 튕김
    this.isGrounded = false;
    this.isJumping = true;

    this.lastFalloutAt = now;
  }

  destroy(): void {
    console.log("🧹 플레이어 정리 중...");

    // 포인터 핸들러 해제
    this.pointerHandle?.destroy?.();

    // 총알 정리
    this.bullets.forEach((b) => b.destroy());
    this.bullets = [];

    // HP바 그래픽 제거
    if (this.hpBarGraphics) {
      this.hpBarGraphics.destroy();
    }

    // 그래픽 제거
    destroyCharacter(this.gfx);

    console.log("✅ 플레이어 정리 완료");
  }

  private baseColor: number;
}
