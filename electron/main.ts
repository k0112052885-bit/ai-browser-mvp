import { app, BrowserView, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
app.disableHardwareAcceleration()
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import { buildDraftClearScript, buildPromptInsertScript } from '../src/webviewPrompt'

interface AIService {
  id: string
  name: string
  url: string
  icon: string
  enabled: boolean
}

const store = new Store<{
  services: AIService[]
}>({
  name: 'config',
  defaults: {
    services: [
      {
        id: 'chatgpt',
        name: 'ChatGPT',
        url: 'https://chatgpt.com',
        icon: 'chatgpt.png',
        enabled: true
      },
      {
        id: 'claude',
        name: 'Claude',
        url: 'https://claude.ai',
        icon: 'claude.png',
        enabled: true
      },
      {
        id: 'gemini',
        name: 'Gemini',
        url: 'https://gemini.google.com',
        icon: 'gemini.png',
        enabled: true
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        url: 'https://www.perplexity.ai',
        icon: 'perplexity.png',
        enabled: true
      },
      {
        id: 'copilot',
        name: 'Copilot',
        url: 'https://copilot.microsoft.com',
        icon: 'copilot.png',
        enabled: true
      }
    ]
  }
})

console.log('Electron Store path:', store.path)
console.log('Current services:', JSON.stringify(store.get('services'), null, 2))

let mainWindow: BrowserWindow | null = null
const CHROME_122_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const RELEASE_URL = 'https://github.com/k0112052885-bit/ai-browser-mvp/releases/latest'

interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}

interface GeminiViewState {
  view: BrowserView
  failed: boolean
  bounds: ViewBounds
}

const geminiViews = new Map<string, GeminiViewState>()

function setupAutoUpdater() {
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[auto-update] skipped in development mode')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-update] checking for update')
  })

  autoUpdater.on('update-available', async (info) => {
    console.log('[auto-update] update available:', info.version)

    const options = {
      type: 'info' as const,
      title: '새 업데이트 발견',
      message: '새 업데이트 발견',
      detail: '새 버전이 있습니다. 다운로드 페이지로 이동하시겠습니까?',
      buttons: ['다운로드', '나중에'],
      defaultId: 0,
      cancelId: 1
    }

    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)

    if (result.response === 0) {
      shell.openExternal(RELEASE_URL)
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[auto-update] update not available:', info.version)
  })

  autoUpdater.on('error', (error) => {
    console.warn('[auto-update] error:', error)
  })

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[auto-update] check failed:', error)
    })
  }, 3000)
}

app.on('render-process-gone', (_event, _webContents, details) => {
  console.error('[CRASH]', details)
})

app.on('child-process-gone', (_event, details) => {
  console.error('[CHILD CRASH]', details)
})

function sanitizeBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  }
}

function notifyGeminiViewFailed(id: string) {
  const state = geminiViews.get(id)
  state?.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('gemini-view-failed', id)
  }
}

function destroyGeminiView(id: string) {
  const state = geminiViews.get(id)
  if (!state) return false

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeBrowserView(state.view)
  }

  if (!state.view.webContents.isDestroyed()) {
    state.view.webContents.destroy()
  }

  geminiViews.delete(id)
  return true
}

function createGeminiView(id: string, url: string, bounds: ViewBounds) {
  if (!mainWindow) return false

  destroyGeminiView(id)

  const view = new BrowserView({
    webPreferences: {
      partition: 'persist:ai-browser',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  const sanitizedBounds = sanitizeBounds(bounds)
  const state: GeminiViewState = { view, failed: false, bounds: sanitizedBounds }
  geminiViews.set(id, state)
  mainWindow.addBrowserView(view)
  view.setBounds(sanitizedBounds)
  view.webContents.setUserAgent(CHROME_122_USER_AGENT)

  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return

    console.warn('Gemini BrowserView failed to load:', {
      id,
      url: validatedURL,
      errorCode,
      errorDescription
    })
    state.failed = true
    notifyGeminiViewFailed(id)
  })

  view.webContents.on('render-process-gone', (_event, details) => {
    console.warn('Gemini BrowserView render process gone:', { id, details })
    state.failed = true
    notifyGeminiViewFailed(id)
  })

  view.webContents.once('dom-ready', () => {
    view.webContents.executeJavaScript(buildDraftClearScript('Gemini'), true).catch(error => {
      console.warn('Gemini draft clear failed:', { id, error })
    })
  })

  view.webContents.loadURL(url, { userAgent: CHROME_122_USER_AGENT }).catch(error => {
    console.warn('Gemini BrowserView loadURL failed:', { id, error })
    state.failed = true
    notifyGeminiViewFailed(id)
  })

  return true
}

function isOAuthUrl(url: string) {
  try {
    const { hostname } = new URL(url)
    // Detect Google OAuth and other common OAuth providers
    return (
      hostname === 'accounts.google.com' ||
      hostname.endsWith('.accounts.google.com') ||
      hostname === 'login.microsoftonline.com' ||
      hostname.endsWith('.login.microsoftonline.com')
    )
  } catch {
    return false
  }
}

function getAppIconPath() {
  const iconPath = path.join(
    process.env.VITE_DEV_SERVER_URL ? process.cwd() : path.join(__dirname, '..'),
    process.env.VITE_DEV_SERVER_URL ? 'public/icons/app-icon.png' : 'dist/icons/app-icon.png'
  )

  return fs.existsSync(iconPath) ? iconPath : undefined
}

function createWindow() {
  const icon = getAppIconPath()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  // VITE_DEV_SERVER_URL is set by vite-plugin-electron
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    Array.from(geminiViews.keys()).forEach(destroyGeminiView)
    mainWindow = null
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Main window crashed:', details)
  })
}

