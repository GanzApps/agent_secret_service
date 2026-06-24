# Usage
Start service on default port `8311`:
```bash
AGENT_SECRET_SERVICE_TOKEN=dev_service_token AGENT_SECRET_DOPPLER_TOKEN="${DOPPLER_TOKEN}" node src/server.js
```

Read a secret:
```bash
curl -H "Authorization: Bearer dev_service_token" "http://localhost:8311/secret/my-project/dev/my-key"
```

Write a secret:
```bash
curl -X POST -H "Authorization: Bearer dev_service_token" -H "Content-Type: application/json" -d '{"value":"topsecret"}' "http://localhost:8311/secret/my-project/dev/my-key"
```
