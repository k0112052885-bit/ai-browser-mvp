import { forwardRef, useState, useRef, useEffect, useImperativeHandle } from 'react'
import { AIService, PanelId, PromptInsertHandle, PromptInsertOptions, PromptInsertTarget, NavigationHandle, NavigationState } from '../types'
import { clearWebviewDraftInputs, insertPromptIntoWebview } from '../webviewPrompt'
import { configureExternalAuthWebview, getAuthWarning } from '../webviewAuth'
import GeminiView from './GeminiView'
import ServiceIcon from './ServiceIcon'
import './SplitView.css'

interface SplitViewProps {
  leftService: AIService | null
  rightService: AIService | null
  activePanel: PanelId
  onPanelClick: (panel: PanelId) => void
}

const SplitView = forwardRef<PromptInsertHandle & NavigationHandle, SplitViewProps>(function SplitView(
  { leftService, rightService, activePanel, onPanelClick },
  ref
) {
  const BackIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11H7.83l5.58-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
    </svg>
  )

  const ExternalIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6h-2V7.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V4z" fill="currentColor" />
      <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" fill="currentColor" />
    </svg>
  )

  const HomeIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.8 12 3l9 7.8-1.31 1.51L18.5 11.3V20H14v-5h-4v5H5.5v-8.7l-1.19 1.01L3 10.8z" fill="currentColor" />
    </svg>
  )

  const [canGoBackLeft, setCanGoBackLeft] = useState(false)
  const [canGoBackRight, setCanGoBackRight] = useState(false)
  const [canGoForwardLeft, setCanGoForwardLeft] = useState(false)
  const [canGoForwardRight, setCanGoForwardRight] = useState(false)
  const leftWebviewRef = useRef<any>(null)
  const rightWebviewRef = useRef<any>(null)
  const isLeftGemini = leftService?.id === 'gemini'
  const isRightGemini = rightService?.id === 'gemini'

