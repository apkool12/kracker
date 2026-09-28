import React from "react";
import { ACCESSORY_SHAPES } from "../../game/render/accessory";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * 게임 속 장신구와 같은 도형 데이터로 그리는 SVG.
 * viewBox 는 머리 윗부분(-36~0): 아래 변이 몸통 중심선, 폭 40 = 몸통 지름.
 */
const AccessoryIcon: React.FC<{ id?: string; style?: React.CSSProperties; className?: string }> = ({
  id,
  style,
  className,
}) => (
  <svg viewBox="-26 -36 52 36" style={style} className={className} aria-hidden>
    {(ACCESSORY_SHAPES[id || "none"] ?? []).map((s, i) => {
      if (s.t === "poly") return <polygon key={i} points={s.pts.join(" ")} fill={hex(s.c)} />;
      if (s.t === "ellipse") return <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill={hex(s.c)} />;
      if (s.t === "line")
        return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={hex(s.c)} strokeWidth={s.w} strokeLinecap="round" />;
      const p0 = [s.x + Math.cos(s.a0) * s.r, s.y + Math.sin(s.a0) * s.r];
      const p1 = [s.x + Math.cos(s.a1) * s.r, s.y + Math.sin(s.a1) * s.r];
      const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
      return (
        <path
          key={i}
          d={`M ${p0[0]} ${p0[1]} A ${s.r} ${s.r} 0 ${large} 1 ${p1[0]} ${p1[1]}`}
          stroke={hex(s.c)}
          strokeWidth={s.w}
          fill="none"
        />
      );
    })}
  </svg>
);

export default AccessoryIcon;
