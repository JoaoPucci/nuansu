// Cloudflare Pages Functions catch-all that mounts the entire Hono API.
// All /api/* requests land here and are handled by `server/app.ts`.

import { app } from "../../server/app";

export const onRequest: PagesFunction = (context) => app.fetch(context.request, context.env);
