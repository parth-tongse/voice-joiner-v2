import WebSocket from "ws";
import { resolveSpotify, isSpotifyUrl, isSpotifyPlaylistOrAlbum } from "./spotifyResolver";

export interface LavalinkTrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number;
  isStream: boolean;
  position: number;
  title: string;
  uri: string;
  artworkUrl: string | null;
  sourceName: string;
}

export interface LavalinkTrack {
  encoded: string;
  info: LavalinkTrackInfo;
}

export interface PlayerState {
  botToken: string;
  botUsername: string;
  avatar: string | null;
  guildId: string | null;
  channelId: string | null;
  connectedToVoice: boolean;
  playing: boolean;
  paused: boolean;
  volume: number;
  currentTrack: LavalinkTrack | null;
  position: number;
  duration: number;
  queue: LavalinkTrack[];
  history: LavalinkTrack[];
  repeatMode: "off" | "track" | "queue";
  autoplay?: boolean;
  soundMode?: string; // AudioPresetName | "hd" | "boost" | "flat"
  lavalinkSessionId: string | null;
  lavalinkNodeStatus: "connected" | "connecting" | "disconnected" | "error";
  error: string | null;
}

export interface LavalinkNodeStats {
  name: string;
  url: string;
  secure: boolean;
  connected: boolean;
  version?: string;
  players?: number;
  playingPlayers?: number;
  uptime?: number;
  memory?: {
    free: number;
    used: number;
    allocated: number;
  };
  cpu?: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
}

export interface LavalinkConfig {
  name: string;
  url: string;
  auth: string;
  secure: boolean;
}

// ─── Audio Filter Types (Lavalink v4 Filters API) ──────────────────────────
export interface LavalinkEQBand {
  band: number; // 0-14
  gain: number; // -0.25 to 1.0
}

export interface LavalinkFilters {
  volume?: number;
  equalizer?: LavalinkEQBand[];
  karaoke?: { level?: number; monoLevel?: number; filterBand?: number; filterWidth?: number } | null;
  timescale?: { speed?: number; pitch?: number; rate?: number } | null;
  tremolo?: { frequency?: number; depth?: number } | null;
  vibrato?: { frequency?: number; depth?: number } | null;
  rotation?: { rotationHz?: number } | null;
  distortion?: { sinOffset?: number; sinScale?: number; cosOffset?: number; cosScale?: number; tanOffset?: number; tanScale?: number; offset?: number; scale?: number } | null;
  channelMix?: { leftToLeft?: number; leftToRight?: number; rightToLeft?: number; rightToRight?: number } | null;
  lowPass?: { smoothing?: number } | null;
}

export type AudioPresetName = "flat" | "hd" | "boost" | "bassboost" | "nightcore" | "vaporwave" | "8d" | "soft" | "earrape" | "pop" | "treble";

// ─── Preset EQ Configurations ──────────────────────────────────────────────
export const PRESET_AUDIO_FILTERS: Record<AudioPresetName, LavalinkFilters> = {
  flat: { equalizer: [] },
  hd: {
    equalizer: [
      { band: 0, gain: 0.08 }, { band: 1, gain: 0.06 }, { band: 2, gain: 0.04 },
      { band: 3, gain: 0.02 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.02 }, { band: 7, gain: 0.02 }, { band: 8, gain: 0.04 },
      { band: 9, gain: 0.06 }, { band: 10, gain: 0.06 }, { band: 11, gain: 0.04 },
      { band: 12, gain: 0.04 }, { band: 13, gain: 0.04 }, { band: 14, gain: 0.06 },
    ],
  },
  boost: {
    equalizer: [
      { band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 },
      { band: 3, gain: 0.15 }, { band: 4, gain: 0.1 }, { band: 5, gain: 0.05 },
      { band: 6, gain: 0.0 }, { band: 7, gain: -0.05 }, { band: 8, gain: 0.05 },
      { band: 9, gain: 0.1 }, { band: 10, gain: 0.12 }, { band: 11, gain: 0.15 },
      { band: 12, gain: 0.2 }, { band: 13, gain: 0.22 }, { band: 14, gain: 0.25 },
    ],
  },
  bassboost: {
    equalizer: [
      { band: 0, gain: 0.6 }, { band: 1, gain: 0.55 }, { band: 2, gain: 0.5 },
      { band: 3, gain: 0.4 }, { band: 4, gain: 0.25 }, { band: 5, gain: 0.1 },
      { band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.0 },
      { band: 9, gain: 0.0 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }, { band: 14, gain: 0.0 },
    ],
  },
  nightcore: {
    timescale: { speed: 1.2, pitch: 1.3, rate: 1.0 },
    equalizer: [
      { band: 0, gain: 0.1 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.05 },
      { band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.0 },
      { band: 9, gain: 0.0 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }, { band: 14, gain: 0.0 },
    ],
  },
  vaporwave: {
    timescale: { speed: 0.85, pitch: 0.8, rate: 1.0 },
    equalizer: [
      { band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 },
      { band: 3, gain: 0.05 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.0 },
      { band: 9, gain: 0.0 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
      { band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }, { band: 14, gain: 0.0 },
    ],
  },
  "8d": {
    rotation: { rotationHz: 0.2 },
    equalizer: [],
  },
  soft: {
    lowPass: { smoothing: 20 },
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.0 },
      { band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.05 }, { band: 7, gain: 0.1 }, { band: 8, gain: 0.1 },
      { band: 9, gain: 0.08 }, { band: 10, gain: 0.06 }, { band: 11, gain: 0.04 },
      { band: 12, gain: 0.02 }, { band: 13, gain: 0.0 }, { band: 14, gain: 0.0 },
    ],
  },
  earrape: {
    equalizer: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 1.0 : 0.5 })),
    distortion: { sinOffset: 0, sinScale: 2.0, cosOffset: 0, cosScale: 2.0, tanOffset: 0, tanScale: 0, offset: 0, scale: 1.0 },
  },
  pop: {
    equalizer: [
      { band: 0, gain: 0.05 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.15 },
      { band: 3, gain: 0.2 }, { band: 4, gain: 0.18 }, { band: 5, gain: 0.12 },
      { band: 6, gain: 0.08 }, { band: 7, gain: 0.05 }, { band: 8, gain: 0.05 },
      { band: 9, gain: 0.08 }, { band: 10, gain: 0.1 }, { band: 11, gain: 0.12 },
      { band: 12, gain: 0.15 }, { band: 13, gain: 0.18 }, { band: 14, gain: 0.2 },
    ],
  },
  treble: {
    equalizer: [
      { band: 0, gain: 0.0 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.0 },
      { band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
      { band: 6, gain: 0.0 }, { band: 7, gain: 0.1 }, { band: 8, gain: 0.2 },
      { band: 9, gain: 0.3 }, { band: 10, gain: 0.35 }, { band: 11, gain: 0.4 },
      { band: 12, gain: 0.45 }, { band: 13, gain: 0.5 }, { band: 14, gain: 0.55 },
    ],
  },
};

