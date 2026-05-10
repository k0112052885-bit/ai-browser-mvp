import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface AIService {
  id: string
  name: string
  url: string
  icon: string
  enabled: boolean
}

interface ElectronViewBounds {
  x: number
  y: number
  width: number
  height: number
}

contextBridge.exposeInMainWorld('electronAPI', {
  getServices: () => ipcRenderer.invoke('get-services'),
  addService: (service: Omit<AIService, 'id'>) =>
    ipcRenderer.invoke('add-service', service),
  updateService: (id: string, updates: Partial<AIService>) =>
    ipcRenderer.invoke('update-service', id, updates),
  deleteService: (id: string) =>
    ipcRenderer.invoke('delete-service', id),
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),
  readPromptAttachments: (attachments: Array<{ path?: string; name: string; type?: string; kind?: string; size?: number }>) =>
    ipcRenderer.invoke('read-prompt-attachments', attachments),
  checkForUpdates: () =>
    ipcRenderer.invoke('auto-update-check'),
  installUpdate: () =>
    ipcRenderer.invoke('auto-update-install'),
  onAutoUpdateStatus: (callback: (status: { status: string; version?: string; percent?: number; message?: string }) => void) => {
    const listener = (_event: IpcRendererEvent, status: { status: string; version?: string; percent?: number; message?: string }) => callback(status)
    ipcRenderer.on('auto-update-status', listener)
    return () => ipcRenderer.removeListener('auto-update-status', listener)
  },
  createGeminiView: (id: string, url: string, bounds: ElectronViewBounds) =>
    ipcRenderer.invoke('gemini-view-create', id, url, bounds),
  updateGeminiViewBounds: (id: string, bounds: ElectronViewBounds) =>
    ipcRenderer.invoke('gemini-view-set-bounds', id, bounds),
  destroyGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-destroy', id),
  reloadGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-reload', id),
  goBackGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-go-back', id),
  goForwardGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-go-forward', id),
  canGoBackGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-can-go-back', id),
  canGoForwardGeminiView: (id: string) =>
    ipcRenderer.invoke('gemini-view-can-go-forward', id),
  insertPromptIntoGeminiView: (id: string, text: string, options?: unknown) =>
    ipcRenderer.invoke('gemini-view-insert-prompt', id, text, options),
  onGeminiViewFailed: (callback: (id: string) => void) => {
    const listener = (_event: IpcRendererEvent, id: string) => callback(id)
    ipcRenderer.on('gemini-view-failed', listener)
    return () => ipcRenderer.removeListener('gemini-view-failed', listener)
  }
})
