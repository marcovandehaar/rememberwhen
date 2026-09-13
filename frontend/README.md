# rememberwhen — frontend

React + TypeScript, built with Vite.

```sh
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
npm run test     # vitest
npm run lint     # oxlint
```

Deploying `dist/` to the NAS: `../deploy-nas.ps1` from the repo root.

`manifest.webmanifest`'s `display` is `"browser"`, not `"standalone"`, on purpose: v1 is a plain website with no install prompt or offline support (see `docs/v1-build-spec.md` §5). The manifest exists only for the `crossorigin="use-credentials"` edge case from ADR 0004 — don't "fix" the display mode without revisiting that decision first.
