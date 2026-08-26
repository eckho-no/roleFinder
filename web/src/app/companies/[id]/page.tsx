import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { getDb } from "@/db/client";
import { companies, listings } from "@/db/schema";

export const dynamic = "force-dynamic";

const TRIAGE_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  scored: "Scored",
  logged_only: "Logged only",
  rejected: "Rejected",
  merged: "Merged",
};

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: string | null,
): string | null {
  if (min === null && max === null) return null;
  const parts = [min, max].filter((v): v is number => v !== null);
  const range =
    parts.length === 2 && min !== max ? `${parts[0]}–${parts[1]}` : String(parts[0]);
  const suffix = period ? `/${period}` : "";
  return `${currency ?? ""} ${range}${suffix}`.trim();
}

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId <= 0) notFound();

  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const company = (await db.select().from(companies).where(eq(companies.id, companyId)))[0];
  if (!company) notFound();

  const companyListings = await db
    .select()
    .from(listings)
    .where(eq(listings.companyId, companyId))
    .orderBy(listings.lastSeenAt);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-[var(--paper-dim)] hover:underline">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--ink)]">{company.name}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-[var(--paper-dim)]">
          {company.careersUrl && (
            <a
              href={company.careersUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Careers page
            </a>
          )}
          {company.domainFlag && (
            <span className="rounded bg-[var(--skip-dim)] px-2 py-0.5 text-[var(--skip)]">
              Domain flag{company.domainNote ? `: ${company.domainNote}` : ""}
            </span>
          )}
        </div>
        {company.notes && <p className="text-sm text-[var(--paper-dim)]">{company.notes}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">
          Listings ({companyListings.length})
        </h2>
        {companyListings.length === 0 ? (
          <p className="text-sm text-[var(--paper-dim)]">No listings recorded for this company.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--paper-dim)]/20">
            {companyListings.map((listing) => {
              const salary = formatSalary(
                listing.salaryMin,
                listing.salaryMax,
                listing.salaryCurrency,
                listing.salaryPeriod,
              );
              return (
                <li key={listing.id} className="flex flex-col gap-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--ink)]">
                      {listing.url ? (
                        <a href={listing.url} target="_blank" rel="noreferrer" className="underline">
                          {listing.title}
                        </a>
                      ) : (
                        listing.title
                      )}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-[var(--paper-dim)]">
                      {listing.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--paper-dim)]">
                    <span>{TRIAGE_LABEL[listing.triage] ?? listing.triage}</span>
                    {listing.location && <span>{listing.location}</span>}
                    <span>{listing.remoteType}</span>
                    {salary && <span>{salary}</span>}
                    <span>Seen {listing.sightingCount}x</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
