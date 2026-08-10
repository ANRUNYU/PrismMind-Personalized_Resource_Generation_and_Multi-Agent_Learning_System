import type { ReactNode } from 'react'

export default function SceneLayer({ children }: { children: ReactNode }) {
  return (
    <section className="scene-layer lesson-scene-layer" aria-label="课程卡片舞台">
      <div className="scene-orbit-grid" aria-hidden="true" />
      <div className="scene-vanish-line" aria-hidden="true" />
      {children}
    </section>
  )
}
