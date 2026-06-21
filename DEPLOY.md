# 部署 — 馬來西亞 VPS（Hostinger）

> **目前線上實況（2026-06-21）**：正式環境跑在 **Hostinger 馬來西亞 VPS（`187.77.133.21`）**，與其他 app（Speech / Plutus / Kairos…）**共置（colocated）**，共用主機上一個 Caddy 反向代理。部署目錄 `/root/splitting-tools`，用 **`docker-compose.yml + docker-compose.colocate.yml`**（colocate 版**不含自己的 Caddy**）。下面 §1–§8 是「從零開一台機」的單機版（自帶 Caddy，用 `prod.yml`）——共置機請改用 §「之後更新」的 colocate 指令。

選址條件（為何不是香港）：

- worker 需要 **開放網路** 連得到 `openrouter.ai`（視覺 LLM）。
- **香港已棄用**：Anthropic 對該地區封鎖，OpenRouter→Anthropic 連不通。改用馬來西亞（Anthropic 開放、延遲可接受）。**選機房前務必先查 LLM 供應商是否開放該地區**。

LLM 呼叫是 server 端（worker → OpenRouter）——使用者只載入你 VPS 的網頁，從不直接碰 OpenRouter。

---

## 0. 部署前（先做）

- [ ] **Rotate OpenRouter API key** — https://openrouter.ai/keys 。舊的 key 出現過在對話 transcript，務必換新。
- [ ] 決定子網域，例如 `split.你的網域.com`（Speech 維持自己的子網域，同一個 domain 不衝突）。

## 1. 開一台香港 VPS

- Ubuntu 22.04 / 24.04 LTS，≥ 2 GB RAM、≥ 2 vCPU、≥ 20 GB 磁碟。
  （LLM 在 OpenRouter 端跑，VPS CPU 負擔輕；但 Next.js build 需要記憶體。）
- 有香港機房的供應商：Vultr（Hong Kong）、阿里雲香港、騰訊雲香港等。

## 2. DNS

- 加一筆 **A record**：`split` → `<VPS_IP>`。
- 等生效：`dig split.你的網域.com`。

## 3. VPS 基礎設定（在 VPS 上）

```sh
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
# 防火牆 — 只開 SSH / HTTP / HTTPS（web、db 的 port 不對外）
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

## 4. 取得程式碼

```sh
git clone https://github.com/changanlee/splitting-tools.git
cd splitting-tools
```

## 5. 建立 `.env`（在 VPS 上，永不進 git）

```sh
cp .env.example .env
chmod 600 .env
```

填入：

```
SPLIT_DOMAIN=split.你的網域.com
OPENROUTER_API_KEY=<剛 rotate 的新 key>
OPENROUTER_SITE_URL=https://split.你的網域.com
OPENROUTER_SITE_NAME=分帳小工具
IP_HASH_SECRET=<執行 openssl rand -hex 24 產生>
POSTGRES_PASSWORD=<一組強密碼>
DATABASE_URL=postgres://postgres:<上面那組密碼>@db:5432/splitting
# web / db 只綁 localhost — 公開流量一律走 Caddy：
WEB_PORT=127.0.0.1:3010
DB_PORT=127.0.0.1:55470
```

## 6. 啟動

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy 首次啟動會自動為 `SPLIT_DOMAIN` 申請 + 安裝 Let's Encrypt HTTPS 憑證。

## 7. 驗證

- `https://split.你的網域.com` → 首頁，網址列有鎖頭（HTTPS）。
- `docker compose logs worker` → 看到 `drizzle migrate complete` / `pg-boss started` / `parseWorker registered`。
- 上傳一張真實收據 → 解析成功 → `llm_costs` 寫入一筆。

## 8. 中國連通性檢查

- 從大陸網路開 `https://split.你的網域.com` — 應能載入。

---

## 之後更新

**共置機（目前線上，馬來西亞）** — 在 `/root/splitting-tools`：

```sh
git fetch origin
# 若 VPS 對 compose 檔有本機改動（如 db healthcheck），先確認 diff 再決定保留/丟棄
git pull --ff-only origin main
docker compose -f docker-compose.yml -f docker-compose.colocate.yml up -d --build
# 驗證（worker 啟動時會自動跑 drizzle migrate）：
docker compose -f docker-compose.yml -f docker-compose.colocate.yml logs --tail=30 worker
# 預期：database reachable → drizzle migrate complete → pg-boss started → parseWorker registered
```

> ⚠️ **絕不要對 caddy 容器下 `docker logs`**：該機 dockerd 開了 live-restore，`docker logs` 撞上 caddy 的 rotating log 會卡死 dockerd goroutine，只能 `systemctl restart docker` 解。只看 `worker` / `web` 的 log。

**單機版（自帶 Caddy）**：

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 備份（有真實使用者後再做）

`db_data` volume 存 Postgres 資料。有使用者後排程 `pg_dump`：

```sh
docker compose exec -T db pg_dump -U postgres splitting > backup-$(date +%F).sql
```

## 架構

```
        https://split.你的網域.com
                  │
            Caddy（80/443，自動 HTTPS）
                  │  內部 compose 網路
                  ▼
   web ──► db ◄── worker ──► openrouter.ai（視覺 LLM）
```

web / db 只綁 `127.0.0.1` + 防火牆只開 80/443/22 → 對外只有 Caddy。
