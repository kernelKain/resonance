# Deploy Resonance (Oracle Always Free VM)

Nothing stays on your laptop. One Ubuntu VM runs Next.js, the filesystem MCP, and TrueForge. Cloudflare Tunnel (free) is the public HTTPS URL. TrueForge and MCP are bound to localhost / the Docker network only.

**Requirements**

- Oracle Cloud Always Free ARM VM (Ampere A1, **2 OCPU / 12 GB**, Ubuntu 24.04)
- `OPENROUTER_API_KEY` and `DAYTONA_API_KEY`
- Optional: a Cloudflare account for a stable `https://` hostname

Do not publish ports `8790` or `8792`. The compose file already maps the UI as `127.0.0.1:43123` only.

---

## 1. Create the VM

1. [Oracle Cloud](https://cloud.oracle.com) → Compute → Create instance.
2. Image: **Ubuntu 24.04**.
3. Shape: **VM.Standard.A1.Flex**, 2 OCPU, 12 GB RAM.
4. Add your SSH public key.
5. You do **not** need ingress for 80/443 if you use a Cloudflare Tunnel.

If ARM capacity is exhausted, try Mumbai, Hyderabad, Phoenix, or Chicago.

```bash
ssh ubuntu@YOUR_VM_IP
```

---

## 2. Install Docker and the repo

```bash
curl -fsSL https://raw.githubusercontent.com/kernelKain/resonance/main/deploy/install-vm.sh | sudo bash
```

Or clone first:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/kernelKain/resonance.git /opt/resonance
sudo bash /opt/resonance/deploy/install-vm.sh
```

---

## 3. Secrets

```bash
sudo nano /opt/resonance/.env
```

Set at least:

```bash
OPENROUTER_API_KEY=...
DAYTONA_API_KEY=...
```

Leave `TRUEFORGE_BASE_URL` and `MCP_*` as in `.env.example`. Compose overrides them with Docker DNS names (`http://trueforge:8790`, `http://mcp:8792`).

---

## 4. Start the stack

```bash
sudo systemctl start resonance-compose
sudo systemctl status resonance-compose
cd /opt/resonance && sudo docker compose ps
curl -sS http://127.0.0.1:43123/api/health
```

The first build on ARM takes several minutes. `bootstrap` runs once TrueForge and MCP are healthy; it registers the `resonance` agent, Exa, the filesystem MCP, and Daytona. The UI waits until that finishes.

Reboot: `resonance-compose.service` is enabled, so the stack comes back.

Useful commands:

```bash
cd /opt/resonance
sudo docker compose logs -f --tail=100 web mcp trueforge bootstrap
sudo docker compose run --rm bootstrap          # re-register agents
sudo systemctl restart resonance-compose
```

---

## 5. Public URL (Cloudflare Tunnel)

Install `cloudflared` **on the VM host** (not inside Compose). Point it at the loopback UI.

**Architecture:** Oracle ARM is `arm64`. On AMD, use `amd64`.

```bash
ARCH="$(dpkg --print-architecture)"   # arm64 or amd64
curl -fsSL -o /tmp/cloudflared.deb \
  "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
sudo dpkg -i /tmp/cloudflared.deb
```

Create a **remotely managed tunnel** in Cloudflare Zero Trust → Networks → Tunnels → Create → Docker/token. Copy the token into `/opt/resonance/.env`:

```bash
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

In the tunnel’s public hostname, set the service URL to:

```text
http://127.0.0.1:43123
```

Then:

```bash
sudo cp /opt/resonance/deploy/systemd/cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

Turn on **Cloudflare Access** (email one-time PIN, free) on that hostname. TrueForge local mode has no login; the tunnel URL would otherwise be an open bill for OpenRouter and Daytona.

Optional: run the tunnel as a Compose sidecar instead (`sudo docker compose --profile tunnel up -d`). If you do that, the Cloudflare hostname service URL must be `http://web:43123`, not localhost.

---

## 6. Smoke check

1. Open `https://your-hostname` (Access PIN if you enabled it).
2. Header **Dev** → health dots for TrueForge, MCP, and agent should be on.
3. **Load demo dataset** → **Run Analysis** once so Daytona can install sklearn off-camera.

---

## Native systemd (no Docker)

Use this only if you do not want Docker. Install **Node.js 22** (TrueForge requires ≥ 22.14):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo git clone https://github.com/kernelKain/resonance.git /opt/resonance
cd /opt/resonance
sudo cp .env.example .env
sudo nano .env          # keys; keep TRUEFORGE_BASE_URL=http://127.0.0.1:8790
sudo npm ci
sudo npm run build
sudo mkdir -p /opt/resonance/data
sudo cp deploy/systemd/resonance-mcp.service \
        deploy/systemd/resonance-trueforge.service \
        deploy/systemd/resonance-bootstrap.service \
        deploy/systemd/resonance-web.service \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now resonance-mcp resonance-trueforge
sudo systemctl start resonance-bootstrap
sudo systemctl enable --now resonance-web
```

Then the same Cloudflare Tunnel to `http://127.0.0.1:43123`.

---

## What this does not host

| Piece | Where it lives |
| --- | --- |
| MiniMax / DeepSeek | OpenRouter (API key, usage billed or free-quota) |
| `cluster.py` k-means | Daytona sandbox (API key) |
| Product research | Exa MCP (`https://mcp.exa.ai/mcp`) |

The VM only runs the UI, filesystem MCP, and TrueForge harness.
