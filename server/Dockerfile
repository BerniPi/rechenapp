# Baut aus dem Projektordner: docker compose -f server/docker-compose.yml up -d --build
FROM node:24-alpine
RUN apk add --no-cache tzdata
WORKDIR /app
COPY server/*.js server/
COPY server/admin server/admin
# Die App selbst – so laufen App und API auf derselben Adresse
COPY index.html manifest.json sw.js public/
COPY css public/css
COPY js public/js
COPY icons public/icons
COPY vendor public/vendor
COPY models public/models
ENV APP=/app/public DATEN=/daten PORT=8080 NODE_ENV=production
RUN mkdir /daten && chown node:node /daten
USER node
VOLUME /daten
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/ping || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
