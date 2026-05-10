import { useState, useEffect, useRef } from 'react'
import { PromptInsertResult } from '../types'
import './QuickPrompt.css'

interface QuickPromptProps {
  isSplitView?: boolean
  onInsertPrompt?: (text: string) => Promise<PromptInsertResult>
}

const HISTORY_KEY = 'quick-prompt-history'
const MAX_HISTORY = 5

function QuickPrompt({ isSplitView, onInsertPrompt }: QuickPromptProps) {
  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const shouldAutoFocusRef = useRef(true)

  const focusInput = () => {
    window.requestAnimationFrame(() => {
      if (shouldAutoFocusRef.current) {
        inputRef.current?.focus()
      }
    })
  }

  useEffect(() => {
    // Load history from localStorage
    const savedHistory = localStorage.getItem(HISTORY_KEY)
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to load history:', e)
      }
    }
  }, [])

  useEffect(() => {
    shouldAutoFocusRef.current = true
    focusInput()
  }, [isSplitView])

  useEffect(() => {
    // Close history dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false)
      }
    }

    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showHistory])

  const saveToHistory = (text: string) => {
    if (!text.trim()) return

    // Add to history, remove duplicates, keep last 5
    const newHistory = [text, ...history.filter(h => h !== text)].slice(0, MAX_HISTORY)
    setHistory(newHistory)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
  }

  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const getResultMessage = (result: PromptInsertResult, copied: boolean) => {
    const failedCount = Math.max(result.targetCount - result.successCount, 0)
    const sendFailureCount = result.sendFailureCount ?? 0

    if (result.successCount > 0 && failedCount > 0 && copied) {
      return `${result.successCount}개 성공, ${failedCount}개는 클립보드 복사로 대체했습니다.`
    }

    if (result.successCount > 0 && sendFailureCount > 0) {
      return `${result.successCount}개 AI에 입력했습니다. ${sendFailureCount}개는 전송 버튼을 찾지 못했습니다.`
    }

    if (result.successCount > 0) {
      return `${result.successCount}개 AI에 입력했습니다.`
    }

    if (copied) {
      return '자동 입력이 어려워 클립보드에 복사했습니다. Cmd+V로 붙여넣어 주세요.'
    }

    return '클립보드 복사에 실패했습니다'
  }

  const handleSend = async () => {
    if (!prompt.trim()) {
      showToastMessage('질문을 입력해주세요')
      focusInput()
      return
    }

    const promptText = prompt

    let copied = false
    let insertResult: PromptInsertResult = { successCount: 0, targetCount: 0 }

    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(promptText)
      copied = true
    } catch (err) {
      console.error('Failed to copy:', err)
    }

    try {
      insertResult = await onInsertPrompt?.(promptText) ?? { successCount: 0, targetCount: 0 }
    } catch (err) {
      console.error('Failed to auto insert:', err)
    }

    try {
      if (copied || insertResult.successCount > 0) {
        // Save to history
        saveToHistory(promptText)

        // Show result message
        showToastMessage(getResultMessage(insertResult, copied))

        // Clear input
        setPrompt('')
      } else {
        showToastMessage('클립보드 복사에 실패했습니다')
      }
    } finally {
      shouldAutoFocusRef.current = true
      focusInput()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      shouldAutoFocusRef.current = false
      setShowHistory(false)
      inputRef.current?.blur()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleHistoryClick = (text: string) => {
    setPrompt(text)
    setShowHistory(false)
    shouldAutoFocusRef.current = true
    focusInput()
  }

  const clearHistory = () => {
    if (confirm('히스토리를 모두 삭제하시겠습니까?')) {
      setHistory([])
      localStorage.removeItem(HISTORY_KEY)
      setShowHistory(false)
      showToastMessage('히스토리가 삭제되었습니다')
      shouldAutoFocusRef.current = true
      focusInput()
    }
  }

  return (
    <div className="quick-prompt">
      <div className="quick-prompt-container">
        <div className="quick-prompt-header">
          <span className="quick-prompt-icon">⚡</span>
          <span className="quick-prompt-title">Quick Prompt</span>
          <span className="quick-prompt-subtitle">
            {isSplitView ? '좌/우 AI에게 동일한 질문 하기' : '여러 AI에게 동일한 질문 하기'}
          </span>
        </div>

        <div className="quick-prompt-input-wrapper">
          <div className="input-group">
            <div className="attachment-guidance" title="파일/이미지 안내">
              📎 파일/이미지는 각 AI 화면에 직접 드래그/첨부
            </div>
            {history.length > 0 && (
              <div className="history-button-wrapper" ref={historyRef}>
                <button
                  className="history-button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowHistory(!showHistory)}
                  title="최근 질문 보기"
                >
                  🕒
                </button>
                {showHistory && (
                  <div className="history-dropdown">
                    <div className="history-header">
                      <span>최근 질문</span>
                      <button
                        className="clear-history-button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={clearHistory}
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="history-list">
                      {history.map((item, index) => (
                        <div
                          key={index}
                          className="history-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleHistoryClick(item)}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              className="prompt-input"
              placeholder="여러 AI에게 질문 입력..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                shouldAutoFocusRef.current = true
              }}
            />
            <button
              className="send-button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
            >
              📋 복사
            </button>
          </div>
        </div>
      </div>

      {showToast && (
        <div className="toast-notification">
          <span className="toast-icon">✓</span>
          <span className="toast-message">{toastMessage}</span>
        </div>
      )}
    </div>
  )
}

export default QuickPrompt
