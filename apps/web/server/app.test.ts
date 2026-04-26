import { describe, it, expect } from "vitest";
import { createApp } from "./app";

describe("Hono app", () => {
  it("responds 200 on /api/health with status, time, requestId", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/api/health", { headers: { origin: "http://localhost:5173" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string; time: string; requestId: string }>();
    expect(body.status).toBe("ok");
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.requestId).toBeTruthy();
  });

  it("emits a unique requestId per request", async () => {
    const app = createApp();
    const resA = await app.fetch(new Request("http://localhost/api/health"));
    const resB = await app.fetch(new Request("http://localhost/api/health"));
    const a = await resA.json<{ requestId: string }>();
    const b = await resB.json<{ requestId: string }>();
    expect(a.requestId).not.toBe(b.requestId);
  });
});
