# Bindr.fun

Collect. Connect. Complete. — The ultimate toolkit for graded Pokemon card collectors.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)
- **PostgreSQL** running locally (default: `localhost:5432`)
- **Redis** running locally (default: `localhost:6379`)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file and fill in your values
cp .env.example .env

# 3. Generate Prisma client
cd services/api && npx prisma generate

# 4. Run database migrations
cd services/api && npx prisma migrate dev
```

## Running the App

### Start both frontend and API together

```bash
pnpm dev
```

### Or start each service individually

**API** — runs on http://localhost:3001

```bash
cd services/api
npm run build
node dist/main.js
```

**Frontend** — runs on http://localhost:3000

```bash
cd apps/web
npm run dev
```

> Both services must be running for the full app to work.

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_PORT` | API server port (default: 3001) |
| `RESEND_API_KEY` | Resend API key for beta invite emails (free at resend.com) |
