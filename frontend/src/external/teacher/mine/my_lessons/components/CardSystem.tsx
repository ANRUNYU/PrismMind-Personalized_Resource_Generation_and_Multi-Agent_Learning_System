import { useEffect, useRef } from 'react'

import { clamp, createMotionEngine, lerp } from '../motion/motionEngine'
import type { LessonCardModel } from '../types'

interface Props {
  courses: LessonCardModel[]
  emptyText?: string
  selectedId?: number
  onSelect: (course: LessonCardModel) => void
}

export default function CardSystem({ courses, emptyText, selectedId, onSelect }: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<number, HTMLElement>())
  const motionRef = useRef({
    rawTargetAngle: 0,
    targetAngle: 0,
    currentAngle: 0,
    step: (Math.PI * 2) / 5,
    hoverTarget: new Map<number, number>(),
    hoverCurrent: new Map<number, number>()
  })

  useEffect(() => {
    if (!courses.length) return

    const stage = stageRef.current
    if (!stage) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const motion = motionRef.current
      motion.rawTargetAngle += event.deltaY * 0.002
      motion.targetAngle = Math.round(motion.rawTargetAngle / motion.step) * motion.step
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [courses.length])

  useEffect(() => {
    const motion = motionRef.current
    const liveIds = new Set(courses.map((course) => course.id))

    Array.from(motion.hoverTarget.keys()).forEach((id) => {
      if (!liveIds.has(id)) {
        motion.hoverTarget.delete(id)
        motion.hoverCurrent.delete(id)
      }
    })

    courses.forEach((course) => {
      if (!motion.hoverTarget.has(course.id)) {
        motion.hoverTarget.set(course.id, 0)
        motion.hoverCurrent.set(course.id, 0)
      }
    })

    const engine = createMotionEngine(() => {
      const stage = stageRef.current
      if (!stage) return

      const rect = stage.getBoundingClientRect()
      const cardScale = Number.parseFloat(window.getComputedStyle(stage).getPropertyValue('--card-scale')) || 0.88
      const radius = clamp(rect.width * 0.28, 230, 370)
      const step = (Math.PI * 2) / Math.max(courses.length, 5)
      const visualStep = (Math.PI * 2) / Math.max(Math.min(courses.length, 6), 5)
      const windowedCards = courses.length > 6
      motion.step = step

      motion.currentAngle += (motion.targetAngle - motion.currentAngle) * 0.08

      courses.forEach((course, index) => {
        const element = cardRefs.current.get(course.id)
        if (!element) return

        let angle = index * step - motion.currentAngle
        if (windowedCards) {
          let relativeIndex = index - motion.currentAngle / step
          relativeIndex = (((relativeIndex + courses.length / 2) % courses.length) + courses.length) % courses.length - courses.length / 2
          if (relativeIndex <= -2.5 || relativeIndex > 3.5) {
            element.style.visibility = 'hidden'
            element.style.opacity = '0'
            element.style.filter = 'none'
            element.style.zIndex = '0'
            element.style.pointerEvents = 'none'
            element.style.transform = 'translate3d(-50%, -50%, -370px) scale(0.66)'
            return
          }
          angle = relativeIndex * visualStep
        }

        const x = Math.sin(angle) * radius
        const z = Math.cos(angle) * radius
        const y = Math.sin(angle * 0.6) * 34
        const rotateY = -angle
        const depth = clamp((z + radius) / (radius * 2), 0, 1)
        const hoverNow = lerp(motion.hoverCurrent.get(course.id) || 0, motion.hoverTarget.get(course.id) || 0, 0.14)
        motion.hoverCurrent.set(course.id, hoverNow)

        const selectedBoost = selectedId === course.id ? 0.02 : 0
        const scale = (0.76 + depth * 0.28 + hoverNow * 0.05 + selectedBoost) * cardScale
        const opacity = 0.28 + depth * 0.72
        const blur = (1 - depth) * 2.8
        const glow = 0.16 + depth * 0.34 + hoverNow * 0.32
        const selectedDepthBoost = selectedId === course.id && depth > 0.98 ? 80 : 0

        element.style.visibility = 'visible'
        element.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(
          2
        )}px), ${z.toFixed(2)}px) rotateY(${rotateY.toFixed(4)}rad) scale(${scale.toFixed(4)})`
        element.style.opacity = opacity.toFixed(3)
        element.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(0.94 + depth * 0.2 + hoverNow * 0.18).toFixed(
          3
        )}) brightness(${(0.86 + depth * 0.16 + hoverNow * 0.12).toFixed(3)}) drop-shadow(0 24px 34px rgba(43, 95, 102, ${glow.toFixed(
          3
        )}))`
        element.style.zIndex = String(Math.round(depth * 1000 + hoverNow * 40 + selectedDepthBoost))
        element.style.pointerEvents = depth < 0.08 ? 'none' : 'auto'
      })
    })

    engine.start()
    return () => engine.stop()
  }, [courses, selectedId])

  const setHover = (id: number, value: number) => {
    motionRef.current.hoverTarget.set(id, value)
  }

  if (!courses.length) {
    return (
      <div className="lesson-empty-state">
        {emptyText || '暂无课程。输入课程名称创建第一门课程，或点击刷新查看最新课程。'}
      </div>
    )
  }

  return (
    <div className="lesson-card-system" ref={stageRef}>
      {courses.map((course) => {
        const progressScale = course.progressPercent === null ? 0 : course.progressPercent / 100
        return (
          <article
            className={`lesson-prism-card ${selectedId === course.id ? 'is-selected' : ''}`}
            data-card="teacher-course"
            data-course-id={course.id}
            key={course.id}
            ref={(node) => {
              if (node) {
                cardRefs.current.set(course.id, node)
              } else {
                cardRefs.current.delete(course.id)
              }
            }}
            style={{ '--accent': course.accent || '#8fd8df' } as React.CSSProperties}
            tabIndex={0}
            onClick={() => onSelect(course)}
            onFocus={() => setHover(course.id, 1)}
            onBlur={() => setHover(course.id, 0)}
            onMouseEnter={() => setHover(course.id, 1)}
            onMouseLeave={() => setHover(course.id, 0)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(course)
              }
            }}
          >
            <div className="prism-card-side prism-card-side-left" aria-hidden="true" />
            <div className="prism-card-side prism-card-side-right" aria-hidden="true" />
            <div className="prism-card-face">
              <span className="lesson-status">{course.status}</span>
              <h3>{course.title}</h3>
              <p>{course.progressLabel}</p>
              <div className="lesson-progress-track">
                <span style={{ transform: `scaleX(${progressScale})` }} />
              </div>
              <small>{course.progressCaption} · 更新于 {course.updatedAt}</small>
            </div>
          </article>
        )
      })}
      <div className="scene-scroll-hint">滚动鼠标滚轮，探索更多课程</div>
    </div>
  )
}