app.whenReady().then(() => {
  // Migration: Normalize icon paths to filename only
  console.log('=== Migrating service icons ===')
  const services = store.get('services')
  let needsSave = false

  services.forEach((service: AIService) => {
    const originalIcon = service.icon

    // Remove /icons/ prefix, file:// protocol, or any path separators
    if (service.icon) {
      const fileName = service.icon.split('/').pop() || service.icon
      if (fileName !== service.icon) {
        console.log(`Migrating ${service.name} icon: "${service.icon}" → "${fileName}"`)
        service.icon = fileName
        needsSave = true
      }
    }
  })

  if (needsSave) {
    store.set('services', services)
    console.log('✅ Icon migration complete')
  } else {
    console.log('✅ No icon migration needed')
  }
  console.log('=== Migration complete ===\n')

  const icon = getAppIconPath()
  if (process.platform === 'darwin' && icon) {
    app.dock.setIcon(icon)
  }

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url, frameName }) => {
      if (!url) {
        return { action: 'deny' }
      }

      // Handle OAuth popups in a separate window
      if (isOAuthUrl(url)) {
        console.log('Opening OAuth URL in popup window:', url)

        // Create a popup window for OAuth with unified partition
        const popupWindow = new BrowserWindow({
          width: 500,
          height: 600,
          title: 'Sign In',
          webPreferences: {
            partition: 'persist:ai-browser',
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
          }
        })

        popupWindow.loadURL(url, {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })

        // Close popup when OAuth is complete (user returns to service)
        popupWindow.webContents.on('will-navigate', (event, newUrl) => {
          // Close popup if navigating back to the main service domain
          try {
            const { hostname } = new URL(newUrl)
            if (
              hostname.includes('gemini.google.com') ||
              hostname.includes('chatgpt.com') ||
              hostname.includes('claude.ai') ||
              hostname.includes('perplexity.ai') ||
              hostname.includes('copilot.microsoft.com')
            ) {
              setTimeout(() => {
                popupWindow.close()
              }, 1000)
            }
          } catch (err) {
            console.error('Error parsing OAuth redirect URL:', err)
          }
        })

        return { action: 'deny' }
      }

      // For other popups/new windows, open in external browser
      console.log('Opening external URL:', url)
      shell.openExternal(url)
      return { action: 'deny' }
    })

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.warn('WebContents failed to load:', {
        id: contents.id,
        type: contents.getType(),
        url: validatedURL,
        errorCode,
        errorDescription
      })
    })

    contents.on('render-process-gone', (_event, details) => {
      console.warn('WebContents render process gone:', {
        id: contents.id,
        type: contents.getType(),
        url: contents.getURL(),
        details
      })
    })
  })

  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Configure unified session for all AI services
  const ses = session.fromPartition('persist:ai-browser')
  ses.setUserAgent(CHROME_122_USER_AGENT)
})

app.on('window-all-closed', (event?: { preventDefault?: () => void }) => {
  event?.preventDefault?.()
  Array.from(geminiViews.keys()).forEach(destroyGeminiView)
})

// IPC Handlers
ipcMain.handle('get-services', () => {
  return store.get('services')
})

ipcMain.handle('add-service', (_event, service: Omit<AIService, 'id'>) => {
  const services = store.get('services')
  const newService: AIService = {
    ...service,
    id: `custom-${Date.now()}`
  }

  services.push(newService)
  store.set('services', services)

  // All services use the unified session
  return newService
})

