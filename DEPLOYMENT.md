# Docker deployment on Oracle Cloud

The production stack contains two containers:

- `app`: the Node/Express application with SQLite data and persistent user sessions stored in a named volume.
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

User sessions are stored in the same SQLite database and survive container rebuilds and restarts. Keep the existing `SESSION_SECRET` unchanged during deployments; changing it intentionally signs everybody out.

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

## Read-only database console

The runtime image includes the SQLite console. Open the live database in read-only mode:

```bash
docker compose exec -e SQLITE_HISTORY=/tmp/.sqlite_history app sqlite3 -readonly -cmd ".headers on" -cmd ".mode column" /data/data.db
```

Useful commands inside the console:

```sql
.tables
.headers on
.mode column
SELECT id, name, email, role FROM users ORDER BY id;
.quit
```

For a shorter command on the VM, add this alias once:

```bash
echo "alias appdb='cd ~/o5my && docker compose exec -e SQLITE_HISTORY=/tmp/.sqlite_history app sqlite3 -readonly -cmd \".headers on\" -cmd \".mode column\" /data/data.db'" >> ~/.bashrc
source ~/.bashrc
```

After that, run `appdb` from any directory.

For intentional database changes, add a separate writable command:

```bash
echo "alias appdb-write='cd ~/o5my && docker compose exec app o5my-db-write'" >> ~/.bashrc
source ~/.bashrc
```

Run `appdb-write` to open the writable console. It creates a timestamped backup such as
`/data/data-before-write-20260804T120000Z.db` before opening the database. Foreign-key checks
are enabled and the console waits briefly instead of immediately failing when the app holds a lock.

Prefer a transaction for manual changes so they can be checked before committing:

```sql
BEGIN IMMEDIATE;
UPDATE users SET nickname = 'New nickname' WHERE id = 1;
SELECT id, name, nickname FROM users WHERE id = 1;
COMMIT;
```

Use `ROLLBACK;` instead of `COMMIT;` if the result is not correct.

## SQLite backup

Create a consistent live backup inside the data volume. The database backup also contains persistent user sessions:

```bash
docker compose exec app node -e "const Database=require('better-sqlite3'); const db=new Database('/data/data.db'); db.backup('/data/data-backup.db').then(() => console.log('backup complete'))"
docker compose cp app:/data/data-backup.db ./data-backup.db
```

Copy the resulting backup to a separate machine or object-storage service.
