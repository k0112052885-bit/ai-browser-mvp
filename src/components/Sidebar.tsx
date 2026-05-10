import { AIService, PanelId, ViewMode } from '../types'
import ServiceIcon from './ServiceIcon'
import './Sidebar.css'

interface SidebarProps {
  services: AIService[]
  selectedService: AIService | null
  onSelectService: (service: AIService) => void
  onSelectPanel?: (panel: PanelId) => void
  onOpenSettings: () => void
  viewMode: ViewMode
  activePanel: PanelId
}

function Sidebar({
  services,
  selectedService,
  onSelectService,
  onSelectPanel,
  onOpenSettings,
  viewMode,
  activePanel
}: SidebarProps) {
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onOpenSettings()
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>AI Browser</h1>
        {viewMode !== 'single' && (
          <div className="split-indicator">
            {(viewMode === 'split'
              ? [
                  ['panel-1', 'L'],
                  ['panel-2', 'R']
                ]
              : [
                  ['panel-1', '1'],
                  ['panel-2', '2'],
                  ['panel-3', '3'],
                  ['panel-4', '4']
                ]
            ).map(([panelId, label]) => (
              <button
                key={panelId}
                className={`pane-badge ${activePanel === panelId ? 'active' : ''}`}
                onClick={() => onSelectPanel?.(panelId as PanelId)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-services">
        {services.map(service => (
          <button
            key={service.id}
            className={`service-item ${selectedService?.id === service.id ? 'active' : ''}`}
            onClick={() => onSelectService(service)}
          >
            <div className="service-item-content">
              <ServiceIcon icon={service.icon} name={service.name} />
              <span className="service-name">{service.name}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="settings-button" onClick={handleSettingsClick}>
          <span className="settings-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar
