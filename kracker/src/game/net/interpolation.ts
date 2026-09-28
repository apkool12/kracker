// 원격 플레이어 스냅샷 보간 (Phaser 비의존 — scripts/interpolation.check.ts 로 검증)
// 원격 플레이어는 이만큼 과거 시점을 그린다 (20Hz 전송 2개 분량 → 지터 흡수)
export const REMOTE_RENDER_DELAY_MS = 100;
const MAX_EXTRAPOLATE_MS = 100;
// 한 스냅샷 사이 이동이 이보다 크면 순간이동으로 간주
export const TELEPORT_DISTANCE = 300;

// renderTime 을 감싸는 두 스냅샷 사이를 선형 보간. 최신 스냅샷보다 뒤면 속도로 짧게 외삽.
export function sampleSnapshots(
  buf: Array<{ t: number; x: number; y: number; vx: number; vy: number }> | undefined,
  renderTime: number
): { x: number; y: number } | null {
  if (!buf || buf.length === 0) return null;
  const first = buf[0]!;
  if (renderTime <= first.t) return { x: first.x, y: first.y };
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1]!;
    const b = buf[i]!;
    if (renderTime >= a.t && renderTime <= b.t) {
      const k = b.t === a.t ? 1 : (renderTime - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const last = buf[buf.length - 1]!;
  const dt = Math.min(renderTime - last.t, MAX_EXTRAPOLATE_MS) / 1000;
  return { x: last.x + last.vx * dt, y: last.y + last.vy * dt };
}