export interface LavalinkConfig {
  name: string;
  url: string;
  auth: string;
  secure: boolean;
}

export const DEFAULT_LAVALINK_CONFIG: LavalinkConfig = {
  name: process.env.LAVALINK_NAME || "Local Lavalink (setup)",
  url: (process.env.LAVALINK_HOST || "localhost:2333").trim().replace(/^https?:\/\//, "").replace(/^wss?:\/\//, ""),
  auth: (process.env.LAVALINK_PASSWORD || "youshallnotpass").trim(),
  secure: process.env.LAVALINK_SECURE === "true",
};

export let ACTIVE_LAVALINK_CONFIG: LavalinkConfig = {
  ...DEFAULT_LAVALINK_CONFIG,
};

export const PRESET_LAVALINK_NODES: LavalinkConfig[] = [
  {
    name: "Local Setup (High Performance)",
    url: "localhost:2333",
    auth: "youshallnotpass",
    secure: false,
  },
  {
    name: "LUMINA-V1 (Cloud Fallback)",
    url: "nokia.vexanode.gg:19133",
    auth: "vexanode.cloud",
    secure: false,
  },
  {
    name: "Vexanode Primary",
    url: "node1.lavalink.directory:2333",
    auth: "youshallnotpass",
    secure: false,
  },
  {
    name: "Horizxon Tech",
    url: "v4.lavalink.rocks:443",
    auth: "horizxon.tech",
    secure: true,
  },
];

export function getHttpUrl(): string {
  const proto = ACTIVE_LAVALINK_CONFIG.secure ? "https://" : "http://";
  return `${proto}${ACTIVE_LAVALINK_CONFIG.url}`;
}

export function getWsUrl(): string {
  const proto = ACTIVE_LAVALINK_CONFIG.secure ? "wss://" : "ws://";
  return `${proto}${ACTIVE_LAVALINK_CONFIG.url}`;
}

export function updateLavalinkNodeConfig(newConfig: Partial<LavalinkConfig>) {
  ACTIVE_LAVALINK_CONFIG = {
    ...ACTIVE_LAVALINK_CONFIG,
    ...newConfig,
  };
}

// ─── Search Source Prefixes (itsfizys/Lavalink-Setup plugin-aware) ───────────
// LavaSrc plugin sources:
//   spsearch:   → Spotify search (LavaSrc)
//   amsearch:   → Apple Music search (LavaSrc)
//   dzsearch:   → Deezer search (LavaSrc)
//   ymsearch:   → Yandex Music search (LavaSrc)
// YouTube plugin:
//   ytsearch:   → YouTube search
//   ytmsearch:  → YouTube Music search
// LavaSearch plugin:
//   ytsearch:, amsearch:, dzsearch:, spsearch: (enhanced multi-source)
export type SearchSource = "youtube" | "ytmusic" | "spotify" | "soundcloud" | "applemusic" | "deezer" | "yandex";

function getSearchPrefix(source: SearchSource): string {
  switch (source) {
    case "youtube": return "ytsearch";
    case "ytmusic": return "ytmsearch";
    case "spotify": return "spsearch";
    case "soundcloud": return "scsearch";
    case "applemusic": return "amsearch";
    case "deezer": return "dzsearch";
    case "yandex": return "ymsearch";
    default: return "ytsearch";
  }
}

// Search tracks using Lavalink v4 loadtracks API
export async function searchLavalinkTracks(
  query: string,
  source: SearchSource = "youtube",
  noFallback: boolean = false
): Promise<{ loadType: string; tracks: LavalinkTrack[]; playlistInfo?: { name: string }; error?: string }> {
  let identifier = query.trim();

  // Helper: load from Lavalink by identifier, returns tracks array
  async function _loadTracks(ident: string): Promise<{ loadType: string; tracks: LavalinkTrack[]; playlistInfo?: { name: string } }> {
    const url = `${getHttpUrl()}/v4/loadtracks?identifier=${encodeURIComponent(ident)}`;
    try {
      const resp = await fetch(url, { headers: { Authorization: ACTIVE_LAVALINK_CONFIG.auth } });
      if (!resp.ok) return { loadType: "empty", tracks: [] };
      const json = (await resp.json()) as any;
      let tracks: LavalinkTrack[] = [];
      let playlistInfo: { name: string } | undefined = undefined;
      if (json.loadType === "search" && Array.isArray(json.data)) {
        tracks = json.data;
      } else if (json.loadType === "track" && json.data) {
        tracks = [json.data];
      } else if (json.loadType === "playlist" && json.data?.tracks) {
        tracks = json.data.tracks;
        if (json.data?.info?.name) playlistInfo = { name: json.data.info.name };
      }
      return { loadType: json.loadType || "empty", tracks, playlistInfo };
    } catch {
      return { loadType: "empty", tracks: [] };
    }
  }

  // 1. Direct URL — pass as-is (Lavalink handles YouTube, SoundCloud, Apple Music, Deezer, Spotify URLs)
  if (identifier.startsWith("http://") || identifier.startsWith("https://")) {
    const res = await _loadTracks(identifier);
    if (res.tracks.length > 0) return res;
    // If URL failed, fall through to search-based fallback
  }

  // 2. Source-prefixed queries (e.g. "scsearch:x", "dzsearch:x", "amsearch:x")
  const knownPrefixes = ["ytsearch:", "ytmsearch:", "scsearch:", "spsearch:", "amsearch:", "dzsearch:", "ymsearch:", "soundcloud:", "sc:", "spotify:"];
  const hasPrefix = knownPrefixes.some((p) => identifier.toLowerCase().startsWith(p));

  // 3. SoundCloud source
  if (source === "soundcloud" || identifier.includes("soundcloud.com/") || identifier.includes("on.soundcloud.com/")) {
    let cleanSc = identifier
      .replace(/^soundcloud:\s*/i, "")
      .replace(/^sc:\s*/i, "")
      .replace(/^scsearch:\s*/i, "");
    let scIdent = (cleanSc.startsWith("http://") || cleanSc.startsWith("https://")) ? cleanSc : `scsearch:${cleanSc}`;
    const res = await _loadTracks(scIdent);
    if (res.tracks.length > 0) return res;
    if (noFallback) return { loadType: "empty", tracks: [], error: "No tracks found on SoundCloud (Pure SoundCloud mode: no fallback used)." };
  }

  // 4. Apple Music source (LavaSrc plugin: amsearch:)
  if (source === "applemusic") {
    if (!identifier.startsWith("http")) {
      const res = await _loadTracks(`amsearch:${identifier}`);
      if (res.tracks.length > 0) return res;
    }
  }

  // 5. Deezer source (LavaSrc plugin: dzsearch:)
  if (source === "deezer") {
    if (!identifier.startsWith("http")) {
      const res = await _loadTracks(`dzsearch:${identifier}`);
      if (res.tracks.length > 0) return res;
    }
  }

  // 6. Yandex Music source (LavaSrc plugin: ymsearch:)
  if (source === "yandex") {
    if (!identifier.startsWith("http")) {
      const res = await _loadTracks(`ymsearch:${identifier}`);
      if (res.tracks.length > 0) return res;
    }
  }

  // 7. YouTube Music source (YouTube Plugin: ytmsearch:)
  if (source === "ytmusic") {
    if (!identifier.startsWith("http")) {
      const res = await _loadTracks(`ytmsearch:${identifier}`);
      if (res.tracks.length > 0) return res;
    }
  }

  // 8. Spotify — try LavaSrc spsearch: first, then fall back to JS resolver
  if (isSpotifyUrl(identifier) || source === "spotify") {
    // Try LavaSrc native Spotify source first (requires LavaSrc plugin on node)
    if (!isSpotifyUrl(identifier)) {
      const spRes = await _loadTracks(`spsearch:${identifier}`);
      if (spRes.tracks.length > 0) return spRes;
    } else {
      // Direct Spotify URL — LavaSrc handles it natively
      const spRes = await _loadTracks(identifier);
      if (spRes.tracks.length > 0) return spRes;
    }
    // JS fallback resolver
    try {
      const entity = await resolveSpotify(identifier);
      if (entity) {
        if (entity.type === "playlist" || entity.type === "album") {
          const tracks: LavalinkTrack[] = entity.tracks.map((t, idx) => ({
            encoded: t.id || `spotify-${idx}`,
            info: {
              identifier: t.id || `spotify-${idx}`,
              isSeekable: true,
              author: t.author,
              length: t.durationMs,
              isStream: false,
              position: 0,
              title: t.title,
              uri: t.url,
              artworkUrl: t.artworkUrl || entity.artworkUrl || null,
              sourceName: "spotify",
            },
          }));
          return { loadType: "playlist", playlistInfo: { name: entity.title }, tracks };
        } else if (entity.type === "track") {
          const term = `${entity.title} ${entity.artist}`.trim();
          const nested = await searchLavalinkTracks(term, "youtube");
          if (nested.tracks.length > 0) {
            nested.tracks[0].info.title = entity.title;
            nested.tracks[0].info.author = entity.artist;
            if (entity.artworkUrl) nested.tracks[0].info.artworkUrl = entity.artworkUrl;
            nested.tracks[0].info.sourceName = "spotify";
            return { loadType: "search", tracks: [nested.tracks[0]] };
          }
          return {
            loadType: "track",
            tracks: [{ encoded: identifier, info: { identifier, isSeekable: true, author: entity.artist, length: entity.durationMs, isStream: false, position: 0, title: entity.title, uri: identifier, artworkUrl: entity.artworkUrl || null, sourceName: "spotify" } }],
          };
        }
      }
    } catch (err: any) {
      console.warn("[Lavalink search] Spotify resolution notice:", err.message);
    }
  }

  // 9. YouTube / generic search fallback — use YouTube Plugin ytsearch:
  if (!identifier.startsWith("http://") && !identifier.startsWith("https://") && !hasPrefix) {
    identifier = `ytsearch:${identifier}`;
  }
  const url = `${getHttpUrl()}/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: ACTIVE_LAVALINK_CONFIG.auth,
      },
    });
    if (resp.ok) {
      const json = (await resp.json()) as any;
      let tracks: LavalinkTrack[] = [];
      let playlistInfo: { name: string } | undefined = undefined;
      if (json.loadType === "search" && Array.isArray(json.data)) {
        tracks = json.data;
      } else if (json.loadType === "track" && json.data) {
        tracks = [json.data];
      } else if (json.loadType === "playlist" && json.data?.tracks) {
        tracks = json.data.tracks;
        if (json.data?.info?.name) {
          playlistInfo = { name: json.data.info.name };
        }
      }

      if (tracks.length > 0) {
        return { loadType: json.loadType || "search", playlistInfo, tracks };
      }
    }
  } catch (err: any) {
    console.warn("[Lavalink search] Primary loadtracks notice:", err.message);
  }

  // 3. AUTOMATIC FALLBACK TO SOUNDCLOUD IF LAVALINK PRIMARY SEARCH FAILED OR YIELDED 0 TRACKS
  try {
    const rawQuery = query.replace(/^ytsearch:/, "").replace(/^scsearch:/, "").trim();
    console.log(`[Lavalink Fallback] Primary search empty. Trying SoundCloud fallback for "${rawQuery}"...`);
    const scUrl = `${getHttpUrl()}/v4/loadtracks?identifier=${encodeURIComponent("scsearch:" + rawQuery)}`;
    const scResp = await fetch(scUrl, {
      headers: { Authorization: ACTIVE_LAVALINK_CONFIG.auth },
    });
    if (scResp.ok) {
      const scJson = (await scResp.json()) as any;
      if (scJson.loadType === "search" && Array.isArray(scJson.data) && scJson.data.length > 0) {
        console.log(`[Lavalink Fallback] Found ${scJson.data.length} SoundCloud fallback tracks!`);
        return { loadType: "search", tracks: scJson.data };
      }
    }
  } catch (scFallbackErr: any) {
    console.warn("[Lavalink search] SoundCloud fallback notice:", scFallbackErr.message);
  }

  return { loadType: "empty", tracks: [], error: "No tracks found matching your search." };
}

// Fetch Node Status & Stats from Lavalink
export async function getLavalinkNodeStatus(): Promise<LavalinkNodeStats> {
  const base: LavalinkNodeStats = {
    name: ACTIVE_LAVALINK_CONFIG.name,
    url: ACTIVE_LAVALINK_CONFIG.url,
    secure: ACTIVE_LAVALINK_CONFIG.secure,
    connected: false,
  };
  try {
    const [infoRes, statsRes] = await Promise.all([
      fetch(`${getHttpUrl()}/v4/info`, {
        headers: { Authorization: ACTIVE_LAVALINK_CONFIG.auth },
      }).catch(() => null),
      fetch(`${getHttpUrl()}/v4/stats`, {
        headers: { Authorization: ACTIVE_LAVALINK_CONFIG.auth },
      }).catch(() => null),
    ]);
    if (infoRes && infoRes.ok) {
      base.connected = true;
      const info = (await infoRes.json().catch(() => ({}))) as any;
      base.version = info.version?.semver || "4.2.2";
    }
    if (statsRes && statsRes.ok) {
      const stats = (await statsRes.json().catch(() => ({}))) as any;
      base.players = stats.players || 0;
      base.playingPlayers = stats.playingPlayers || 0;
      base.uptime = stats.uptime || 0;
      base.memory = stats.memory;
      base.cpu = stats.cpu;
    }
  } catch {
    base.connected = false;
  }
  return base;
}

export class LavalinkPlayer {
  public botToken: string;
  public botUsername: string = "Unknown";
  public avatar: string | null = null;
  public userId: string | null = null;
  public guildId: string | null = null;
  public channelId: string | null = null;
  public voiceSessionId: string | null = null;
  public voiceServer: { token: string; endpoint: string; guild_id: string } | null = null;
  public sessionId: string | null = null;
  public nodeStatus: "connected" | "connecting" | "disconnected" | "error" = "disconnected";
  public currentTrack: LavalinkTrack | null = null;
  public queue: LavalinkTrack[] = [];
  public history: LavalinkTrack[] = [];
  public repeatMode: "off" | "track" | "queue" = "off";
  public autoplay: boolean = true;
  public soundMode: AudioPresetName = "hd";
  public currentFilters: LavalinkFilters = {};
  public playing: boolean = false;
  public paused: boolean = false;
  public volume: number = 100;
  public position: number = 0;
  public duration: number = 0;
  public error: string | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = true;
  private logCallback?: (level: "info" | "success" | "warn" | "error", msg: string) => void;

  constructor(
    botToken: string,
    botUsername: string,
    userId: string | null,
    avatar: string | null,
    logCallback?: (level: "info" | "success" | "warn" | "error", msg: string) => void
  ) {
    this.botToken = botToken;
    this.botUsername = botUsername;
    this.userId = userId;
    this.avatar = avatar;
    this.logCallback = logCallback;
  }

  private log(level: "info" | "success" | "warn" | "error", message: string) {
    if (this.logCallback) {
      this.logCallback(level, `[Lavalink:LUMINA] ${message}`);
    }
  }

  public updateBotInfo(username: string, userId: string | null, avatar: string | null) {
    this.botUsername = username;
    this.userId = userId;
    this.avatar = avatar;
    if (this.nodeStatus === "disconnected" && this.userId) {
      this.connect();
    }
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const effectiveUserId = this.userId || "123456789012345678";
    this.nodeStatus = "connecting";
    this.shouldReconnect = true;
    try {
      const wsUrl = `${getWsUrl()}/v4/websocket`;
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "User-Id": effectiveUserId,
          "Client-Name": "DiscordVoiceJoiner/Lumina",
        },
      });

      this.ws.on("open", () => {
        this.log("info", `Connected to WebSocket node ${ACTIVE_LAVALINK_CONFIG.name}`);
      });

      this.ws.on("message", (raw: WebSocket.Data) => {
        try {
          const packet = JSON.parse(raw.toString());
          const { op, sessionId, state, type, reason, exception } = packet;

          // Opcode: ready
          if (op === "ready") {
            this.sessionId = sessionId;
            this.nodeStatus = "connected";
            this.error = null;
            this.log("success", `Lavalink session initialized (Session ID: ${sessionId})`);
            // If voice credentials already present for a guild, sync voice immediately
            if (this.guildId && this.channelId && this.voiceSessionId && this.voiceServer?.endpoint) {
              this.syncVoiceToLavalink();
            }
          }

          // Opcode: playerUpdate
          if (op === "playerUpdate") {
            if (state) {
              this.position = state.position || 0;
            }
          }

          // Opcode: event
          if (op === "event") {
            if (type === "TrackStartEvent") {
              this.playing = true;
              this.paused = false;
              this.log("success", `Now playing: "${this.currentTrack?.info.title || "Track"}" in voice channel`);
            } else if (type === "TrackEndEvent") {
              if (reason === "finished") {
                this.handleTrackEnd();
              } else if (reason === "loadFailed") {
                this.log("warn", "Current track load failed. Skipping to next song...");
                this.handleTrackEnd();
              }
            } else if (type === "TrackExceptionEvent") {
              this.log("warn", `Track playback exception: ${exception?.message || "Unknown error"}`);
            }
          }
        } catch (err: any) {
          console.error("Lavalink WS message error:", err);
        }
      });

      this.ws.on("error", (err: Error) => {
        this.error = err.message;
        this.nodeStatus = "error";
        this.log("error", `Lavalink connection error: ${err.message}`);
      });

      this.ws.on("close", (code: number) => {
        this.nodeStatus = "disconnected";
        this.ws = null;
        if (this.shouldReconnect) {
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, 5000);
        }
      });
    } catch (err: any) {
      this.nodeStatus = "error";
      this.error = err.message;
      this.log("error", `Failed initiating Lavalink connection: ${err.message}`);
    }
  }

  // Switch node on the fly
  public reconnectWithNewNode() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.sessionId = null;
    this.nodeStatus = "disconnected";
    this.connect();
  }

  // Handle Discord Gateway Voice State Update
  public updateVoiceState(voiceSessionId: string, guildId: string | null, channelId: string | null) {
    this.voiceSessionId = voiceSessionId;
    this.guildId = guildId;
    this.channelId = channelId;
    if (!channelId) {
      // Left channel, stop playback
      this.playing = false;
      this.currentTrack = null;
    } else if (this.voiceServer?.endpoint && this.sessionId) {
      this.syncVoiceToLavalink();
    }
  }

  // Handle Discord Gateway Voice Server Update
  public updateVoiceServer(token: string, endpoint: string | null, guildId: string) {
    if (!endpoint) {
      this.log("warn", "Voice server endpoint allocating by Discord gateway...");
      return;
    }
    const cleanEndpoint = endpoint.replace(/:\d+$/, "");
    this.voiceServer = { token, endpoint: cleanEndpoint, guild_id: guildId };
    if (this.voiceSessionId && this.sessionId && this.channelId) {
      this.syncVoiceToLavalink();
    }
  }

  // Sync Discord voice tokens into Lavalink player (Lavalink v4 requires all 4 fields)
  public async syncVoiceToLavalink(): Promise<boolean> {
    if (
      !this.sessionId ||
      !this.guildId ||
      !this.channelId ||
      !this.voiceSessionId ||
      !this.voiceServer?.endpoint ||
      !this.voiceServer?.token
    ) {
      return false;
    }
    try {
      const cleanEndpoint = this.voiceServer.endpoint.replace(/:\d+$/, "");
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
      const payload = {
        voice: {
          token: this.voiceServer.token,
          endpoint: cleanEndpoint,
          sessionId: this.voiceSessionId,
          channelId: this.channelId,
        },
      };
      const resp = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        this.log("info", `Lavalink voice gateway synced for Guild ${this.guildId} (Channel ${this.channelId})`);
        return true;
      } else {
        const errText = await resp.text().catch(() => "");
        this.log("warn", `Voice sync warning (${resp.status}): ${errText}`);
        return false;
      }
    } catch (err: any) {
      this.log("error", `Exception syncing voice to Lavalink: ${err.message}`);
      return false;
    }
  }

  // Direct play from SoundCloud without any fallback command
  public async playSoundCloudDirect(
    queryOrUrl: string,
    mode: "now" | "queue" = "now"
  ) {
    this.log("info", `[SoundCloud Pure Command] Playing via SoundCloud without fallback: "${queryOrUrl}"`);
    return this.play(queryOrUrl, mode, "soundcloud", true);
  }

  // Play a track (or search query)
  public async play(
    trackOrQuery: string | LavalinkTrack,
    mode: "now" | "queue" = "now",
    source: SearchSource = "youtube",
    noFallback: boolean = false
  ): Promise<{
    success: boolean;
    track?: LavalinkTrack;
    queued?: boolean;
    playlist?: { title: string; count: number };
    error?: string;
  }> {
    if (!this.guildId || !this.channelId) {
      return {
        success: false,
        error: "Bot is not in any voice channel! Please join the bot to a voice channel first via Dashboard.",
      };
    }
    if (!this.sessionId) {
      this.connect();
      // Wait up to 3s for session ready
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.sessionId) break;
      }
    }
    if (!this.sessionId) {
      return {
        success: false,
        error: `Lavalink session not ready. Check if ${ACTIVE_LAVALINK_CONFIG.name} (${ACTIVE_LAVALINK_CONFIG.url}) is reachable.`,
      };
    }

    // Wait up to 3s for Discord Voice server handshake if credentials pending
    if (!this.voiceServer?.endpoint || !this.voiceSessionId) {
      this.log("info", "Waiting for Discord voice server gateway handshake before playing...");
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.voiceServer?.endpoint && this.voiceSessionId) break;
      }
    }

    let targetTrack: LavalinkTrack | null = null;
    let playlistMeta: { title: string; count: number } | undefined = undefined;

    if (typeof trackOrQuery === "string") {
      const searchRes = await searchLavalinkTracks(trackOrQuery, source);
      if (searchRes.tracks.length === 0) {
        return { success: false, error: searchRes.error || "No songs found matching your search." };
      }

      if (searchRes.loadType === "playlist" && searchRes.tracks.length > 1) {
        const plName = searchRes.playlistInfo?.name || "Spotify Playlist";
        playlistMeta = { title: plName, count: searchRes.tracks.length };

        if (this.voiceServer?.token && this.voiceServer?.endpoint && this.voiceSessionId && this.channelId) {
          await this.syncVoiceToLavalink();
        }

        if (this.playing && mode === "queue") {
          this.queue.push(...searchRes.tracks);
          this.log("info", `Queued playlist "${plName}" (${searchRes.tracks.length} tracks added to queue)`);
          return { success: true, queued: true, playlist: playlistMeta };
        } else {
          targetTrack = searchRes.tracks[0];
          this.queue.push(...searchRes.tracks.slice(1));
          this.log(
            "info",
            `Loaded playlist "${plName}" (${searchRes.tracks.length} tracks). Starting playback of "${targetTrack.info.title}"`
          );
        }
      } else {
        targetTrack = searchRes.tracks[0];
      }
    } else {
      const anyObj = trackOrQuery as any;
      if (anyObj.info) {
        targetTrack = anyObj;
      } else {
        targetTrack = {
          encoded: anyObj.id || anyObj.url || "",
          info: {
            identifier: anyObj.id || anyObj.url || "",
            isSeekable: true,
            author: anyObj.author || "Unknown Artist",
            length: anyObj.durationMs || 0,
            isStream: anyObj.source === "stream",
            position: 0,
            title: anyObj.title || "Unknown Title",
            uri: anyObj.url || "",
            artworkUrl: anyObj.artworkUrl || null,
            sourceName: anyObj.source || "youtube",
          },
        };
      }

      // If encoded is missing or is just a URL / ID (e.g. from Direct engine search), resolve Lavalink encoded track
      if (
        !targetTrack.encoded ||
        targetTrack.encoded.startsWith("http") ||
        targetTrack.encoded.length < 40
      ) {
        const queryTerm = targetTrack.info?.uri || `${targetTrack.info?.title} ${targetTrack.info?.author}`.trim();
        const searchRes = await searchLavalinkTracks(queryTerm, source);
        if (searchRes.tracks.length > 0) {
          targetTrack = searchRes.tracks[0];
        }
      }
    }

    if (!targetTrack) {
      return { success: false, error: "Invalid track data" };
    }

    // Ensure voice credentials are synced to Lavalink if complete
    if (this.voiceServer?.token && this.voiceServer?.endpoint && this.voiceSessionId && this.channelId) {
      await this.syncVoiceToLavalink();
    }

    // If currently playing and mode is queue, append to queue
    if (this.playing && mode === "queue") {
      this.queue.push(targetTrack);
      this.log("info", `Added to queue: "${targetTrack.info.title}" (Position #${this.queue.length})`);
      return { success: true, track: targetTrack, queued: true };
    }

    // Play immediately
    try {
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
      const payload: any = {
        track: { encoded: targetTrack.encoded },
        volume: this.volume,
        paused: false,
      };

      // Only attach complete voice credentials to avoid 400 Bad Request
      if (
        this.voiceServer?.token &&
        this.voiceServer?.endpoint &&
        this.voiceSessionId &&
        this.channelId
      ) {
        payload.voice = {
          token: this.voiceServer.token,
          endpoint: this.voiceServer.endpoint.replace(/:\d+$/, ""),
          sessionId: this.voiceSessionId,
          channelId: this.channelId,
        };
      }

      let resp = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // If 400 Bad Request occurred with voice attached, retry with track-only payload
      if (resp.status === 400 && payload.voice) {
        const retryPayload = {
          track: { encoded: targetTrack.encoded },
          volume: this.volume,
          paused: false,
        };
        const retryResp = await fetch(url, {
          method: "PATCH",
          headers: {
            Authorization: ACTIVE_LAVALINK_CONFIG.auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(retryPayload),
        });
        if (retryResp.ok) {
          resp = retryResp;
        }
      }

      if (resp.ok) {
        this.currentTrack = targetTrack;
        this.duration = targetTrack.info.length || 0;
        this.position = 0;
        this.playing = true;
        this.paused = false;
        // Add to history
        this.history.unshift(targetTrack);
        if (this.history.length > 20) {
          this.history.pop();
        }
        this.log("success", `  Started playing: "${targetTrack.info.title}" by ${targetTrack.info.author}`);
        return { success: true, track: targetTrack, queued: false };
      } else {
        const errText = await resp.text().catch(() => "");
        this.log("error", `Lavalink play failed (${resp.status}): ${errText}`);
        return {
          success: false,
          error: `Lavalink play failed (${resp.status}): ${errText || resp.statusText}. Please reconnect the bot to the voice channel and try again.`,
        };
      }
    } catch (err: any) {
      this.log("error", `Exception during play: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  public async pause(): Promise<boolean> {
    if (!this.sessionId || !this.guildId) return false;
    try {
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paused: true }),
      });
      this.paused = true;
      this.log("info", "Playback paused");
      return true;
    } catch {
      return false;
    }
  }

  public async resume(): Promise<boolean> {
    if (!this.sessionId || !this.guildId) return false;
    try {
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paused: false }),
      });
      this.paused = false;
      this.log("info", "Playback resumed");
      return true;
    } catch {
      return false;
    }
  }

  public async stop(): Promise<boolean> {
    if (!this.sessionId || !this.guildId) {
      this.playing = false;
      this.currentTrack = null;
      return true;
    }
    try {
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ track: { encoded: null } }),
      });
      this.playing = false;
      this.currentTrack = null;
      this.position = 0;
      this.log("info", "Playback stopped");
      return true;
    } catch {
      return false;
    }
  }

  public async skip(): Promise<boolean> {
    this.log("info", "Skipping current song...");
    await this.handleTrackEnd();
    return true;
  }

  public async setVolume(volume: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(200, volume));
    this.volume = clamped;
    if (this.sessionId && this.guildId) {
      try {
        const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
        await fetch(url, {
          method: "PATCH",
          headers: {
            Authorization: ACTIVE_LAVALINK_CONFIG.auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ volume: clamped }),
        });
      } catch {}
    }
    return true;
  }

  public async seek(positionMs: number): Promise<boolean> {
    this.position = positionMs;
    if (this.sessionId && this.guildId) {
      try {
        const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}`;
        await fetch(url, {
          method: "PATCH",
          headers: {
            Authorization: ACTIVE_LAVALINK_CONFIG.auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ position: positionMs }),
        });
        return true;
      } catch {}
    }
    return false;
  }

  public setRepeat(mode: "off" | "track" | "queue") {
    this.repeatMode = mode;
    this.log("info", `Repeat mode set to: ${mode}`);
  }

  public setAutoplay(enabled: boolean) {
    this.autoplay = enabled;
    this.log("info", `Autoplay mode: ${enabled ? "ENABLED" : "DISABLED"}`);
  }

  public setSoundMode(mode: AudioPresetName) {
    this.soundMode = mode;
    const filters = PRESET_AUDIO_FILTERS[mode] || PRESET_AUDIO_FILTERS["flat"];
    this.setFilters(filters).catch(() => {});
    this.log("info", `Sound mode applied: ${mode.toUpperCase()}`);
  }

  // ─── Audio Filters API (Lavalink v4 /filters endpoint) ─────────────────────
  public async setFilters(filters: LavalinkFilters): Promise<boolean> {
    this.currentFilters = { ...this.currentFilters, ...filters };
    if (!this.sessionId || !this.guildId) return false;
    try {
      const url = `${getHttpUrl()}/v4/sessions/${this.sessionId}/players/${this.guildId}/filters`;
      const resp = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: ACTIVE_LAVALINK_CONFIG.auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filters),
      });
      if (resp.ok) {
        this.log("info", `Audio filters updated: ${Object.keys(filters).join(", ")}`);
        return true;
      } else {
        const errText = await resp.text().catch(() => "");
        this.log("warn", `Filters API warning (${resp.status}): ${errText}`);
        return false;
      }
    } catch (err: any) {
      this.log("warn", `Filters apply error: ${err.message}`);
      return false;
    }
  }

  public async applyPreset(preset: AudioPresetName): Promise<boolean> {
    const filters = PRESET_AUDIO_FILTERS[preset];
    if (!filters) return false;
    this.soundMode = preset;
    return this.setFilters(filters);
  }

  public async resetFilters(): Promise<boolean> {
    this.currentFilters = {};
    this.soundMode = "flat";
    return this.setFilters(PRESET_AUDIO_FILTERS["flat"]);
  }

  public removeFromQueue(index: number) {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1);
      this.log("info", `Removed "${removed[0]?.info.title}" from queue`);
      return true;
    }
    return false;
  }

  public clearQueue() {
    this.queue = [];
    this.log("info", "Queue cleared");
  }

  public async handleTrackEnd() {
    if (this.repeatMode === "track" && this.currentTrack) {
      await this.play(this.currentTrack, "now");
      return;
    }
    if (this.repeatMode === "queue" && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }
    if (this.queue.length > 0) {
      const nextTrack = this.queue.shift()!;
      await this.play(nextTrack, "now");
    } else if (this.autoplay && this.currentTrack) {
      // Capture track info before async work
      const lastTitle = this.currentTrack.info.title;
      const lastAuthor = this.currentTrack.info.author;
      const lastIdentifier = this.currentTrack.info.identifier;

      try {
        this.log("info", `[Autoplay] Queue ended. Finding next track for "${lastTitle}" by ${lastAuthor}...`);

        // Try SoundCloud search first — works reliably without YouTube bot-check blocks
        const searchQueries = [
          `scsearch:${lastAuthor} ${lastTitle} mix`,
          `scsearch:${lastAuthor} popular songs`,
          `${lastAuthor} popular songs`,  // YouTube fallback
        ];

        let nextTrack: any = null;
        for (const query of searchQueries) {
          if (nextTrack) break;
          try {
            const res = await searchLavalinkTracks(query, query.startsWith("scsearch:") ? "soundcloud" : "youtube");
            const candidate = res.tracks.find(
              (t) =>
                t.info.identifier !== lastIdentifier &&
                t.info.title.toLowerCase() !== lastTitle.toLowerCase() &&
                !this.history.some((h) => h.info.identifier === t.info.identifier)
            ) || res.tracks[0];
            if (candidate && candidate.info.identifier !== lastIdentifier) {
              nextTrack = candidate;
            }
          } catch {}
        }

        if (nextTrack) {
          this.log("info", `[Autoplay] Auto-playing recommended track: "${nextTrack.info.title}"`);
          await this.play(nextTrack, "now");
          return;
        }
      } catch {}
      await this.stop();
    } else {
      await this.stop();
    }
  }

  public getState(): PlayerState {
    return {
      botToken: this.botToken,
      botUsername: this.botUsername,
      avatar: this.avatar,
      guildId: this.guildId,
      channelId: this.channelId,
      connectedToVoice: Boolean(this.channelId && this.guildId),
      playing: this.playing,
      paused: this.paused,
      volume: this.volume,
      currentTrack: this.currentTrack,
      position: this.position,
      duration: this.duration,
      queue: this.queue,
      history: this.history,
      repeatMode: this.repeatMode,
      autoplay: this.autoplay,
      soundMode: this.soundMode,
      lavalinkSessionId: this.sessionId,
      lavalinkNodeStatus: this.nodeStatus,
      error: this.error,
    };
  }

  public destroy() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stop();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
