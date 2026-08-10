export function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount
}

export function createMotionEngine(onFrame: () => void) {
  let frameId = 0
  let lastTime = performance.now()
  let running = false

  function tick(now: number) {
    if (!running) return
    lastTime = now
    onFrame()
    frameId = window.requestAnimationFrame(tick)
  }

  return {
    start() {
      if (running) return
      running = true
      lastTime = performance.now()
      frameId = window.requestAnimationFrame(tick)
    },
    stop() {
      running = false
      window.cancelAnimationFrame(frameId)
    }
  }
}
