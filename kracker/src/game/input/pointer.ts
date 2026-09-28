

export interface PointerHandle {
  getPointer: () => { x: number; y: number };
  computeAngle: (originX: number, originY: number) => number;
  destroy: () => void;
}

/**
 * 포인터(마우스) 트래킹을 설정한다.
 * - world 좌표로 변환: pointer + camera.scroll
 * - 왼클릭 시 onShoot 콜백 호출(옵션)
 */
export function setupPointer(
  scene: any,
  opts?: {
    getCamera?: () => any; // 기본값: scene.cameras?.main
    onShoot?: () => void; // 왼클릭 시 호출
  }
): PointerHandle | null {
  if (!scene?.input) return null;

  const getCam = () => opts?.getCamera?.() ?? scene.cameras?.main;
  let mouseX = 0;
  let mouseY = 0;

  const onMove = (pointer: any) => {
    const cam = getCam();
    const scrollX = cam?.scrollX ?? 0;
    const scrollY = cam?.scrollY ?? 0;
    mouseX = (pointer?.x ?? 0) + scrollX;
    mouseY = (pointer?.y ?? 0) + scrollY;
  };

  const onDown = (pointer: any) => {
    // Phaser Pointer: leftButtonDown() 존재
    if (pointer?.leftButtonDown && pointer.leftButtonDown()) {
      opts?.onShoot?.();
    }
  };

  scene.input.on("pointermove", onMove);
  scene.input.on("pointerdown", onDown);

  return {
    getPointer: () => ({ x: mouseX, y: mouseY }),
    computeAngle: (originX: number, originY: number) =>
      Math.atan2(mouseY - originY, mouseX - originX),
    destroy: () => {
      tryOff(scene, "pointermove", onMove);
      tryOff(scene, "pointerdown", onDown);
    },
  };
}

function tryOff(scene: any, evt: string, fn: (...args: any[]) => void) {
  if (scene?.input?.off) {
    scene.input.off(evt, fn);
  }
}
