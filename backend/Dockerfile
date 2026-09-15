FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -trimpath -o /out/server ./cmd

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home app
WORKDIR /app
COPY --from=build /out/server ./server
COPY pkg/db/migrations ./pkg/db/migrations
RUN mkdir -p /data/uploads && chown -R app:app /data
USER app
ENV PORT=5174 DATABASE_PATH=/data/socialnetwork.db UPLOAD_DIR=/data/uploads
EXPOSE 5174
CMD ["./server"]
