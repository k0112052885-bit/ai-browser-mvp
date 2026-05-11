import type { PromptInsertOptions } from './types'

type PromptWebview = HTMLElement & {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  sendInputEvent?: (event: Record<string, unknown>) => void
  focus?: () => void
}
// Native input fallback for Perplexity webview prompt insertion
async function insertPromptWithNativeInputFallback(
  webview: PromptWebview,
  text: string,
  options: PromptInsertOptions = {}
): Promise<WebviewPromptResult> {
  const label = options.debugLabel ?? ''
  if (!/perplexity/i.test(label)) {
    return { inserted: false, sent: false, sendAttempted: Boolean(options.autoSend) }
  }

  if (typeof webview.sendInputEvent !== 'function') {
    return { inserted: false, sent: false, sendAttempted: Boolean(options.autoSend) }
  }

  try {
    webview.focus?.()

    const rect = webview.getBoundingClientRect()
    const clickX = Math.round(rect.width * 0.5)
    const clickY = Math.round(rect.height - 92)

    webview.sendInputEvent({ type: 'mouseDown', x: clickX, y: clickY, button: 'left', clickCount: 1 })
    webview.sendInputEvent({ type: 'mouseUp', x: clickX, y: clickY, button: 'left', clickCount: 1 })

    await new Promise(resolve => setTimeout(resolve, 180))

    webview.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
    webview.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
    webview.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
    webview.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })

    await new Promise(resolve => setTimeout(resolve, 120))

    for (const char of text) {
      webview.sendInputEvent({ type: 'char', keyCode: char })
    }

    await new Promise(resolve => setTimeout(resolve, 250))

    let sent = false
    if (options.autoSend) {
      webview.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      webview.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
      sent = true
    }

    return { inserted: true, sent, sendAttempted: Boolean(options.autoSend) }
  } catch (error) {
    console.warn('[QuickPrompt][Perplexity] native input fallback failed:', error)
    return { inserted: false, sent: false, sendAttempted: Boolean(options.autoSend) }
  }
}

export interface WebviewPromptResult {
  inserted: boolean
  sent: boolean
  sendAttempted: boolean
}

