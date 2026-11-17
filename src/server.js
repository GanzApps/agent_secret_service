/* ============================================================
   agent_secret_service — Node.js Doppler bridge for agents
   - GET  /secret/:project/:env/:key   -> { value, project, env, key }
   - POST /secret/:project/:env/:key   { value } -> { status:'ok' }
   Auth   : Authorization: Bearer <AGENT...KEN>
   Env    : AGENT_SECRET_SERVICE_TOKEN
            AGENT_SECRET_SERVICE_PORT  (default 8311)
            AGENT_SECRET_DOPPLER_TOKEN (preferred) | DOPPLER_TOKEN
   Uses Doppler REST API — no doppler-cli binary required.
   ============================================================ */

import http from "node:http";
import { request } from "node:https";

const DEFAULT_OPTS = Object.freeze({
  port:       8311,
  token:      "changeme_service_token",
});

const DOPPLER_API = "https://api.doppler.com/v3/secrets";

class AgentSecretService {
  constructor(opts = {}) {
    this.port     = Number(opts.port      ?? DEFAULT_OPTS.port);
    this.secret   = String(opts.token     ?? DEFAULT_OPTS.token);
    this.dopplerKey =
      String(opts.dopplerToken ?? process.env.AGENT_SECRET_DOPPLER_TOKEN ?? process.env.DOPPLER_TOKEN ?? "");
  }

  /* ---------- HTTP helpers ---------- */
  respond(res, status, body) {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    res.end(payload);
  }
  unauthorized(res)  { return this.respond(res, 401,  { error: "unauthorized" }); }
  notFound(res, msg) { return this.respond(res, 404,  { error: "not found", ...(msg ? {hint: msg} : {}) }); }
  bad(res, msg)      { return this.respond(res, 400,  { error: "bad_request", ...(msg ? {detail: msg} : {}) }); }
  notFoundKey(res, msg) { return this.respond(res, 404, { error: "not_found", detail: (msg || "") }); }
  gateway(e, res)    { return this.respond(res, 502,  { error: "upstream", detail: (e && e.message) || String(e) }); }

  /* ---------- Doppler REST API ---------- */
  dopplerRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : null;
      const options = {
        hostname: "api.doppler.com",
        path: `/v3${path}`,
        method,
        headers: {
          Authorization: `Bearer ${this.dopplerKey}`,
          "Content-Type": "application/json",
        },
      };
      const req = request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let msg = data;
            try { const parsed = JSON.parse(data); msg = parsed.message ?? data; } catch {}
            return reject(new Error(`Doppler ${res.statusCode}: ${msg}`));
          }
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      });
      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async readSecret(project, env, key) {
    // Doppler REST shape: GET /v3/configs/config/secrets?project=<p>&config=<c>
    // Returns { secrets: { NAME: { raw, computed, ... } } }. The ?name= param is NOT
    // a server-side filter - it returns the whole set - so select the key locally.
    const result = await this.dopplerRequest(
      "GET",
      `/configs/config/secrets?project=${encodeURIComponent(project)}&config=${encodeURIComponent(env)}`,
    );
    const entry = (result && result.secrets && result.secrets[key]) || null;
    if (!entry) throw new Error(`Secret not found: ${project}/${env}/${key}`);
    const value = entry.raw ?? entry.computed;
    if (value === undefined || value === null) throw new Error(`Secret has no value: ${project}/${env}/${key}`);
    return value;
  }

  async writeSecret(project, env, key, value) {
    // POST /v3/configs/config/secrets?project=<p>&config=<c>  body: { secrets: { NAME: value } }
    await this.dopplerRequest(
      "POST",
      `/configs/config/secrets?project=${encodeURIComponent(project)}&config=${encodeURIComponent(env)}`,
      { secrets: { [key]: value } },
    );
  }

  /* ---------- routing ---------- */
  parsePath(urlPath) {
    const parts = decodeURIComponent(urlPath).split("/").filter(Boolean);
    // URL shape is /secret/:project/:env/:key -> ["secret", project, env, key] = 4 parts.
    if (parts.length !== 4 || parts[0] !== "secret") return null;
    const p = parts[1], e = parts[2], k = parts[3];
    return p && e && k ? { project: p, env: e, key: k } : null;
  }
  checkAuth(req) {
    const hdr = (req.headers.authorization || "").trim();
    return hdr === `Bearer ${this.secret}`;
  }
  async handle(req, res) {
    /* CORS preflight */
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" });
      return res.end();
    }
    if (!this.checkAuth(req)) return this.unauthorized(res);

    const url = new URL(req.url, `http://${req.headers.host}`);
    const ctx = this.parsePath(url.pathname);
    if (!ctx) return this.notFound(res, "/secret/:project/:env/:key");

    try {
      if (req.method === "GET") {
        const value = await this.readSecret(ctx.project, ctx.env, ctx.key);
        return this.respond(res, 200, { project: ctx.project, env: ctx.env, key: ctx.key, value });
      }
      if (req.method === "POST") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return this.bad(res, '{"value":"..."}'); }
        if (!("value" in body)) return this.bad(res, '{"value":"..."} required');
        const val = String(body.value);
        await this.writeSecret(ctx.project, ctx.env, ctx.key, val);
        return this.respond(res, 200, { project: ctx.project, env: ctx.env, key: ctx.key, status: "ok" });
      }
      this.respond(res, 405, { error: "method_not_allowed" });
    } catch (e) {
      // A missing key/project is a client error, not an upstream failure.
      if (e && typeof e.message === "string" && e.message.startsWith("Secret not found:")) {
        return this.notFoundKey(res, e.message);
      }
      this.gateway(e, res);
    }
  }

  /* ---------- lifecycle ---------- */
  start() {
    const srv = http.createServer((req, res) => this.handle(req, res));
    srv.listen(this.port, () => console.log(`agent_secret_service listening on :${this.port}`));
    return srv;
  }
}

/* ----- boot ----- */
const svc = new AgentSecretService({
  port:        Number(process.env.AGENT_SECRET_SERVICE_PORT),
  token:       process.env.AGENT_SECRET_SERVICE_TOKEN,
  dopplerToken: process.env.AGENT_SECRET_DOPPLER_TOKEN,
});
const server = svc.start();
