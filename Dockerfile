# ---- Build Stage ----
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

# Copy go.mod and go.sum first for dependency caching
COPY go.mod go.sum ./
RUN go mod download

# Copy the entire source code
COPY . .

# Build the Go binary
RUN CGO_ENABLED=1 GOOS=linux go build -o /app/server ./cmd

# ---- Run Stage ----
FROM alpine:3.21

RUN apk add --no-cache sqlite-libs ca-certificates tzdata

WORKDIR /app

# Copy the built binary
COPY --from=builder /app/server .

# Copy templates and static files (needed at runtime)
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

# Create directory for the SQLite database
RUN mkdir -p /app/pkg/app/repositories

# Expose the application port
EXPOSE 5174

# Run the server
CMD ["./server"]