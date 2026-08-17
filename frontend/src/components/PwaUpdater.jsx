import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000

export default function PwaUpdater() {
  const registrationRef = useRef(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration || null
      registration?.update()

      if (registration) {
        window.setInterval(() => {
          registration.update()
        }, UPDATE_CHECK_INTERVAL)
      }
    },
    onRegisterError(error) {
      console.error('No se pudo registrar el service worker:', error)
    },
  })

  useEffect(() => {
    let reloading = false

    const reloadWhenControlled = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    const checkForUpdate = () => {
      registrationRef.current?.update()
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    navigator.serviceWorker?.addEventListener('controllerchange', reloadWhenControlled)
    window.addEventListener('focus', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', checkWhenVisible)

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', reloadWhenControlled)
      window.removeEventListener('focus', checkForUpdate)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div className="pwa-updater" role="status">
      <div>
        <strong>Hay una versión nueva de BarberApp</strong>
        <span>Actualizá para usar los últimos cambios.</span>
      </div>
      <div className="pwa-updater-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setNeedRefresh(false)
            updateServiceWorker(true)
          }}
        >
          Actualizar
        </button>
        <button type="button" className="pwa-later" onClick={() => setNeedRefresh(false)}>
          Después
        </button>
      </div>
    </div>
  )
}
