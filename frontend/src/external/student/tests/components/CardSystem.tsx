import { useEffect, useRef, useState } from 'react'

import { clamp } from '../motion/motionEngine'
import type { TestCardModel } from '../types'

const renderRange = 2

const positionMap: Record<string, { y: number; scale: number; opacity: number }> = {
  '-2': { y: 260, scale: 0.86, opacity: 0 },
  '-1': { y: 140, scale: 0.92, opacity: 0.35 },
  '0': { y: 0, scale: 1, opacity: 1 },
  '1': { y: -140, scale: 0.92, opacity: 0.35 },
  '2': { y: -260, scale: 0.86, opacity: 0 }
}

const wrapIndex = (index: number, total: number) => {
  if (total <= 0) return 0

  let next = index
  while (next < 0) next += total
  while (next >= total) next -= total
  return next
}

const getLoopOffset = (index: number, activeIndex: number, total: number) => {
  let offset = index - activeIndex

  if (offset > total / 2) offset -= total
  if (offset < -total / 2) offset += total

  return offset
}

const getScrollDirection = (event: React.WheelEvent) => Math.sign(event.deltaY)

function getVisualState(visualOffset: number) {
  const key = String(clamp(Math.round(visualOffset), -renderRange, renderRange))
  return positionMap[key] || positionMap['0']
}

export default function CardSystem({
  tests,
  activeIndex,
  selectedId,
  onActiveChange,
  onSelect
}: {
  tests: TestCardModel[]
  activeIndex: number
  selectedId?: number
  onActiveChange: (nextIndex: number) => void
  onSelect: (test: TestCardModel, index: number) => void
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef(new Map<number, HTMLElement>())
  const timeoutRef = useRef(0)
  const activeIndexRef = useRef(activeIndex)
  const [slideDirection, setSlideDirection] = useState(0)
  const [isSliding, setIsSliding] = useState(false)
  const motionRef = useRef({
    currentIndex: activeIndex,
    targetIndex: activeIndex,
    direction: 0,
    locked: false
  })

  const applyLayout = (baseIndex: number, direction: number) => {
    window.requestAnimationFrame(() => {
      const stage = stageRef.current
      const total = tests.length
      const cardScale = stage
        ? Number.parseFloat(window.getComputedStyle(stage).getPropertyValue('--card-scale')) || 0.9
        : 0.9

      tests.forEach((test, index) => {
        const element = cardRefs.current.get(test.id)
        if (!element) return

        const offset = getLoopOffset(index, baseIndex, total)
        const visualOffset = offset - direction
        const visual = getVisualState(visualOffset)
        const selectedBoost = selectedId === test.id ? 0.015 : 0
        const blur = Math.abs(offset) * 2
        const zIndex = 100 - Math.abs(offset)

        element.style.transform = `translate3d(-50%, calc(-50% + ${visual.y.toFixed(2)}px), 0) scale(${(
          visual.scale * cardScale + selectedBoost
        ).toFixed(4)})`
        element.style.opacity = visual.opacity.toFixed(3)
        element.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(1 - Math.min(Math.abs(visualOffset), 2) * 0.08).toFixed(3)})`
        element.style.zIndex = String(zIndex + (selectedId === test.id ? 3 : 0))
        element.style.pointerEvents = Math.abs(offset) > 1 ? 'none' : 'auto'
      })
    })
  }

  useEffect(() => {
    const safeActiveIndex = wrapIndex(activeIndex, tests.length)
    activeIndexRef.current = safeActiveIndex
    motionRef.current.currentIndex = safeActiveIndex
    motionRef.current.targetIndex = safeActiveIndex
    applyLayout(safeActiveIndex, isSliding ? slideDirection : 0)
  }, [activeIndex, tests, selectedId, slideDirection, isSliding])

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    []
  )

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault()

    if (motionRef.current.locked || tests.length <= 1) return

    const direction = getScrollDirection(event)
    if (direction === 0) return

    const nextIndex = wrapIndex(activeIndexRef.current + direction, tests.length)

    motionRef.current.locked = true
    motionRef.current.direction = direction
    motionRef.current.targetIndex = nextIndex
    setSlideDirection(direction)
    setIsSliding(true)
    applyLayout(activeIndexRef.current, direction)

    timeoutRef.current = window.setTimeout(() => {
      activeIndexRef.current = nextIndex
      motionRef.current.currentIndex = nextIndex
      motionRef.current.direction = 0
      onActiveChange(nextIndex)
      setSlideDirection(0)
      setIsSliding(false)
      applyLayout(nextIndex, 0)
      motionRef.current.locked = false
    }, 520)
  }

  const safeActiveIndex = wrapIndex(activeIndex, tests.length)
  const visibleTests = tests.filter(
    (_, index) => tests.length <= renderRange * 2 + 1 || Math.abs(getLoopOffset(index, safeActiveIndex, tests.length)) <= renderRange
  )

  return (
    <div className="test-card-system" ref={stageRef} onWheel={handleWheel}>
      {visibleTests.map((test) => {
        const index = tests.findIndex((item) => item.id === test.id)

        return (
          <article
            className={`test-card ${selectedId === test.id ? 'is-selected' : ''}`}
            key={test.id}
            ref={(node) => {
              if (node) {
                cardRefs.current.set(test.id, node)
              } else {
                cardRefs.current.delete(test.id)
              }
            }}
            style={{ '--accent': test.accent || '#9cd7dc' } as React.CSSProperties}
            onClick={() => onSelect(test, index)}
          >
            <div className="paper-crystal" aria-hidden="true" />
            <span className="test-course">{test.course}</span>
            <h3>{test.title}</h3>
            <p>{test.summary}</p>
            <div className="test-stat-row">
              <span>
                <strong>{test.questionCount}</strong>
                题目数
              </span>
              <span>
                <strong>{test.totalScore}</strong>
                总分值
              </span>
              <span>
                <strong>{test.duration}</strong>
                分钟
              </span>
            </div>
            <small>更新于 {test.updatedAt}</small>
            <button type="button">{test.status === 'submitted' ? '查看结果' : '开始/继续'} →</button>
          </article>
        )
      })}
      <div className="stack-indicator" aria-hidden="true">
        {tests.map((test, index) => (
          <span className={index === activeIndex ? 'is-active' : ''} key={test.id} />
        ))}
      </div>
      <div className="scene-scroll-hint">滚动鼠标滚轮切换试卷</div>
    </div>
  )
}
