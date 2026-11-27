/**
 * ESLint flat config snippet for enforcing §14.4 — No Swallowed Errors.
 *
 * Usage in your project's eslint.config.js:
 * ```js
 * import { nocturnaLoggerRules } from '@nocturna/logger/configs'
 * export default [...nocturnaLoggerRules]
 * ```
 *
 * Or inline the rules directly:
 * ```js
 * export default [{
 *   rules: {
 *     'no-empty': ['error', { allowEmptyCatch: false }],
 *     '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }],
 *     'no-console': ['error', { allow: [] }],
 *   }
 * }]
 * ```
 */
export const nocturnaLoggerRules = [
  {
    rules: {
      // Ban empty catch blocks — every catch must log, rethrow, or return a typed error
      'no-empty': ['error', { allowEmptyCatch: false }],

      // All caught errors must be used — no `catch (e) {}` or `catch (e) { /* ignore */ }`
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }],

      // App code must not use console — use @nocturna/logger instead.
      // Exception: disable this rule inside the logger package itself.
      'no-console': ['error', { allow: [] }],
    },
  },
]
