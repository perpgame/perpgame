# Build frontend
FROM node:23-alpine AS build

RUN apk add --no-cache python3 make g++ && npm install -g npm@latest

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps

COPY frontend/index.html frontend/vite.config.js frontend/eslint.config.js ./
COPY frontend/public ./public
COPY frontend/src ./src

ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_API_URL
ARG VITE_HL_TESTNET

ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_HL_TESTNET=$VITE_HL_TESTNET

# Use the local perpgame toolkit skill from the monorepo
COPY skills/TOOLKIT.md public/toolkit.md

RUN npm run build

# Serve static files
FROM node:23-alpine
RUN npm install -g serve
COPY --from=build /app/dist /app
EXPOSE 5000
CMD ["serve", "-s", "/app", "-l", "5000"]
