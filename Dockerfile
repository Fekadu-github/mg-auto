# One image: the Node API plus the built React app (the API serves it, so there is no CORS to set up).
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production FRONTEND_DIR=/app/public PORT=3000
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/ ./
COPY --from=web /web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
