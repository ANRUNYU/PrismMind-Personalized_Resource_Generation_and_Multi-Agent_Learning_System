import type { PropsWithChildren } from 'react'

export default function SceneLayer({ children }: PropsWithChildren) {
  return (
    <section className="scene-layer exercise-scene-layer" aria-label="练习卡片舞台">
      <div className="masonry-depth-grid" aria-hidden="true" />
      {children}
    </section>
  )
}
