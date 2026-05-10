import { useEffect, useState } from 'react'
import './ServiceIcon.css'

interface ServiceIconProps {
  icon?: string
  name?: string
  className?: string
}

const FALLBACK_ICON_FILE = 'fallback.png'

export function normalizeIcon(icon?: string) {
  const value = icon?.trim()
  if (!value) return FALLBACK_ICON_FILE

  if (/^data:image\//i.test(value)) return value
  if (/^file:\/\//i.test(value)) return FALLBACK_ICON_FILE
  if (/^https?:\/\//i.test(value)) return FALLBACK_ICON_FILE

  const fileName = value.split('/').pop() || ''
  if (/^[\w.-]+\.(png|jpg|jpeg|webp|svg)$/i.test(fileName)) {
    return fileName
  }

  return FALLBACK_ICON_FILE
}

export function resolveIcon(icon?: string) {
  const normalizedIcon = normalizeIcon(icon)

  if (/^data:image\//i.test(normalizedIcon)) return normalizedIcon

  // Use simple path resolution for both dev and production
  // Vite will handle copying public/icons/ to dist/icons/
  return `./icons/${normalizedIcon}`
}

function ServiceIcon({ icon, name, className = '' }: ServiceIconProps) {
  const label = name || 'AI service'
  const [imageFailed, setImageFailed] = useState(false)
  const resolvedIcon = imageFailed ? resolveIcon(FALLBACK_ICON_FILE) : resolveIcon(icon)

  useEffect(() => {
    setImageFailed(false)
  }, [icon])

  return (
    <span className={`service-logo ${imageFailed ? 'service-logo-fallback' : ''} ${className}`} aria-label={label}>
      <img
        key={resolvedIcon}
        src={resolvedIcon}
        alt={label}
        onError={(event) => {
          if (!imageFailed) {
            event.currentTarget.src = resolveIcon(FALLBACK_ICON_FILE)
            setImageFailed(true)
          }
        }}
      />
    </span>
  )
}

export default ServiceIcon
