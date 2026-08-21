import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

// Only for `next dev` — this opens a remote-bindings proxy session for
// bindings with no local emulation (Vectorize, Workers AI), which needs a
// live, authenticated Cloudflare connection. Calling it unconditionally
// (as the OpenNext docs show) also fires it during `next build`, which
// then fails in CI with "necessary to set a CLOUDFLARE_API_TOKEN... in a
// non-interactive environment" — `next build` sets NODE_ENV=production,
// `next dev` sets NODE_ENV=development, so this guard is a reliable way
// to keep CI's build step credential-free.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

export default nextConfig;
