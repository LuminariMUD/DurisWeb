import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    name: 'app/custom-rules',
    rules: {
      // Allow single-word component names for UI library components (shadcn-vue)
      'vue/multi-word-component-names': ['error', {
        ignores: [
          'Dialog',
          'Select',
          'Toast',
          'Alert',
          'Badge',
          'Button',
          'Card',
          'Input',
          'Label',
          'Separator',
          'Sheet',
          'Sidebar',
          'Skeleton',
          'Textarea',
          'Tooltip',
          'Pagination',
          'Popover',
          'Tabs',
          'Checkbox',
          'Table',
          'Combobox',
        ]
      }],
      // Allow any types in catch blocks and specific cases
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unused vars that start with underscore
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
)
