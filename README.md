# agent_secret_service

Thin Doppler bridge so agents never hold raw provider credentials. Running this service lets agents request secrets using a shared bearer token while the service keeps the platform token isolated.

## Config
Set these before starting the service.

- `AGENT_SECRET_SERVICE_TOKEN` (required) — bearer token the service accepts
- `AGENT_SECRET_SERVICE_PORT` (optional, default `8311`) — bind port
- `AGENT_SECRET_DOPPLER_TOKEN` (preferred) or `DOPPLER_TOKEN` (fallback) — master Doppler token

## Run
```bash
node src/server.js
```

## API
All requests require `Authorization: Bearer $AGENT_SECRET_SERVICE_TOKEN`.

- GET `/secret/:project/:env/:key` returns `{"project"..., "env"..., "key"..., "value":"..."}`
- POST `/secret/:project/:env/:key` with `{"value":"..."}` returns `{"project"..., ..., "status":"ok"}`

Errors: 401 unauthorized, 404 route/shape issue, 502 upstream Doppler error.

## Agent skill
See `docs/SKILL.md` for the transport rules, error mapping, and secret hygiene
patterns when integrating this service into Hermes agents.
