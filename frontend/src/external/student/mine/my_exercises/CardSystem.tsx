import { useEffect, useMemo, useRef } from 'react'

import type { ExerciseCardModel } from './types'
import { createMotionEngine, lerp } from './motionEngine'

interface CardSystemProps {
  exercises: ExerciseCardModel[]
  selectedId?: string | null
  onSelect: (exercise: ExerciseCardModel) => void
}

export default function CardSystem({ exercises, selectedId, onSelect }: CardSystemProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const columnRefs = useRef<Array<HTMLDivElement | null>>([])
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const motionRef = useRef({
    targetOffset: 0,
    currentOffset: 0,
    hoverTarget: new Map<string, number>(),
    hoverCurrent: new Map<string, number>()
  })

  const columns = useMemo(() => {
    const nextColumns: ExerciseCardModel[][] = [[], [], []]
    exercises.forEach((exercise, index) => nextColumns[index % 3].push(exercise))
    return nextColumns
  }, [exercises])

  useEffect(() => {
    const motion = motionRef.current
    const liveIds = new Set(exercises.map((exercise) => exercise.card_id))
    Array.from(motion.hoverTarget.keys()).forEach((id) => {
      if (!liveIds.has(id)) {
        motion.hoverTarget.delete(id)
        motion.hoverCurrent.delete(id)
      }
    })
    exercises.forEach((exercise) => {
      if (!motion.hoverTarget.has(exercise.card_id)) {
        motion.hoverTarget.set(exercise.card_id, 0)
        motion.hoverCurrent.set(exercise.card_id, 0)
      }
    })

    const engine = createMotionEngine(() => {
      const stage = stageRef.current
      const cardScale = stage ? Number.parseFloat(window.getComputedStyle(stage).getPropertyValue('--card-scale')) || 0.86 : 0.86

      motion.currentOffset += (motion.targetOffset - motion.currentOffset) * 0.08
      const columnOffsets = [motion.currentOffset * 0.68, motion.currentOffset * -0.48, motion.currentOffset * 0.56]
      columnRefs.current.forEach((column, index) => {
        if (column) column.style.transform = `translate3d(0, ${columnOffsets[index].toFixed(2)}px, 0)`
      })

      exercises.forEach((exercise) => {
        const element = cardRefs.current.get(exercise.card_id)
        if (!element) return
        const hover = lerp(motion.hoverCurrent.get(exercise.card_id) || 0, motion.hoverTarget.get(exercise.card_id) || 0, 0.16)
        motion.hoverCurrent.set(exercise.card_id, hover)
        const selectedBoost = selectedId === exercise.card_id ? 0.025 : 0
        const scale = (1 + hover * 0.03 + selectedBoost) * cardScale
        const lift = hover * -10
        element.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
        element.style.filter = `drop-shadow(0 ${Math.round(14 + hover * 8)}px ${Math.round(24 + hover * 10)}px rgba(38, 62, 66, ${0.07 + hover * 0.04}))`
      })
    })

    engine.start()
    return () => engine.stop()
  }, [exercises, selectedId])

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!stageRef.current?.contains(event.target as Node)) return
      motionRef.current.targetOffset += event.deltaY * -0.18
      motionRef.current.targetOffset = Math.max(Math.min(motionRef.current.targetOffset, 180), -180)
    }
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <div className="exercise-card-system" ref={stageRef}>
      {columns.map((column, columnIndex) => (
        <div
          className={`masonry-column masonry-column-${columnIndex + 1}`}
          key={`column-${columnIndex}`}
          ref={(element) => {
            columnRefs.current[columnIndex] = element
          }}
        >
          {column.map((exercise) => (
            <article
              className={`exercise-card ${selectedId === exercise.card_id ? 'is-selected' : ''}`}
              data-exercise-card-id={exercise.card_id}
              data-exercise-source={exercise.source}
              key={exercise.card_id}
              ref={(element) => {
                if (element) cardRefs.current.set(exercise.card_id, element)
                else cardRefs.current.delete(exercise.card_id)
              }}
              style={{ minHeight: exercise.height }}
              onMouseEnter={() => motionRef.current.hoverTarget.set(exercise.card_id, 1)}
              onMouseLeave={() => motionRef.current.hoverTarget.set(exercise.card_id, 0)}
            >
              <div className="card-topline">
                <span>{exercise.category}</span>
                <button type="button" aria-label={`查看 ${exercise.title}`} onClick={() => onSelect(exercise)}>
                  →
                </button>
              </div>
              <h3>{exercise.title}</h3>
              <p>{exercise.description || exercise.content || '打开详情后即可查看题目要求、填写答案并获得学习反馈。'}</p>
              <div className="difficulty-row">
                <span className={`score-dot score-${Math.max(1, Math.min(5, Math.ceil((exercise.score ?? 60) / 20)))}`} />
                <strong>{formatDifficultyLabel(exercise.difficulty)}</strong>
                <small>{exercise.status_label}</small>
              </div>
              <div className="tag-row">
                {exercise.tags.slice(0, 4).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <small>
                {exercise.course_name || '个人习题库'} · {exercise.updated_label}
              </small>
              <button className="detail-link" type="button" onClick={() => onSelect(exercise)}>
                打开详情
              </button>
            </article>
          ))}
        </div>
      ))}
    </div>
  )
}

function formatDifficultyLabel(value?: string | null) {
  if (value === 'easy') return '基础'
  if (value === 'hard') return '困难'
  if (value === 'medium') return '中等'
  return value || '-'
}
