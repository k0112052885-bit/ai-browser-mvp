import { useCallback, useEffect, useRef, useState } from 'react'
import './GeminiView.css'

interface GeminiViewProps {
  viewId: string
  url: string
}

function GeminiView({ viewId, url }: GeminiViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasFailed, setHasFailed] = useState(false)

  const getBounds = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    }
  }, [])

  const updateBounds = useCallback(() => {
    const bounds = getBounds()
    if (!bounds) return
    window.electronAPI.updateGeminiViewBounds(viewId, bounds)
  }, [getBounds, viewId])

  useEffect(() => {
    const bounds = getBounds()
    if (!bounds) return

    setHasFailed(false)
    window.electronAPI.createGeminiView(viewId, url, bounds)

    const resizeObserver = new ResizeObserver(updateBounds)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    window.addEventListener('resize', updateBounds)
    window.addEventListener('scroll', updateBounds, true)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateBounds)
      window.removeEventListener('scroll', updateBounds, true)
      window.electronAPI.destroyGeminiView(viewId)
    }
  }, [getBounds, updateBounds, url, viewId])

  useEffect(() => {
    return window.electronAPI.onGeminiViewFailed((failedViewId) => {
      if (failedViewId === viewId) {
        setHasFailed(true)
      }
    })
  }, [viewId])

  const handleReload = () => {
    setHasFailed(false)
    const bounds = getBounds()
    if (bounds) {
      window.electronAPI.updateGeminiViewBounds(viewId, bounds)
    }
    window.electronAPI.reloadGeminiView(viewId)
  }

  return (
    <div className="gemini-view-host" ref={containerRef}>
      {hasFailed && (
        <div className="gemini-view-failure">
          <h3>Gemini 로딩 실패, 새로고침 필요</h3>
          <button onClick={handleReload}>새로고침</button>
        </div>
      )}
    </div>
  )
}

export default GeminiView
