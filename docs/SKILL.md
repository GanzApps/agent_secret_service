# agent_secret_service agent skill

Use this service when you need a secret for a project/agent and you have the shared service bearer token. Do not read `DOPPLER_TOKEN` directly.

## Base URL
`http://100.117.68.97:8311` (local-wsl instance)

## Auth
`Authorization: Bearer $AGENT_SECRET_SERVICE_TOKEN`

## Read a secret
```
GET /secret/$PROJECT/$ENV/$KEY
```
Responses:
- `200` — `{"value":"..."}`
- `401` — bad service token
- `502` — Doppler failure (show detail; retry once then alert user)

## Write a secret
```
POST /secret/$PROJECT/$ENV/$KEY
Content-Type: application/json
{"value":"..."}
```
Responses:
- `200` — `{"status":"ok"}`
- `400` — bad body
- `401` — bad service token
- `502` — Doppler failure

## Contract rules
- Always use the service token header; never fall back to raw Doppler.
- Reuse bearer token from memory/env instead of echoing it in chat.
- On `502`, retry once; on second failure surface upstream error + original secret reference.
- Cap REST round-trips to this service when possible instead of repeated CLI calls.
