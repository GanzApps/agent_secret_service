#!/usr/bin/env bash
set -euo pipefail
: "${AGENT_SECRET_SERVICE_DOCKER_IMAGE:=localhost/agent-secret-service:local}"
docker build -t "${AGENT_SECRET_SERVICE_DOCKER_IMAGE}" .
echo "Image built: ${AGENT_SECRET_SERVICE_DOCKER_IMAGE}"
