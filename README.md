# Discord Voice Joiner & 24/7 Voice Controller

A high-performance dashboard and controller for managing multiple Discord accounts in voice channels 24/7 with bulk controls, Lavalink & DAVE E2EE audio engines, automated reconnection, and April 2026 Discord Gateway v10 integrity protocol support.

**Author & Rights Holder:** PARTH TONGSE  
**License:** MIT License (Copyright © 2026 PARTH TONGSE. All rights reserved.)

---

## Key Features

- **24/7 Voice Channel Gateway:** Keep multiple Discord tokens connected seamlessly across voice and stage channels.
- **April 2026 Integrity Protocol:** Authentic client properties emulation (Build 522553) with dynamic fingerprint negotiation (`X-Discord-Fingerprint`) to bypass connection checks.
- **Dual High-Fidelity Audio Engines:**
  - **Direct E2EE Voice Engine:** High-performance direct Opus streaming with End-to-End Encryption (Discord DAVE protocol).
  - **Lavalink v4 Streaming Engine:** Support for external Lavalink nodes with full queue management, seeking, filters, and Spotify integration.
- **Spotify URL & Collection Resolver:** Stream tracks, albums, and playlists directly via auto-resolved audio streams.
- **Interactive Web Terminal & CLI:** Real-time logging, raw command execution, bulk join/leave, mute, deafen, and stream controls.
- **AMOLED & Light Themes:** Crisp, distraction-free UI designed for continuous monitoring.

---

## Quick Start

### Prerequisites
- Node.js 18+ or 20+
- Discord Bot or User Tokens

### 1. Installation
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your configuration options (Audio engine, Spotify API credentials, Lavalink node if applicable).

### 3. Start Application
```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

Open `http://localhost:3000` in your browser.

---

## License & Copyright

Copyright (c) 2026 **PARTH TONGSE**. All rights reserved.  
Licensed under the [MIT License](LICENSE).