export function buildPromptInsertScript(
  text: string,
  options: PromptInsertOptions = {}
): string {
  return `
    (async () => {
      const promptText = ${JSON.stringify(text)}
      const attachments = ${JSON.stringify(options.attachments ?? [])}
      const shouldAutoSend = ${JSON.stringify(Boolean(options.autoSend))}
      const debugLabel = ${JSON.stringify(options.debugLabel ?? 'AI WebView')}
      const logPrefix = '[QuickPrompt][' + debugLabel + ']'
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
      const selectorGroups = [
        'textarea',
        'input[type="text"], input:not([type])',
        '[contenteditable="true"], [contenteditable="plaintext-only"]',
        '[role="textbox"]',
        'input[type="search"], input[type="email"], input[type="url"], input[type="tel"]'
      ]

      const logAttachmentNotice = () => {
        if (attachments.length === 0) return
        console.log(logPrefix, 'attachments passed to prompt injection:', attachments.map(file => ({
          name: file.name,
          kind: file.kind,
          size: file.size,
          hasPath: Boolean(file.path)
        })))
      }

      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
      }

      const isTextControl = (element) => {
        if (element instanceof HTMLTextAreaElement) {
          return !element.disabled && !element.readOnly
        }

        if (!(element instanceof HTMLInputElement)) {
          return false
        }

        const allowedTypes = new Set([
          '',
          'text',
          'search',
          'url',
          'email',
          'tel',
          'password'
        ])

        return allowedTypes.has(element.type) && !element.disabled && !element.readOnly
      }

      const isEditableElement = (element) => {
        return isTextControl(element) ||
          element.isContentEditable ||
          element.getAttribute('contenteditable') === 'true' ||
          element.getAttribute('contenteditable') === 'plaintext-only' ||
          element.getAttribute('role') === 'textbox' ||
          element.hasAttribute('data-lexical-editor') ||
          element.classList?.contains('ProseMirror')
      }

      const resolveEditableElement = (element) => {
        if (isEditableElement(element)) return element

        if (element.getAttribute('role') === 'textbox') {
          const nestedEditable = element.querySelector(
            'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [data-lexical-editor], .ProseMirror'
          )

          if (nestedEditable && isEditableElement(nestedEditable)) {
            return nestedEditable
          }
        }

        return element
      }

      const describe = (element) => [
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('name'),
        element.getAttribute('id'),
        element.getAttribute('class'),
        element.getAttribute('data-testid')
      ].filter(Boolean).join(' ')

      const scoreElement = (element) => {
        const rect = element.getBoundingClientRect()
        const tagName = element.tagName.toLowerCase()
        const description = describe(element)
        let score = 0

        if (document.activeElement === element) score += 100
        if (tagName === 'textarea') score += 45
        if (element.isContentEditable) score += 40
        if (tagName === 'input') score += 20
        if (element.getAttribute('role') === 'textbox') score += 20
        if (/message|prompt|chat|ask|composer|editor|question|query|질문|입력|메시지|프롬프트/i.test(description)) score += 35
        if (/search|filter|검색|필터/i.test(description)) score -= 25
        if (rect.width >= 240) score += 10
        if (rect.height >= 36) score += 8
        if (rect.top > window.innerHeight * 0.45) score += 8

        return score
      }

      const getCandidates = (selector) => Array.from(document.querySelectorAll(selector))
        .map((element) => ({
          originalElement: element,
          element: resolveEditableElement(element),
          selector
        }))
        .filter(({ originalElement, element }) => {
          if (!isVisible(originalElement) || !isVisible(element)) return false
          if (isTextControl(element)) return true
          if (element.isContentEditable) return true
          return element.getAttribute('role') === 'textbox'
        })
        .map((candidate) => ({
          ...candidate,
          score: scoreElement(candidate.element)
        }))
        .sort((a, b) => b.score - a.score)

      const dispatchValueEvents = (element) => {
        try {
          element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertReplacementText',
            data: null
          }))
        } catch {
          element.dispatchEvent(new Event('input', { bubbles: true }))
        }

        element.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const setCaretToEnd = (element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          const end = element.value.length
          element.setSelectionRange?.(end, end)
          return
        }

        if (element.isContentEditable) {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(element)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

      const setTextControlValue = (target) => {
        const proto = target instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
        const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

        if (valueSetter) {
          valueSetter.call(target, promptText)
        } else {
          target.value = promptText
        }

        if (target.value === promptText + promptText) {
          target.value = promptText
        }
        dispatchValueEvents(target)
        setCaretToEnd(target)
        return target.value === promptText
      }

      const setContentEditableValue = (target) => {
        setCaretToEnd(target)

        target.textContent = promptText
        if ((target.textContent || '') === promptText + promptText) {
          target.textContent = promptText
        }
        dispatchValueEvents(target)
        setCaretToEnd(target)

        const currentText = target.textContent || ''
        return currentText.includes(promptText)
      }

      let insertedTarget = null

      const tryInsert = ({ element, selector }) => {
        try {
          element.focus()
          setCaretToEnd(element)

          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const success = setTextControlValue(element)
            if (success) console.log(logPrefix, 'auto input succeeded with selector:', selector)
            return success
          }

          if (element.isContentEditable) {
            const success = setContentEditableValue(element)
            if (success) console.log(logPrefix, 'auto input succeeded with selector:', selector)
            return success
          }

          console.warn(logPrefix, 'candidate is not editable for selector:', selector)
          return false
        } catch (error) {
          console.warn(logPrefix, 'auto input attempt failed for selector:', selector, error)
          return false
        }
      }

      const isVisibleButton = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
      }

      const getButtonText = (element) => [
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('data-testid'),
        element.getAttribute('data-test-id'),
        element.getAttribute('data-cy'),
        element.getAttribute('name'),
        element.getAttribute('class'),
        element.textContent
      ].filter(Boolean).join(' ')

      const blockedButtonText = /attach|upload|file|image|photo|picture|camera|mic|voice|audio|record|stop|cancel|close|settings|menu|more|google|apple|login|sign|search|첨부|업로드|파일|이미지|사진|카메라|마이크|음성|녹음|중지|취소|닫기|설정|메뉴|로그인|검색/i
      const preferredButtonText = /send|submit|arrow|upward|paper|plane|보내기|전송/i

      const isSendButton = (element) => {
        if (!isVisibleButton(element)) return false
        if (element instanceof HTMLButtonElement && element.disabled) return false
        if (element.hasAttribute('disabled')) return false
        if (element.getAttribute('aria-disabled') === 'true') return false

        const buttonText = getButtonText(element)
        if (blockedButtonText.test(buttonText)) return false
        if (element instanceof HTMLButtonElement && element.type === 'submit') return true
        if (preferredButtonText.test(buttonText)) return true
        return Boolean(element.querySelector('svg'))
      }

      const dedupe = (elements) => Array.from(new Set(elements.filter(Boolean)))

      const distanceFromPoint = (button, point) => {
        const rect = button.getBoundingClientRect()
        const dx = point.x - (rect.left + rect.width / 2)
        const dy = point.y - (rect.top + rect.height / 2)
        return Math.sqrt((dx * dx) + (dy * dy))
      }

      const getInputPoint = () => {
        const rect = insertedTarget?.getBoundingClientRect?.()
        if (rect) {
          return {
            x: rect.right,
            y: rect.bottom
          }
        }

        return {
          x: window.innerWidth,
          y: window.innerHeight
        }
      }

      const scoreSendButton = (button) => {
        const text = getButtonText(button)
        const rect = button.getBoundingClientRect()
        const inputPoint = getInputPoint()
        let score = 0

        if (button instanceof HTMLButtonElement && button.type === 'submit') score += 90
        if (/send|submit|arrow|upward|보내기|전송/i.test(text)) score += 120
        if (/data-testid|data-test-id|data-cy/i.test(text)) score += 5
        if (/arrow|paper|plane/i.test(text)) score += 50
        if (button.querySelector('svg')) score += 20
        if (rect.left >= inputPoint.x - 180) score += 18
        if (rect.top >= inputPoint.y - 120) score += 18
        score -= distanceFromPoint(button, inputPoint) / 10

        return score
      }

      const pickBottomRightButton = (buttons) => {
        const candidates = dedupe(buttons).filter(isSendButton)
        return candidates.sort((a, b) => scoreSendButton(b) - scoreSendButton(a))[0] || null
      }

      const clickButton = (button, label) => {
        try {
          button.scrollIntoView?.({ block: 'center', inline: 'center' })
          button.focus?.()

          const rect = button.getBoundingClientRect()
          const clientX = rect.left + rect.width / 2
          const clientY = rect.top + rect.height / 2

          const pointerOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
          }

          try { button.dispatchEvent(new PointerEvent('pointerdown', pointerOptions)) } catch {}
          try { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX, clientY })) } catch {}
          try { button.dispatchEvent(new PointerEvent('pointerup', pointerOptions)) } catch {}
          try { button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX, clientY })) } catch {}
          button.click?.()
          button.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX,
            clientY
          }))

          console.log(logPrefix, '[auto-send] clicked:', label || getButtonText(button))
          return true
        } catch (error) {
          console.warn(logPrefix, '[auto-send] click failed:', error)
          return false
        }
      }


      const getClosestFormButtons = (selector) => {
        const source = insertedTarget?.matches?.(selector)
          ? insertedTarget
          : document.querySelector(selector)
        const form = source?.closest?.('form')
        if (!form) return []
        return Array.from(form.querySelectorAll('button:not([disabled]), [role="button"]'))
      }

      const dispatchEnterSubmit = async () => {
        if (!shouldAutoSend || !insertedTarget) return false

        try {
          insertedTarget.focus?.()
          setCaretToEnd(insertedTarget)

          const eventOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          }

          const activeTarget = document.activeElement || insertedTarget
          const targets = dedupe([
            insertedTarget,
            activeTarget,
            insertedTarget.closest?.('form'),
            document
          ])

          for (const target of targets) {
            try { target.dispatchEvent(new KeyboardEvent('keydown', eventOptions)) } catch {}
            await wait(30)
            try { target.dispatchEvent(new KeyboardEvent('keypress', eventOptions)) } catch {}
            await wait(30)
            try { target.dispatchEvent(new KeyboardEvent('keyup', eventOptions)) } catch {}
          }

          try {
            insertedTarget.dispatchEvent(new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertParagraph',
              data: null
            }))
          } catch {}

          const form = insertedTarget.closest?.('form')
          if (form) {
            try {
              form.requestSubmit?.()
              console.log(logPrefix, '[auto-send] requested form submit')
              return true
            } catch {}

            try {
              form.dispatchEvent(new SubmitEvent('submit', {
                bubbles: true,
                cancelable: true,
                submitter: null
              }))
              console.log(logPrefix, '[auto-send] dispatched form submit')
              return true
            } catch {}
          }

          console.log(logPrefix, '[auto-send] dispatched Enter key events')
          return true
        } catch (error) {
          console.warn(logPrefix, '[auto-send] Enter key dispatch failed:', error)
          return false
        }
      }

      const getComposerRoots = () => {
        const roots = []
        const form = insertedTarget?.closest?.('form')
        if (form) roots.push(form)

        const composer = insertedTarget?.closest?.([
          '[data-testid*="composer" i]',
          '[data-testid*="prompt" i]',
          '[data-testid*="chat" i]',
          '[class*="composer" i]',
          '[class*="prompt" i]',
          '[class*="chat" i]',
          '[class*="input" i]',
          '[class*="editor" i]',
          '[role="form"]'
        ].join(', '))
        if (composer) roots.push(composer)

        let parent = insertedTarget?.parentElement
        let depth = 0
        while (parent && depth < 5) {
          roots.push(parent)
          parent = parent.parentElement
          depth += 1
        }

        roots.push(document)
        return dedupe(roots)
      }

      const normalizeButton = (element) => {
        if (!element) return null
        if (element instanceof SVGElement) return element.closest('button, [role="button"]')
        if (element instanceof HTMLElement) return element.closest('button, [role="button"]') || element
        return null
      }

      const getButtonsFromRoot = (root) => {
        try {
          return Array.from(root.querySelectorAll?.([
            'button[type="submit"]',
            'button[aria-label*="send" i]',
            'button[aria-label*="보내기"]',
            'button[aria-label*="전송"]',
            '[role="button"][aria-label*="send" i]',
            '[role="button"][aria-label*="보내기"]',
            '[role="button"][aria-label*="전송"]',
            '[data-testid*="send" i]',
            '[data-test-id*="send" i]',
            '[data-cy*="send" i]',
            'button:not([disabled])',
            '[role="button"]'
          ].join(', ')) || [])
            .map(normalizeButton)
            .filter(Boolean)
        } catch {
          return []
        }
      }

      const clickDirectSendFallback = () => {
        if (!shouldAutoSend) return false

        for (const root of getComposerRoots()) {
          const candidates = dedupe(getButtonsFromRoot(root)).filter(isSendButton)
          const preferred = candidates.find((button) => preferredButtonText.test(getButtonText(button)))
          const submit = candidates.find((button) => button instanceof HTMLButtonElement && button.type === 'submit')
          const bottomRight = pickBottomRightButton(candidates)
          const candidate = preferred || submit || bottomRight

          console.log(logPrefix, '[auto-send] composer candidates:', candidates.length, {
            root: root === document ? 'document' : root.tagName,
            buttons: candidates.map(button => getButtonText(button).slice(0, 80))
          })

          if (candidate && clickButton(candidate, 'direct-send-fallback')) {
            return true
          }
        }

        return false
      }

      const hostname = window.location.hostname
      logAttachmentNotice()

      const isPerplexityHost = /perplexity\.ai/i.test(hostname)

      const getPerplexityPromptTarget = async () => {
        // DOM 전체 덤프: 진단용
        const collectPerplexityInputs = () => Array.from(document.querySelectorAll('textarea, input, [contenteditable], [role="textbox"], [data-lexical-editor], .ProseMirror'))
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              tag: el.tagName,
              type: el instanceof HTMLInputElement ? el.type : null,
              role: el.getAttribute('role'),
              ce: el.getAttribute('contenteditable'),
              lexical: el.getAttribute('data-lexical-editor'),
              placeholder: el.getAttribute('placeholder'),
              ariaLabel: el.getAttribute('aria-label'),
              class: String(el.className || '').slice(0, 90),
              text: String(el.textContent || '').trim().slice(0, 60),
              rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
              visible: r.width > 0 && r.height > 0
            }
          })

        const allInputs = Array.from(document.querySelectorAll('textarea, input, [contenteditable], [role="textbox"], [data-lexical-editor], .ProseMirror'))
        window.__AI_BROWSER_PERPLEXITY_INPUTS__ = collectPerplexityInputs()
        console.log(logPrefix, '[Perplexity] ALL inputs in DOM:', window.__AI_BROWSER_PERPLEXITY_INPUTS__)

        // 1순위: textarea 중 visible + 가장 넓은 것
        const textareas = Array.from(document.querySelectorAll('textarea'))
          .filter((el) => isVisible(el))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect()
            const rb = b.getBoundingClientRect()
            const scoreA = ra.bottom + (ra.width / 10)
            const scoreB = rb.bottom + (rb.width / 10)
            return scoreB - scoreA
          })

        if (textareas.length > 0) {
          console.log(logPrefix, '[Perplexity] found textarea:', {
            placeholder: textareas[0].getAttribute('placeholder'),
            rect: (() => {
              const r = textareas[0].getBoundingClientRect()
              return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
            })()
          })
          return textareas[0]
        }

        // 2순위: contenteditable / role=textbox
        const selectors = [
          '[contenteditable="true"]',
          '[contenteditable="plaintext-only"]',
          '[role="textbox"]',
          '[data-lexical-editor="true"]',
          '[data-lexical-editor]',
          '.ProseMirror'
        ].join(', ')

        const seen = new Set()
        const candidates = Array.from(document.querySelectorAll(selectors))
          .map(resolveEditableElement)
          .filter((element) => {
            if (!element) return false
            if (seen.has(element)) return false
            seen.add(element)
            if (!isVisible(element)) return false
            const rect = element.getBoundingClientRect()
            return rect.width > 100
          })
          .sort((a, b) => {
            const ra = a.getBoundingClientRect()
            const rb = b.getBoundingClientRect()
            const scoreA = ra.bottom + (ra.width / 10)
            const scoreB = rb.bottom + (rb.width / 10)
            return scoreB - scoreA
          })

        console.log(logPrefix, '[Perplexity] contenteditable candidates:', candidates.length)
        if (candidates[0]) return candidates[0]

        const clickPoints = [
          { x: window.innerWidth * 0.52, y: window.innerHeight - 86 },
          { x: window.innerWidth * 0.45, y: window.innerHeight - 86 },
          { x: window.innerWidth * 0.62, y: window.innerHeight - 86 },
          { x: window.innerWidth * 0.52, y: window.innerHeight - 112 }
        ]

        for (const point of clickPoints) {
          const target = document.elementFromPoint(point.x, point.y)
          const editable = target?.closest?.('textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [data-lexical-editor], .ProseMirror')
          let candidate = editable ? resolveEditableElement(editable) : null

          try {
            const clickTarget = target instanceof HTMLElement ? target : candidate
            clickTarget?.dispatchEvent?.(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y }))
            clickTarget?.dispatchEvent?.(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y }))
            clickTarget?.dispatchEvent?.(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y }))
            clickTarget?.focus?.()
            await wait(180)
          } catch {}

          if (!candidate || !isVisible(candidate)) {
            const active = document.activeElement
            const activeEditable = active?.closest?.('textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [data-lexical-editor], .ProseMirror')
            candidate = activeEditable ? resolveEditableElement(activeEditable) : null
          }

          if (candidate && isVisible(candidate) && isEditableElement(candidate)) {
            candidate.focus?.()
            console.log(logPrefix, '[Perplexity] found by coordinate:', {
              point,
              tag: candidate.tagName,
              role: candidate.getAttribute('role'),
              contenteditable: candidate.getAttribute('contenteditable'),
              lexical: candidate.getAttribute('data-lexical-editor'),
              placeholder: candidate.getAttribute('placeholder'),
              ariaLabel: candidate.getAttribute('aria-label')
            })
            return candidate
          }
        }

        const active = document.activeElement
        if (active && isEditableElement(active) && isVisible(active)) {
          console.log(logPrefix, '[Perplexity] using activeElement:', active.tagName)
          return active
        }

        return null
      }

      const setPerplexityPromptValue = (target) => {
        try {
          target.focus?.()

          const dispatchPerplexityReplacementEvents = (element) => {
            try {
              element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertReplacementText',
                data: null
              }))
            } catch {
              element.dispatchEvent(new Event('input', { bubbles: true }))
            }
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }

          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            const proto = target instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype
            const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

            if (valueSetter) {
              valueSetter.call(target, '')
              dispatchPerplexityReplacementEvents(target)
              valueSetter.call(target, promptText)
            } else {
              target.value = ''
              dispatchPerplexityReplacementEvents(target)
              target.value = promptText
            }

            dispatchPerplexityReplacementEvents(target)
            setCaretToEnd(target)
            return target.value === promptText
          }

          if (target.isContentEditable || target.getAttribute('role') === 'textbox' || target.hasAttribute('data-lexical-editor') || target.classList?.contains('ProseMirror')) {
            target.focus?.()
            target.textContent = ''
            target.innerHTML = ''
            dispatchPerplexityReplacementEvents(target)

            target.replaceChildren(document.createTextNode(promptText))
            dispatchPerplexityReplacementEvents(target)
            setCaretToEnd(target)

            const currentText = (target.textContent || '').trim()
            return currentText === promptText.trim()
          }
        } catch (error) {
          console.warn(logPrefix, '[Perplexity] set prompt value failed:', error)
        }

        return false
      }

      const clickChatGPTSendButton = () => {
        // ChatGPT composer area: look for send button by aria-label, data-testid, type=submit, SVG, or position
        const composerSelectors = [
          '[data-testid="composer-submit-button"]',
          '[data-testid*="send" i]',
          'button[aria-label*="Send" i]',
          'button[aria-label*="send" i]',
          'button[type="submit"]',
          'button:has(svg[data-icon])',
          'button:has(svg)'
        ]

        for (const sel of composerSelectors) {
          const buttons = Array.from(document.querySelectorAll(sel))
            .map(el => normalizeButton(el))
            .filter(Boolean)
            .filter(isSendButton)

          if (buttons.length > 0) {
            const btn = pickBottomRightButton(buttons)
            if (btn && clickButton(btn, '[ChatGPT] ' + sel)) return true
          }
        }

        // Position-based fallback: rightmost bottom button near composer
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
          .map(el => normalizeButton(el))
          .filter(Boolean)
          .filter(isSendButton)

        const btn = pickBottomRightButton(allButtons)
        if (btn && clickButton(btn, '[ChatGPT] position-fallback')) return true
        return false
      }

      const clickGeminiSendButton = () => {
        // Gemini: bottom-right arrow button near input area
        const geminiSelectors = [
          'button[aria-label*="전송"]',
          'button[aria-label*="보내기"]',
          'button[aria-label*="Send" i]',
          'button[aria-label*="submit" i]',
          '[data-testid*="send" i]',
          'button[class*="send" i]',
          'button[class*="submit" i]',
          'button:has(mat-icon)',
          'button:has(svg)'
        ]

        for (const sel of geminiSelectors) {
          const buttons = Array.from(document.querySelectorAll(sel))
            .map(el => normalizeButton(el))
            .filter(Boolean)
            .filter(isSendButton)

          if (buttons.length > 0) {
            const btn = pickBottomRightButton(buttons)
            if (btn && clickButton(btn, '[Gemini] ' + sel)) return true
          }
        }

        // Material icon arrow_upward / send button
        const matIcons = Array.from(document.querySelectorAll('mat-icon'))
          .filter(icon => /arrow_upward|send|submit/i.test(icon.textContent || ''))
          .map(icon => icon.closest('button, [role="button"]'))
          .filter(Boolean)
          .filter(isSendButton)

        const btn = pickBottomRightButton(matIcons)
        if (btn && clickButton(btn, '[Gemini] mat-icon')) return true

        // Position-based fallback
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
          .map(el => normalizeButton(el))
          .filter(Boolean)
          .filter(isSendButton)

        const fallback = pickBottomRightButton(allButtons)
        if (fallback && clickButton(fallback, '[Gemini] position-fallback')) return true
        return false
      }

      const clickClaudeSendButton = () => {
        const claudeSelectors = [
          'button[aria-label*="Send" i]',
          'button[type="submit"]',
          '[data-testid*="send" i]',
          'button:has(svg)'
        ]

        for (const sel of claudeSelectors) {
          const buttons = Array.from(document.querySelectorAll(sel))
            .map(el => normalizeButton(el))
            .filter(Boolean)
            .filter(isSendButton)

          if (buttons.length > 0) {
            const btn = pickBottomRightButton(buttons)
            if (btn && clickButton(btn, '[Claude] ' + sel)) return true
          }
        }
        return false
      }

      const clickPerplexitySendButton = () => {
        const inputRect = insertedTarget?.getBoundingClientRect?.()

        const blockedPerplexityButtonText = /검색|심층|리서치|모델|협의회|단계별|배우기|첨부|attach|upload|file|image|photo|mic|voice|audio|settings|menu|more|download|comet/i

        // 전체 버튼 덤프: 진단용
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
        console.log(logPrefix, '[Perplexity] ALL buttons in DOM:', allButtons.map((el) => {
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName,
            ariaLabel: el.getAttribute('aria-label'),
            type: el.getAttribute('type'),
            disabled: el.hasAttribute('disabled'),
            text: (el.textContent || '').trim().slice(0, 30),
            rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
            visible: r.width > 0 && r.height > 0
          }
        }))

        // 1단계: 입력창 기준으로 같은 행(row) 또는 바로 아래에 있는 버튼 탐색
        // Perplexity는 입력창 오른쪽에 전송 버튼이 있음
        if (inputRect) {
          const nearInputButtons = Array.from(document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'))
            .map(el => normalizeButton(el))
            .filter(Boolean)
            .filter((button) => {
              if (!isVisibleButton(button)) return false
              const text = getButtonText(button)
              if (blockedPerplexityButtonText.test(text)) return false
              const rect = button.getBoundingClientRect()
              // 입력창 수직 범위 내 (위아래 40px 여유)
              if (rect.top < inputRect.top - 40) return false
              if (rect.bottom > inputRect.bottom + 40) return false
              // 입력창 왼쪽 절반보다 왼쪽은 제외
              if (rect.right < inputRect.left + inputRect.width * 0.5) return false
              return true
            })
            .sort((a, b) => {
              const ra = a.getBoundingClientRect()
              const rb = b.getBoundingClientRect()
              // 가장 오른쪽 버튼
              return rb.right - ra.right
            })

          console.log(logPrefix, '[Perplexity] near-input button candidates:', nearInputButtons.map((b) => {
            const r = b.getBoundingClientRect()
            return { text: getButtonText(b).slice(0, 60), rect: { top: Math.round(r.top), right: Math.round(r.right) } }
          }))

          if (nearInputButtons.length > 0) {
            const btn = nearInputButtons[0]
            if (clickButton(btn, '[Perplexity] near-input-send-button')) return true
          }
        }

        // 2단계: 좌표 기반 탐색 (입력창 오른쪽 끝)
        if (inputRect) {
          const pointCandidates = [
            { x: inputRect.right - 20, y: inputRect.top + inputRect.height / 2 },
            { x: inputRect.right - 36, y: inputRect.top + inputRect.height / 2 },
            { x: inputRect.right - 20, y: inputRect.bottom - 20 },
            { x: inputRect.right - 36, y: inputRect.bottom - 20 },
            { x: inputRect.right + 20, y: inputRect.top + inputRect.height / 2 },
            { x: inputRect.right + 36, y: inputRect.top + inputRect.height / 2 }
          ]

          for (const point of pointCandidates) {
            const target = document.elementFromPoint(point.x, point.y)
            const button = normalizeButton(target)
            if (button && isVisibleButton(button)) {
              const text = getButtonText(button)
              if (!blockedPerplexityButtonText.test(text)) {
                console.log(logPrefix, '[Perplexity] coordinate hit:', { point, text: text.slice(0, 40) })
                if (clickButton(button, '[Perplexity] coordinate-send-button')) return true
              }
            }
          }
        }

        // 3단계: type=submit 또는 aria-label 기반
        const directSelectors = [
          'button[type="submit"]:not([disabled])',
          'button[aria-label*="Submit" i]:not([disabled])',
          'button[aria-label*="Send" i]:not([disabled])',
          '[data-testid*="submit" i]',
          '[data-testid*="send" i]'
        ]

        for (const sel of directSelectors) {
          const buttons = Array.from(document.querySelectorAll(sel))
            .map(el => normalizeButton(el))
            .filter(Boolean)
            .filter((button) => {
              if (!isVisibleButton(button)) return false
              return !blockedPerplexityButtonText.test(getButtonText(button))
            })

          if (buttons.length > 0) {
            const btn = pickBottomRightButton(buttons)
            if (btn && clickButton(btn, '[Perplexity] ' + sel)) return true
          }
        }

        return false
      }

      const clickSiteSpecificSendButton = () => {
        if (!shouldAutoSend) return false

        if (/chatgpt\.com|chat\.openai\.com/i.test(hostname)) {
          console.log(logPrefix, '[auto-send] using ChatGPT strategy')
          return clickChatGPTSendButton()
        }
        if (/gemini\.google\.com/i.test(hostname)) {
          console.log(logPrefix, '[auto-send] using Gemini strategy')
          return clickGeminiSendButton()
        }
        if (/claude\.ai/i.test(hostname)) {
          console.log(logPrefix, '[auto-send] using Claude strategy')
          return clickClaudeSendButton()
        }
        if (/perplexity\.ai/i.test(hostname)) {
          console.log(logPrefix, '[auto-send] using Perplexity strategy')
          return clickPerplexitySendButton()
        }
        return false
      }

      const clickSendButton = () => {
        if (!shouldAutoSend) return false

        // Try site-specific strategy first
        if (clickSiteSpecificSendButton()) return true

        const selectorGroups = [
          ['input surrounding composer', () => getComposerRoots().flatMap(getButtonsFromRoot)],
          ['button[type="submit"]', () => Array.from(document.querySelectorAll('button[type="submit"]'))],
          ['[data-testid*="send" i], [data-test-id*="send" i], [data-cy*="send" i]', () => Array.from(document.querySelectorAll('[data-testid*="send" i], [data-test-id*="send" i], [data-cy*="send" i]'))],
          ['button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]', () => Array.from(document.querySelectorAll('button[aria-label*="Send" i], [role="button"][aria-label*="Send" i]'))],
          ['button[aria-label*="보내기"], [role="button"][aria-label*="보내기"]', () => Array.from(document.querySelectorAll('button[aria-label*="보내기"], [role="button"][aria-label*="보내기"]'))],
          ['button[aria-label*="전송"], [role="button"][aria-label*="전송"]', () => Array.from(document.querySelectorAll('button[aria-label*="전송"], [role="button"][aria-label*="전송"]'))],
          ['form button:not([disabled])', () => Array.from(document.querySelectorAll('form button:not([disabled]), form [role="button"]'))],
          ['textarea closest form button:not([disabled])', () => getClosestFormButtons('textarea')],
          ['contenteditable closest form button:not([disabled])', () => getClosestFormButtons('[contenteditable="true"]')],
          ['button:has(svg), [role="button"]:has(svg)', () => Array.from(document.querySelectorAll('button:has(svg), [role="button"]:has(svg)'))],
          ['bottom-right active button', () => Array.from(document.querySelectorAll('button, [role="button"]'))]
        ]

        for (const [label, getCandidates] of selectorGroups) {
          const candidates = dedupe(getCandidates().map((element) => {
            if (element instanceof SVGElement) return element.closest('button, [role="button"]')
            if (element instanceof HTMLElement) return element.closest('button, [role="button"]') || element
            return element
          })).filter(isSendButton)
          console.log(logPrefix, '[auto-send] candidates:', candidates.length, 'selector:', label)
          const candidate = pickBottomRightButton(candidates)

          if (candidate && clickButton(candidate, label)) {
            return true
          }
        }

        console.warn(logPrefix, '[auto-send] no send button found')
        return false
      }

      if (isPerplexityHost) {
        console.log(logPrefix, '[Perplexity] host detected, shouldAutoSend:', shouldAutoSend)
        let perplexityTarget = null

        for (let attempt = 0; attempt < 12; attempt += 1) {
          perplexityTarget = await getPerplexityPromptTarget()
          console.log(logPrefix, '[Perplexity] target retry:', attempt, Boolean(perplexityTarget), perplexityTarget?.tagName)
          if (perplexityTarget) break
          await wait(500)
        }

        if (perplexityTarget) {
          let inserted = false

          for (let attempt = 0; attempt < 3; attempt += 1) {
            inserted = setPerplexityPromptValue(perplexityTarget)
            console.log(logPrefix, '[Perplexity] insert retry:', attempt, inserted, 'value:', perplexityTarget.value?.slice(0, 40) || perplexityTarget.textContent?.slice(0, 40))
            if (inserted) break
            await wait(250)
          }

          if (inserted) {
            insertedTarget = perplexityTarget
            let sent = false

            if (shouldAutoSend) {
              await wait(700)
              sent = clickPerplexitySendButton()
              if (!sent) {
                await wait(600)
                sent = clickPerplexitySendButton()
              }
            }

            const sendAttempted = shouldAutoSend
            console.log(logPrefix, '[Perplexity] result:', { inserted: true, sent, sendAttempted })
            return { inserted: true, sent, sendAttempted }
          }
        }

        const diagnostics = window.__AI_BROWSER_PERPLEXITY_INPUTS__ || []
        console.warn(logPrefix, '[Perplexity] prompt target not found or insert failed', diagnostics)
        return {
          inserted: false,
          sent: false,
          sendAttempted: shouldAutoSend,
          reason: 'perplexity-target-not-found-or-insert-failed',
          diagnostics
        }
      }

      for (const selector of selectorGroups) {
        const candidates = getCandidates(selector)

        for (const candidate of candidates) {
          if (tryInsert(candidate)) {
            insertedTarget = candidate.element
            let sent = false

            if (attachments.length > 0) {
              console.log(logPrefix, '[attachment] files were selected in Quick Prompt, but auto upload is disabled. User should drag/upload files directly to each AI.', { attachmentCount: attachments.length })
            }

            if (shouldAutoSend) {
              await wait(800)
              try {
                sent = clickSendButton() || clickDirectSendFallback()
              } catch (error) {
                console.warn(logPrefix, 'send button click failed after input:', error)
              }

              if (!sent) {
                await wait(350)
                sent = await dispatchEnterSubmit()
              }

              if (!sent) {
                await wait(500)
                sent = clickSendButton() || clickDirectSendFallback()
              }

              if (!sent) {
                await wait(700)
                sent = await dispatchEnterSubmit()
              }
            }

            const sendAttempted = shouldAutoSend
            console.log(logPrefix, 'result:', { inserted: true, sent, sendAttempted })
            return { inserted: true, sent, sendAttempted }
          }
        }
      }

      console.warn(logPrefix, 'auto input failed: no editable target accepted the prompt.')
      return { inserted: false, sent: false, sendAttempted: shouldAutoSend }
    })()
  `
}

