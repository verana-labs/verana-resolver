# Docker Setup Guide

This guide explains how to set up PostgreSQL container for the Verana Trust Resolver.

## Container Configuration

### PostgreSQL Container

- **Image**: `postgres:16-alpine` (from Docker Hub)
- **Container Name**: `psql_verana_resolver`
- **Port**: `5435` (default, to avoid conflicts with existing containers on 5432/5433/5434)
- **Database**: `verana_resolver`
- **User**: `verana_resolver_user`

## Quick Commands

### Start Database Container Only

```bash
pnpm run db:up
```

This starts PostgreSQL container using `docker-compose.db.yml`.

### Stop Database Container

```bash
pnpm run db:down
```

### View Database Logs

```bash
pnpm run db:logs
```

### Start Full Stack (Resolver + Database)

```bash
pnpm run docker:up
```

### Stop Full Stack

```bash
pnpm run docker:down
```

## Using Existing Containers

If you already have PostgreSQL containers running, you should:

1. **Use your existing containers** - Don't run `pnpm run db:up` as it will try to create new containers on the same ports
2. Make sure `.env` matches your existing container settings:
   - DB_PORT: `5435` (or whatever port your container uses)
   - DB_NAME, DB_USER, DB_PASSWORD match your existing setup
3. Start only the resolver service:

```bash
pnpm run dev
```

## Recreating Containers with Same Configuration

If you want to recreate containers with the same configuration:

1. **Stop your existing containers first:**
   ```bash
   docker stop psql_verana_resolver
   docker rm psql_verana_resolver
   ```

2. **Then create new containers:**
   ```bash
   pnpm run db:up
   ```

This will create `psql_verana_resolver` with:
- PostgreSQL: port 5435 (default), database `verana_resolver`, user `verana_resolver_user`

## Creating Containers Manually

If you prefer to create containers manually:

### PostgreSQL

```bash
docker run -d \
  --name psql_verana_resolver \
  -e POSTGRES_USER=verana_resolver_user \
  -e POSTGRES_PASSWORD= \
  -e POSTGRES_DB=verana_resolver \
  -p 5435:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

## Troubleshooting

### Port Already in Use

By default, containers use port 5435 (PostgreSQL) to avoid conflicts. If you need different ports:

**Option 1: Use environment variables to change ports**
```bash
# Windows PowerShell
$env:DB_PORT="5435"; pnpm run db

# Linux/Mac
DB_PORT=5435 pnpm run db
```

**Option 2: Stop existing containers**
```bash
docker stop psql_verana_resolver
docker rm psql_verana_resolver
pnpm run db:up
```

**Option 3: Use existing containers**
Just run `pnpm run dev` - it will connect to your existing containers.

### Image Not Found

The project uses standard Docker Hub images:
- `postgres:16-alpine` - Official PostgreSQL image (automatically pulled)

These images are automatically pulled from Docker Hub when you run `docker-compose up`.

### Connection Issues

Check container status:

```bash
docker ps
```

Check container logs:

```bash
docker logs psql_verana_resolver
```

Test PostgreSQL connection:

```bash
docker exec -it psql_verana_resolver psql -U verana_resolver_user -d verana_resolver
```
