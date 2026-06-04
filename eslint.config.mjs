import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            {
              sourceTag: 'scope:composition',
              onlyDependOnLibsWithTags: [
                'scope:platform',
                'scope:platform-sdk',
                'scope:presence',
                'scope:forms',
                'scope:files',
                'scope:approval',
                'scope:report',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:platform',
              onlyDependOnLibsWithTags: ['scope:platform', 'scope:shared', 'type:contract'],
            },
            {
              sourceTag: 'scope:presence',
              onlyDependOnLibsWithTags: [
                'scope:presence',
                'scope:platform',
                'scope:platform-sdk',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:forms',
              onlyDependOnLibsWithTags: ['scope:forms', 'scope:platform-sdk', 'scope:shared'],
            },
            {
              sourceTag: 'scope:files',
              onlyDependOnLibsWithTags: [
                'scope:files',
                'scope:platform',
                'scope:platform-sdk',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:approval',
              onlyDependOnLibsWithTags: ['scope:approval', 'scope:platform-sdk', 'scope:shared'],
            },
            {
              sourceTag: 'scope:report',
              onlyDependOnLibsWithTags: ['scope:report', 'scope:platform-sdk', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
          ],
        },
      ],
    },
  },
];