export function buildDraftClearScript(debugLabel = 'AI WebView'): string {
  return `
    (async () => {
      const debugLabel = ${JSON.stringify(debugLabel)}
      const logPrefix = '[draft-clear][' + debugLabel + ']'
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

      const isVisible = (element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
      }

      const describe = (element) => [
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('name'),
        element.getAttribute('id'),
        element.getAttribute('class'),
        element.getAttribute('data-testid'),
        element.getAttribute('role')
      ].filter(Boolean).join(' ')

      const dispatchClearEvents = (element) => {
        try {
          element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'deleteContentBackward',
            data: null
          }))
        } catch {
          element.dispatchEvent(new Event('input', { bubbles: true }))
        }
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const shouldClear = (element) => {
        if (!isVisible(element)) return false
        const rect = element.getBoundingClientRect()
        const description = describe(element)
        const looksLikeComposer = /message|prompt|chat|ask|composer|editor|question|query|textbox|질문|입력|메시지|프롬프트/i.test(description)
        const isLowerLargeInput = rect.width > 220 && rect.top > window.innerHeight * 0.35
        return looksLikeComposer || isLowerLargeInput
      }

      const clearElement = (element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          if (element.disabled || element.readOnly) return false
          if (element instanceof HTMLInputElement && !['', 'text', 'search'].includes(element.type)) return false
          if (!element.value) return false
          const proto = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
          const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
          if (valueSetter) {
            valueSetter.call(element, '')
          } else {
            element.value = ''
          }
          dispatchClearEvents(element)
          return true
        }

        if (element.isContentEditable || element.getAttribute('role') === 'textbox') {
          const text = element.textContent || ''
          if (!text.trim()) return false
          element.textContent = ''
          dispatchClearEvents(element)
          return true
        }

        return false
      }

      const runPass = () => {
        const candidates = Array.from(document.querySelectorAll(
          'textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]'
        )).filter(shouldClear)

        let cleared = 0
        for (const element of candidates) {
          if (clearElement(element)) cleared += 1
        }
        console.log(logPrefix, 'cleared draft inputs:', cleared, 'candidates:', candidates.length)
        return cleared
      }

      let total = 0
      await wait(250)
      total += runPass()
      await wait(700)
      total += runPass()
      await wait(1500)
      total += runPass()
      return total
    })()
  `
}

