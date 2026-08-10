import { useCallback, useEffect, useRef, useState } from 'react'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function toneForStatus(status) {
  if (status === '正常' || status === '启用' || status === '真实模型') return 'published'
  if (status === '关注' || status === '本地演示模式') return 'review'
  return 'draft'
}

function ExternalCard({ item, active, hovered, style, onClick, onOpen, onMouseEnter, onMouseLeave }) {
  const buttonText = hovered ? '查看详情' : '查看'
  return (
    <article
      className="exam-card"
      data-active={active ? 'true' : 'false'}
      data-status={toneForStatus(item.status)}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="exam-card-prism" aria-hidden="true" />
      <div className="exam-card-content">
        <div className="exam-card-topline">
          <span>{item.course}</span>
          <strong>{item.status}</strong>
        </div>

        <h2>{item.title}</h2>

        <div className="exam-card-metrics">
          {item.metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <p>{item.content}</p>

        <div className="exam-card-footer">
          <span>{item.updatedAt}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
          >
            {buttonText}
          </button>
        </div>
      </div>
    </article>
  )
}

export function ExternalCardStack({ items, emptyTitle, emptyAction, onOpenItem, onEmptyAction }) {
  const targetIndex = useRef(0)
  const currentIndex = useRef(0)
  const lastWheelAt = useRef(0)
  const [visualIndex, setVisualIndex] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hoveredId, setHoveredId] = useState(null)

  useEffect(() => {
    const maxIndex = Math.max(items.length - 1, 0)
    targetIndex.current = clamp(targetIndex.current, 0, maxIndex)
    currentIndex.current = clamp(currentIndex.current, 0, maxIndex)
    setActiveIndex(clamp(targetIndex.current, 0, maxIndex))
    setVisualIndex(currentIndex.current)
  }, [items.length])

  useEffect(() => {
    let frameId

    function animate() {
      const delta = targetIndex.current - currentIndex.current
      if (Math.abs(delta) < 0.001) {
        currentIndex.current = targetIndex.current
      } else {
        currentIndex.current += delta * 0.08
      }
      setVisualIndex(currentIndex.current)
      frameId = window.requestAnimationFrame(animate)
    }

    frameId = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  const moveToIndex = useCallback(
    (nextIndex) => {
      const boundedIndex = clamp(nextIndex, 0, Math.max(items.length - 1, 0))
      targetIndex.current = boundedIndex
      setActiveIndex(boundedIndex)
    },
    [items.length]
  )

  const handleWheel = useCallback(
    (event) => {
      if (items.length < 2) return
      event.preventDefault()
      const now = performance.now()
      if (now - lastWheelAt.current < 160 || Math.abs(event.deltaY) < 8) return

      const direction = event.deltaY > 0 ? 1 : -1
      moveToIndex(targetIndex.current + direction)
      lastWheelAt.current = now
    },
    [items.length, moveToIndex]
  )

  const handleCardClick = useCallback(
    (item, index) => {
      if (index !== activeIndex) {
        moveToIndex(index)
        return
      }
      onOpenItem(item)
    },
    [activeIndex, moveToIndex, onOpenItem]
  )

  if (!items.length) {
    return (
      <section className="exam-stack-shell">
        <div className="exam-empty-card">
          <div className="exam-empty-prism" aria-hidden="true" />
          <h2>{emptyTitle}</h2>
          <button type="button" onClick={onEmptyAction}>
            {emptyAction}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="exam-stack-shell" aria-label="外部后台卡片堆叠">
      <div className="exam-stack-meta" aria-live="polite">
        <span>{activeIndex + 1}</span>
        <i />
        <span>{items.length}</span>
      </div>

      <div className="exam-stack-stage" onWheel={handleWheel}>
        {items.map((item, index) => {
          const offset = index - visualIndex
          const distance = Math.abs(offset)
          const isActive = index === activeIndex
          const isHovered = hoveredId === item.id && isActive
          const scale = Math.max(0.74, 1 - distance * 0.08 + (isHovered ? 0.025 : 0))
          const opacity = Math.max(0.12, 1 - distance * 0.22)
          const translateY = offset * 120
          const rotate = clamp(offset * -2.8, -7, 7)
          const zIndex = Math.max(1, 100 - Math.round(distance * 12))

          return (
            <ExternalCard
              key={item.id}
              item={item}
              active={isActive}
              hovered={isHovered}
              style={{
                opacity,
                zIndex,
                transform: `translate3d(0, ${translateY}px, 0) scale(${scale}) rotate(${rotate}deg)`,
                pointerEvents: distance > 3.5 ? 'none' : 'auto'
              }}
              onClick={() => handleCardClick(item, index)}
              onOpen={() => handleCardClick(item, index)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          )
        })}
      </div>
    </section>
  )
}

export function ExternalDetailPanel({ item, loading, onClose }) {
  if (!item) return null

  return (
    <div className="exam-detail-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="exam-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="exam-detail-header">
          <div>
            <span>运行详情</span>
            <h2 id="external-detail-title">{item.title}</h2>
          </div>
          <button type="button" aria-label="关闭详情" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? <div className="exam-detail-loading">正在加载详情</div> : null}

        <div className="exam-detail-grid">
          {item.metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <section className="exam-detail-section">
          <h3>说明</h3>
          <p>{item.answer || item.content}</p>
        </section>

        <section className="exam-detail-section">
          <h3>建议</h3>
          <p>{item.explanation || '继续观察系统运行状态。'}</p>
        </section>
      </aside>
    </div>
  )
}
