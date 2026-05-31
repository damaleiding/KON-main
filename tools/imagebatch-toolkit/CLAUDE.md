# Claude Harness Notes

## Project Shape
- `dashboard.html` is the primary operator UI.
- `server.js` is the local orchestration service.
- `batch_process.mjs` is the generation worker.
- `harness/run.js` wraps batch execution with verification and reporting.

## Harness Goals
- Preserve the current web-first workflow.
- Keep provider routing stable: module-based processing uses imagine-compatible flow, while Crate remains the fallback path.
- Centralize file naming for generated outputs.
- Run local verification and tests before invoking Claude Code as a sub-agent reviewer.

## Naming Contract
- Generated output images must follow:
- `{item}__m-{model}__res-{resolution}__mod-{module}__round-{round}__v-{version}__ts-{YYYYMMDD_HHmmss}.png`
- Required dimensions of the contract:
- `model`
- `resolution`
- `module`
- `round`
- `version`
- `timestamp`

## Constraints
- Keep all round input directories relative to the project root.
- Reject absolute paths and parent traversal for `INPUT_SUBDIR`.
- Keep Crate token acquisition compatible with both `.env` and browser-backed discovery.
- Require imagine CLI login before running imagine-based jobs.
- Keep promoted round input images under the existing reference-size limit.
- Retry failed tasks only when they belong to the same round and input pool.
- Surface harness verification output in `output_images/harness_report.json`.
- Treat Claude Code as a reviewer inside the harness, not as a replacement for local checks.

## Verification Flow
1. Local checks read `output_images/gallery_data.js`.
2. Node tests run from `tests/*.test.js`.
3. Claude Code runs as a sub-agent reviewer when `claude` is available.
4. Harness writes status to `output_images/harness_status.json`.
5. Harness writes report to `output_images/harness_report.json`.

## Commands
- `npm start`
- `npm test`
- `npm run harness:verify`
