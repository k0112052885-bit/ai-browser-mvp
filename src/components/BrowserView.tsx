import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AIService, PromptInsertHandle, NavigationHandle, NavigationState } from '../types'
import { clearWebviewDraftInputs, insertPromptIntoWebview } from '../webviewPrompt'
import { configureExternalAuthWebview, getAuthWarning, getExternalButtonLabel } from '../webviewAuth'
import GeminiView from './GeminiView'
import ServiceIcon from './ServiceIcon'
import './BrowserView.css'

interface BrowserViewProps {
  service: AIService | null
}

const BrowserView = forwardRef<PromptInsertHandle & NavigationHandle, BrowserViewProps>(function BrowserView({ service }, ref) {
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

  const webviewRef = useRef<any>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const isGemini = service?.id === 'gemini'
  const geminiViewId = 'gemini-single'

  useImperativeHandle(ref, () => ({
    insertPrompt: async (text: string, options) => {
      if (!service) return { successCount: 0, targetCount: 0 }
      const promptOptions = { ...options, debugLabel: service.name }
      const result = isGemini
        ? await window.electronAPI.insertPromptIntoGeminiView(geminiViewId, text, promptOptions)
        : await insertPromptIntoWebview(webviewRef.current, text, promptOptions)

      console.log('[QuickPrompt][single]', service.name, result)

      return {
        successCount: result.inserted ? 1 : 0,
        targetCount: 1,
        sendSuccessCount: result.sent ? 1 : 0,
        sendFailureCount: result.sendAttempted && result.inserted && !result.sent ? 1 : 0
      }
    },
    goBack: () => {
      if (isGemini) {
        window.electronAPI.goBackGeminiView(geminiViewId)
      } else if (webviewRef.current) {
        if (webviewRef.current.canGoBack?.()) {
          webviewRef.current.goBack()
        } else {
          webviewRef.current.executeJavaScript?.('history.back()', true)
        }
      }
    },
    goForward: () => {
      if (isGemini) {
        window.electronAPI.goForwardGeminiView(geminiViewId)
      } else if (webviewRef.current) {
        if (webviewRef.current.canGoForward?.()) {
          webviewRef.current.goForward()
        } else {
          webviewRef.current.executeJavaScript?.('history.forward()', true)
        }
      }
    },
    getNavigationState: (): NavigationState => ({
      canGoBack,
      canGoForward
    })
  }), [isGemini, service, canGoBack, canGoForward])

  useEffect(() => {
    if (service && isGemini) {
      // Poll Gemini navigation state
      const pollInterval = setInterval(async () => {
        const back = await window.electronAPI.canGoBackGeminiView(geminiViewId)
        const forward = await window.electronAPI.canGoForwardGeminiView(geminiViewId)
        setCanGoBack(back)
        setCanGoForward(forward)
      }, 500)

      return () => clearInterval(pollInterval)
    }

    if (webviewRef.current && service && !isGemini) {
      const webview = webviewRef.current
      webview.src = service.url
      webview.partition = 'persist:ai-browser'

      const updateNavigationState = () => {
        if (webview.canGoBack) {
          setCanGoBack(webview.canGoBack())
        }
        if (webview.canGoForward) {
          setCanGoForward(webview.canGoForward())
        }
      }

      webview.addEventListener('did-navigate', updateNavigationState)
      webview.addEventListener('did-navigate-in-page', updateNavigationState)
      webview.addEventListener('dom-ready', updateNavigationState)
      webview.addEventListener('page-title-updated', updateNavigationState)

      const clearDraftOnce = () => {
        clearWebviewDraftInputs(webview, service.name)
      }

      webview.addEventListener('dom-ready', clearDraftOnce, { once: true })

      const cleanup = configureExternalAuthWebview(webview, service)

      return () => {
        webview.removeEventListener('did-navigate', updateNavigationState)
        webview.removeEventListener('did-navigate-in-page', updateNavigationState)
        webview.removeEventListener('dom-ready', updateNavigationState)
        webview.removeEventListener('dom-ready', clearDraftOnce)
        webview.removeEventListener('page-title-updated', updateNavigationState)
        cleanup?.()
      }
    }
  }, [isGemini, service, geminiViewId])

  const handleGoBack = () => {
    if (isGemini) {
      window.electronAPI.goBackGeminiView(geminiViewId)
      return
    }
    if (webviewRef.current) {
      if (webviewRef.current.canGoBack?.()) {
        webviewRef.current.goBack()
      } else {
        webviewRef.current.executeJavaScript?.('history.back()', true)
      }
    }
  }

  const handleHome = () => {
    if (isGemini) {
      window.electronAPI.reloadGeminiView(geminiViewId)
      return
    }

    if (!webviewRef.current || !service?.url) return

    webviewRef.current.src = 'about:blank'
    window.setTimeout(() => {
      if (webviewRef.current && service?.url) {
        webviewRef.current.src = service.url
      }
    }, 50)
  }

  const handleOpenExternal = () => {
    if (service) {
      window.electronAPI.openExternal(service.url)
    }
  }

  if (!service) {
    return (
      <div className="browser-view">
        <div className="browser-placeholder">
          <h2>Welcome to AI Browser</h2>
          <p>Select an AI service from the sidebar to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="browser-view">
      <div className="webview-header">
        <div className="webview-info">
          <ServiceIcon icon={service.icon} name={service.name} className="service-logo-small" />
          <span className="webview-name">{service.name}</span>
        </div>
        <div className="webview-actions">
          <button
            className="pane-icon-button pane-back-button"
            onClick={handleGoBack}
            aria-disabled={!canGoBack}
            title="뒤로가기"
            aria-label="뒤로가기"
          >
            <BackIcon />
          </button>
          <button
            className="pane-icon-button pane-external-button"
            onClick={handleOpenExternal}
            title="외부 브라우저 열기"
            aria-label="외부 브라우저 열기"
          >
            <ExternalIcon />
          </button>
          <button className="pane-icon-button pane-home-button" onClick={handleHome} title="홈으로 이동" aria-label="홈으로 이동">
            <HomeIcon />
          </button>
        </div>
      </div>
      <div className="login-notice">
        <span className="notice-icon">ℹ️</span>
        <span className="notice-text">{getAuthWarning(service)}</span>
      </div>
      <div className="browser-content">
        {isGemini ? (
          <GeminiView viewId={geminiViewId} url={service.url} />
        ) : (
          <webview
            ref={webviewRef}
            src={service.url}
            partition="persist:ai-browser"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            allowpopups="true"
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
    </div>
  )
})

export default BrowserView
