# JavaScript / TypeScript

> Applies to: Astro, Svelte, React, Node, Bun, Deno.
> Load alongside the core `AGENTS.md`.

## Toolchain

| Concern | Choice |
|---|---|
| Formatter | Prettier 3 |
| Linter | ESLint (flat config — `eslint.config.js`) |
| Config | `printWidth: 100`, `singleQuote: true`, `trailingComma: "es5"` |
| Svelte | Add `prettier-plugin-svelte` so `.svelte` files are formatted too |

## TypeScript

Enable all of: `strict`, `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`.

- No `any` without a `// eslint-disable` and a comment justifying it.
- No non-null assertion (`!`) to silence a real nullability problem — narrow instead.
- Prefer `unknown` over `any` at boundaries; narrow before use.
- Discriminated unions over boolean flag pairs (`{ status: 'error', error }` not `{ isError: true, error }`).

## Imports

- Absolute aliases for cross-module: `$lib/`, `@/`.
- Relative for siblings: `./`.
- No unused imports, variables, or parameters.

## Svelte

- One component per file.
- Co-locate styles unless using a shared design system.
- Prefer Svelte 5 runes (`$state`, `$derived`). Extract shared state and logic to `.svelte.ts` modules.
- Legacy stores are acceptable only for interop.

## Astro

- Islands for interactivity only. Keep content pages static where possible.

## Logging — `@nocturna/logger`

```ts
import { createLogger, consoleSink, fileSink } from '@nocturna/logger'

// Module-scoped — create once per file
const log = createLogger({
  module: 'checkout',
  sinks: [consoleSink(), fileSink({ dir: './logs', retainDays: 14 })],
})

log.info('order placed', { data: { orderId } })          // structured context
log.warn('retrying payment', { data: { attempt: 2 } })
log.error('payment failed', { error: err, data: { orderId } })
```

- `log('message')` is shorthand for `log.info('message')`.
- Never `console.log` — the linter bans it (`no-console`).
- Pass errors as the error object, never `String(err)`.
- See core `AGENTS.md` §9 for level semantics and the swallowed-error table.

## Testing

- Vitest. Run with `pnpm test`.
- Test files adjacent to source (`*.test.ts`).
- Mock only what you own.

## Error Handling

```ts
// Preserve the cause
try {
  await chargeCard(order)
} catch (cause) {
  throw new Error('payment failed', { cause })
}
```

- Catch to add context, not to silence.
- Preserve `cause` when wrapping.
- Never `catch (e) {}` — see core `AGENTS.md` §9.4.
