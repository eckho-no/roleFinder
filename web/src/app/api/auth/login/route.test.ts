import { beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_PASSWORD = "correct-horse-battery-staple";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { AUTH_PASSWORD } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

// Imported after the mock so the route picks up the mocked binding.
const { POST } = await import("./route");

function loginRequest(body: unknown): Request {
  return new Request("https://rolefinder.example/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:true with 200 for the correct password", async () => {
    const response = await POST(loginRequest({ password: AUTH_PASSWORD }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns ok:false with 401 for an incorrect password", async () => {
    const response = await POST(loginRequest({ password: "wrong-password" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });

  it("returns the same shape and status for a missing password as for a wrong one", async () => {
    const missing = await POST(loginRequest({}));
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(missing.status).toBe(wrong.status);
    await expect(missing.json()).resolves.toEqual(await wrong.json());
  });

  it("returns the same shape and status for an empty-string password as for a wrong one", async () => {
    const empty = await POST(loginRequest({ password: "" }));
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(empty.status).toBe(wrong.status);
    await expect(empty.json()).resolves.toEqual(await wrong.json());
  });

  it("returns the same shape and status for a malformed JSON body as for a wrong password", async () => {
    const malformed = await POST(
      new Request("https://rolefinder.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(malformed.status).toBe(wrong.status);
    await expect(malformed.json()).resolves.toEqual(await wrong.json());
  });
});
