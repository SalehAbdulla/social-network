FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /out/server ./cmd

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home app
WORKDIR /app
COPY --from=build /out/server ./server
COPY pkg/db/migrations ./pkg/db/migrations
RUN mkdir -p /data/uploads && chown -R app:app /data
USER app
ENV PORT=5174 DATABASE_PATH=/data/socialnetwork.db UPLOAD_DIR=/data/uploads
EXPOSE 5174
# Readiness is the database-backed probe, so a container is only reported
# healthy once it can answer API requests — migrations run before the server
# starts listening, so a first boot passes as soon as the schema is in place.
# curl is the only tool the probe needs; this image ships no other HTTP client.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:5174/api/v1/ready || exit 1
CMD ["./server"]
