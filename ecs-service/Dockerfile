FROM node:20-bookworm-slim AS dependencies

WORKDIR /app/ecs-service
COPY ecs-service/package.json ecs-service/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app/ecs-service
COPY --from=dependencies /app/ecs-service/node_modules ./node_modules
COPY ecs-service/src ./src
COPY ecs-service/migrations ./migrations
COPY cloudfunctions/assessmentBff/core /app/cloudfunctions/assessmentBff/core

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
