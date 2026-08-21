import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { env } = await getCloudflareContext({ async: true });

  await env.DB.prepare("INSERT INTO deploy_check (note) VALUES (?)")
    .bind("M1 deploy spine check")
    .run();

  const { results } = await env.DB.prepare(
    "SELECT count(*) as count FROM deploy_check",
  ).all<{ count: number }>();
  const count = results[0]?.count ?? 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-16 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        roleFinder — deploy spine
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        D1 round-trip OK — {count} row{count === 1 ? "" : "s"} in{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          deploy_check
        </code>
      </p>
    </div>
  );
}
