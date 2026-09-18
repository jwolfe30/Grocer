# Grocer — Next.js 15 production (Node 22, better-sqlite3 native build)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# SQLite defaults use process.cwd()/data — mount host/Fly volume at /app/data
RUN mkdir -p /app/data

EXPOSE 3000

# Seed empty volume from image-baked data/seed/prices.sqlite (warm launch bar)
CMD ["node", "scripts/docker-entrypoint.js"]
