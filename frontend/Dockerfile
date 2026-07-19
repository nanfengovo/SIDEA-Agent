# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_BASE_URL=http://localhost:8000
ENV VITE_BASE_URL=$VITE_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
