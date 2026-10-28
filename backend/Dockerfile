FROM golang:1.26-bookworm@sha256:98e20eb89c0b04076da4e5a6c1ebf3cd7499042c6db8807a66fb8c83f65074c1 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /out/server ./cmd

FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
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
