# ChallanCast — E-Challan WhatsApp Broadcast System

A full-stack enforcement platform for broadcasting e-challan notices via WhatsApp to vehicle owners. Includes a high-end web dashboard and a Telegram bot interface.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/challan-broadcast run dev` — run the frontend (port 23089)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- WhatsApp: @whiskeysockets/baileys
- Telegram: node-telegram-bot-api
- Frontend: React + Vite + TailwindCSS v4 + shadcn/ui
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/lib/whatsapp.ts` — Baileys WhatsApp manager
- `artifacts/api-server/src/lib/broadcast.ts` — broadcast engine
- `artifacts/api-server/src/lib/telegram-bot.ts` — Telegram bot
- `artifacts/api-server/src/lib/csv-store.ts` — in-memory CSV session store
- `artifacts/api-server/uploads/` — CSV and APK uploads
- `artifacts/api-server/sessions/` — WhatsApp session persistence
- `artifacts/challan-broadcast/src/pages/` — Dashboard, Broadcast, History pages

## Architecture decisions

- WhatsApp session persists to disk via `useMultiFileAuthState` in `artifacts/api-server/sessions/` — survives server restarts
- CSV data is stored in-memory per session ID; session IDs are UUIDs passed from upload → broadcast
- APK files are stored to disk; only one APK is kept active at a time (old ones deleted on new upload)
- Broadcast runs async with 1.5s delay between messages to avoid WhatsApp rate limiting
- Telegram bot and web UI share the same broadcast engine state via EventEmitter

## Product

- **Web Dashboard**: Connect WhatsApp via QR code, view live connection status and broadcast progress
- **Broadcast Control**: Upload CSV (vehicle_no + mobile columns), upload APK, configure e-challan template, start/stop broadcasts with live counter
- **History**: View all past broadcast sessions with sent/failed stats and success rates
- **Telegram Bot**: Full bot interface — upload CSV via document, upload APK, wizard-style broadcast config, live progress updates, stop command

## Telegram Bot Commands

- `/start` — show help
- `/status` — WhatsApp connection status
- `/connect` — connect WhatsApp (sends QR as photo)
- `/disconnect` — disconnect WhatsApp
- `/upload_csv` — prompt to send CSV file
- `/upload_apk` — prompt to send APK file
- `/broadcast` — start broadcast wizard (challan no → violation → amount → confirm)
- `/stop` — stop active broadcast
- `/progress` — check broadcast progress
- `/history` — view last 5 broadcasts
- `/cancel` — cancel current wizard

## User preferences

- High-end dark UI with teal/slate color scheme
- Dense, information-rich layout
- Real-time polling for WhatsApp status and broadcast progress

## Gotchas

- WhatsApp QR expires after ~20s of inactivity — server auto-reconnects and generates a new one
- CSV must have columns containing "vehicle" (or "car") and "mobile" (or "phone") — flexible column name detection
- APK files over Telegram are limited to 50MB by Telegram's Bot API
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing openapi.yaml

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
