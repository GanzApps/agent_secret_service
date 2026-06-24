FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
COPY src/server.js src/server.js
RUN npm install --production
RUN addgroup --system app && adduser --system --ingroup app app
USER app
EXPOSE 8311
