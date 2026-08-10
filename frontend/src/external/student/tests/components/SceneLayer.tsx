import type { ReactNode } from 'react'

export default function SceneLayer({ children }: { children: ReactNode }) {
  return (
    <section className="scene-layer test-scene-layer" aria-label="试卷 cover-flow 堆叠舞台">
      <div className="stack-stage-grid" aria-hidden="true" />
      {children}
    </section>
  )
}
