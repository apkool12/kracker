import AccessoryIcon from "../icons/AccessoryIcon";
import { ACCESSORIES } from "../../game/render/accessory";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import BgBase from "../../assets/images/titleBackground.svg";
import BackButton from "../buttons/BackButton";
import { PLAYER_CONSTANTS } from "../../game/config/GameConstants";

type Player = { id: string; team: number; name: string; color: string; accessory?: string };

interface ColorSelectModalProps {
  open: boolean;
  player: Player | null;
  numTeams?: number;
  onClose: () => void;
  onConfirm: (next: Player) => void;
  palette?: string[];
  blockedColors?: string[];
}

// 0xRRGGBB → "#RGGBB"
const toCssHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const DEFAULT_PALETTE: string[] = [
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.빨간색.primary),
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.주황색.primary),
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.초록색.primary),
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.파란색.primary),
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.보라색.primary),
  toCssHex(PLAYER_CONSTANTS.COLOR_PRESETS.핑크색.primary),
];

// 전역 방향 기반 하이라이트 이동 튜닝
const DEADZONE = 0.06;  // 중심 흔들림 방지 구간(0~1)
const SMOOTH = 0.18;  // 위치 보간(0~1), 낮을수록 더 부드러움
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

const ColorSelectModal: React.FC<ColorSelectModalProps> = ({
  open,
  player,
  numTeams = 0,
  onClose,
  onConfirm,
  palette = DEFAULT_PALETTE,
  blockedColors = [],
}) => {
  const safePlayer = useMemo(
    () => player ?? { id: "", team: 0, name: "", color: palette[0] },
    [player, palette]
  );
  const [picked, setPicked] = useState<string>(safePlayer.color);
  const [pickedAcc, setPickedAcc] = useState<string>(safePlayer.accessory ?? "none");
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (open) {
      setIsAnimating(true);
    }
  }, [open]);

  // ===== 마우스 추적 & 하이라이트(동일 방향) 이동 =====
  const faceRef = useRef<HTMLDivElement>(null);
  const leftEyeRef = useRef<HTMLDivElement>(null);
  const rightEyeRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);

  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [hlL, setHlL] = useState<{ leftPct: number; topPct: number }>({ leftPct: 30, topPct: 30 });
  const [hlR, setHlR] = useState<{ leftPct: number; topPct: number }>({ leftPct: 30, topPct: 30 });

  useEffect(() => {
    if (!mouse) return;

    const face = faceRef.current?.getBoundingClientRect();
    if (!face) return;

    // 전역(얼굴 중심) → 마우스 방향 단위벡터 (양쪽 눈에 동일 적용)
    const fcx = face.left + face.width / 2;
    const fcy = face.top + face.height / 2;
    const vx = mouse.x - fcx;
    const vy = mouse.y - fcy;
    const vlen = Math.hypot(vx, vy) || 1;
    const ux = vx / vlen;
    const uy = vy / vlen;

    // 거리 기반 강도 (멀수록 더 바깥쪽)
    const maxDist = face.width / 2;
    let frac = Math.min(1, Math.max(0, Math.hypot(vx, vy) / maxDist));
    if (frac < DEADZONE) frac = 0;
    else frac = easeOut((frac - DEADZONE) / (1 - DEADZONE));

    type Pt = { leftPct: number; topPct: number };

    const calc = (pupilEl: HTMLDivElement | null, prev: Pt): Pt => {
      if (!pupilEl) return prev;

      const rect = pupilEl.getBoundingClientRect();

      // 하이라이트 반지름 r = (눈 가로의 1/3)/2 = w/6
      const r = rect.width / 6;

      // 하이라이트가 안 벗어나도록 r만큼 축소된 타원 반경
      const a = Math.max(1, rect.width / 2 - r);
      const b = Math.max(1, rect.height / 2 - r);

      // 동일 방향(ux,uy)으로 타원 경계까지 가능한 스케일
      const boundaryScale = 1 / Math.sqrt((ux * ux) / (a * a) + (uy * uy) / (b * b));

      // 목표 좌표(중심 기준)
      const hx = ux * boundaryScale * frac;
      const hy = uy * boundaryScale * frac;

      // 퍼센트 좌표로 변환
      const targetLeft = ((hx + rect.width / 2) / rect.width) * 100;
      const targetTop = ((hy + rect.height / 2) / rect.height) * 100;

      // 스무딩
      const leftPct = prev.leftPct + (targetLeft - prev.leftPct) * SMOOTH;
      const topPct = prev.topPct + (targetTop - prev.topPct) * SMOOTH;

      return { leftPct, topPct };
    };

    setHlL(prev => calc(leftPupilRef.current, prev));
    setHlR(prev => calc(rightPupilRef.current, prev));
  }, [mouse]);

  // 사용 중 색 집합(소문자 비교)
  const blockedSet = useMemo(
    () => new Set((blockedColors ?? []).map(c => c.toLowerCase())),
    [blockedColors]
  );

  const selfColorLower = safePlayer.color.toLowerCase();

  // 사용할 수 있는 첫 번째 색 (자기 색은 항상 허용)
  const firstAvailable = useMemo(() => {
    const found = palette.find(col => {
      const l = col.toLowerCase();
      return l === selfColorLower || !blockedSet.has(l);
    });
    return found ?? safePlayer.color;
  }, [palette, blockedSet, selfColorLower, safePlayer.color]);

  
  // 현재 선택(picked)이 막힌 색이면 자동 보정
  useEffect(() => {
    const l = picked.toLowerCase();
    if (blockedSet.has(l) && l !== selfColorLower) {
      setPicked(firstAvailable);
    }
  }, [blockedSet, picked, selfColorLower, firstAvailable]);

  const handleConfirm = () => {
    const l = picked.toLowerCase();
    const finalColor = (blockedSet.has(l) && l !== selfColorLower) ? firstAvailable : picked;
    onConfirm({ ...safePlayer, color: finalColor, accessory: pickedAcc });
    
    // 사라질 때 트랜지션 적용
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  if (!open || !player) return null;

  return (
    <Overlay 
      role="dialog" 
      aria-modal="true" 
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
      style={{
        transform: isAnimating ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <TopBar>
        <TextBackButton onClick={handleConfirm} aria-label="나가기(확정)">
          나가기
        </TextBackButton>
      </TopBar>

      <PreviewWrap>
        <Palette>
          {palette.map((c) => {
            const lower = c.toLowerCase();
            const isBlocked = blockedSet.has(lower) && lower !== selfColorLower;

            return (
              <Swatch
                key={c}
                $color={c}
                $active={picked === c}
                $blocked={isBlocked}
                disabled={isBlocked}
                onClick={() => {if (!isBlocked) setPicked(c) }}
              aria-label={`색상 ${c}`}
              />
            );
          })}
        </Palette>

        <AccRow role="radiogroup" aria-label="장신구">
          {ACCESSORIES.map((a) => (
            <AccChip
              key={a.id}
              type="button"
              role="radio"
              aria-checked={pickedAcc === a.id}
              $active={pickedAcc === a.id}
              onClick={() => setPickedAcc(a.id)}
            >
              <AccessoryIcon id={a.id} style={{ width: 44, height: 30 }} />
              <span>{a.name}</span>
            </AccChip>
          ))}
        </AccRow>

        <FaceWrap>
        {pickedAcc !== "none" && (
          <AccessoryIcon
            id={pickedAcc}
            style={{ position: "absolute", left: "50%", bottom: 0, width: "130%", transform: "translate(-50%, 0)", overflow: "visible" }}
          />
        )}
        <Face ref={faceRef} $color={picked}>
          {/* 눈: 하이라이트가 '같은 방향'으로 이동 */}
          <EyeWrap ref={leftEyeRef} $side="left">
            <Pupil ref={leftPupilRef}>
              <Highlight style={{ left: `${hlL.leftPct}%`, top: `${hlL.topPct}%` }} />
            </Pupil>
          </EyeWrap>

          <EyeWrap ref={rightEyeRef} $side="right">
            <Pupil ref={rightPupilRef}>
              <Highlight style={{ left: `${hlR.leftPct}%`, top: `${hlR.topPct}%` }} />
            </Pupil>
          </EyeWrap>
        </Face>
        </FaceWrap>
      </PreviewWrap>
    </Overlay>
  );
};

export default ColorSelectModal;

/* ================= styles (UI 변경 없음) ================= */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #090731;
  display: grid;
  grid-template-rows: auto 1fr;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: url(${BgBase}) center/cover no-repeat;
    opacity: 0.1;
    pointer-events: none;
  }
`;

const TopBar = styled.div`
  position: relative;
  height: 150px;
  padding: 20px 0px;
  display: grid;
  place-items: center;
`;

const TextBackButton = styled(BackButton)`
  position: absolute;
  left: clamp(64px, 5vw, 96px);
  top: 50%;
  width: 175px;
  height: 60px;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #8f8f8f;
  font-size: 50px;
  font-weight: 400;

  &:hover { color: #fff; }
  &:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(255,255,255,0.45); border-radius: 8px; }
`;

const Palette = styled.div`
  display: flex;
  justify-content: space-evenly;
  align-items: center;
  width: clamp(640px, 42vw, 860px);
  height: clamp(96px, 7vh, 120px);
  padding: 16px 24px;
  box-sizing: border-box;
  border-radius: 14px;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.06);
  backdrop-filter: blur(6px);
