import { AIService } from './types'

const DEFAULT_SERVICE_ICONS: Record<string, string> = {
  chatgpt: 'chatgpt.png',
  claude: 'claude.png',
  gemini: 'gemini.png',
  perplexity: 'perplexity.png',
  copilot: 'copilot.png'
}

export function normalizeServiceIcon(service: AIService): AIService {
  const defaultIcon = DEFAULT_SERVICE_ICONS[service.id]

  if (!defaultIcon) {
    return service
  }

  return {
    ...service,
    icon: defaultIcon
  }
}