ipcMain.handle('update-service', (_event, id: string, updates: Partial<AIService>) => {
  const services = store.get('services')
  const index = services.findIndex(s => s.id === id)

  if (index !== -1) {
    services[index] = { ...services[index], ...updates }
    store.set('services', services)
    return services[index]
  }

  return null
})

ipcMain.handle('delete-service', (_event, id: string) => {
  const services = store.get('services')
  const filtered = services.filter(s => s.id !== id)
  store.set('services', filtered)

  // Don't clear session data - all services share the same session
  return true
})

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
  return true
})

ipcMain.handle('auto-update-check', async () => {
  if (process.env.VITE_DEV_SERVER_URL) {
    return { ok: false, reason: 'development-mode' }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, updateInfo: result?.updateInfo ?? null }
  } catch (error) {
    console.warn('[auto-update] manual check failed:', error)
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown-error' }
  }
})

ipcMain.handle('auto-update-install', () => {
  if (process.env.VITE_DEV_SERVER_URL) {
    return false
  }

  shell.openExternal(RELEASE_URL)
  return true
})

ipcMain.handle('read-prompt-attachments', async (_event, attachments: Array<{ path?: string; name: string; type?: string; kind?: string; size?: number }>) => {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (!attachment.path) {
        return {
          ...attachment,
          ok: false,
          error: 'missing-path'
        }
      }

      try {
        const buffer = await fs.promises.readFile(attachment.path)
        return {
          ...attachment,
          ok: true,
          base64: buffer.toString('base64')
        }
      } catch (error) {
        console.warn('Failed to read prompt attachment:', {
          name: attachment.name,
          path: attachment.path,
          error
        })

        return {
          ...attachment,
          ok: false,
          error: 'read-failed'
        }
      }
    })
  )
})

ipcMain.handle('gemini-view-create', (_event, id: string, url: string, bounds: ViewBounds) => {
  return createGeminiView(id, url, bounds)
})

ipcMain.handle('gemini-view-set-bounds', (_event, id: string, bounds: ViewBounds) => {
  const state = geminiViews.get(id)
  if (!state) return false

  const sanitizedBounds = sanitizeBounds(bounds)
  state.bounds = sanitizedBounds
  if (!state.failed) {
    state.view.setBounds(sanitizedBounds)
  }
  return true
})

ipcMain.handle('gemini-view-destroy', (_event, id: string) => {
  return destroyGeminiView(id)
})

ipcMain.handle('gemini-view-reload', (_event, id: string) => {
  const state = geminiViews.get(id)
  if (!state) return false

  state.failed = false
  state.view.setBounds(state.bounds)
  state.view.webContents.reload()
  return true
})

ipcMain.handle('gemini-view-go-back', (_event, id: string) => {
  const state = geminiViews.get(id)
  if (!state) return false

  if (state.view.webContents.canGoBack()) {
    state.view.webContents.goBack()
    return true
  }

  state.view.webContents.executeJavaScript('history.back()', true).catch(error => {
    console.warn('Gemini history.back fallback failed:', { id, error })
  })
  return true
})

ipcMain.handle('gemini-view-go-forward', (_event, id: string) => {
  const state = geminiViews.get(id)
  if (!state) return false

  if (state.view.webContents.canGoForward()) {
    state.view.webContents.goForward()
    return true
  }

  state.view.webContents.executeJavaScript('history.forward()', true).catch(error => {
    console.warn('Gemini history.forward fallback failed:', { id, error })
  })
  return true
})

ipcMain.handle('gemini-view-can-go-back', (_event, id: string) => {
  const state = geminiViews.get(id)
  if (!state) return false
  return state.view.webContents.canGoBack()
})

ipcMain.handle('gemini-view-can-go-forward', (_event, id: string) => {
  const state = geminiViews.get(id)
  if (!state) return false
  return state.view.webContents.canGoForward()
})

ipcMain.handle('gemini-view-insert-prompt', async (_event, id: string, text: string, options = {}) => {
  const state = geminiViews.get(id)
  const promptOptions = options as { autoSend?: boolean; attachments?: unknown[]; debugLabel?: string }

  if (!state || state.failed) {
    return { inserted: false, sent: false, sendAttempted: Boolean(promptOptions.autoSend) }
  }

  try {
    const result = await state.view.webContents.executeJavaScript(
      buildPromptInsertScript(text, promptOptions),
      true
    )

    if (result && typeof result === 'object') {
      return result
    }

    return {
      inserted: result === true,
      sent: false,
      sendAttempted: Boolean(promptOptions.autoSend)
    }
  } catch (error) {
    console.warn('Failed to insert prompt into Gemini BrowserView:', { id, error })
    return { inserted: false, sent: false, sendAttempted: Boolean(promptOptions.autoSend) }
  }
})
