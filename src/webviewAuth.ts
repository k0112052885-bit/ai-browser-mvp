import { AIService } from './types'

export const DEFAULT_AUTH_WARNING = '이메일 로그인으로 진행해 주세요.'
export const GEMINI_AUTH_WARNING = 'Gemini는 Google 계정 로그인이 필요합니다.'

type WebviewElement = HTMLElement & {
  src?: string
  partition?: string
  reload: () => void
  addEventListener: (event: string, listener: (e: any) => void) => void
  removeEventListener: (event: string, listener: (e: any) => void) => void
}

export function getAuthWarning(service: AIService) {
  return service.id === 'gemini' ? GEMINI_AUTH_WARNING : DEFAULT_AUTH_WARNING
}

export function getExternalButtonLabel(_service: AIService) {
  return '🌐'
}

export function configureExternalAuthWebview(
  webview: WebviewElement | null,
  service: AIService | null
) {
  if (!webview || !service) {
    return undefined
  }

  const handleDidFailLoad = (event: Event) => {
    const detail = event as Event & {
      errorCode?: number
      errorDescription?: string
      validatedURL?: string
    }

    console.warn('[webview] did-fail-load:', {
      service: service.name,
      url: detail.validatedURL,
      errorCode: detail.errorCode,
      errorDescription: detail.errorDescription
    })
  }

  const handleRenderProcessGone = (event: Event) => {
    console.warn('[webview] render-process-gone:', {
      service: service.name,
      event
    })
  }

  webview.addEventListener('did-fail-load', handleDidFailLoad)
  webview.addEventListener('render-process-gone', handleRenderProcessGone)

  return () => {
    webview.removeEventListener('did-fail-load', handleDidFailLoad)
    webview.removeEventListener('render-process-gone', handleRenderProcessGone)
  }
}
