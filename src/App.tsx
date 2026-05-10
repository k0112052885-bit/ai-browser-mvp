
import { useState, useEffect, useRef } from 'react'
import { AIService, PanelId, PromptInsertHandle, PromptInsertOptions, PromptInsertResult, ViewMode, NavigationHandle } from './types'
import Sidebar from './components/Sidebar'
import BrowserView from './components/BrowserView'
import Settings from './components/Settings'
import Topbar from './components/Topbar'
import SplitView from './components/SplitView'
import GridView from './components/GridView'
import QuickPrompt from './components/QuickPrompt'
import { normalizeServiceIcon } from './serviceIcons'
import './App.css'

const AUTO_SEND_KEY = 'autoSend'
const LEGACY_AUTO_SEND_KEY = 'quick-prompt-auto-send'
const LAST_STATE_KEY = 'ai-browser-last-state'
const PANEL_IDS: Exclude<PanelId, 'single'>[] = ['panel-1', 'panel-2', 'panel-3', 'panel-4']
const LEGACY_SERVICE_FLAG_KEYS = ['external' + 'Only', 'googleAuth' + 'ExternalOnly']

type PanelServiceIds = Record<Exclude<PanelId, 'single'>, string | null>

type AutoUpdateStatus = {
  status: string
  version?: string
  percent?: number
  message?: string
}

interface LastState {
  viewMode: ViewMode
  selectedServiceId: string | null
  panelServiceIds: PanelServiceIds
  activePanel: PanelId
}

const DEFAULT_PANEL_SERVICE_IDS: PanelServiceIds = {
  'panel-1': null,
  'panel-2': null,
  'panel-3': null,
  'panel-4': null
}

const isViewMode = (value: unknown): value is ViewMode =>
  value === 'single' || value === 'split' || value === 'grid'

const isPanelId = (value: unknown): value is PanelId =>
  value === 'single' || PANEL_IDS.includes(value as Exclude<PanelId, 'single'>)

const readLastState = (): LastState | null => {
  try {
    const raw = localStorage.getItem(LAST_STATE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<LastState>
    if (!isViewMode(parsed.viewMode) || !isPanelId(parsed.activePanel)) return null

    return {
      viewMode: parsed.viewMode,
      selectedServiceId: typeof parsed.selectedServiceId === 'string' ? parsed.selectedServiceId : null,
      activePanel: parsed.activePanel,
      panelServiceIds: {
        ...DEFAULT_PANEL_SERVICE_IDS,
        ...(parsed.panelServiceIds ?? {})
      }
    }
  } catch (error) {
    console.warn('Failed to read last AI Browser state:', error)
    return null
  }
}

const stripLegacyServiceFlags = (service: AIService): AIService => {
  const next = { ...service } as Record<string, unknown>
  LEGACY_SERVICE_FLAG_KEYS.forEach(key => {
    delete next[key]
  })
  return next as unknown as AIService
}

const removeLegacyFlagsFromStoredValue = (value: unknown): { value: unknown; changed: boolean } => {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map(item => {
      const result = removeLegacyFlagsFromStoredValue(item)
      changed ||= result.changed
      return result.value
    })

    return { value: next, changed }
  }

  if (!value || typeof value !== 'object') {
    return { value, changed: false }
  }

  let changed = false
  const next = { ...(value as Record<string, unknown>) }

  LEGACY_SERVICE_FLAG_KEYS.forEach(key => {
    if (key in next) {
      delete next[key]
      changed = true
    }
  })

  Object.entries(next).forEach(([key, child]) => {
    const result = removeLegacyFlagsFromStoredValue(child)
    if (result.changed) {
      next[key] = result.value
      changed = true
    }
  })

  return { value: next, changed }
}

const migrateRendererLocalStorageServices = () => {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue

    const raw = localStorage.getItem(key)
    if (!raw || (!raw.includes('gemini') && !raw.includes('Gemini'))) continue

    try {
      const parsed = JSON.parse(raw)
      const result = removeLegacyFlagsFromStoredValue(parsed)

      if (result.changed) {
        localStorage.setItem(key, JSON.stringify(result.value))
      }
    } catch {
      // Ignore non-JSON values.
    }
  }
}

