# CCGui Template

Minimal template with:
- Go backend using ConnectRPC
- React + TypeScript + Tailwind + shadcn/ui frontend
- Shared protobufs with end-to-end type-safe clients

## Prereqs
- Go 1.22+
- Node.js 20+
- Buf CLI (https://buf.build)

## Codegen
From repo root:
```
buf generate
```

## Backend
```
cd backend
go run ./cmd/server
```

## Frontend
```
cd frontend
npm install
npm run dev
```

## Notes
- Update `module` in `backend/go.mod` and `go_package` in `proto/*.proto` to match your repo path.
- Generated code lives in `backend/gen` and `frontend/src/gen`.
# CCGui template

Minimal full-stack template with:
- Go backend: gRPC + gRPC-web (frontend) + REST (public) on one port.
- React + TypeScript + Tailwind + shadcn/ui frontend.
- Shared protobuf in `proto/` with generated code for both sides.

## Requirements
- Go 1.22+
- Node 18+
- `buf` CLI for code generation

## Quick start
```bash
./scripts/gen.sh

cd backend
go run ./cmd/server
```

In another terminal:
```bash
cd frontend
npm install
npm run dev
```

Frontend talks to `http://localhost:8080` using gRPC-web.
REST endpoint: `GET http://localhost:8080/v1/hello?name=world`

## Code generation
```bash
./scripts/gen.sh
```
This reads `proto/` and writes:
- Go: `backend/gen/...`
- TS: `frontend/src/gen/...`

## Tests
```bash
cd backend
go test ./...
```

```bash
cd frontend
npm test
```

## Configuration
Backend env vars:
- `HTTP_ADDR` (default `:8080`)
- `CORS_ORIGINS` (default `http://localhost:5173`)

Frontend env vars:
- `VITE_API_BASE_URL` (default `http://localhost:8080`)
# CCGui - Full-Stack Application

A modern full-stack application with:
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Go with gRPC and REST API support
- **Communication**: Strictly typed gRPC layer with public REST API endpoints

## Project Structure

```
CCGui/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── lib/         # Utilities and API clients
│   │   └── proto/       # Protocol buffer definitions
│   └── package.json
├── backend/           # Go backend application
│   ├── cmd/server/     # Main server entry point
│   ├── internal/
│   │   ├── api/        # REST API handlers
│   │   ├── grpc/       # gRPC service implementation
│   │   └── proto/      # Generated protobuf code
│   └── go.mod
└── README.md
```

## Features

### Frontend
- ⚡ **Vite** - Fast build tool and dev server
- ⚛️ **React 19** - Modern React with TypeScript
- 🎨 **Tailwind CSS** - Utility-first CSS framework
- 🧩 **shadcn/ui** - High-quality component library
- 📡 **REST API Client** - Communication with backend via REST (gRPC-Gateway)
- 🔌 **gRPC-Web Support** - Ready for direct gRPC-Web communication

### Backend
- 🚀 **Go** - High-performance backend
- 🔌 **gRPC** - Type-safe RPC communication (port 50051)
- 🌐 **REST API** - Public-facing HTTP endpoints (port 8080)
- 🔄 **gRPC-Gateway** - Automatic REST to gRPC transcoding
- 🌍 **gRPC-Web** - Browser-compatible gRPC support
- 🔒 **CORS** - Configured for frontend communication

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Go** (v1.21 or higher)
- **protoc** (Protocol Buffers compiler)
- **protoc-gen-go** and **protoc-gen-go-grpc** plugins

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install Go dependencies:
```bash
go mod tidy
```

3. Generate protobuf code:
```bash
make proto
# Or manually:
# export PATH=$PATH:$(go env GOPATH)/bin
# make generate
```

4. Run the backend server:
```bash
go run cmd/server/main.go
```

The backend will start:
- **gRPC server** on `:50051`
- **HTTP/REST server** on `:8080` (gRPC transcoding + gRPC-Web + public API)

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

## API Endpoints

### REST API (via gRPC Transcoding)

All gRPC methods are automatically exposed as REST endpoints on port 8080:

- `GET /api/v1/message/{id}` - Get a message by ID (transcoded to gRPC)
- `POST /api/v1/message` - Create a new message (transcoded to gRPC)

These REST endpoints are automatically transcoded to gRPC calls using gRPC-Gateway.

### Public REST API

- `GET /api/v1/public/health` - Health check endpoint
- `GET /api/v1/public/info` - Service information

### gRPC-Web

- gRPC-Web is available on port 8080 using the gRPC-Web protocol
- Browsers can make gRPC calls directly via gRPC-Web

### Direct gRPC

- Direct gRPC is available on port 50051 using any gRPC client

## Development

### Adding New gRPC Methods

1. Update `backend/internal/proto/service.proto` with your new service definition
2. Regenerate protobuf code: `make proto` (in backend directory)
3. Implement the method in `backend/internal/grpc/service.go`
4. The REST endpoint will be automatically available via gRPC-Gateway

### Frontend Development

The frontend uses:
- **Vite** for fast HMR (Hot Module Replacement)
- **Tailwind CSS** for styling
- **shadcn/ui** components (install via `npx shadcn-ui@latest add [component]`)

### Keeping Proto In Sync (Recommended)

Use a single source of truth: `backend/internal/proto/service.proto`. The frontend copies it and generates gRPC-Web stubs from that file.

To sync and generate frontend stubs:

```bash
cd frontend
npm run proto
```

This copies the backend proto into `frontend/src/proto/service.proto` and generates TypeScript/JavaScript code.

## Architecture

### Communication Flow

1. **Frontend → Backend (REST)**: Frontend uses REST API client (`src/lib/api/client.ts`) which communicates with the backend's HTTP server on port 8080. The HTTP server uses gRPC-Gateway to automatically transcode REST calls to gRPC calls.

2. **Frontend → Backend (gRPC-Web)**: Frontend can use gRPC-Web client (`src/lib/grpc/client.ts`) to communicate directly via gRPC-Web protocol on port 8080.

3. **Backend**:
   - gRPC server on port 50051 (direct gRPC clients)
   - HTTP server on port 8080 (REST + gRPC-Web + public endpoints)

### Type Safety

- **Backend**: Go code is generated from `.proto` files, ensuring type safety
- **Frontend**: TypeScript provides type safety. REST API responses are typed via JSON, and gRPC-Web provides generated TypeScript types.

## Building for Production

### Backend

```bash
cd backend
go build -o bin/server cmd/server/main.go
```

### Frontend

```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`.

## Troubleshooting

### protoc not found
Install Protocol Buffers compiler:
- **macOS**: `brew install protobuf`
- **Linux**: `sudo apt-get install protobuf-compiler` (or use your package manager)
- **Windows**: Download from [protobuf releases](https://github.com/protocolbuffers/protobuf/releases)

### protoc-gen-go not found
Ensure Go binaries are in your PATH:
```bash
export PATH=$PATH:$(go env GOPATH)/bin
```

### CORS errors
The backend CORS configuration allows `http://localhost:5173` and `http://localhost:3000`. Update the CORS settings in `backend/cmd/server/main.go` if using a different port.

## License

MIT
