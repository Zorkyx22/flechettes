/** Logs the user out after a stretch of no activity on a shared computer. */

const ACTIVITY = ["pointerdown", "keydown", "mousemove", "touchstart", "wheel"] as const;

export function startIdleTimer(ms: number, onIdle: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let fired = false;
  const reset = (): void => {
    if (fired) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true;
      onIdle();
    }, ms);
  };
  for (const ev of ACTIVITY) addEventListener(ev, reset, { passive: true });
  reset();
  return () => {
    clearTimeout(timer);
    for (const ev of ACTIVITY) removeEventListener(ev, reset);
  };
}
