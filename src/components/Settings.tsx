import { useState } from 'react'
import { AIService } from '../types'
import ServiceIcon from './ServiceIcon'
import './Settings.css'

interface SettingsProps {
  services: AIService[]
  onAddService: (service: Omit<AIService, 'id'>) => Promise<AIService>
  onDeleteService: (id: string) => Promise<void>
  onUpdateService: (id: string, updates: Partial<AIService>) => Promise<void>
  autoSend: boolean
  onAutoSendChange: (enabled: boolean) => void
  onClose: () => void
}

function Settings({
  services,
  onAddService,
  onDeleteService,
  onUpdateService,
  autoSend,
  onAutoSendChange,
  onClose
}: SettingsProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newService, setNewService] = useState({
    name: '',
    url: '',
    icon: '',
    enabled: true
  })

  const readIconFile = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

  const handleNewServiceIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const icon = await readIconFile(file)
      setNewService({ ...newService, icon })
    } catch (error) {
      console.error('Failed to read icon file:', error)
    }
  }

  const handleServiceIconChange = async (
    service: AIService,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const icon = await readIconFile(file)
      await onUpdateService(service.id, { icon })
    } catch (error) {
      console.error('Failed to update icon file:', error)
    } finally {
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newService.name && newService.url) {
      // Use default icon if not provided
      const serviceToAdd = {
        ...newService,
        icon: newService.icon || 'AI'
      }
      await onAddService(serviceToAdd)
      setNewService({ name: '', url: '', icon: '', enabled: true })
      setShowAddForm(false)
    }
  }

  const handleToggleEnabled = async (service: AIService) => {
    await onUpdateService(service.id, { enabled: !service.enabled })
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this service?')) {
      await onDeleteService(id)
    }
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="close-button" onClick={onClose}>✕</button>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>General</h3>
          <label className="setting-toggle-row">
            <div>
              <span className="setting-toggle-title">자동 전송</span>
              <span className="setting-toggle-description">
                Quick Prompt 입력 시 자동으로 질문을 전송합니다
              </span>
            </div>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(event) => onAutoSendChange(event.target.checked)}
              />
              <span className="toggle-slider" aria-hidden="true"></span>
            </span>
          </label>
        </div>

        <div className="settings-section">
          <div className="section-header">
            <h3>AI Services</h3>
            <button
              className="add-service-button"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? 'Cancel' : '+ Add Service'}
            </button>
          </div>

          {showAddForm && (
            <form className="add-service-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={newService.name}
                  onChange={e => setNewService({ ...newService, name: e.target.value })}
                  placeholder="e.g., Mistral AI"
                  required
                />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input
                  type="url"
                  value={newService.url}
                  onChange={e => setNewService({ ...newService, url: e.target.value })}
                  placeholder="e.g., https://chat.mistral.ai"
                  required
                />
              </div>
              <div className="form-group">
                <label>Icon</label>
                <div className="icon-picker-row">
                  <ServiceIcon
                    icon={newService.icon}
                    name={newService.name || 'New service'}
                    className="service-logo-large"
                  />
                  <label className="icon-file-button">
                    아이콘 파일 선택
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={handleNewServiceIconChange}
                    />
                  </label>
                </div>
              </div>
              <button type="submit" className="submit-button">Add Service</button>
            </form>
          )}

          <div className="services-list">
            {services.map(service => (
              <div key={service.id} className="service-item-settings">
                <div className="service-info">
                  <ServiceIcon
                    icon={service.icon}
                    name={service.name}
                    className="service-logo-large"
                  />
                  <div className="service-details">
                    <h4>{service.name}</h4>
                    <p>{service.url}</p>
                  </div>
                </div>
                <div className="service-actions">
                  <label className="icon-update-button">
                    Icon
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      onChange={(event) => handleServiceIconChange(service, event)}
                    />
                  </label>
                  <button
                    className={`toggle-button ${service.enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => handleToggleEnabled(service)}
                  >
                    {service.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(service.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Future Features</h3>
          <div className="future-features">
            <div className="feature-placeholder">
              <h4>API Comparison Mode</h4>
              <p>Compare responses from multiple AI services side-by-side using their APIs</p>
              <span className="badge">Coming Soon</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
