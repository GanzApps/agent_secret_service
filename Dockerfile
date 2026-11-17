FROM node:24-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src/server.js ./src/server.js
EXPOSE 8311
HEALTHCHECK CMD node -e "require('http').get('http://127.0.0.1:8311/secret/_health/_check/int/test',{headers:{Authorization:'Bearer t'}},r=>process.exit(r.statusCode===401?0:1)).on('error',()=>process.exit(1))" || exit 1
CMD ["node", "src/server.js"]
