import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'

import { clamp, createMotionEngine, lerp } from '../motion/motionEngine'
import type { TestCardModel } from '../types'

const renderRange = 3
const wheelStep = 0.002

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

const getNearestContinuousIndex = (reference: number, wrappedIndex: number, total: number) => {
  if (total <= 0) return wrappedIndex

  let next = wrappedIndex
  while (next - reference > total / 2) next -= total
  while (reference - next > total / 2) next += total
  return next
}

const getContinuousOffset = (index: number, currentIndex: number, total: number) => {
  const continuousIndex = getNearestContinuousIndex(currentIndex, index, total)
  return continuousIndex - currentIndex
}

interface CardItemProps {
  index: number
  selected: boolean
  test: TestCardModel
  onSelect: (test: TestCardModel, index: number) => void
  onHover: (id: number, value: number) => void
  registerCard: (id: number, node: HTMLElement | null) => void
}

const TestCardItem = memo(function TestCardItem({ index, selected, test, onHover, onSelect, registerCard }: CardItemProps) {
  return (
    <article
      className={`test-card ${selected ? 'is-selected' : ''}`}
      data-card="student-test"
      data-test-id={test.id}
      key={test.id}
      ref={(node) => registerCard(test.id, node)}
      style={{ '--accent': test.accent || '#9cd7dc' } as CSSProperties}
      tabIndex={0}
      onBlur={() => onHover(test.id, 0)}
      onClick={() => onSelect(test, index)}
      onFocus={() => onHover(test.id, 1)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(test, index)
        }
      }}
      onMouseEnter={() => onHover(test.id, 1)}
      onMouseLeave={() => onHover(test.id, 0)}
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
})