const forceWebviewBack = (webview: any) => {
  if (!webview) return

  webview.executeJavaScript?.(`
    (() => {
      try { window.history.back(); } catch (e) {}

      const clickAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (el) {
          el.click();
          return true;
        }
        return false;
      };

      const points = [
        [10,10],[30,10],[50,10],[80,10],
        [10,30],[30,30],[50,30],[80,30],
        [10,60],[30,60],[50,60]
      ];

      for (const [x,y] of points) {
        if (clickAt(x,y)) return 'clicked-area';
      }

      const elements = document.querySelectorAll('button, a, [role="button"]');
      for (const el of elements) {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        if (
          text.includes('back') ||
          text.includes('뒤') ||
          text.includes('close') ||
          text.includes('설정')
        ) {
          el.click();
          return 'clicked-text';
        }
      }

      return 'no-action';
    })();
  `).catch((error: unknown) => {
    console.warn('[split-navigation] javascript goBack fallback failed:', error)
  })
}

  const forceWebviewForward = (webview: any) => {
    if (!webview) return

    try {
      if (webview.canGoForward?.()) {
        webview.goForward()
        return
      }
    } catch (error) {
      console.warn('[split-navigation] native goForward failed:', error)
    }

    webview.executeJavaScript?.('window.history.forward()').catch((error: unknown) => {
      console.warn('[split-navigation] javascript goForward fallback failed:', error)
    })
  }

  const insertPromptToTarget = async (
    text: string,
    target: PromptInsertTarget,
    options?: PromptInsertOptions
  ) => {
    if (target === 'all') {
      const targets = [
        leftService ? { service: leftService, webview: leftWebviewRef.current, viewId: 'gemini-panel-1' } : null,
        rightService ? { service: rightService, webview: rightWebviewRef.current, viewId: 'gemini-panel-2' } : null
      ].filter(Boolean) as { service: AIService; webview: any; viewId: string }[]
      const results = await Promise.all(targets.map(async (targetPanel) => {
        const promptOptions = { ...options, debugLabel: targetPanel.service.name }
        if (targetPanel.service.id === 'gemini') {
          const result = await window.electronAPI.insertPromptIntoGeminiView(targetPanel.viewId, text, promptOptions)
          console.log('[QuickPrompt][split]', targetPanel.service.name, result)
          return result
        }

        const result = await insertPromptIntoWebview(targetPanel.webview, text, promptOptions)
        console.log('[QuickPrompt][split]', targetPanel.service.name, result)
        return result
      }))

      return {
        successCount: results.filter(result => result.inserted).length,
        targetCount: targets.length,
        sendSuccessCount: results.filter(result => result.sent).length,
        sendFailureCount: results.filter(result => result.sendAttempted && result.inserted && !result.sent).length
      }
    }

    const resolvedTarget = target === 'active' ? activePanel : target
    const service = resolvedTarget === 'panel-2' ? rightService : leftService
    const webview = resolvedTarget === 'panel-2' ? rightWebviewRef.current : leftWebviewRef.current

    if (!service) return { successCount: 0, targetCount: 0 }
    const viewId = resolvedTarget === 'panel-2' ? 'gemini-panel-2' : 'gemini-panel-1'
    const promptOptions = { ...options, debugLabel: service.name }
    const result = service.id === 'gemini'
      ? await window.electronAPI.insertPromptIntoGeminiView(viewId, text, promptOptions)
      : await insertPromptIntoWebview(webview, text, promptOptions)

    console.log('[QuickPrompt][split]', service.name, result)

    return {
      successCount: result.inserted ? 1 : 0,
      targetCount: 1,
      sendSuccessCount: result.sent ? 1 : 0,
      sendFailureCount: result.sendAttempted && result.inserted && !result.sent ? 1 : 0
    }
  }

  useImperativeHandle(ref, () => ({
    insertPrompt: (text: string, options?: PromptInsertOptions) =>
      insertPromptToTarget(text, options?.target ?? 'active', options),
    goBack: () => {
      const isActive = activePanel === 'panel-1'
      const service = isActive ? leftService : rightService
      const isGemini = service?.id === 'gemini'
      const webview = isActive ? leftWebviewRef.current : rightWebviewRef.current
      const viewId = isActive ? 'gemini-panel-1' : 'gemini-panel-2'

      if (isGemini) {
        window.electronAPI.goBackGeminiView(viewId)
      } else if (webview) {
        forceWebviewBack(webview)
      }
    },
    goForward: () => {
      const isActive = activePanel === 'panel-1'
      const service = isActive ? leftService : rightService
      const isGemini = service?.id === 'gemini'
      const webview = isActive ? leftWebviewRef.current : rightWebviewRef.current
      const viewId = isActive ? 'gemini-panel-1' : 'gemini-panel-2'

      if (isGemini) {
        window.electronAPI.goForwardGeminiView(viewId)
      } else if (webview) {
        forceWebviewForward(webview)
      }
    },
    getNavigationState: (): NavigationState => ({
      canGoBack: activePanel === 'panel-1' ? canGoBackLeft : canGoBackRight,
      canGoForward: activePanel === 'panel-1' ? canGoForwardLeft : canGoForwardRight
    })
  }), [activePanel, leftService, rightService, canGoBackLeft, canGoBackRight, canGoForwardLeft, canGoForwardRight])

  useEffect(() => {
    if (leftService && isLeftGemini) {
      const pollInterval = setInterval(async () => {
        const back = await window.electronAPI.canGoBackGeminiView('gemini-panel-1')
        const forward = await window.electronAPI.canGoForwardGeminiView('gemini-panel-1')
        setCanGoBackLeft(back)
        setCanGoForwardLeft(forward)
      }, 500)

      return () => clearInterval(pollInterval)
    }

    if (leftWebviewRef.current && leftService && !isLeftGemini) {
      const webview = leftWebviewRef.current
      webview.src = leftService.url
      webview.partition = 'persist:ai-browser'

      const updateNavigationState = () => {
        if (webview.canGoBack) {
          setCanGoBackLeft(webview.canGoBack())
        }
        if (webview.canGoForward) {
          setCanGoForwardLeft(webview.canGoForward())
        }
      }

      webview.addEventListener('did-navigate', updateNavigationState)
      webview.addEventListener('did-navigate-in-page', updateNavigationState)
      webview.addEventListener('dom-ready', updateNavigationState)
      webview.addEventListener('page-title-updated', updateNavigationState)

      const clearDraftOnce = () => {
        clearWebviewDraftInputs(webview, leftService.name)
      }

      webview.addEventListener('dom-ready', clearDraftOnce, { once: true })

      const cleanup = configureExternalAuthWebview(webview, leftService)

      return () => {
        webview.removeEventListener('did-navigate', updateNavigationState)
        webview.removeEventListener('did-navigate-in-page', updateNavigationState)
        webview.removeEventListener('dom-ready', updateNavigationState)
        webview.removeEventListener('dom-ready', clearDraftOnce)
        webview.removeEventListener('page-title-updated', updateNavigationState)
        cleanup?.()
      }
    }
  }, [isLeftGemini, leftService])

  useEffect(() => {
    if (rightService && isRightGemini) {
      const pollInterval = setInterval(async () => {
        const back = await window.electronAPI.canGoBackGeminiView('gemini-panel-2')
        const forward = await window.electronAPI.canGoForwardGeminiView('gemini-panel-2')
        setCanGoBackRight(back)
        setCanGoForwardRight(forward)
      }, 500)

      return () => clearInterval(pollInterval)
    }

    if (rightWebviewRef.current && rightService && !isRightGemini) {
      const webview = rightWebviewRef.current
      webview.src = rightService.url
      webview.partition = 'persist:ai-browser'

      const updateNavigationState = () => {
        if (webview.canGoBack) {
          setCanGoBackRight(webview.canGoBack())
        }
        if (webview.canGoForward) {
          setCanGoForwardRight(webview.canGoForward())
        }
      }

      webview.addEventListener('did-navigate', updateNavigationState)
      webview.addEventListener('did-navigate-in-page', updateNavigationState)
      webview.addEventListener('dom-ready', updateNavigationState)
      webview.addEventListener('page-title-updated', updateNavigationState)

      const clearDraftOnce = () => {
        clearWebviewDraftInputs(webview, rightService.name)
      }

      webview.addEventListener('dom-ready', clearDraftOnce, { once: true })

      const cleanup = configureExternalAuthWebview(webview, rightService)

      return () => {
        webview.removeEventListener('did-navigate', updateNavigationState)
        webview.removeEventListener('did-navigate-in-page', updateNavigationState)
        webview.removeEventListener('dom-ready', updateNavigationState)
        webview.removeEventListener('dom-ready', clearDraftOnce)
        webview.removeEventListener('page-title-updated', updateNavigationState)
        cleanup?.()
      }
    }
  }, [isRightGemini, rightService])

  const handleGoBackLeft = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLeftGemini) {
      window.electronAPI.goBackGeminiView('gemini-panel-1')
    } else if (leftWebviewRef.current) {
      forceWebviewBack(leftWebviewRef.current)
    }
  }

  const handleGoBackRight = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRightGemini) {
      window.electronAPI.goBackGeminiView('gemini-panel-2')
    } else if (rightWebviewRef.current) {
      forceWebviewBack(rightWebviewRef.current)
    }
  }

  const handleHomeLeft = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isLeftGemini) {
      window.electronAPI.reloadGeminiView('gemini-panel-1')
      return
    }

    if (!leftWebviewRef.current || !leftService?.url) return

    leftWebviewRef.current.src = 'about:blank'
    window.setTimeout(() => {
      if (leftWebviewRef.current && leftService?.url) {
        leftWebviewRef.current.src = leftService.url
      }
    }, 50)
  }

  const handleHomeRight = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isRightGemini) {
      window.electronAPI.reloadGeminiView('gemini-panel-2')
      return
    }

    if (!rightWebviewRef.current || !rightService?.url) return

    rightWebviewRef.current.src = 'about:blank'
    window.setTimeout(() => {
      if (rightWebviewRef.current && rightService?.url) {
        rightWebviewRef.current.src = rightService.url
      }
    }, 50)
  }

  const handleOpenExternalLeft = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (leftService) {
      window.electronAPI.openExternal(leftService.url)
    }
  }

  const handleOpenExternalRight = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (rightService) {
      window.electronAPI.openExternal(rightService.url)
    }
  }

  return (
    <div className="split-view">
      <div
        className={`split-pane left-pane ${activePanel === 'panel-1' ? 'active' : ''}`}
        onMouseDown={() => onPanelClick('panel-1')}
        onClick={() => onPanelClick('panel-1')}
      >
        {leftService ? (
          <>
            <div className="pane-header" onClick={() => onPanelClick('panel-1')}>
              <div className="pane-header-info">
                <ServiceIcon icon={leftService.icon} name={leftService.name} className="service-logo-small" />
                <span className="pane-header-name">{leftService.name}</span>
              </div>
              <div className="pane-header-actions">
                <button
                  className="pane-icon-button pane-back-button"
                  onClick={handleGoBackLeft}
                  aria-disabled={!canGoBackLeft}
                  title="뒤로가기"
                  aria-label="뒤로가기"
                >
                  <BackIcon />
                </button>
                <button
                  className="pane-icon-button pane-external-button"
                  onClick={handleOpenExternalLeft}
                  title="외부 브라우저 열기"
                  aria-label="외부 브라우저 열기"
                >
                  <ExternalIcon />
                </button>
                <button className="pane-icon-button pane-home-button" onClick={handleHomeLeft} title="홈으로 이동" aria-label="홈으로 이동">
                  <HomeIcon />
                </button>
              </div>
            </div>
            <div className="pane-notice">
              <span className="notice-icon">ℹ️</span>
              <span className="notice-text">{getAuthWarning(leftService)}</span>
            </div>
            <div className="pane-webview" onClick={() => onPanelClick('panel-1')}>
              {isLeftGemini ? (
                <GeminiView viewId="gemini-panel-1" url={leftService.url} />
              ) : (
                <webview
                  key={leftService.id}
                  ref={leftWebviewRef}
                  src={leftService.url}
                  partition="persist:ai-browser"
                  useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                  allowpopups="true"
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="pane-placeholder" onClick={() => onPanelClick('panel-1')}>
            <h3>Select an AI from the sidebar</h3>
            <p>Left pane</p>
          </div>
        )}
      </div>

      <div
        className={`split-pane right-pane ${activePanel === 'panel-2' ? 'active' : ''}`}
        onMouseDown={() => onPanelClick('panel-2')}
        onClick={() => onPanelClick('panel-2')}
      >
        {rightService ? (
          <>
            <div className="pane-header" onClick={() => onPanelClick('panel-2')}>
              <div className="pane-header-info">
                <ServiceIcon icon={rightService.icon} name={rightService.name} className="service-logo-small" />
                <span className="pane-header-name">{rightService.name}</span>
              </div>
              <div className="pane-header-actions">
                <button
                  className="pane-icon-button pane-back-button"
                  onClick={handleGoBackRight}
                  aria-disabled={!canGoBackRight}
                  title="뒤로가기"
                  aria-label="뒤로가기"
                >
                  <BackIcon />
                </button>
                <button
                  className="pane-icon-button pane-external-button"
                  onClick={handleOpenExternalRight}
                  title="외부 브라우저 열기"
                  aria-label="외부 브라우저 열기"
                >
                  <ExternalIcon />
                </button>
                <button className="pane-icon-button pane-home-button" onClick={handleHomeRight} title="홈으로 이동" aria-label="홈으로 이동">
                  <HomeIcon />
                </button>
              </div>
            </div>
            <div className="pane-notice">
              <span className="notice-icon">ℹ️</span>
              <span className="notice-text">{getAuthWarning(rightService)}</span>
            </div>
            <div className="pane-webview" onClick={() => onPanelClick('panel-2')}>
              {isRightGemini ? (
                <GeminiView viewId="gemini-panel-2" url={rightService.url} />
              ) : (
                <webview
                  key={rightService.id}
                  ref={rightWebviewRef}
                  src={rightService.url}
                  partition="persist:ai-browser"
                  useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                  allowpopups="true"
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="pane-placeholder" onClick={() => onPanelClick('panel-2')}>
            <h3>Select an AI from the sidebar</h3>
            <p>Right pane</p>
          </div>
        )}
      </div>
    </div>
  )
})

export default SplitView
