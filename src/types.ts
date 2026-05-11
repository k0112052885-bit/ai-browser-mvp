export interface AIService {
  id: string
  name: string
  url: string
  icon: string
  enabled: boolean
}

export interface ElectronAPI {
  getServices: () => Promise<AIService[]>
  addService: (service: Omit<AIService, 'id'>) => Promise<AIService>
  updateService: (id: string, updates: Partial<AIService>) => Promise<AIService | null>
  deleteService: (id: string) => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
  createGeminiView: (id: string, url: string, bounds: ElectronViewBounds) => Promise<boolean>
  updateGeminiViewBounds: (id: string, bounds: ElectronViewBounds) => Promise<boolean>
  destroyGeminiView: (id: string) => Promise<boolean>
  reloadGeminiView: (id: string) => Promise<boolean>
  goBackGeminiView: (id: string) => Promise<boolean>
  goForwardGeminiView: (id: string) => Promise<boolean>
  canGoBackGeminiView: (id: string) => Promise<boolean>
  canGoForwardGeminiView: (id: string) => Promise<boolean>
  insertPromptIntoGeminiView: (
    id: string,
    text: string,
    options?: PromptInsertOptions
  ) => Promise<{ inserted: boolean; sent: boolean; sendAttempted: boolean }>
  dumpGeminiViewDom: (id: string) => Promise<unknown>
  onGeminiViewFailed: (callback: (id: string) => void) => () => void
}

export interface ElectronViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ViewMode = 'single' | 'split' | 'grid'
export type PanelId = 'single' | 'panel-1' | 'panel-2' | 'panel-3' | 'panel-4'
export type PromptInsertTarget = 'active' | 'all' | PanelId

export interface PromptAttachment {
  id: string
  name: string
  path: string
  type: string
  size: number
  kind: 'image' | 'file'
}

export interface PromptInsertOptions {
  target?: PromptInsertTarget
  autoSend?: boolean
  debugLabel?: string
  attachments?: PromptAttachment[]
}

export interface PromptInsertResult {
  successCount: number
  targetCount: number
  sendSuccessCount?: number
  sendFailureCount?: number
}

export interface PromptInsertHandle {
  insertPrompt: (text: string, options?: PromptInsertOptions) => Promise<PromptInsertResult>
}

export interface NavigationState {
  canGoBack: boolean
  canGoForward: boolean
}

export interface NavigationHandle {
  goBack: () => void
  goForward: () => void
  getNavigationState: () => NavigationState
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