function CardSystem({
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
  const testsRef = useRef(tests)
  const selectedIdRef = useRef(selectedId)
  const testsLengthRef = useRef(tests.length)
  const previousLengthRef = useRef(tests.length)
  const onActiveChangeRef = useRef(onActiveChange)
  const motionRef = useRef({
    rawTargetIndex: activeIndex,
    targetIndex: activeIndex,
    currentIndex: activeIndex,
    hoverTarget: new Map<number, number>(),
    hoverCurrent: new Map<number, number>()
  })

  testsRef.current = tests
  selectedIdRef.current = selectedId
  testsLengthRef.current = tests.length
  onActiveChangeRef.current = onActiveChange

  const registerCard = useCallback((id: number, node: HTMLElement | null) => {
    if (node) {
      cardRefs.current.set(id, node)
    } else {
      cardRefs.current.delete(id)
    }
  }, [])

  const setHover = useCallback((id: number, value: number) => {
    motionRef.current.hoverTarget.set(id, value)
  }, [])

  useEffect(() => {
    const safeActiveIndex = wrapIndex(activeIndex, tests.length)
    const motion = motionRef.current
    const targetIndex = getNearestContinuousIndex(motion.currentIndex, safeActiveIndex, tests.length)

    motion.rawTargetIndex = targetIndex
    motion.targetIndex = targetIndex

    if (previousLengthRef.current !== tests.length || previousLengthRef.current === 0) {
      motion.currentIndex = targetIndex
      previousLengthRef.current = tests.length
    }
  }, [activeIndex, tests.length])

  useEffect(() => {
    const motion = motionRef.current
    const liveIds = new Set(tests.map((test) => test.id))

    Array.from(motion.hoverTarget.keys()).forEach((id) => {
      if (!liveIds.has(id)) {
        motion.hoverTarget.delete(id)
        motion.hoverCurrent.delete(id)
      }
    })

    tests.forEach((test) => {
      if (!motion.hoverTarget.has(test.id)) {
        motion.hoverTarget.set(test.id, 0)
        motion.hoverCurrent.set(test.id, 0)
      }
    })
  }, [tests])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const total = testsLengthRef.current
      if (total <= 1) return

      const motion = motionRef.current
      const wheelDelta = clamp(event.deltaY * wheelStep, -0.56, 0.56)
      if (wheelDelta === 0) return

      motion.rawTargetIndex += wheelDelta
      const wrappedTarget = wrapIndex(Math.round(motion.rawTargetIndex), total)
      const nextTarget = getNearestContinuousIndex(motion.targetIndex, wrappedTarget, total)
      if (nextTarget === motion.targetIndex) return

      motion.rawTargetIndex = nextTarget
      motion.targetIndex = nextTarget
      onActiveChangeRef.current(wrappedTarget)
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    const engine = createMotionEngine(() => {
      const stage = stageRef.current
      if (!stage) return

      const currentTests = testsRef.current
      const total = currentTests.length
      if (!total) return

      const motion = motionRef.current
      const rect = stage.getBoundingClientRect()
      const cardScale = Number.parseFloat(window.getComputedStyle(stage).getPropertyValue('--card-scale')) || 0.9
      const verticalStep = clamp(rect.height * 0.42, 210, 300)

      motion.currentIndex = lerp(motion.currentIndex, motion.targetIndex, 0.1)

      currentTests.forEach((test, index) => {
        const element = cardRefs.current.get(test.id)
        if (!element) return

        const offset = getContinuousOffset(index, motion.currentIndex, total)
        const absOffset = Math.abs(offset)
        const depth = clamp(1 - absOffset / (renderRange + 0.35), 0, 1)
        const hoverNow = lerp(motion.hoverCurrent.get(test.id) || 0, motion.hoverTarget.get(test.id) || 0, 0.14)
        motion.hoverCurrent.set(test.id, hoverNow)

        const centered = absOffset < 0.42
        const selectedBoost = selectedIdRef.current === test.id && centered ? 0.018 : 0
        const y = offset * verticalStep
        const z = 80 - absOffset * 78
        const scale = (0.78 + depth * 0.24 + hoverNow * 0.035 + selectedBoost) * cardScale
        const opacity = centered ? 1 : clamp(0.4 - absOffset * 0.07 + depth * 0.04, 0.14, 0.34)
        const blur = absOffset <= 1.15 ? 0 : clamp((absOffset - 1.15) * 0.55, 0, 1.25)
        const saturate = 0.9 + depth * 0.18 + hoverNow * 0.08
        const brightness = 0.88 + depth * 0.12 + hoverNow * 0.06
        const glow = 0.1 + depth * 0.28 + hoverNow * 0.18
        const zIndex = Math.round(depth * 1000 + hoverNow * 30 + (centered ? 120 : 0) + (selectedIdRef.current === test.id && centered ? 60 : 0))

        element.style.transform = `translate3d(-50%, calc(-50% + ${y.toFixed(2)}px), ${z.toFixed(2)}px) scale(${scale.toFixed(4)})`
        element.style.opacity = opacity.toFixed(3)
        element.style.filter = `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(3)}) brightness(${brightness.toFixed(
          3
        )}) drop-shadow(0 22px 30px rgba(43, 95, 102, ${glow.toFixed(3)}))`
        element.style.zIndex = String(zIndex)
        element.style.pointerEvents = absOffset > 1.15 ? 'none' : 'auto'
      })
    })

    engine.start()
    return () => engine.stop()
  }, [])

  const safeActiveIndex = wrapIndex(activeIndex, tests.length)
  const visibleTests = useMemo(
    () =>
      tests.filter(
        (_, index) => tests.length <= renderRange * 2 + 1 || Math.abs(getLoopOffset(index, safeActiveIndex, tests.length)) <= renderRange
      ),
    [safeActiveIndex, tests]
  )

  return (
    <div className="test-card-system" ref={stageRef}>
      {visibleTests.map((test) => {
        const index = tests.findIndex((item) => item.id === test.id)

        return (
          <TestCardItem
            index={index}
            key={test.id}
            registerCard={registerCard}
            selected={selectedId === test.id}
            test={test}
            onHover={setHover}
            onSelect={onSelect}
          />
        )
      })}
      <div className="stack-indicator" aria-hidden="true">
        {tests.map((test, index) => (
          <span className={index === activeIndex ? 'is-active' : ''} key={test.id} />
        ))}
      </div>
      <div className="scene-scroll-hint">滚动鼠标滚轮切换测验</div>
    </div>
  )
}

export default memo(CardSystem)
