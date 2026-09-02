import { loadEnv } from 'vite'

import { parseViteEnvironment } from './environment.ts'

parseViteEnvironment(loadEnv('development', process.cwd(), ''))
console.log('Frontend configuration is valid.')
