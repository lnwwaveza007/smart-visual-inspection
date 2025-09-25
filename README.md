## Smart Visual Inspection (SVI)

Smart Visual Inspection is a Next.js app for recording short sessions with a camera, annotating items with time-stamped remarks, and saving the resulting video and metadata either locally or to Google Drive. Records are stored in MongoDB and can be viewed in a report or table view.

### Tech stack

- Next.js 15 (App Router) with React 19
- TypeScript, Tailwind CSS (v4 via `@tailwindcss/postcss`)
- MongoDB (official Node driver)
- Google Identity Services + Google Drive API (token-based, no server OAuth flow)

---

## Quick start

Prereqs:

- Node.js 18.18+ (or 20+ recommended)
- npm (comes with Node)
- Docker (optional, for local MongoDB)

1) Install dependencies

```bash
npm ci
```

2) Configure environment

Create `.env.local` at the repo root and set at least the Google Client ID. Mongo URI is optional (defaults exist but local override is recommended).

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id
# Recommended for local dev with the included docker-compose:
# MONGO_URI=mongodb://admin:secret123@localhost:11802

# Optional: only needed if proxying to an external upstream for records (not used by default)
# NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

3) (Optional) Start local MongoDB

The repo includes `database/docker-compose.yml` exposing Mongo on port 11802 with user `admin` / `secret123`.

```bash
docker compose -f database/docker-compose.yml up -d
```

Then set `MONGO_URI=mongodb://admin:secret123@localhost:11802` in `.env.local`.

4) Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

---

## Core features

- Record sessions from a camera preview and annotate items with remarks at time offsets
- Save video either locally (to `public/videos`) or to Google Drive (user chooses folder)
- Persist session metadata in MongoDB (collection: `records`)
- Replay videos and browse annotations in `/report` and `/report-table`

---

## Pages & flows

### `/record`

- Start/stop a recording session; app tries `MediaRecorder` with WebM codecs
- Add items during the session and attach remarks; timestamps are relative to session start
- Choose storage: Local or Google Drive
  - Local: video saved via `POST /api/upload` to `public/videos/{sessionId}.{ext}`
  - Drive: user signs in with Google (token stored in an httpOnly cookie) and selects a folder; upload is handled server-side
- After stopping, session metadata is merged into MongoDB via `PUT /api/records`

### `/report`

- Select a record to view its video and remark timeline
- If the record used Drive, playback streams through `GET /api/drive/stream?fileId=...` with Range support

### `/report-table`

- Tabular view of all records with counts and links
- Delete a record (also tries to delete the associated video: Drive file if token is present, or local file)

---

## Environment variables

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (required for Drive features): OAuth 2.0 “Web application” client ID from Google Cloud Console.
  - Add Authorized JavaScript origins: `http://localhost:3000` (and your deployed origin)
- `MONGO_URI` (recommended): Mongo connection string used by the server (defaults to a demo URI; override for local/dev/prod)
- `NEXT_PUBLIC_API_BASE_URL` (optional): Upstream API base for server-side proxying. By default, the app uses its own Next.js API routes.

---

## Google Drive integration

Client obtains short-lived access tokens using Google Identity Services and posts them to `POST /api/drive/token`, which stores the token in an httpOnly cookie. Server then:

- Lists folders: `GET /api/drive/list?parentId=<optional>` (folders only)
- Uploads files: `POST /api/drive/upload?name=...&parentId=...` (multipart/related upload to Drive v3)
- Streams media: `GET /api/drive/stream?fileId=...` (passes Range headers for seeking)

To enable Drive features you must set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Without it, local saving still works.

Security notes:

- In development, the cookie is not marked secure. In production, it is `secure` and `sameSite=lax`.

---

## Data model (MongoDB)

Collection: `records`

A record document is keyed by its `_id` (string or ObjectId). Value shape (simplified):

```json
{
  "items": [
    { "name": "Item A", "addedAt": 1234, "remarks": [ { "text": "note", "ts": 2000 } ] }
  ],
  "sessionId": "session-...",
  "videoSource": "local" | "drive",
  "videoExt": "webm" | "mp4",
  "driveFileId": "...",
  "driveWebViewLink": "..."
}
```

Included file `database/mongo_rule.json` describes a stricter schema (not enforced by the app by default).

---

## API reference (internal Next.js routes)

Base: `http://localhost:3000`

### Records

- `GET /api/records` → returns map of records `{ [id]: record }`
- `PUT /api/records` body: full map to upsert/merge; returns latest map
- `DELETE /api/records?id=<id>` → deletes record; also attempts to delete its video

### Local upload

- `POST /api/upload?name=<sessionId>&ext=<webm|mp4>` with raw video body and `Content-Type` set to the video MIME

Example (WebM):

```bash
curl -X POST \
  -H "Content-Type: video/webm" \
  --data-binary @video.webm \
  "http://localhost:3000/api/upload?name=session-123&ext=webm"
```

### Google Drive

- `POST /api/drive/token` { accessToken, expiresInSec } → stores cookie
- `GET /api/drive/status` → `{ authed: boolean }`
- `GET /api/drive/list?parentId=<folderId|omit-for-root>` → `{ folders: [{ id, name }] }`
- `POST /api/drive/upload?name=<file>&parentId=<folderId>` raw file body, `Content-Type` = MIME
- `GET /api/drive/stream?fileId=<id>` → media stream with Range support

---

## Scripts

- `npm run dev` — start Next.js with Turbopack
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — run eslint

---

## Project structure (high level)

- `app/` — App Router pages and API routes
  - `app/record/page.tsx` — recording UI and Drive folder picker
  - `app/report/page.tsx` — viewer with inline playback
  - `app/report-table/page.tsx` — table view with delete
  - `app/api/` — server endpoints (records, upload, drive/*)
- `lib/mongodb.ts` — Mongo connection utilities (uses `MONGO_URI`)
- `public/videos/` — locally saved videos
- `database/docker-compose.yml` — local MongoDB

---

## Troubleshooting

- Camera not starting: check browser permissions and that a camera device is available.
- Drive sign-in button disabled: make sure `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set and your origin is whitelisted in Google Cloud Console.
- Mongo connection issues: verify `MONGO_URI` and that MongoDB is reachable (port 11802 if using the included compose file).
- Video playback from Drive fails or seeks poorly: ensure the Drive cookie is set (use `/api/drive/status`) and the file exists.

---

## License

For internal use or as specified by the repository owner.
