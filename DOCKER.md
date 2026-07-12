# Docker Setup for MasePOS

This guide helps you run MasePOS using Docker and Docker Compose.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)
- At least 4GB of free disk space

## Quick Start

### 1. Configure Environment Variables

Copy the Docker environment template and customize as needed:

```bash
cp .env.docker .env.docker.local
```

Edit `.env.docker.local` to configure:
- Database credentials
- JWT secret (change from default!)
- PayFast sandbox settings

### 2. Build and Start Services

Start all services (PostgreSQL, App, Nginx):

```bash
docker-compose up -d
```

This will:
- Build the POS application image
- Start PostgreSQL database
- Start the Node.js/React application
- Start Nginx reverse proxy
- Initialize the database schema

### 3. Access the Application

```
http://localhost
```

The application will be available at port 80 (HTTP).

## Services

### PostgreSQL Database
- **Container**: masepos-db
- **Port**: 5432 (exposed for local development)
- **Volume**: `postgres_data` (persistent database storage)
- **Health Check**: Automatic

### POS Application
- **Container**: masepos-app
- **Port**: 3000 (internal, proxied through nginx)
- **Volumes**: 
  - `./logs:/app/logs` (application logs)
- **Health Check**: HTTP health check to port 3000

### Nginx Reverse Proxy
- **Container**: masepos-nginx
- **Ports**: 80 (HTTP), 443 (HTTPS - configure SSL certificates)
- **Features**:
  - Request rate limiting
  - Gzip compression
  - Security headers
  - Static asset caching
  - API routing to app container

## Common Commands

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
docker-compose logs -f nginx
```

### Stop services
```bash
docker-compose down
```

### Stop and remove all data (⚠️ warning: deletes database)
```bash
docker-compose down -v
```

### Restart services
```bash
docker-compose restart
```

### Rebuild application image
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Access database directly
```bash
docker exec -it masepos-db psql -U pos_user jimmy_pos
```

### Execute commands in app container
```bash
docker exec masepos-app npm run db:init
```

### View resource usage
```bash
docker stats
```

## Environment Variables

Create a `.env.docker.local` file (git-ignored) with your configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | pos_user | Database user (Postgres superuser) |
| `DB_PASSWORD` | pospassword | Database password |
| `DB_DATABASE` | jimmy_pos | Database name |
| `JWT_SECRET` | - | **CHANGE THIS!** JWT signing key |
| `JWT_EXPIRES_IN` | 8h | JWT token expiration |
| `PAYFAST_SANDBOX` | true | Use PayFast sandbox (set false for production) |
| `NODE_ENV` | production | Node environment |

## Troubleshooting

### App won't connect to database
```bash
# Check if PostgreSQL is healthy
docker-compose ps

# View PostgreSQL logs
docker-compose logs postgres

# Verify connectivity from app container
docker exec masepos-db psql -U pos_user -d jimmy_pos -c "SELECT 1"
```

### Port 3000 or 80 already in use
Edit `docker-compose.yml` and change the port mapping:
```yaml
services:
  app:
    ports:
      - "3001:3000"  # Change 3000 to different port
  nginx:
    ports:
      - "8080:80"    # Change 80 to different port
```

### Database initialization failed
Check the schema file exists at `./db/schema.postgres.sql`:
```bash
ls -la db/schema.postgres.sql
```

### Container keeps restarting
Check the logs for errors:
```bash
docker-compose logs app
```

### Nginx 502 Bad Gateway errors
- Ensure app container is running: `docker-compose ps`
- Check app logs: `docker-compose logs app`
- Verify app is listening on port 3000

## Production Deployment

For production use:

1. **Change JWT Secret**
   ```bash
   JWT_SECRET=your-very-long-random-secret-key-min-32-chars
   ```

2. **Use Strong Database Password**
   ```bash
   DB_PASSWORD=very-strong-password-min-16-chars
   ```

3. **Disable PayFast Sandbox**
   ```bash
   PAYFAST_SANDBOX=false
   ```

4. **Set up SSL/TLS**
   - Add SSL certificates to nginx volume
   - Update `nginx-docker.conf` to handle HTTPS
   - Uncomment or configure port 443

5. **Update NODE_ENV**
   ```bash
   NODE_ENV=production
   ```

6. **Enable resource limits** in docker-compose.yml
   ```yaml
   services:
     app:
       deploy:
         resources:
           limits:
             cpus: '2'
             memory: 1G
   ```

## Database Backups

### Backup the database
```bash
docker exec masepos-db pg_dump -U pos_user jimmy_pos > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restore from backup
```bash
docker exec -i masepos-db psql -v ON_ERROR_STOP=1 -U pos_user jimmy_pos < backup_20260506_142000.sql
```

## Network

The services communicate via the `pos-network` Docker bridge network:
- App connects to `postgres:5432`
- Nginx connects to `app:3000`
- All containers can be accessed internally by service name

## Volumes

Persistent data is stored in named Docker volumes:
- `postgres_data` - Database files
- `nginx_cache` - Nginx cache
- `nginx_logs` - Nginx logs

View volumes:
```bash
docker volume ls | grep masepos
```

## Development Tips

### Run commands in app container
```bash
docker exec masepos-app npm run db:init
docker exec masepos-app npm run test:unit
```

### Build image with custom tags
```bash
docker build -t masepos:v1.0 .
```

### Push to registry (e.g., Docker Hub)
```bash
docker tag masepos:v1.0 yourusername/masepos:v1.0
docker push yourusername/masepos:v1.0
```

## Support

For issues or questions, check the logs first:
```bash
docker-compose logs -f
```

Then review the application logs in `./logs/` directory.