function App() {
  const [services, setServices] = useState<AIService[]>([])
  const [selectedService, setSelectedService] = useState<AIService | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [autoSend, setAutoSend] = useState(false)
  const [hasRestoredLastState, setHasRestoredLastState] = useState(false)
  const [autoUpdateStatus, setAutoUpdateStatus] = useState<AutoUpdateStatus | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>('single')
  const [panelServiceIds, setPanelServiceIds] = useState<PanelServiceIds>(DEFAULT_PANEL_SERVICE_IDS)
  const [activePanel, setActivePanel] = useState<PanelId>('single')
  const browserViewRef = useRef<PromptInsertHandle & NavigationHandle>(null)
  const splitViewRef = useRef<PromptInsertHandle & NavigationHandle>(null)
  const gridViewRef = useRef<PromptInsertHandle & NavigationHandle>(null)

  const enabledServices = services.filter(s => s.enabled)
  const getServiceById = (id: string | null) => services.find(service => service.id === id) ?? null
  const panelServices = PANEL_IDS.map(panelId => ({
    id: panelId,
    service: getServiceById(panelServiceIds[panelId])
  }))
  const leftService = panelServices[0].service
  const rightService = panelServices[1].service

  const getFallbackPanelServiceIds = (loadedServices: AIService[], fallbackId: string | null) =>
    PANEL_IDS.reduce((next, panelId, index) => {
      next[panelId] = loadedServices[index]?.id ?? fallbackId
      return next
    }, { ...DEFAULT_PANEL_SERVICE_IDS })

  const sanitizePanelServiceIds = (
    savedPanelIds: PanelServiceIds,
    loadedServices: AIService[],
    fallbackId: string | null
  ) => {
    const validIds = new Set(loadedServices.map(service => service.id))

    return PANEL_IDS.reduce((next, panelId, index) => {
      const savedId = savedPanelIds[panelId]
      next[panelId] = savedId && validIds.has(savedId)
        ? savedId
        : loadedServices[index]?.id ?? fallbackId
      return next
    }, { ...DEFAULT_PANEL_SERVICE_IDS })
  }

  useEffect(() => {
    migrateRendererLocalStorageServices()
    loadServices()
    const storedAutoSend = localStorage.getItem(AUTO_SEND_KEY) ?? localStorage.getItem(LEGACY_AUTO_SEND_KEY)
    setAutoSend(storedAutoSend === 'true')
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onAutoUpdateStatus) return

    const unsubscribe = window.electronAPI.onAutoUpdateStatus((status: AutoUpdateStatus) => {
      setAutoUpdateStatus(status)
    })

    return unsubscribe
  }, [])

  const loadServices = async () => {
    const loadedServices = (await window.electronAPI.getServices())
      .map(stripLegacyServiceFlags)
      .map(normalizeServiceIcon)
    const lastState = readLastState()
    const validIds = new Set(loadedServices.map(service => service.id))
    const fallbackId = loadedServices[0]?.id ?? null
    const restoredSelectedId = lastState?.selectedServiceId && validIds.has(lastState.selectedServiceId)
      ? lastState.selectedServiceId
      : fallbackId

    setServices(loadedServices)

    if (loadedServices.length > 0 && !hasRestoredLastState) {
      setSelectedService(loadedServices.find(service => service.id === restoredSelectedId) ?? loadedServices[0])
      setPanelServiceIds(lastState
        ? sanitizePanelServiceIds(lastState.panelServiceIds, loadedServices, fallbackId)
        : getFallbackPanelServiceIds(loadedServices, fallbackId))
      setViewMode(lastState?.viewMode ?? 'single')
      setActivePanel(lastState?.viewMode === 'single'
        ? 'single'
        : lastState?.activePanel && lastState.activePanel !== 'single'
          ? lastState.activePanel
          : 'panel-1')
      setHasRestoredLastState(true)
    }
  }

  useEffect(() => {
    if (!hasRestoredLastState) return

    const state: LastState = {
      viewMode,
      selectedServiceId: selectedService?.id ?? null,
      panelServiceIds,
      activePanel
    }

    localStorage.setItem(LAST_STATE_KEY, JSON.stringify(state))
  }, [activePanel, hasRestoredLastState, panelServiceIds, selectedService, viewMode])

  const handleAutoSendChange = (enabled: boolean) => {
    setAutoSend(enabled)
    localStorage.setItem(AUTO_SEND_KEY, String(enabled))
  }

  const handleInstallUpdate = () => {
    window.electronAPI?.installUpdate?.()
  }

  const getAutoUpdateMessage = () => {
    if (!autoUpdateStatus) return null

    if (autoUpdateStatus.status === 'checking') return '업데이트 확인 중...'
    if (autoUpdateStatus.status === 'available') return `새 버전 ${autoUpdateStatus.version ?? ''} 다운로드 중...`
    if (autoUpdateStatus.status === 'downloading') return `업데이트 다운로드 중 ${autoUpdateStatus.percent ?? 0}%`
    if (autoUpdateStatus.status === 'downloaded') return `새 버전 ${autoUpdateStatus.version ?? ''} 다운로드 완료`
    if (autoUpdateStatus.status === 'error') return `업데이트 확인 실패: ${autoUpdateStatus.message ?? ''}`

    return null
  }

  const handleSelectService = (service: AIService) => {
    setShowSettings(false)

    if (viewMode !== 'single' && activePanel !== 'single') {
      setPanelServiceIds(current => ({
        ...current,
        [activePanel]: service.id
      }))
    } else {
      setSelectedService(service)
    }
  }

  const ensurePanelDefaults = () => {
    setPanelServiceIds(current => {
      const fallbackId = selectedService?.id ?? enabledServices[0]?.id ?? null

      return PANEL_IDS.reduce((next, panelId, index) => {
        next[panelId] = current[panelId] ?? enabledServices[index]?.id ?? fallbackId
        return next
      }, { ...current })
    })
  }

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === viewMode) return

    if (mode === 'single') {
      setSelectedService(activePanel !== 'single' ? getServiceById(panelServiceIds[activePanel]) ?? selectedService : selectedService)
      setActivePanel('single')
    } else {
      ensurePanelDefaults()
      setActivePanel(mode === 'split' && (activePanel === 'panel-3' || activePanel === 'panel-4' || activePanel === 'single')
        ? 'panel-1'
        : activePanel === 'single'
          ? 'panel-1'
          : activePanel)
    }

    setViewMode(mode)
  }

  const handlePanelClick = (panel: PanelId) => {
    setActivePanel(panel)
  }

  const handleInsertPrompt = (text: string, options?: PromptInsertOptions) => {
    const baseOptions: PromptInsertOptions = {
      ...options,
      autoSend
    }

    if (viewMode === 'split') {
      return splitViewRef.current?.insertPrompt(text, { ...baseOptions, target: 'all' }) ?? Promise.resolve({ successCount: 0, targetCount: 0 })
    }

    if (viewMode === 'grid') {
      return gridViewRef.current?.insertPrompt(text, { ...baseOptions, target: 'all' }) ?? Promise.resolve({ successCount: 0, targetCount: 0 })
    }

    return browserViewRef.current?.insertPrompt(text, baseOptions) ?? Promise.resolve({ successCount: 0, targetCount: 0 })
  }

  const handleAddService = async (service: Omit<AIService, 'id'>) => {
    const newService = await window.electronAPI.addService(service)
    await loadServices()
    return newService
  }

  const handleDeleteService = async (id: string) => {
    await window.electronAPI.deleteService(id)
    if (selectedService?.id === id) {
      setSelectedService(null)
    }
    setPanelServiceIds(current => PANEL_IDS.reduce((next, panelId) => {
      next[panelId] = current[panelId] === id ? null : current[panelId]
      return next
    }, { ...current }))
    await loadServices()
  }

  const handleUpdateService = async (id: string, updates: Partial<AIService>) => {
    await window.electronAPI.updateService(id, updates)
    await loadServices()
  }

  const autoUpdateMessage = getAutoUpdateMessage()

  return (
    <div className="app">
      {autoUpdateMessage && (
        <div className="auto-update-banner">
          <span>{autoUpdateMessage}</span>
          {autoUpdateStatus?.status === 'downloaded' && (
            <button type="button" onClick={handleInstallUpdate}>
              재시작하여 업데이트
            </button>
          )}
        </div>
      )}
      <Sidebar
        services={enabledServices}
        selectedService={viewMode === 'single' ? selectedService : getServiceById(panelServiceIds[activePanel === 'single' ? 'panel-1' : activePanel])}
        onSelectService={handleSelectService}
        onSelectPanel={setActivePanel}
        onOpenSettings={() => setShowSettings(true)}
        viewMode={viewMode}
        activePanel={activePanel}
      />
      <div className="main-content">
        {!showSettings && (
          <Topbar
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            selectedService={selectedService}
            panelServices={panelServices}
            activePanel={activePanel}
            onPanelClick={handlePanelClick}
          />
        )}
        <div className="content-area">
          {showSettings ? (
            <Settings
              services={services}
              onAddService={handleAddService}
              onDeleteService={handleDeleteService}
              onUpdateService={handleUpdateService}
              autoSend={autoSend}
              onAutoSendChange={handleAutoSendChange}
              onClose={() => setShowSettings(false)}
            />
          ) : viewMode === 'split' ? (
            <SplitView
              ref={splitViewRef}
              leftService={leftService}
              rightService={rightService}
              activePanel={activePanel}
              onPanelClick={handlePanelClick}
            />
          ) : viewMode === 'grid' ? (
            <GridView
              ref={gridViewRef}
              panels={panelServices}
              activePanel={activePanel}
              onPanelClick={handlePanelClick}
            />
          ) : (
            <BrowserView ref={browserViewRef} service={selectedService} />
          )}
        </div>
        {!showSettings && (
          <QuickPrompt
            isSplitView={viewMode !== 'single'}
            onInsertPrompt={handleInsertPrompt}
          />
        )}
      </div>
    </div>
  )
}

export default App
