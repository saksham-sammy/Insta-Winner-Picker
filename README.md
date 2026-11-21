# Insta-Winner-Picker — CSPRNG Instagram Giveaway Selector

Reads comments from public Instagram posts or reels, filters qualifying entries, and selects winners using cryptographically secure randomness (Web Crypto `crypto.getRandomValues` with rejection sampling). Used in production by **Suraj Verma Jewellers (`@mr_surajvarma`)** for live audience giveaway draws.

---

## Option 1: Standalone Web App (Recommended)

### 1. Launch
- **Windows:** Double-click `start.bat`
- **Terminal:**
  ```bash
  npm start
  ```
  Opens `http://localhost:3000`.

### 2. Fetch & Cache Comments
1. Paste any post/reel URL (e.g. `https://www.instagram.com/p/DfRxjqKxy8d/`).
2. Click **Fetch All Comments** and approve the session prompt to pull comments into the local disk cache (`data/comments_<shortcode>.json`) for instant reloads.

### 3. Pick a Winner
1. Configure filters: entry mode (unique user vs per-comment), required keyword/hashtag, minimum `@mentions`, excluded accounts, and nested replies.
2. Run the draw and export full audit logs or CSV results.

---

## Option 2: Browser Extension (Manifest V3)

1. Open `chrome://extensions` (or Edge/Brave), enable **Developer mode**, and click **Load unpacked** on this folder.
2. Open any Instagram post in a tab and launch the studio from the extension popup.

---

## Fairness & Security

- **Web Crypto CSPRNG:** Picks winners uniformly using rejection sampling via `crypto.getRandomValues()`.
- **Fair Ordering:** Filters comments *before* user deduplication so a participant's second qualifying comment still counts.
- **Privacy & Safety:** Zero external API tracking. Session tokens stay on your local computer.

---

## 🧪 Testing

Run the automated test suite covering parsing, CSPRNG uniform draw math, API pagination, and server endpoints:

```bash
npm test
```