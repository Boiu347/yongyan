const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist', 'dist-server', 'node_modules', 'client/src/api/gen', '**/*.d.ts', '**/*.js.map'] },
  {
    files: ['client/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
      },
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [
            ['@', './client/src'],
            ['@client', './client'],
            ['@shared', './shared'],
          ],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
  },
  {
    files: ['server/**/*.{ts,tsx}', 'shared/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
      }
    },
    settings: {
      'import/resolver': {
        alias: {
          map: [['@server', './server'], ['@shared', './shared']],
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      }
    }
  },
);