export async function clearWebviewDraftInputs(
  webview: PromptWebview | null,
  debugLabel?: string
): Promise<number> {
  if (!webview) return 0

  try {
    const result = await webview.executeJavaScript(buildDraftClearScript(debugLabel), true)
    return typeof result === 'number' ? result : 0
  } catch (error) {
    console.warn('[draft-clear] failed to clear webview draft inputs:', { debugLabel, error })
    return 0
  }
}

export async function insertPromptIntoWebview(
  webview: PromptWebview | null,
  text: string,
  options: PromptInsertOptions = {}
): Promise<WebviewPromptResult> {
  if (!webview) return { inserted: false, sent: false, sendAttempted: false }

  const script = buildPromptInsertScript(text, options)

  try {
    const result = await webview.executeJavaScript(script, true)
    if (result && typeof result === 'object') {
      const webviewResult = result as WebviewPromptResult
      if (!webviewResult.inserted && /perplexity/i.test(options.debugLabel ?? '')) {
        return insertPromptWithNativeInputFallback(webview, text, options)
      }
      return webviewResult
    }

    if (result !== true && /perplexity/i.test(options.debugLabel ?? '')) {
      return insertPromptWithNativeInputFallback(webview, text, options)
    }

    return { inserted: result === true, sent: false, sendAttempted: Boolean(options.autoSend) }
  } catch (error) {
    console.error('Failed to insert prompt into webview:', error)
    if (/perplexity/i.test(options.debugLabel ?? '')) {
      return insertPromptWithNativeInputFallback(webview, text, options)
    }
    return { inserted: false, sent: false, sendAttempted: Boolean(options.autoSend) }
  }
}
