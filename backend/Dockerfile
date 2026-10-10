FROM golang:1.26-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /out/server ./cmd

FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home app
WORKDIR /app
COPY --from=build /out/server ./server
COPY pkg/db/migrations ./pkg/db/migrations
RUN mkdir -p /data/uploads && chown -R app:app /data
USER app
ENV PORT=5174 DATABASE_PATH=/data/socialnetwork.db UPLOAD_DIR=/data/uploads
EXPOSE 5174
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://127.0.0.1:5174/api/v1/ready || exit 1
CMD ["./server"]
