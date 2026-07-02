import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="pwa-updater" role="status">
      <div>
        <strong>Hay una versión nueva de BarberApp</strong>
        <span>Actualizá para usar los últimos cambios.</span>
      </div>
      <div className="pwa-updater-actions">
        <button type="button" className="btn-primary" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </button>
        <button type="button" className="pwa-later" onClick={() => setNeedRefresh(false)}>
          Después
        </button>
      </div>
    </div>
  )
}
