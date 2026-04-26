import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";

// Variables that handlers can read off the Hono context.
interface AppVariables {
  requestId: string;
}

export function createApp() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use("*", requestId());
  app.use("*", honoLogger());
  app.use("*", secureHeaders());
  app.use("*", csrf({ origin: ["http://localhost:5173", "http://localhost:8788"] }));
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173"],
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  // Health endpoint — used by uptime monitor and CI smoke test.
  app.get("/api/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString(), requestId: c.get("requestId") }),
  );

  return app;
}

// A long-lived singleton for the Pages Functions runtime to import.
export const app = createApp();
