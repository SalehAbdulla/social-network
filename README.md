# Real-Time Forum | Typing In Progress

A production-grade, single-page real-time forum application built with **Go**, **WebSockets**, **SQLite**, and vanilla JavaScript — containerized with Docker and deployed via GitHub Actions.

[![Live Demo](https://img.shields.io/badge/Live_Demo-View_App-46E3B7?logo=render)](https://real-time-forum.onrender.com)
![Go Version](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--Time-010101?logo=socket.io)

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Best Practices](#best-practices)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Deployment](#deployment)
- [CI/CD](#cicd)

---

## ✨ Features

- **User Authentication** — Register, login, session-based auth with secure password hashing (bcrypt)
- **Posts & Comments** — Create, read, delete posts and threaded comments with pagination and infinite scroll
- **Reactions** — Like/dislike posts and comments
- **Categories** — Browse and filter posts by category
- **Real-Time Chat** — WebSocket-powered private messaging with paginated history, typing indicators, and online presence
- **Notifications** — Real-time notifications for new comments and messages with paginated history
- **Responsive SPA** — Client-side routing with a mobile-first UI built in vanilla JavaScript
- **Structured Logging** — Request-level logging with duration, status codes, and user agent tracking

---

## 🏗 Architecture

The application follows a strict **three-tier layered architecture** designed for separation of concerns, testability, and maintainability:

```
┌─────────────────────────────────────────┐
│              HANDLERS (HTTP)             │  ← Thin layer: parse requests, delegate to services, write responses
├─────────────────────────────────────────┤
│              SERVICES (Logic)            │  ← Business rules, DTO mapping, orchestration
├─────────────────────────────────────────┤
│           REPOSITORIES (Data)            │  ← SQL queries, database access, no business logic
└─────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility | Must NOT |
|-------|---------------|----------|
| **Handlers** | Parse HTTP requests, validate input, call services, write JSON responses | Contain business logic or SQL queries |
| **Services** | Business logic, data transformation, DTO mapping, orchestrate multiple repositories | Access `http.Request`/`http.ResponseWriter` |
| **Repositories** | Execute SQL queries, return domain models | Contain business rules or HTTP concerns |

---

## 📁 Project Structure

```
.
├── cmd/
│   ├── main.go              # Application entry point, dependency wiring
│   ├── router.go            # HTTP route definitions (Go 1.22+ patterns)
│   └── middleware.go         # Request logger with response wrapping
│
├── pkg/
│   ├── app/
│   │   ├── handlers/         # HTTP handlers (Auth, Post, Comment, Chat, WebSocket, Notification)
│   │   ├── service/          # Business logic layer (interfaces + implementations)
│   │   └── repositories/     # Data access layer (SQL queries, schema)
│   │
│   ├── config/               # Application configuration & constants
│   ├── logger/               # Structured logging (slog)
│   ├── middleware/           # Auth middleware, static file protection
│   ├── models/               # Domain models (Post, Comment, User, Message, etc.)
│   ├── payload/              # DTOs — separate packages per domain
│   │   ├── posts/            # PostDTO, PostResponse
│   │   ├── comment/          # CommentDTO, CommentResponse
│   │   ├── message/          # MessageDTO, MessagesResponse
│   │   ├── notification/     # NotificationDTO, NotificationResponse
│   │   ├── reaction/         # ReactionResponse
│   │   ├── user/             # UserDTO, RegisterRequestDTO
│   │   └── category/         # CategoryDTO
│   ├── render/               # HTML template rendering
│   └── websocket/            # WebSocket hub, client, message types
│
├── static/                   # Static assets (CSS, JS, SVG)
│   ├── css/style.css
│   └── js/
│       ├── app.js            # SPA entry point
│       ├── router.js         # Client-side hash router
│       ├── api.js            # HTTP API client
│       ├── websocket.js      # WebSocket client
│       ├── components/       # Reusable UI components (PostCard, Avatar, BottomNav, etc.)
│       ├── layouts/          # Page layout templates
│       └── pages/            # Page modules (feed, chat, profile, notifications, etc.)
│
├── templates/
│   └── index.html            # Single HTML entry point for the SPA
│
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Local development & production deployment
├── .dockerignore
├── .air.toml                 # Hot-reload configuration for development
└── .github/
    └── workflows/
        └── docker-build-push.yml   # CI/CD pipeline
```

---

## 🧠 Best Practices Implemented

### 1. Clean Layered Architecture

Strict separation of **Handlers → Services → Repositories**. Each layer depends only on the layer below it. This makes the codebase modular, testable, and easy to extend.

```go
// Handlers depend on services (interfaces), never on repositories directly
type HandlerContext struct {
    AuthService        service.AuthService
    PostService        service.PostService
    CommentService     service.CommentService
    // ...
}
```

### 2. Interface-Based Service Design

Every service is defined as an **interface** with a concrete implementation. This enables dependency injection, mocking in tests, and swapping implementations without changing consumers.

```go
type PostService interface {
    GetPosts(...) (posts.PostResponse, error)
    CreatePost(...) (posts.PostDTO, error)
    GetPostByID(...) (posts.PostDTO, error)
    DeletePost(...) error
}

type PostServiceImpl struct {
    db             db.PostRepository
    reactionService ReactionService
}
```

### 3. DTO (Data Transfer Object) Pattern

Domain models are **never** exposed to the client. A dedicated `payload/` package contains DTOs organized by domain. Service methods map internal models to DTOs before returning them — decoupling the API contract from the database schema.

```
pkg/models/Post.go          ← Internal domain model (includes all DB fields)
pkg/payload/posts/PostDTO.go ← Client-facing DTO (curated, secure fields)
```

```go
func mapPostToDTO(post models.Post, userScore int) posts.PostDTO {
    return posts.PostDTO{
        PostId:          post.PostId,
        Nickname:        post.Nickname,
        Title:           post.Title,
        // ... only fields the client needs
    }
}
```

### 4. Repository Pattern with Interface Segregation

The `DB` struct implements multiple narrow interfaces (`PostRepository`, `CommentRepository`, etc.), each exposing only the queries relevant to that domain. This prevents repositories from becoming bloated "god objects."

### 5. WebSocket Hub Pattern

Real-time communication uses a central **Hub** that manages client connections, broadcasting, and direct messaging. The Hub runs in its own goroutine and uses channels for thread-safe communication — following the [Gorilla WebSocket chat example](https://github.com/gorilla/websocket/tree/master/examples/chat) pattern.

```go
type Hub struct {
    clients    map[string]*Client
    Register   chan *Client
    Unregister chan *Client
    broadcast  chan []byte
}
```

### 6. Middleware Chain

Reusable middleware for authentication, request logging, and security:
- **`AuthMiddleware`** — Validates session tokens, injects user context
- **`RequestLogger`** — Structured logging with method, path, status, duration, and user agent
- **`NoDirListing`** — Prevents directory enumeration on static files

### 7. In-Memory Session Manager

A thread-safe session manager using `sync.RWMutex` for concurrent access. Sessions are stored in bi-directional maps (`Token→UID` and `UID→Token`) for O(1) lookups in both directions. Supports automatic duplicate session invalidation and presence tracking.

### 8. Go 1.22+ Routing Patterns

Routes use Go's native enhanced `http.ServeMux` patterns (`POST /api/v1/posts`, `GET /api/v1/post`, `DELETE /api/v1/posts`) — no third-party router dependency.

### 9. Structured Logging with `log/slog`

All logging uses Go's standard `slog` package with structured key-value pairs. The request logger captures method, path, remote address, status code, duration, and user agent for every request.

### 10. Multi-Stage Docker Build

```
Stage 1 (builder): golang:1.25-alpine → Compile Go binary with CGO
Stage 2 (runtime): alpine:3.21 → Copy binary + static files only
```

The final image is **minimal** (~20MB) and contains only the compiled binary, templates, and static assets.

### 11. Proper Database Schema Design

- SQLite with **foreign keys** and `ON DELETE CASCADE` constraints
- **Indexes** on high-traffic query patterns (messages by sender/recipient, reactions by entity, notifications by user/read status)
- `CHECK` constraints for enum-like fields (gender, reaction score, entity type, read status)

### 12. Client-Side SPA Architecture

The frontend is a vanilla JavaScript SPA with:
- **Hash-based routing** for in-app navigation
- **Component system** with reusable UI pieces
- **API abstraction layer** for all HTTP requests
- **WebSocket client** for real-time features
- No framework dependencies — just vanilla JS

---

## 🚀 Getting Started

### Prerequisites

- [Go 1.25+](https://go.dev/dl/)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)
- SQLite3 (bundled with Docker, or install via `brew install sqlite3`)

### Local Development

```bash
# Clone the repository
git clone https://learn.reboot01.com/git/saabdulla/real-time-forum-typing-in-progress.git
cd real-time-forum-typing-in-progress

# Run with hot-reload (requires air)
go install github.com/air-verse/air@latest
air

# Or run directly
go run ./cmd
```

The application starts at **http://localhost:5174**.

### Docker

```bash
# Build and run with Docker Compose
docker compose up -d --build

# Or pull from Docker Hub
docker pull saabdulla/real-time-forum:latest
docker run -d -p 5174:5174 saabdulla/real-time-forum:latest
```

---

## 📡 API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/v1/auth/register` | Register new user | No |
| `POST` | `/api/v1/auth/login` | Login | No |
| `POST` | `/api/v1/auth/logout` | Logout | Yes |
| `GET` | `/api/v1/auth/me` | Get current user | Yes |
| `GET` | `/api/v1/categories` | List all categories | Yes |
| `GET` | `/api/v1/posts` | List posts (paginated) | Yes |
| `POST` | `/api/v1/posts` | Create post | Yes |
| `DELETE` | `/api/v1/posts` | Delete post | Yes |
| `GET` | `/api/v1/post` | Get single post | Yes |
| `GET` | `/api/v1/posts/comments` | Get comments | Yes |
| `POST` | `/api/v1/posts/comments` | Create comment | Yes |
| `DELETE` | `/api/v1/posts/comments` | Delete comment | Yes |
| `POST` | `/api/v1/reactions` | React to post/comment | Yes |
| `GET` | `/api/v1/messages/users` | List chat users | Yes |
| `GET` | `/api/v1/messages` | Get conversation | Yes |
| `GET` | `/api/v1/notifications` | List notifications | Yes |
| `GET` | `/api/v1/notifications/unread-count` | Unread count | Yes |
| `PATCH` | `/api/v1/notifications/{id}/read` | Mark as read | Yes |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all as read | Yes |
| `GET` | `/ws` | WebSocket upgrade | Yes |

---

## 🐳 Deployment

### Docker Hub

The image is published to Docker Hub: **[saabdulla/real-time-forum](https://hub.docker.com/r/saabdulla/real-time-forum)**

```bash
docker pull saabdulla/real-time-forum:latest
docker run -d -p 5174:5174 --name forum saabdulla/real-time-forum:latest
```

### Deploying on a VPS

```bash
# Create a docker-compose.yml on your server
cat > docker-compose.yml << 'EOF'
services:
  real-time-forum:
    image: saabdulla/real-time-forum:latest
    container_name: real-time-forum
    ports:
      - "80:5174"
    environment:
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/pkg/app/repositories
    restart: unless-stopped
EOF

docker compose up -d
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

---

## 🤖 CI/CD

Every push to `main` triggers a GitHub Actions workflow that:

1. Checks out the code
2. Logs into Docker Hub using repository secrets
3. Builds the multi-stage Docker image
4. Pushes the image to `saabdulla/real-time-forum:latest`

The workflow uses Docker Buildx for fast, cached builds. See [`.github/workflows/docker-build-push.yml`](.github/workflows/docker-build-push.yml).

---

## 🗄️ Database

The project uses SQLite with a normalized schema:

```
user ────< post ────< comment
  │          │
  │          └──< reaction (entityType: 'post')
  │          │
  ├──< message (sender/recipient)
  │
  ├──< session
  │
  └──< notification
```

The database file is created automatically on first run at `data/realTimeForum.db`.

---

## 🔐 Security

- Passwords hashed with **bcrypt**
- Session tokens generated via `crypto/rand` (UUID v4)
- Auth middleware validates sessions on every protected route
- SQL parameters use placeholders (parameterized queries) to prevent injection
- Static directory listing disabled
- Foreign key constraints enforced at the database level

---

## 📄 License

This project is part of the Reboot01 curriculum.

---

**Built with Go · WebSockets · SQLite · Docker · GitHub Actions**