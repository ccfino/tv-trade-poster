# EC2 Deployment Guide (Ubuntu)

TV Trade Poster — Docker deployment on AWS EC2 (Ubuntu 22.04/24.04).

## Architecture

```
Internet
  │
  ├─ :80   → nginx → /            → web:3000   (Next.js dashboard)
  │                  /api/*        → app:3501   (worker API)
  │                  /socket.io/*  → app:3501   (real-time updates)
  │                  /images/*     → app:3501   (image previews)
  │
  └─ :3500 → nginx → app:3500  (image server — Meta API fetches images here)
```

Three containers: `app` (worker), `web` (Next.js dashboard), `nginx` (reverse proxy).

---

## Prerequisites

- EC2 instance running Ubuntu 22.04 or 24.04
- Instance type: `t3.small` (2 vCPU, 2 GB RAM) minimum
- Storage: 20 GB gp3
- An Elastic IP attached (so the public IP doesn't change on reboot)

### EC2 Security Group — Inbound Rules

| Port | Protocol | Source    | Purpose                               |
| ---- | -------- | --------- | ------------------------------------- |
| 22   | TCP      | Your IP   | SSH access                            |
| 80   | TCP      | 0.0.0.0/0 | Dashboard (nginx)                     |
| 3500 | TCP      | 0.0.0.0/0 | Image server (Meta API must reach it) |

> No other ports need to be open. Ports 3000, 3501 stay internal to Docker.

---

## Step 1 — SSH into EC2

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

## Step 2 — System update

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

---

## Step 3 — Install Docker

```bash
# Install Docker
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Let ubuntu user run docker without sudo
sudo usermod -aG docker ubuntu

# Enable Docker to start on boot
sudo systemctl enable docker
sudo systemctl start docker
```

**Log out and back in** for the group change to take effect:

```bash
exit
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

Verify:

```bash
docker --version
docker compose version
```

---

## Step 4 — Generate deploy key and clone repo

```bash
# Generate a deploy key (no passphrase)
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""

# Print the public key
cat ~/.ssh/github_deploy.pub
```

**Copy the output**, then go to GitHub:
**ccfino/tv-trade-poster → Settings → Deploy keys → Add deploy key**
Paste the public key, give it a title like `ec2-ubuntu`, and save.

```bash
# Tell SSH to use this key for github.com
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config

# Test connection
ssh -T git@github.com
# Should say: "Hi ccfino/tv-trade-poster! You've successfully authenticated..."

# Clone
git clone git@github.com:ccfino/tv-trade-poster.git
cd tv-trade-poster
```

---

## Step 5 — Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in these values:

```bash
WEBSOCKET_URL=https://terminal.finosauras.com
SOCKET_TOKEN=<your-jwt-token>

INSTAGRAM_ACCOUNT_ID=<your-account-id>
META_ACCESS_TOKEN=<your-long-lived-token>
META_API_VERSION=v19.0

IMAGE_HOST_TYPE=local
IMAGE_SERVER_PORT=3500
IMAGE_SERVER_PUBLIC_URL=http://<EC2-PUBLIC-IP>:3500

WATERMARK_TEXT=@YourHandle • StockAlerts
LOG_LEVEL=info
PORT=3501
```

> Replace `<EC2-PUBLIC-IP>` with your actual Elastic IP.

---

## Step 6 — Prepare bind-mount files

```bash
touch posts_history.json
mkdir -p output/temp logs
```

---

## Step 7 — Build and start

```bash
docker compose up -d --build
```

First build takes 3-5 minutes (downloads base images, compiles native deps).

Watch logs:

```bash
docker compose logs -f
```

Press `Ctrl+C` to stop following logs (containers keep running).

---

## Step 8 — Verify everything is running

```bash
# All 3 containers should be "Up"
docker compose ps

# Worker API responds
curl http://localhost/api/status

# Image server responds
curl -I http://localhost:3500

# Check resource usage
docker stats --no-stream
```

Open in browser: `http://<EC2-PUBLIC-IP>` — you should see the dashboard.

---

## Step 9 — Auto-start on reboot (systemd)

```bash
sudo tee /etc/systemd/system/tv-trade-poster.service << 'EOF'
[Unit]
Description=TV Trade Poster (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/tv-trade-poster
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=ubuntu
Group=docker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tv-trade-poster
```

Test it:

```bash
# Stop via systemctl
sudo systemctl stop tv-trade-poster

# Start via systemctl
sudo systemctl start tv-trade-poster

# Check status
sudo systemctl status tv-trade-poster
```

---

## Day-to-day commands

### View logs

```bash
cd ~/tv-trade-poster

# All containers
docker compose logs -f

# Just the worker
docker compose logs -f app

# Just nginx
docker compose logs -f nginx
```

### Update to latest code

```bash
cd ~/tv-trade-poster
git pull
docker compose up -d --build
```

### Restart everything

```bash
docker compose restart
```

### Restart just the worker (e.g., after .env change)

```bash
docker compose up -d --force-recreate app
```

### Stop everything

```bash
docker compose down
```

### Enter a container for debugging

```bash
docker compose exec app sh
docker compose exec web sh
```

### Check disk usage

```bash
# Docker images and containers
docker system df

# Clean up old images
docker image prune -f
```

---

## Updating Meta access token

The Meta long-lived token expires every 60 days. When you get a new one:

```bash
cd ~/tv-trade-poster
nano .env
# Update META_ACCESS_TOKEN=<new-token>

docker compose up -d --force-recreate app
```

---

## Troubleshooting

### Container won't start

```bash
# Check logs for the failing container
docker compose logs app
docker compose logs web

# Rebuild from scratch
docker compose down
docker compose up -d --build --force-recreate
```

### "Cannot connect to Meta API" / images not uploading

1. Verify security group has port 3500 open to 0.0.0.0/0
2. Verify `IMAGE_SERVER_PUBLIC_URL` in `.env` matches your Elastic IP
3. Test from outside: `curl http://<EC2-PUBLIC-IP>:3500`

### Out of disk space

```bash
# Clean up old Docker data
docker system prune -af

# Check what's using space
df -h
du -sh ~/tv-trade-poster/output/temp/*
```

### High memory usage

```bash
docker stats --no-stream
```

If the `app` container exceeds 1.5 GB during ffmpeg conversion, upgrade to `t3.medium` (4 GB RAM).

---

## Optional — Swap file (recommended for t3.small)

Adds 2 GB of swap as safety net during peak ffmpeg usage:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify: `free -h` should show 2 GB swap.
