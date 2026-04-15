FROM node:22-alpine
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm install --omit=dev

COPY backend/ .
