export interface PublicFrontendConfiguration {
  baseUrl: string
  apiUrl: string
  websocketUrl: string
  staticUrl: string
}

export interface ViteEnvironmentConfiguration extends PublicFrontendConfiguration {
  developmentHost: string
  developmentPort: number
  previewHost: string
  previewPort: number
  allowedHosts: string[]
}

export class FrontendConfigurationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid frontend configuration:\n- ${issues.join('\n- ')}`)
    this.name = 'FrontendConfigurationError'
    this.issues = issues
  }
}

type EnvironmentSource = Readonly<Record<string, string | boolean | undefined>>

function requiredString(source: EnvironmentSource, name: string, issues: string[]): string {
  const raw = source[name]
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) issues.push(`${name} is required`)
  if (/(?:change[_-]?me|replace_with)/i.test(value)) {
    issues.push(`${name} still contains an example placeholder`)
  }
  return value
}

function requiredUrl(
  source: EnvironmentSource,
  name: string,
  protocols: readonly string[],
  issues: string[],
): string {
  const raw = requiredString(source, name, issues)
  if (!raw) return raw
  try {
    const value = new URL(raw)
    if (!protocols.includes(value.protocol)) {
      issues.push(`${name} must use ${protocols.join(' or ')}`)
    }
    if (value.username || value.password) issues.push(`${name} must not contain credentials`)
    return value.toString().replace(/\/$/, '')
  } catch {
    issues.push(`${name} must be a valid URL`)
    return raw
  }
}

function requiredPort(source: EnvironmentSource, name: string, issues: string[]): number {
  const raw = requiredString(source, name, issues)
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65_535) {
    if (raw) issues.push(`${name} must be an integer between 1 and 65535`)
    return 1
  }
  return value
}

function requiredHost(source: EnvironmentSource, name: string, issues: string[]): string {
  const value = requiredString(source, name, issues)
  if (
    value &&
    value !== '::' &&
    value !== '::1' &&
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
      value,
    )
  ) {
    issues.push(`${name} must be a hostname or IP address without a scheme, port, or path`)
  }
  return value
}

function parseAllowedHosts(source: EnvironmentSource, issues: string[]): string[] {
  const raw = requiredString(source, 'FRONTEND_ALLOWED_HOSTS', issues)
  const hosts = raw
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
  if (hosts.length === 0) issues.push('FRONTEND_ALLOWED_HOSTS must contain at least one hostname')
  for (const host of hosts) {
    const normalized = host.startsWith('.') ? host.slice(1) : host
    if (
      !/^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.test(
        normalized,
      )
    ) {
      issues.push('FRONTEND_ALLOWED_HOSTS entries must be hostnames without schemes or ports')
      break
    }
  }
  return hosts
}

function parsePublicValues(
  source: EnvironmentSource,
  issues: string[],
): PublicFrontendConfiguration {
  const baseUrl = requiredString(source, 'VITE_BASE_URL', issues)
  if (baseUrl && (!baseUrl.startsWith('/') || !baseUrl.endsWith('/'))) {
    issues.push('VITE_BASE_URL must start and end with /')
  }
  return {
    baseUrl,
    apiUrl: requiredUrl(source, 'VITE_API_URL', ['http:', 'https:'], issues),
    websocketUrl: requiredUrl(source, 'VITE_WS_URL', ['ws:', 'wss:'], issues),
    staticUrl: requiredUrl(source, 'VITE_STATIC_URL', ['http:', 'https:'], issues),
  }
}

export function parsePublicFrontendEnvironment(
  source: EnvironmentSource,
): PublicFrontendConfiguration {
  const issues: string[] = []
  const configuration = parsePublicValues(source, issues)
  if (issues.length > 0) throw new FrontendConfigurationError(issues)
  return configuration
}

export function parseViteEnvironment(source: EnvironmentSource): ViteEnvironmentConfiguration {
  const issues: string[] = []
  const publicConfiguration = parsePublicValues(source, issues)
  const configuration: ViteEnvironmentConfiguration = {
    ...publicConfiguration,
    developmentHost: requiredHost(source, 'FRONTEND_DEV_HOST', issues),
    developmentPort: requiredPort(source, 'FRONTEND_DEV_PORT', issues),
    previewHost: requiredHost(source, 'FRONTEND_PREVIEW_HOST', issues),
    previewPort: requiredPort(source, 'FRONTEND_PREVIEW_PORT', issues),
    allowedHosts: parseAllowedHosts(source, issues),
  }
  if (issues.length > 0) throw new FrontendConfigurationError(issues)
  return configuration
}
