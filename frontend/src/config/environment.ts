import { parsePublicFrontendEnvironment } from '../../config/environment'

export const frontendConfiguration = parsePublicFrontendEnvironment(import.meta.env)
