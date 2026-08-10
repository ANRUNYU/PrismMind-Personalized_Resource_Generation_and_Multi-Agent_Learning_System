export function lerp(current: number, target: number, amount: number) {
  return current + (target - current) * amount
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function spring(current: number, target: number, velocity: number, stiffness = 0.14, damping = 0.78) {
  const nextVelocity = (velocity + (target - current) * stiffness) * damping
  return {
    value: current + nextVelocity,
    velocity: nextVelocity
  }
}

export function createMotionEngine(onFrame: (frame: { now: number; delta: number }) => void) {
  let frameId = 0
  let lastTime = performance.now()
  let running = false

  function tick(now: number) {
    if (!running) return

    const deltaMs = Math.min(now - lastTime, 48)
    const delta = deltaMs / 16.67
    lastTime = now
    onFrame({ now, delta })
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
