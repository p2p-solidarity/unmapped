// Second pass (the land on the phone): the page's dev server for an E2E run in a working tree other
// sessions are editing. It is the repo's own config (vite.browser.config.ts) with no file watcher
// and no HMR, so another session's edit neither reloads the page mid-run nor changes the modules
// it was served. Alone in a checkout, `bun run browser:dev` does the same job.
//
//   bunx vite --config docs/e2e/milestone-rev6-p4-mobile-proof/vite.e2e.config.mts
import base from "../../../vite.browser.config.ts";

export default { ...base, server: { ...base.server, hmr: false, watch: null } };
