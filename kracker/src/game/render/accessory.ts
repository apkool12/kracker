// 장신구: 도형 데이터 하나로 게임(Phaser Graphics)과 로비(SVG)를 같이 그린다.
// 좌표계: 몸통 중심 (0,0), 반지름 20, 오른쪽을 바라보는 기준 (왼쪽을 볼 땐 그래픽을 좌우 반전)
import list from "../../data/accessories.json";

export type AccessoryId = string;
export const ACCESSORIES: Array<{ id: AccessoryId; name: string }> = list;

export type Shape =
  | { t: "poly"; pts: number[]; c: number }
  | { t: "ellipse"; x: number; y: number; rx: number; ry: number; c: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w: number; c: number }
  | { t: "arc"; x: number; y: number; r: number; a0: number; a1: number; w: number; c: number };

// 윗부분만 있는 반타원 폴리곤
const dome = (cx: number, cy: number, rx: number, ry: number, n = 14) => {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
};
const deg = (d: number) => (d * Math.PI) / 180;

export const ACCESSORY_SHAPES: Record<AccessoryId, Shape[]> = {
  none: [],
  cap: [
    { t: "poly", pts: dome(0, -13, 17.5, 12), c: 0x2f6fd6 },
    { t: "poly", pts: [3, -15, 27, -15, 27, -11.5, 3, -11.5], c: 0x1f4fa6 },
    { t: "ellipse", x: 0, y: -25, rx: 2.2, ry: 1.6, c: 0x1f4fa6 },
  ],
  crown: [
    { t: "poly", pts: [-12, -16, -13, -30, -6, -23, 0, -33, 6, -23, 13, -30, 12, -16], c: 0xf5c542 },
    { t: "poly", pts: [-12, -19, 12, -19, 12, -15.5, -12, -15.5], c: 0xd9a521 },
    { t: "ellipse", x: 0, y: -21, rx: 2, ry: 2, c: 0xe53950 },
    { t: "ellipse", x: -7, y: -20.5, rx: 1.4, ry: 1.4, c: 0x4fc3f7 },
    { t: "ellipse", x: 7, y: -20.5, rx: 1.4, ry: 1.4, c: 0x4fc3f7 },
  ],
  horns: [
    { t: "poly", pts: [-14, -13, -21, -31, -6, -18], c: 0xefe3c4 },
    { t: "poly", pts: [14, -13, 21, -31, 6, -18], c: 0xefe3c4 },
    { t: "poly", pts: [-19, -27, -21, -31, -17, -28], c: 0xc9b99a },
    { t: "poly", pts: [19, -27, 21, -31, 17, -28], c: 0xc9b99a },
  ],
  sprout: [
    { t: "line", x1: 0, y1: -19, x2: 1, y2: -29, w: 2, c: 0x3d8b40 },
    { t: "ellipse", x: -4.5, y: -30, rx: 5, ry: 2.6, c: 0x5cc160 },
    { t: "ellipse", x: 6.5, y: -32, rx: 5.5, ry: 2.8, c: 0x6fd673 },
  ],
  bow: [
    { t: "poly", pts: [8, -20, 0, -27, 0, -13], c: 0xff5f9e },
    { t: "poly", pts: [8, -20, 16, -27, 16, -13], c: 0xff5f9e },
    { t: "ellipse", x: 8, y: -20, rx: 2.8, ry: 2.8, c: 0xd93f7e },
  ],
  headband: [
    { t: "arc", x: 0, y: 0, r: 18, a0: deg(200), a1: deg(340), w: 4.5, c: 0xe53935 },
    { t: "poly", pts: [-16.5, -7, -26, -3, -24, -10], c: 0xe53935 },
    { t: "poly", pts: [-16.5, -7, -25, -12, -21, -15], c: 0xc62828 },
  ],
};

/** 장신구를 Phaser Graphics 에 그린다 (id 가 바뀔 때만 다시 그림) */
export function drawAccessory(g: any, id: AccessoryId | undefined) {
  const key = id || "none";
  if (g.getData?.("acc") === key) return;
  g.setData?.("acc", key);
  g.clear();
  for (const s of ACCESSORY_SHAPES[key] ?? []) {
    if (s.t === "poly") {
      g.fillStyle(s.c);
      const pts = [];
      for (let i = 0; i < s.pts.length; i += 2) pts.push({ x: s.pts[i]!, y: s.pts[i + 1]! });
      g.fillPoints(pts, true);
    } else if (s.t === "ellipse") {
      g.fillStyle(s.c);
      g.fillEllipse(s.x, s.y, s.rx * 2, s.ry * 2);
    } else if (s.t === "line") {
      g.lineStyle(s.w, s.c);
      g.lineBetween(s.x1, s.y1, s.x2, s.y2);
    } else {
      g.lineStyle(s.w, s.c);
      g.beginPath();
      g.arc(s.x, s.y, s.r, s.a0, s.a1);
      g.strokePath();
    }
  }
}
