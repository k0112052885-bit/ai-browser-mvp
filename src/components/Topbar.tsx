import { AIService, PanelId, ViewMode } from '../types'
import ServiceIcon from './ServiceIcon'
import './Topbar.css'

interface TopbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  selectedService: AIService | null
  panelServices: { id: Exclude<PanelId, 'single'>; service: AIService | null }[]
  activePanel: PanelId
  onPanelClick: (panel: PanelId) => void
}

function Topbar({
  viewMode,
  onViewModeChange,
  selectedService,
  panelServices,
  activePanel,
  onPanelClick
}: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        {viewMode !== 'single' ? (
          <div className="split-info">
            {panelServices.slice(0, viewMode === 'split' ? 2 : 4).map((panel, index) => (
              <button
                key={panel.id}
                className={`pane-info ${activePanel === panel.id ? 'active' : ''}`}
                onClick={() => onPanelClick(panel.id)}
                type="button"
              >
                <ServiceIcon icon={panel.service?.icon} name={panel.service?.name} className="service-logo-small" />
                <span className="pane-name">{viewMode === 'split' ? (index === 0 ? 'L' : 'R') : index + 1}. {panel.service?.name || 'Select AI'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="single-info">
            <ServiceIcon icon={selectedService?.icon} name={selectedService?.name} />
            <div className="service-details">
              <h2>{selectedService?.name || 'Select AI'}</h2>
            </div>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {(['single', 'split', 'grid'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            className={`split-view-button ${viewMode === mode ? 'active' : ''}`}
            onClick={() => onViewModeChange(mode)}
            title={`${mode[0].toUpperCase()}${mode.slice(1)} View`}
          >
            <span className="button-text">{mode[0].toUpperCase()}{mode.slice(1)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default Topbar
