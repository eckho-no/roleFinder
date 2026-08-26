"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { LocationRules, ProfileAxis } from "@/db/schema/scoring";

type FormState = {
  titles: string;
  commutable: string;
  notCommutable: string;
  radiusMiles: string;
  londonRule: string;
  salaryFloor: string;
  salaryHardFloor: string;
  tierAct: string;
  tierConsider: string;
  axesJson: string;
  positioningJson: string;
  note: string;
};

function toFormState(config: {
  titles: string[];
  locationRules: LocationRules;
  salaryFloor: number;
  salaryHardFloor: number;
  positioning: Record<string, unknown>;
  axes: ProfileAxis[];
  tierThresholds: { act: number; consider: number };
} | null): FormState {
  if (!config) {
    return {
      titles: "",
      commutable: "",
      notCommutable: "",
      radiusMiles: "0",
      londonRule: "",
      salaryFloor: "0",
      salaryHardFloor: "0",
      tierAct: "0",
      tierConsider: "0",
      axesJson: "[]",
      positioningJson: "{}",
      note: "",
    };
  }
  return {
    titles: config.titles.join(", "),
    commutable: config.locationRules.commutable.join(", "),
    notCommutable: config.locationRules.notCommutable.join(", "),
    radiusMiles: String(config.locationRules.radiusMiles),
    londonRule: config.locationRules.londonRule,
    salaryFloor: String(config.salaryFloor),
    salaryHardFloor: String(config.salaryHardFloor),
    tierAct: String(config.tierThresholds.act),
    tierConsider: String(config.tierThresholds.consider),
    axesJson: JSON.stringify(config.axes, null, 2),
    positioningJson: JSON.stringify(config.positioning, null, 2),
    note: "",
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function SettingsForm({
  currentConfig,
}: {
  currentConfig: {
    titles: string[];
    locationRules: LocationRules;
    salaryFloor: number;
    salaryHardFloor: number;
    positioning: Record<string, unknown>;
    axes: ProfileAxis[];
    tierThresholds: { act: number; consider: number };
  } | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(currentConfig));
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved"; version: number }
  >({ kind: "idle" });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "saving" });

    let axes: unknown;
    let positioning: unknown;
    try {
      axes = JSON.parse(form.axesJson);
      positioning = JSON.parse(form.positioningJson);
    } catch {
      setStatus({ kind: "error", message: "Axes and positioning must be valid JSON." });
      return;
    }

    const body = {
      titles: splitList(form.titles),
      locationRules: {
        commutable: splitList(form.commutable),
        notCommutable: splitList(form.notCommutable),
        radiusMiles: Number(form.radiusMiles),
        londonRule: form.londonRule,
      },
      salaryFloor: Number(form.salaryFloor),
      salaryHardFloor: Number(form.salaryHardFloor),
      positioning,
      axes,
      tierThresholds: { act: Number(form.tierAct), consider: Number(form.tierConsider) },
      note: form.note || null,
    };

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as
        | { ok: true; version: number }
        | { ok: false; error: string };

      if (!response.ok || !result.ok) {
        setStatus({
          kind: "error",
          message: result.ok ? `Save failed (${response.status})` : result.error,
        });
        return;
      }

      setStatus({ kind: "saved", version: result.version });
      setForm((prev) => ({ ...prev, note: "" }));
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Network error while saving." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink)]">Titles (comma-separated)</span>
        <input
          className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
          value={form.titles}
          onChange={(e) => update("titles", e.target.value)}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">Commutable locations</span>
          <input
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.commutable}
            onChange={(e) => update("commutable", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">Not commutable</span>
          <input
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.notCommutable}
            onChange={(e) => update("notCommutable", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">Radius (miles)</span>
          <input
            type="number"
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.radiusMiles}
            onChange={(e) => update("radiusMiles", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">London rule</span>
          <input
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.londonRule}
            onChange={(e) => update("londonRule", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">Salary floor</span>
          <input
            type="number"
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.salaryFloor}
            onChange={(e) => update("salaryFloor", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--ink)]">Salary hard floor</span>
          <input
            type="number"
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.salaryHardFloor}
            onChange={(e) => update("salaryHardFloor", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--act)]">Tier threshold — act</span>
          <input
            type="number"
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.tierAct}
            onChange={(e) => update("tierAct", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--consider)]">Tier threshold — consider</span>
          <input
            type="number"
            className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
            value={form.tierConsider}
            onChange={(e) => update("tierConsider", e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink)]">Axes (JSON)</span>
        <textarea
          className="min-h-32 rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1 font-mono text-xs"
          value={form.axesJson}
          onChange={(e) => update("axesJson", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink)]">Positioning (JSON)</span>
        <textarea
          className="min-h-24 rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1 font-mono text-xs"
          value={form.positioningJson}
          onChange={(e) => update("positioningJson", e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--ink)]">Note for this version (optional)</span>
        <input
          className="rounded border border-[var(--paper-dim)]/40 bg-transparent px-2 py-1"
          value={form.note}
          onChange={(e) => update("note", e.target.value)}
          placeholder="Why is this version changing?"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="rounded bg-[var(--act)] px-4 py-1.5 text-sm font-medium text-[var(--ink)] disabled:opacity-50"
        >
          {status.kind === "saving" ? "Saving…" : "Save as new version"}
        </button>
        {status.kind === "error" && (
          <span className="text-sm text-[var(--skip)]">{status.message}</span>
        )}
        {status.kind === "saved" && (
          <span className="text-sm text-[var(--act)]">Saved as version {status.version}.</span>
        )}
      </div>
    </form>
  );
}
