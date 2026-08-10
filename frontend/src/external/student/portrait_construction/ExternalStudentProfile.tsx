import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import chatPanelCss from './original/components/ChatPanel/ChatPanel.css?raw'
import radarChartCss from './original/components/DynamicRadarChart/DynamicRadarChart.css?raw'
import topNavCss from './original/components/TopNav/TopNav.css?raw'
import RadarProfilePage from './original/pages/RadarProfilePage.jsx'
import radarProfilePageCss from './original/pages/RadarProfilePage.css?raw'
import baseCss from './original/styles.css?raw'

const templateCss = [baseCss, radarProfilePageCss, topNavCss, chatPanelCss, radarChartCss].join('\n')

export default function ExternalStudentProfile() {
  const shadowHostRef = useRef<HTMLDivElement | null>(null)
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null)

  useEffect(() => {
    if (!shadowHostRef.current) return undefined

    const root = shadowHostRef.current.shadowRoot || shadowHostRef.current.attachShadow({ mode: 'open' })
    setShadowRoot(root)

    return () => {
      setShadowRoot(null)
    }
  }, [])

  return (
    <div
      ref={shadowHostRef}
      className="external-student-portrait-shadow-host"
      data-testid="external-student-portrait"
    >
      {shadowRoot
        ? createPortal(
            <>
              <style>{templateCss}</style>
              <div className="external-student-portrait-original">
                <RadarProfilePage />
              </div>
            </>,
            shadowRoot
          )
        : null}
    </div>
  )
}
