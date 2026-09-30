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

`manifest.webmanifest`'s `display` is `"standalone"` since ADR 0007: each device keeps its login as a cookie in the installed app (Add to Home Screen), which is isolated from Safari's own cookies. The manifest is exempt from the gate in `nas/htaccess.template`, so its link needs no `crossorigin`. Setting up the gate on the NAS: `../deploy-auth.ps1`.
