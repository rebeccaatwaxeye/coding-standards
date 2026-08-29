/**
 * Type declarations for the §14.4 ESLint flat config snippet.
 */
export interface NocturnaLoggerRule {
  rules: {
    'no-empty': [string, { allowEmptyCatch: boolean }]
    '@typescript-eslint/no-unused-vars': [string, { caughtErrors: string }]
    'no-console': [string, { allow: string[] }]
  }
}

/**
 * ESLint flat config rules enforcing §14.4 — No Swallowed Errors.
 *
 * @example
 * ```js
 * import { nocturnaLoggerRules } from '@nocturna/logger/configs'
 * export default [...nocturnaLoggerRules]
 * ```
 */
export declare const nocturnaLoggerRules: NocturnaLoggerRule[]
