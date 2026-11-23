FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production FOX_HOSTED_RELEASE=1 DATABASE_PATH=/app/storage/data.db
COPY package.json server.mjs container-start.mjs team-lead-expectations.json ./
COPY public ./public
RUN mkdir -p /app/storage && chown 1000:1000 /app/storage && chmod 700 /app/storage
EXPOSE 10000
ENV PORT=10000
CMD ["node", "--no-warnings=ExperimentalWarning", "container-start.mjs"]
