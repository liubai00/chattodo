# glibc base so better-sqlite3 uses its prebuilt binary (no native compile).
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DB_PATH=/data/chattodo.db
EXPOSE 8787
# Ensure schema + seed-if-empty, then start.
CMD ["sh", "-c", "node src/db/bootstrap.js && node src/server.js"]
