import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import sessions from "./routes/sessions.js";

const app = new Hono();

// CORS — allow web app origins
app.use("*", cors({
  origin: ["http://127.0.0.1:3000", "http://localhost:3000", "https://bolt-new-poc-web.vercel.app", "https://api.opencomputer.dev"],
  allowHeaders: ["Content-Type", "X-API-Key"],
  exposeHeaders: ["Content-Type"],
}));

// Health check
app.get("/healthz", (c) => c.json({ ok: true, service: "bolt-platform", time: new Date().toISOString() }));

// Session routes
app.route("/v1/sessions", sessions);

// Error handler
app.onError((err, c) => {
  console.error("[platform]", err);
  return c.json({ error: { type: "internal_error", message: err.message } }, 500);
});

app.notFound((c) => c.json({ error: { type: "not_found", message: "Not found" } }, 404));

const port = parseInt(process.env.PORT ?? "8081", 10);
console.log(`bolt-platform listening on :${port}`);
serve({ fetch: app.fetch, port });
