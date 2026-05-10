import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AIService, PanelId, PromptInsertHandle, PromptInsertOptions, PromptInsertTarget, NavigationHandle, NavigationState } from '../types'
import { clearWebviewDraftInputs, insertPromptIntoWebview } from '../webviewPrompt'
import { configureExternalAuthWebview, getAuthWarning, getExternalButtonLabel } from '../webviewAuth'
import GeminiView from './GeminiView'
import ServiceIcon from './ServiceIcon'
import './GridView.css'

interface GridPanel {
  id: Exclude<PanelId, 'single'>
  service: AIService | null
}

interface GridViewProps {
  panels: GridPanel[]
  activePanel: PanelId
  onPanelClick: (panel: PanelId) => void
}

const GridView = forwardRef<PromptInsertHandle & NavigationHandle, GridViewProps>(function GridView(
  { panels, activePanel, onPanelClick },
  ref
) {
  const BackIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
    </svg>
  )

  const HomeIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.8 12 3l9 7.8-1.31 1.51L18.5 11.3V20H14v-5h-4v5H5.5v-8.7l-1.19 1.01L3 10.8z" fill="currentColor" />
      <path d="M10 10h2v2h-2v-2zm3 0h2v2h-2v-2zm-3 3h2v2h-2v-2zm3 0h2v2h-2v-2z" fill="currentColor" opacity="0.75" />
    </svg>
  )

  const ExternalIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6h-2V7.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V4z" fill="currentColor" />
      <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" fill="currentColor" />
    </svg>
  )

  const webviewRefs = useRef<Record<string, any>>({})
  const [canGoBack, setCanGoBack] = useState<Record<string, boolean>>({})
  const [canGoForward, setCanGoForward] = useState<Record<string, boolean>>({})

  const insertPromptToTarget = async (
    text: string,
    target: PromptInsertTarget,
    options?: PromptInsertOptions
  ) => {
    const targetPanels = target === 'all'
      ? panels
      : panels.filter(panel => panel.id === (target === 'active' ? activePanel : target))
    const visiblePanels = targetPanels.filter(panel => panel.service)

    const results = await Promise.all(visiblePanels.map(async (panel) => {
      const promptOptions = { ...options, debugLabel: panel.service?.name ?? panel.id }
      if (panel.service?.id === 'gemini') {
        const result = await window.electronAPI.insertPromptIntoGeminiView(`gemini-${panel.id}`, text, promptOptions)
        console.log('[QuickPrompt][grid]', panel.service.name, result)
        return result
      }

      const result = await insertPromptIntoWebview(webviewRefs.current[panel.id] ?? null, text, promptOptions)
      console.log('[QuickPrompt][grid]', panel.service?.name ?? panel.id, result)
      return result
    }))

    return {
      successCount: results.filter(result => result.inserted).length,
      targetCount: visiblePanels.length,
      sendSuccessCount: results.filter(result => result.sent).length,
      sendFailureCount: results.filter(result => result.sendAttempted && result.inserted && !result.sent).length
    }
  }

  useImperativeHandle(ref, () => ({
    insertPrompt: (text: string, options?: PromptInsertOptions) =>
      insertPromptToTarget(text, options?.target ?? 'active', options),
    goBack: () => {
      const panel = panels.find(p => p.id === activePanel)
      if (!panel || !panel.service) return

      const isGemini = panel.service.id === 'gemini'
      const webview = webviewRefs.current[activePanel]
      const viewId = `gemini-${activePanel}`

      if (isGemini) {
        window.electronAPI.goBackGeminiView(viewId)
      } else if (webview) {
        if (webview.canGoBack?.()) {
          webview.goBack()
        } else {
          webview.executeJavaScript?.('history.back()', true)
        }
      }
    },
    goForward: () => {
      const panel = panels.find(p => p.id === activePanel)
      if (!panel || !panel.service) return

      const isGemini = panel.service.id === 'gemini'
      const webview = webviewRefs.current[activePanel]
      const viewId = `gemini-${activePanel}`

      if (isGemini) {
        window.electronAPI.goForwardGeminiView(viewId)
      } else if (webview) {
        if (webview.canGoForward?.()) {
          webview.goForward()
        } else {
          webview.executeJavaScript?.('history.forward()', true)
        }
      }
    },
    getNavigationState: (): NavigationState => ({
      canGoBack: canGoBack[activePanel] || false,
      canGoForward: canGoForward[activePanel] || false
    })
  }), [activePanel, panels, canGoBack, canGoForward])

  useEffect(() => {
    const cleanups = panels
      .map(panel => configureExternalAuthWebview(webviewRefs.current[panel.id] ?? null, panel.service))
      .filter((cleanup): cleanup is () => void => Boolean(cleanup))

    // Setup navigation event listeners for non-Gemini panels
    const navigationCleanups = panels.map(panel => {
      const webview = webviewRefs.current[panel.id]
      if (!webview || !panel.service || panel.service.id === 'gemini') return null

      const updateNavigationState = () => {
        if (webview.canGoBack) {
          setCanGoBack(prev => ({ ...prev, [panel.id]: webview.canGoBack() }))
        }
        if (webview.canGoForward) {
          setCanGoForward(prev => ({ ...prev, [panel.id]: webview.canGoForward() }))
        }
      }

      webview.addEventListener('did-navigate', updateNavigationState)
      webview.addEventListener('did-navigate-in-page', updateNavigationState)
      webview.addEventListener('dom-ready', updateNavigationState)
      webview.addEventListener('page-title-updated', updateNavigationState)

      const clearDraftOnce = () => {
        clearWebviewDraftInputs(webview, panel.service?.name ?? panel.id)
      }

      webview.addEventListener('dom-ready', clearDraftOnce, { once: true })

      return () => {
        webview.removeEventListener('did-navigate', updateNavigationState)
        webview.removeEventListener('did-navigate-in-page', updateNavigationState)
        webview.removeEventListener('dom-ready', updateNavigationState)
        webview.removeEventListener('dom-ready', clearDraftOnce)
        webview.removeEventListener('page-title-updated', updateNavigationState)
      }
    }).filter((cleanup): cleanup is () => void => Boolean(cleanup))

    // Setup Gemini navigation polling
    const geminiPollingCleanups = panels.map(panel => {
      if (!panel.service || panel.service.id !== 'gemini') return null

      const viewId = `gemini-${panel.id}`
      const pollInterval = setInterval(async () => {
        const back = await window.electronAPI.canGoBackGeminiView(viewId)
        const forward = await window.electronAPI.canGoForwardGeminiView(viewId)
        setCanGoBack(prev => ({ ...prev, [panel.id]: back }))
        setCanGoForward(prev => ({ ...prev, [panel.id]: forward }))
      }, 500)

      return () => clearInterval(pollInterval)
    }).filter((cleanup): cleanup is () => void => Boolean(cleanup))

    return () => {
      cleanups.forEach(cleanup => cleanup())
      navigationCleanups.forEach(cleanup => cleanup())
      geminiPollingCleanups.forEach(cleanup => cleanup())
    }
  }, [panels])

  const handleHome = (panelId: PanelId) => {
    const panel = panels.find(candidate => candidate.id === panelId)
    if (panel?.service?.id === 'gemini') {
      window.electronAPI.reloadGeminiView(`gemini-${panelId}`)
      return
    }

    const webview = webviewRefs.current[panelId]
    if (!webview || !panel?.service?.url) return

    webview.src = 'about:blank'
    window.setTimeout(() => {
      const currentPanel = panels.find(candidate => candidate.id === panelId)
      if (webview && currentPanel?.service?.url) {
        webview.src = currentPanel.service.url
      }
    }, 50)
  }

  const handleGoBack = (panelId: PanelId, isGemini: boolean) => {
    if (isGemini) {
      window.electronAPI.goBackGeminiView(`gemini-${panelId}`)
      return
    }
    const webview = webviewRefs.current[panelId]
    if (webview) {
      if (webview.canGoBack?.()) {
        webview.goBack()
      } else {
        webview.executeJavaScript?.('history.back()', true)
      }
    }
  }

  const handleOpenExternal = (service: AIService | null) => {
    if (service) {
      window.electronAPI.openExternal(service.url)
    }
  }

  return (
    <div className="grid-view">
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          className={`grid-pane ${activePanel === panel.id ? 'active' : ''}`}
        >
          {panel.service ? (
            <>
              <div className="grid-pane-header" onClick={() => onPanelClick(panel.id)}>
                <div className="pane-header-info">
                  <ServiceIcon icon={panel.service.icon} name={panel.service.name} className="service-logo-small" />
                  <span className="pane-header-name">{index + 1}. {panel.service.name}</span>
                </div>
                <div className="pane-header-actions">
                  <button
                    className="pane-icon-button pane-back-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleGoBack(panel.id, panel.service?.id === 'gemini')
                    }}
                    aria-disabled={!canGoBack[panel.id]}
                    title="뒤로가기"
                    aria-label="뒤로가기"
                  >
                    <BackIcon />
                  </button>
                  <button
                    className="pane-icon-button pane-external-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleOpenExternal(panel.service)
                    }}
                    title="외부 브라우저 열기"
                    aria-label="외부 브라우저 열기"
                  >
                    <ExternalIcon />
                  </button>
                  <button
                    className="pane-icon-button pane-home-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleHome(panel.id)
                    }}
                    title="홈으로 이동"
                    aria-label="홈으로 이동"
                  >
                    <HomeIcon />
                  </button>
                </div>
              </div>
              <div className="grid-pane-notice">
                <span className="notice-icon">ℹ️</span>
                <span className="notice-text">{getAuthWarning(panel.service)}</span>
              </div>
              <div className="grid-pane-webview" onClick={() => onPanelClick(panel.id)}>
                {panel.service.id === 'gemini' ? (
                  <GeminiView viewId={`gemini-${panel.id}`} url={panel.service.url} />
                ) : (
                  <webview
                    key={panel.service.id}
                    ref={(node) => {
                      webviewRefs.current[panel.id] = node
                    }}
                    src={panel.service.url}
                    partition="persist:ai-browser"
                    useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    allowpopups="true"
                    style={{ width: '100%', height: '100%' }}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="grid-pane-placeholder" onClick={() => onPanelClick(panel.id)}>
              <h3>Select an AI from the sidebar</h3>
              <p>Panel {index + 1}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

export default GridView
