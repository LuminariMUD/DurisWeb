import type { PublicFrontendConfiguration } from '../../config/environment'

/** Object path used by the static-origin upload of pre-rendered layer images. */
const STATIC_LAYER_PATH = '/duris/maps/layer-'

/** Backend endpoint that renders a layer image on demand from the published map rows. */
const API_LAYER_PATH = '/api/wiki/map/image'

/**
 * Resolves the background image for a world-map layer.
 *
 * A separate static asset origin (`VITE_STATIC_URL` different from
 * `VITE_API_URL`) serves pre-rendered layer PNGs at the object path written by
 * the backend's static-asset upload. When the static origin is the API origin
 * itself, nothing publishes those files there, so the backend's on-demand image
 * endpoint is used instead; a request to the static path would fall through to
 * the SPA fallback and return HTML.
 */
export function resolveMapLayerImageUrl(
  configuration: Pick<PublicFrontendConfiguration, 'apiUrl' | 'staticUrl'>,
  layer: number,
): string {
  if (!Number.isSafeInteger(layer)) {
    throw new RangeError('map layer must be an integer')
  }
  const apiUrl = configuration.apiUrl.replace(/\/$/, '')
  const staticUrl = configuration.staticUrl.replace(/\/$/, '')
  if (staticUrl === apiUrl) {
    return `${apiUrl}${API_LAYER_PATH}?layer=${layer}`
  }
  return `${staticUrl}${STATIC_LAYER_PATH}${layer}.png`
}
