# Strix Deployment Plan

## 1. Homelab Infrastructure

### Hardware

- Raspberry Pi 5 homelab server
- OpenMediaVault installed for NAS management
- Pi connected to the team LAN with a stable static IP or reserved DHCP lease

### Network

- `pfSense` firewall configured on the secondary laptop
- WAN traffic blocked to Pi's port `3001`
- LAN allowed access to Pi ports `3001` and `1234`
- `nginx` reverse proxy on the Pi listening on port `80`

### Services

- `FreeLLMAPI` on `localhost:3001`
- `y-websocket` collab server on `localhost:1234`
- `nginx` proxy on `localhost:80`
- `PM2` process manager for service lifecycle

---

## 2. FreeLLMAPI Setup

### Clone and install

```bash
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi
npm install
```

### Environment setup

```bash
cp .env.example .env
node -e "const crypto = require('crypto'); console.log('ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'));" >> .env
```

### Build and run

```bash
npm run build
npm install -g pm2
pm2 start "node server/dist/index.js" --name freellmapi
pm2 startup
pm2 save
```

### Verification

```bash
curl http://localhost:3001/v1/models
```

---

## 3. nginx Configuration

Create an nginx server block like this:

```nginx
server {
    listen 80;
    server_name pi.local;

    location /ai/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
    }

    location /collab/ {
        proxy_pass http://localhost:1234/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Notes

- Use `proxy_buffering off` for streaming AI responses
- Expose `/ai/` and `/collab/` only on the LAN

---

## 4. Developer Environment Configuration

Each team member should set these values in their local `.env` file:

```env
FREELLMAPI_URL=http://192.168.x.x:3001/v1
FREELLMAPI_KEY=freellmapi-your-unified-key-from-dashboard
COLLAB_SERVER_URL=ws://192.168.x.x:1234
```

Replace `192.168.x.x` with the Pi's actual LAN IP.

---

## 5. Monitoring & Health Checks

### FreeLLMAPI

- `pm2 logs freellmapi` for runtime logs
- `pm2 monit` for process metrics
- `curl http://localhost:3001/v1/models` to verify service health

### nginx

- Confirm `http://pi.local/ai/` and `http://pi.local/collab/` are reachable from another LAN machine

### Collab

- Confirm the Yjs server is reachable over WebSocket
- Verify collaborator cursors appear in the editor when two clients connect

---

## 6. Security & Key Management

- Store provider API keys encrypted with AES-256-GCM inside FreeLLMAPI's `.env` and SQLite
- Never commit `.env` files or the encryption key to git
- Keep FreeLLMAPI and collaboration endpoints LAN-only
- Use pfSense rules to block external WAN access to port `3001`

---

## 7. Deployment Checklist

- [ ] Raspberry Pi 5 online and accessible from LAN
- [ ] OpenMediaVault installed and configured
- [ ] `freellmapi` repo cloned and dependencies installed
- [ ] `ENCRYPTION_KEY` generated and added to `.env`
- [ ] `npm run build` successful
- [ ] `pm2` installed and `freellmapi` service running
- [ ] `nginx` configured for `/ai/` and `/collab/`
- [ ] `pfSense` firewall rules set to block WAN access to port `3001`
- [ ] Developer `.env` values set to Pi IP and `COLLAB_SERVER_URL`
- [ ] `curl http://localhost:3001/v1/models` returns a valid response
- [ ] Team can connect to the AI endpoint and collab server from the IDE

---

## 8. Next Step

Once the Pi deployment plan is verified, run the workflow coordinator to confirm readiness and move into Phase 4: integration testing.
