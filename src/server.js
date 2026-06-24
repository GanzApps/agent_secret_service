/* ============================================================
   agent_secret_service — Node.js Doppler bridge for agents
   - GET  /secret/:project/:env/:key   -> { value, project, env, key }
   - POST /secret/:project/:env/:key   { value } -> { status:'ok' }
   Auth   : Authorization: Bearer <AGENT_SECRET_SERVICE_TOKEN>
   Env    : AGENT_SECRET_SERVICE_TOKEN
            AGENT_SECRET_SERVICE_PORT  (default 8311)
            AGENT_SECRET_DOPPLER_TOKEN (preferred) | DOPPLER_TOKEN
            DOPPLER_CLI                (default "doppler")
   ============================================================ */

import http from "node:http";

const DEFAULT_OPTS = Object.freeze({
  port:       8311,
  token:      "changeme_service_token",
  dopplerCli: "doppler",
});

class AgentSecretService {
  constructor(opts = {}) {
    this.port       = Number(opts.port       ?? DEFAULT_OPTS.port);
    this.secret     = String(opts.token      ?? DEFAULT_OPTS.token);
    this.doppler    = String(opts.dopplerCli ?? DEFAULT_OPTS.dopplerCli);
    this.dopplerKey =
      String(opts.dopplerToken ?? process.env.AGENT_SECRET_DOPPLER_TOKEN ?? process.env.DOPPLER_TOKEN ?? "");
  }

  /* ---------- helpers ---------- */
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
  gateway(e, res)    { return this.respond(res, 502,  { error: "upstream", detail: (e && e.message) || String(e) }); }

  /* ---------- doppler ---------- */
  async doppler(args) {
    const { spawn } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      const child = spawn(this.doppler, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env:   { ...process.env, DOPPLER_TOKEN: this.dopplerKey },
      });
      let out = "", err = "";
      child.stdout.on("data", d => out += d);
      child.stderr.on("data", d => err += d);
      child.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || out.trim())));
    });
  }
  async readSecret(project, env, key) {
    return await this.doppler(["secrets", "get", key, "--plain", "--project", project, "--config", env]);
  }
  async writeSecret(project, env, key, value) {
    await this.doppler(["secrets", "set", key, value, "--project", project, "--config", env]);
  }

  /* ---------- routing ---------- */
  parsePath(urlPath) {
    const parts = decodeURIComponent(urlPath).split("/").filter(Boolean);
    if (parts.length !== 3 || parts[0] !== "secret") return null;
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
  dopplerCli:  process.env.DOPPLER_CLI,
  dopplerToken: process.env.AGENT_SECRET_DOPPLER_TOKEN,
});
const server = svc.start();
