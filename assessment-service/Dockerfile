FROM node:20-bookworm-slim AS verified

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY test ./test
COPY assets ./assets
COPY THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

RUN npm run test:container

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    ASSESSMENT_PROVIDER_MODE=font-smoke \
    GLYPH_PROVIDER_MODE=source-han-serif

WORKDIR /app

COPY --from=verified /app/package.json /app/package-lock.json ./
COPY --from=verified /app/node_modules ./node_modules
COPY --from=verified /app/src ./src
COPY --from=verified /app/assets ./assets
COPY --from=verified /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