`;

const Swatch = styled.button<{ $color: string; $active?: boolean; $blocked?: boolean }>`
  width: clamp(48px, 4vw, 80px);
  height: clamp(48px, 4vw, 80px);
  border-radius: 50%;
  border: none;
  background: ${({ $color }) => $color};
  cursor: ${({ $blocked }) => ($blocked ? "not-allowed" : "pointer")};
  opacity: ${({ $blocked }) => ($blocked ? 0.25 : 1)};
  box-shadow: ${({ $active }) => ($active ? "0 0 0 4px #090731, 0 0 0 7px #fff" : "none")};
  transition: transform .12s ease, box-shadow .12s ease;
  &:hover:not(:disabled) { transform: translateY(-2px); }
`;

const AccRow = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
  justify-content: center;
`;

const AccChip = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 76px;
  padding: 8px 10px 6px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  color: #e9ecf3;
  font-size: 14px;
  background: ${({ $active }) => ($active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)")};
  box-shadow: ${({ $active }) => ($active ? "0 0 0 2px #fff" : "0 0 0 1px rgba(255,255,255,0.2)")};
  transition: background .12s ease;
  &:hover { background: rgba(255,255,255,0.16); }
`;

// 장신구가 머리 위로 올라갈 공간(지름의 ~34%)을 확보하고, 선택 UI 를 가리지 않게 크기 조정
const FACE_W = "clamp(480px, 34vw, 720px)";
const FaceWrap = styled.div`
  position: relative;
  top: 40px;
  width: ${FACE_W};
  margin-top: calc(${FACE_W} * 0.36);
`;

const PreviewWrap = styled.div`
  display: grid;
  place-items: center;
  padding-bottom: 24px;
`;

const Face = styled.div<{ $color: string }>`
  width: 100%;
  aspect-ratio: 1 / 0.5;
  border-top-left-radius: 1200px;
  border-top-right-radius: 1200px;
  background: ${({ $color }) => $color};
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: url(${BgBase}) center/cover no-repeat;
    opacity: 0.1;
    pointer-events: none;
  }
`;

/* 눈 비율/위치 그대로 */
const EyeWrap = styled.div<{ $side: "left" | "right" }>`
  position: absolute;
  top: 22%;
  ${({ $side }) => ($side === "left" ? "left: 35%;" : "right: 35%;")}
  width: 5%;
  height: 25%;
  transform: translate(-50%, 0);
  pointer-events: none;
`;

const Pupil = styled.div`
  position: absolute;
  inset: 0;
  background: #000;
  border-radius: 50%;
  overflow: hidden; /* 하이라이트 클리핑 */
`;

const Highlight = styled.div`
  position: absolute;
  width: 33%;
  height: 16.5%;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 0px rgba(0,0,0,0.06);
`;