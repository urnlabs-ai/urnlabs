module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
    'security'
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:security/recommended'
  ],
  rules: {
    // Security-specific rules
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'error',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-require': 'error',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-bidi-characters': 'error',

    // TypeScript security rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',

    // General security best practices
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unused-expressions': 'error',
    'no-void': 'error',
    'no-with': 'error',
    'prefer-promise-reject-errors': 'error',
    'radix': 'error',

    // Input validation
    'no-prototype-builtins': 'error',
    'no-iterator': 'error',
    'no-proto': 'error',

    // SQL injection prevention
    'security/detect-sql-injection': 'error',

    // XSS prevention
    'no-inner-declarations': 'error',

    // Custom security rules for common patterns
    'no-restricted-globals': [
      'error',
      'eval',
      'execScript'
    ],
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Use config module for environment variables'
      },
      {
        object: 'global',
        property: 'eval',
        message: 'eval() is dangerous and should never be used'
      }
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="setTimeout"][arguments.0.type="Literal"]',
        message: 'setTimeout with string argument is dangerous'
      },
      {
        selector: 'CallExpression[callee.name="setInterval"][arguments.0.type="Literal"]',
        message: 'setInterval with string argument is dangerous'
      }
    ]
  },
  overrides: [
    {
      files: ['*.test.ts', '*.spec.ts'],
      rules: {
        // Relax some rules for test files
        'security/detect-non-literal-fs-filename': 'off',
        '@typescript-eslint/no-explicit-any': 'warn'
      }
    },
    {
      files: ['src/security/**/*.ts'],
      rules: {
        // Security testing files may need to use some restricted patterns
        'security/detect-child-process': 'warn',
        'security/detect-non-literal-require': 'warn'
      }
    }
  ],
  env: {
    node: true,
    es2022: true
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true
      }
    }
  }
};