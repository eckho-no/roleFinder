import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache backend configured: this app is SSR-only (a gated,
// single-user dashboard), not relying on ISR/SSG, which is the only thing
// the incremental cache affects. Add an R2-backed cache here if a future
// phase needs static regeneration.
export default defineCloudflareConfig();
