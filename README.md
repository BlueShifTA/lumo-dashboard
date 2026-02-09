# FastAPI + Next.js Template

A production-ready fullstack template with FastAPI backend and Next.js frontend, containerized for deployment.

## 🏗️ Project Structure

```
├── backend/
│   └── app_template/       # FastAPI application
│       ├── api/            # API routers
│       ├── core/           # Config, utilities
│       ├── domain/         # Models, schemas
│       └── services/       # Business logic
│   └── tests/              # pytest tests
├── frontend/               # Next.js application
│   └── app/                # App Router pages
├── devops/
│   ├── backend.dockerfile
│   ├── frontend.dockerfile
│   └── .pre-commit-config.yaml
├── .github/workflows/      # CI/CD pipelines
├── docker-compose.yml
├── pyproject.toml          # Python project (uv)
└── justfile                # Task runner
```

## 🚀 Quick Start

### Prerequisites
- Python 3.13+
- Node.js 22+
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- [just](https://github.com/casey/just) (command runner)
- Docker & Docker Compose

### Local Development

```bash
# Install all dependencies
just install

# Run backend (port 8000)
just run-backend

# Run frontend (port 3000) - in another terminal
just run-frontend
```

### Docker

```bash
# Build and run
just docker-up

# View logs
just docker-logs

# Stop
just docker-down
```

## 📋 Available Commands

```bash
just              # List all commands
just install      # Install all dependencies
just run-backend  # Start FastAPI dev server
just run-frontend # Start Next.js dev server
just test         # Run backend tests
just test-cov 80  # Run tests with 80% coverage threshold
just lint         # Run all linters
just typecheck    # Run mypy
just docker-build # Build Docker images
just docker-up    # Start containers
just docker-prod  # Build & run production mode
```

## 🧪 Testing

```bash
# Run all tests
just test

# Run with coverage
just test-cov 80
```

## 🔧 Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key environment variables:
- `API_HOST` / `API_PORT` - Backend server settings
- `NEXT_PUBLIC_API_BASE_URL` - Frontend API endpoint
- `DEBUG` - Enable debug mode

## 📦 CI/CD

### GitHub Actions Workflows

1. **CI** (`.github/workflows/ci.yml`)
   - Runs on push/PR to main
   - Backend: tests, coverage, ruff, mypy
   - Frontend: lint, build check
   - Docker build (main branch only)

2. **CD** (`.github/workflows/cd.yml`)
   - Triggered by version tags (`v*`)
   - Builds & pushes to GitHub Container Registry
   - Deploy placeholder (customize for your infra)

### Creating a Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 🎨 Customization

### Renaming the Project

1. Rename `backend/app_template/` to your project name
2. Update `pyproject.toml`:
   - `name`
   - `[tool.hatch.build.targets.wheel]` packages
   - `[tool.coverage.run]` source
   - `[tool.mypy]` files
3. Update imports in all Python files
4. Update `justfile` uvicorn command
5. Update Docker image names in workflows

### Adding a Database

1. Add dependency to `pyproject.toml`:
   ```toml
   "sqlalchemy>=2.0",
   "asyncpg",  # for PostgreSQL
   ```

2. Uncomment postgres service in `docker-compose.yml`

3. Add database connection in `core/config.py`

## 📄 License

MIT
