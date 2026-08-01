# Docker deployment on Oracle Cloud

The production stack contains two containers:

- `app`: the Node/Express application with SQLite stored in a named volume.
- `caddy`: the public reverse proxy with automatic HTTPS certificates.

Only ports 80 and 443 are published. Port 5000 remains inside the Compose network.

## 1. Prepare the VM

Create an Ubuntu 24.04 VM and allow inbound TCP ports 22, 80, and 443 in its OCI network security rules. Restrict port 22 to your own public IP when possible.

Install Docker Engine and the Compose plugin using Docker's official Ubuntu repository:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc" | sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in after adding yourself to the `docker` group, then verify:

```bash
docker version
docker compose version
```

## 2. Configure DNS and secrets

Create an `A` record for the application domain pointing to the VM's reserved public IP. Clone this repository onto the VM, then run:

```bash
cp .env.production.example .env.production
openssl rand -hex 32
nano .env.production
chmod 600 .env.production
```

Set `APP_DOMAIN` to the bare hostname and `APP_URL` to its HTTPS URL. Paste the generated value into `SESSION_SECRET` and configure the SMTP credentials.

## 3. Start the stack

```bash
docker compose --env-file .env.production up -d --build
docker compose ps
docker compose logs -f app
```

Caddy requests the TLS certificate after the domain resolves and ports 80 and 443 are reachable.

## Updates

```bash
git pull --ff-only
docker compose --env-file .env.production up -d --build
docker image prune -f
```

## Useful commands

```bash
docker compose logs -f
docker compose restart app
docker compose exec app node --version
docker compose down
```

Do not run `docker compose down -v`: the `-v` option deletes the SQLite and Caddy volumes.

## SQLite backup

Create a consistent live backup inside the data volume:

```bash
docker compose exec app node -e "const Database=require('better-sqlite3'); const db=new Database('/data/data.db'); db.backup('/data/data-backup.db').then(() => console.log('backup complete'))"
docker compose cp app:/data/data-backup.db ./data-backup.db
```

Copy the resulting backup to a separate machine or object-storage service.
