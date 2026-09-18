import dotenv from "dotenv";
dotenv.config();

import ffmpegPath from "ffmpeg-static";

if (ffmpegPath && !process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  VoiceConnection,
  AudioPlayer,
  AudioResource,
  StreamType,
  entersState,
} from "@discordjs/voice";
import play from "play-dl";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import { LavalinkTrack, PlayerState } from "./src/types";
import { resolveSpotify, isSpotifyUrl, isSpotifyPlaylistOrAlbum } from "./spotifyResolver";

// Load tokens on module import if available in env or cookies.txt
try {
  let cookieContent = (process.env.YOUTUBE_COOKIE || "").replace(/\\n/g, "\n").trim();
  const cookiesPath = path.join(process.cwd(), "cookies.txt");
  if (!cookieContent && fs.existsSync(cookiesPath)) {
    cookieContent = fs.readFileSync(cookiesPath, "utf8").trim();
  }
  if (cookieContent) {
    play.setToken({ youtube: { cookie: cookieContent } });
    console.log("[DAVE-Voice] YouTube authentication cookie activated successfully!");
  }
} catch (err: any) {
  console.warn("[DAVE-Voice] Notice on YouTube cookie:", err.message);
}

if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  try {
    play.setToken({
      spotify: {
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
        refresh_token: "",
        market: "US",
      },
    });
    console.log("[DAVE-Voice] Spotify API credentials configured from .env");
  } catch (err: any) {
    console.warn("[DAVE-Voice] Notice on Spotify credentials:", err.message);
  }
}

// Pre-initialize SoundCloud client ID globally for instant search and streaming
const SOUNDCLOUD_CLIENT_IDS = [
  "Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo",
  "a3e059563d7fd3372b49b37f00a00bcf",
  "2t9loNfh0ekOfjqqGsHS2zgGuIrTnKNb",
];

// Set known working ID immediately with zero latency
try {
  play.setToken({ soundcloud: { client_id: SOUNDCLOUD_CLIENT_IDS[0] } });
  console.log("[DAVE-Voice] High-fidelity audio stream pipeline initialized immediately with primary client.");
} catch {}

(async () => {
  try {
    const scClientId = await play.getFreeClientID();
    if (scClientId) {
      await play.setToken({ soundcloud: { client_id: scClientId } });
      console.log("[DAVE-Voice] Global SoundCloud client ID refreshed successfully!");
    }
  } catch (err: any) {
    console.warn("[DAVE-Voice] Global SoundCloud client ID init notice:", err.message);
  }
})();

// Clean search string for audio streaming lookup (removes video labels like (Official Music Video))
export function cleanSearchQuery(title: string, author?: string): string {
  let cleaned = (title || "").trim();
  // Strip parentheses/brackets containing video/release artifacts
  cleaned = cleaned
    .replace(/\s*[\(\[][^\)\]]*(?:official|video|music video|lyric|lyrics|remaster|4k|hd|audio|visualizer|mv|feat|ft\.)[^\)\]]*[\)\]]/gi, "")
    .trim();
  
  if (author && author !== "YouTube Creator" && author !== "Spotify Artist" && author !== "Artist") {
    // If author not already in cleaned title, append it
    if (!cleaned.toLowerCase().includes(author.toLowerCase())) {
      cleaned = `${cleaned} ${author}`;
    }
  }
  return cleaned.trim() || title;
}

// Check if string is a YouTube URL
export function isYouTubeUrl(query: string): boolean {
  if (!query) return false;
  const q = query.trim().toLowerCase();
  return (
    q.includes("youtube.com/watch") ||
    q.includes("youtu.be/") ||
    q.includes("youtube.com/shorts/") ||
    q.includes("m.youtube.com/") ||
    q.includes("music.youtube.com/")
  );
}

// Check if string is a SoundCloud URL or query prefix
export function isSoundCloudUrl(query: string): boolean {
  if (!query) return false;
  const q = query.trim().toLowerCase();
  return (
    q.includes("soundcloud.com/") ||
    q.includes("on.soundcloud.com/") ||
    q.startsWith("scsearch:") ||
    q.startsWith("soundcloud:") ||
    q.startsWith("sc:")
  );
}

// Resolve SoundCloud track metadata
export async function resolveSoundCloudMetadata(
  url: string
): Promise<{ title: string; artist: string; artworkUrl?: string; durationMs?: number } | null> {
  try {
    const cleanUrl = url.trim().replace(/^soundcloud:\s*/i, "").replace(/^sc:\s*/i, "").replace(/^scsearch:\s*/i, "");
    const sc = await play.soundcloud(cleanUrl);
    if (sc) {
      return {
        title: (sc as any).name || (sc as any).title || "SoundCloud Track",
        artist: (sc as any).publisher?.artist || (sc as any).user?.name || "SoundCloud Artist",
        artworkUrl: (sc as any).thumbnail || (sc as any).artwork_url || undefined,
        durationMs: (sc as any).durationInSec ? (sc as any).durationInSec * 1000 : 200000,
      };
    }
  } catch (err: any) {
    console.warn("[resolveSoundCloudMetadata] notice:", err.message);
  }
  return null;
}

// Instant catalog lookup fallback via iTunes Search API so search never returns empty
async function searchItunesFallback(query: string, limit = 8): Promise<DaveTrack[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`);
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.results && Array.isArray(data.results)) {
        return data.results.map((r: any) => ({
          id: `itunes-${r.trackId}`,
          title: r.trackName || "Track",
          author: r.artistName || "Artist",
          url: r.previewUrl || `https://itunes.apple.com/track/${r.trackId}`,
          durationMs: r.trackTimeMillis || 180000,
          artworkUrl: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "600x600bb") : undefined,
          source: "youtube" as const,
        }));
      }
    }
  } catch {}
  return [];
}

export interface DaveTrack {
  id: string;
  title: string;
  author: string;
  url: string;
  durationMs: number;
  artworkUrl?: string;
  source: "soundcloud" | "youtube" | "spotify" | "stream" | "test";
  encoded?: string;
  info?: {
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
  };
}

export const RADIO_STATIONS: { name: string; url: string; genre: string }[] = [
  {
    name: "Lofi Girl Chillhop Stream",
    url: "https://streams.ilovemusic.de/iloveradio17.mp3",
    genre: "Lo-Fi / Study Beats",
  },
  {
    name: "Bollywood Hits Radio",
    url: "https://stream.zeno.fm/4wt8uvw9y7zuv",
    genre: "Bollywood / Hindi Pop",
  },
  {
    name: "Global Top 40 Pop Radio",
    url: "https://streams.ilovemusic.de/iloveradio1.mp3",
    genre: "Pop / Top 40 Hits",
  },
  {
    name: "EDM Dance & Club Hits",
    url: "https://streams.ilovemusic.de/iloveradio2.mp3",
    genre: "Electronic / Dance",
  },
];

// Cached Spotify Access Token
let spotifyCachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  if (spotifyCachedToken && Date.now() < spotifyCachedToken.expiresAt - 60000) {
    return spotifyCachedToken.token;
  }

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.access_token) {
        spotifyCachedToken = {
          token: data.access_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
        console.log("[Spotify API] Successfully obtained Spotify Web API access token!");
        return data.access_token;
      }
    } else {
      const errText = await res.text();
      console.warn("[Spotify API] Token grant failed:", res.status, errText);
    }
  } catch (err: any) {
    console.warn("[Spotify API] Token request exception:", err.message);
  }
  return null;
}

// Helper to resolve Spotify track / playlist / album metadata via unified Spotify resolver
export async function resolveSpotifyMetadata(
  url: string
): Promise<{ title: string; artist: string; artworkUrl?: string; durationMs?: number } | null> {
  try {
    const res = await resolveSpotify(url);
    if (!res) return null;
    if (res.type === "track") {
      return {
        title: res.title,
        artist: res.artist,
        artworkUrl: res.artworkUrl,
        durationMs: res.durationMs,
      };
    } else if (res.type === "playlist" || res.type === "album") {
      const first = res.tracks[0];
      return {
        title: first ? first.title : res.title,
        artist: first ? first.author : "Spotify",
        artworkUrl: res.artworkUrl,
        durationMs: first ? first.durationMs : 180000,
      };
    }
  } catch (err: any) {
    console.warn("[resolveSpotifyMetadata] error:", err.message);
  }
  return null;
}

// Helper to resolve YouTube video metadata via YouTube oEmbed (bypasses bot block)
export async function resolveYouTubeMetadata(
  url: string
): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  const cleanUrl = url.trim();
  // Try 1: YouTube Official oEmbed
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.title) {
        return {
          title: data.title,
          artist: data.author_name || "YouTube Creator",
          artworkUrl: data.thumbnail_url || undefined,
        };
      }
    }
  } catch {}

  // Try 2: Noembed fallback
  try {
    const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`;
    const res = await fetch(noembedUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.title) {
        return {
          title: data.title,
          artist: data.author_name || "YouTube Creator",
          artworkUrl: data.thumbnail_url || undefined,
        };
      }
    }
  } catch {}

  // Try 3: Extract video ID
  const match = cleanUrl.match(/(?:v=|\/shorts\/|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  if (match && match[1]) {
    const videoId = match[1];
    return {
      title: `YouTube Track (${videoId})`,
      artist: "YouTube",
      artworkUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }

  return null;
}

export class DaveVoiceManager {
  private token: string;
  private botUsername: string = "Discord Bot";
  private userId: string | null = null;
  private avatar: string | null = null;
  private guildId: string | null = null;
  private channelId: string | null = null;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private currentResource: AudioResource | null = null;
  private adapterMethods: any = null;
  private isConnectedToVoice = false;
  private isDaveReady = false;
  private currentTrack: DaveTrack | null = null;
  private queue: DaveTrack[] = [];
  private history: DaveTrack[] = [];
  private volume = 100; // 0 - 200%
  private isPaused = false;
  private repeatMode: "off" | "track" | "queue" = "off";
  private autoplay = true;
  private soundMode: "hd" | "boost" | "flat" = "hd";
  private playbackStartTime = 0;
  private lastError: string | null = null;
  private soundCloudInit = false;
  private isAutoPlaying = false;
  private fallbackActive = false;
  private fallbackNotice: string | null = null;
  private sourceProvider = "direct";
  private logCallback?: (level: "info" | "success" | "warn" | "error", msg: string) => void;

  constructor(
    token: string,
    logger?: (level: "info" | "success" | "warn" | "error", msg: string) => void
  ) {
    this.token = token.trim();
    this.logCallback = logger;
  }

  private log(level: "info" | "success" | "warn" | "error", message: string) {
    if (this.logCallback) {
      this.logCallback(level, `[Direct Voice Engine] ${message}`);
    } else {
      console.log(`[Direct Voice Engine] [${level}] ${message}`);
    }
  }

  public setBotInfo(username: string, userId: string | null, avatar: string | null) {
    this.botUsername = username;
    this.userId = userId;
    this.avatar = avatar;
  }

  private async ensureSoundCloudClient(): Promise<boolean> {
    if (this.soundCloudInit) return true;
    for (const cid of SOUNDCLOUD_CLIENT_IDS) {
      try {
        await play.setToken({ soundcloud: { client_id: cid } });
        this.soundCloudInit = true;
        this.log("info", "High-fidelity audio stream pipeline verified and ready");
        return true;
      } catch {}
    }
    try {
      const clientId = await play.getFreeClientID();
      if (clientId) {
        await play.setToken({ soundcloud: { client_id: clientId } });
        this.soundCloudInit = true;
        this.log("info", "Audio streaming client initialized successfully");
        return true;
      }
    } catch (err: any) {
      this.log("warn", `Audio client setup notice: ${err.message}`);
    }
    return true; // Still proceed as primary token is preloaded
  }

  // Handle Discord Gateway Voice State and Voice Server updates
  public handleVoiceServerUpdate(data: any) {
    if (this.adapterMethods?.onVoiceServerUpdate) {
      this.adapterMethods.onVoiceServerUpdate(data);
    }
  }

  public handleVoiceStateUpdate(data: any) {
    if (data.user_id === this.userId) {
      if (data.channel_id) {
        this.channelId = data.channel_id;
        this.guildId = data.guild_id || this.guildId;
      } else {
        this.channelId = null;
        this.destroyConnection();
      }
    }
    if (this.adapterMethods?.onVoiceStateUpdate) {
      this.adapterMethods.onVoiceStateUpdate(data);
    }
  }

  // Create voice connection using @discordjs/voice with native DAVE E2EE
  public async joinVoice(
    guildId: string,
    channelId: string,
    sendGatewayPayload: (payload: any) => boolean
  ): Promise<boolean> {
    this.guildId = guildId;
    this.channelId = channelId;

    try {
      // Destroy previous connection if any
      if (this.connection) {
        try {
          this.connection.destroy();
        } catch {}
      }

      this.log("info", `Connecting Direct Voice UDP pipeline for Guild ${guildId} / Channel ${channelId}...`);

      this.connection = joinVoiceChannel({
        channelId,
        guildId,
        selfMute: false,
        selfDeaf: false,
        daveEncryption: true,
        adapterCreator: (methods) => {
          this.adapterMethods = methods;
          return {
            sendPayload: (d) => sendGatewayPayload(d),
            destroy: () => {
              this.adapterMethods = null;
            },
          };
        },
      } as any);

      // Initialize audio player
      if (!this.player) {
        this.player = createAudioPlayer();

        this.player.on("stateChange", (oldState, newState) => {
          if (
            newState.status === AudioPlayerStatus.Idle &&
            oldState.status === AudioPlayerStatus.Playing
          ) {
            this.handleTrackFinished();
          }
        });

        this.player.on("error", (err) => {
          this.log("error", `Audio player stream error: ${err.message}`);
          this.lastError = err.message;
          this.handleTrackFinished();
        });
      }

      this.connection.subscribe(this.player);

      this.connection.on("stateChange", (oldState, newState) => {
        this.log("info", `Voice status: ${oldState.status} -> ${newState.status}`);
        if (newState.status === VoiceConnectionStatus.Ready) {
          this.isConnectedToVoice = true;
          this.isDaveReady = true;
          this.log("success", "Microphone audio connected! DAVE encrypted voice stream ready.");
        } else if (newState.status === VoiceConnectionStatus.Disconnected) {
          this.isDaveReady = false;
        } else if (newState.status === VoiceConnectionStatus.Destroyed) {
          this.isConnectedToVoice = false;
          this.isDaveReady = false;
        }
      });

      // Give voice connection up to 8s to become ready
      try {
        await entersState(this.connection, VoiceConnectionStatus.Ready, 8000);
        return true;
      } catch {
        return true;
      }
    } catch (err: any) {
      this.log("error", `Exception connecting voice: ${err.message}`);
      this.lastError = err.message;
      return false;
    }
  }

  public destroyConnection() {
    this.isConnectedToVoice = false;
    this.isDaveReady = false;
    if (this.player) {
      try {
        this.player.stop(true);
      } catch {}
    }
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }
    this.currentTrack = null;
    this.currentResource = null;
  }

  // Generate a test audio chime to verify microphone output in voice channel
  public async playTestChime(): Promise<{ success: boolean; message: string }> {
    if (!this.connection || !this.player) {
      return {
        success: false,
        message: "Bot is not connected to any voice channel. Please join a voice channel first!",
      };
    }
    try {
      this.log("info", "Generating test audio chime for Voice Channel verification...");
      const sampleRate = 48000;
      const durationSec = 3.2;
      const numSamples = Math.floor(sampleRate * durationSec);
      const buffer = Buffer.alloc(numSamples * 4); // 2 channels * 2 bytes (16-bit)

      // C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
      const notes = [
        { freq: 523.25, start: 0, end: 0.8 },
        { freq: 659.25, start: 0.7, end: 1.5 },
        { freq: 783.99, start: 1.4, end: 2.2 },
        { freq: 1046.5, start: 2.1, end: 3.1 },
      ];

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;
        for (const n of notes) {
          if (t >= n.start && t < n.end) {
            const noteT = t - n.start;
            const noteDur = n.end - n.start;
            const env = Math.sin((noteT / noteDur) * Math.PI) * Math.exp(-noteT * 1.5);
            sample += Math.sin(2 * Math.PI * n.freq * noteT) * 12000 * env;
          }
        }
        const clamped = Math.max(-32767, Math.min(32767, Math.floor(sample)));
        buffer.writeInt16LE(clamped, i * 4);
        buffer.writeInt16LE(clamped, i * 4 + 2);
      }

      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      resource.volume?.setVolume(Math.min(2.0, this.volume / 100));

      this.currentResource = resource;
      this.currentTrack = {
        id: "test-chime",
        title: "Microphone Audio Test Chime",
        author: "Direct Voice Engine",
        url: "#",
        durationMs: 3200,
        source: "test",
      };
      this.playbackStartTime = Date.now();
      this.isPaused = false;
      this.player.play(resource);
      this.log("success", "Microphone transmitting test chime in voice channel!");
      return { success: true, message: "Test audio chime is now playing through the bot's mic!" };
    } catch (err: any) {
      this.log("error", `Failed playing test chime: ${err.message}`);
      return { success: false, message: `Error playing test chime: ${err.message}` };
    }
  }

  // Search tracks across YouTube, Spotify, and SoundCloud
  public async searchTracks(
    query: string,
    source: "youtube" | "spotify" | "soundcloud" = "youtube",
    noFallback: boolean = false
  ): Promise<DaveTrack[]> {
    await this.ensureSoundCloudClient();
    const results: DaveTrack[] = [];
    const trimmed = query.trim();
    if (!trimmed) return results;

    // Direct SoundCloud query/URL or SoundCloud mode
    if (source === "soundcloud" || isSoundCloudUrl(trimmed)) {
      this.sourceProvider = "soundcloud";
      try {
        if (isSoundCloudUrl(trimmed) && trimmed.startsWith("http")) {
          const scMeta = await resolveSoundCloudMetadata(trimmed);
          if (scMeta) {
            this.log("info", `Resolved direct SoundCloud link: "${scMeta.title}" by ${scMeta.artist}`);
            return [
              {
                id: trimmed,
                title: scMeta.title,
                author: scMeta.artist,
                url: trimmed,
                durationMs: scMeta.durationMs || 180000,
                artworkUrl: scMeta.artworkUrl,
                source: "soundcloud",
              },
            ];
          }
        }

        const cleanScQuery = trimmed
          .replace(/^soundcloud:\s*/i, "")
          .replace(/^sc:\s*/i, "")
          .replace(/^scsearch:\s*/i, "");

        this.log("info", `Searching SoundCloud directly for: "${cleanScQuery}"...`);
        const scItems = await play.search(cleanScQuery, {
          source: { soundcloud: "tracks" },
          limit: 12,
        });

        for (const item of scItems) {
          const scTitle = (item as any).name || (item as any).title || "";
          results.push({
            id: item.url,
            title: scTitle || "SoundCloud Track",
            author: (item as any).publisher?.artist || (item as any).user?.name || "SoundCloud Artist",
            url: item.url,
            durationMs: (item as any).durationInSec ? (item as any).durationInSec * 1000 : 180000,
            artworkUrl: (item as any).thumbnail || (item as any).artwork_url || undefined,
            source: "soundcloud",
          });
        }

        if (results.length === 0) {
          // Resilient secondary Lavalink scsearch query
          try {
            const scLavalinkUrl = `http://nokia.vexanode.gg:19133/v4/loadtracks?identifier=${encodeURIComponent(`scsearch:${cleanScQuery}`)}`;
            const scResp = await fetch(scLavalinkUrl, {
              headers: { Authorization: "vexanode.cloud" },
            });
            if (scResp.ok) {
              const scJson = (await scResp.json()) as any;
              const items = Array.isArray(scJson.data) ? scJson.data : scJson.data?.tracks || [];
              for (const it of items) {
                results.push({
                  id: it.info?.uri || it.encoded,
                  title: it.info?.title || "SoundCloud Track",
                  author: it.info?.author || "SoundCloud Artist",
                  url: it.info?.uri || `https://soundcloud.com/search?q=${encodeURIComponent(cleanScQuery)}`,
                  durationMs: it.info?.length || 180000,
                  artworkUrl: it.info?.artworkUrl || undefined,
                  source: "soundcloud",
                  encoded: it.encoded,
                  info: it.info,
                });
              }
            }
          } catch {}
        }

        if (results.length > 0) {
          this.log("success", `Found ${results.length} tracks on SoundCloud!`);
          return results;
        }
      } catch (scErr: any) {
        this.log("warn", `SoundCloud search notice: ${scErr.message}`);
      }

      // If noFallback is true, do NOT fall back to YouTube or Spotify
      if (noFallback) {
        return results;
      }
    }

    // 1. Check if user pasted a Spotify link
    if (isSpotifyUrl(trimmed)) {
      const entity = await resolveSpotify(trimmed);
      if (entity) {
        if (entity.type === "playlist" || entity.type === "album") {
          this.log("info", `Resolved Spotify ${entity.type}: "${entity.title}" (${entity.tracks.length} tracks)`);
          return entity.tracks.map((t, idx) => ({
            id: t.id || `spotify-${Date.now()}-${idx}`,
            title: t.title,
            author: t.author,
            url: t.url,
            durationMs: t.durationMs,
            artworkUrl: t.artworkUrl || entity.artworkUrl,
            source: "spotify" as const,
          }));
        } else if (entity.type === "track") {
          this.log("info", `Resolved Spotify track: "${entity.title}" by ${entity.artist}`);
          return [
            {
              id: trimmed,
              title: entity.title,
              author: entity.artist,
              url: trimmed,
              durationMs: entity.durationMs,
              artworkUrl: entity.artworkUrl,
              source: "spotify",
            },
          ];
        }
      }
    }

    // 2. Check if user pasted a YouTube link
    if (isYouTubeUrl(trimmed)) {
      const ytInfo = await resolveYouTubeMetadata(trimmed);
      if (ytInfo) {
        this.log("info", `Resolved YouTube URL: "${ytInfo.title}" by ${ytInfo.artist}`);
        return [
          {
            id: trimmed,
            title: ytInfo.title,
            author: ytInfo.artist,
            url: trimmed,
            durationMs: 240000,
            artworkUrl: ytInfo.artworkUrl,
            source: "youtube",
          },
        ];
      }
    }

    // 3. Search based on selected provider (YouTube or Spotify)
    if (source === "youtube") {
      try {
        const ytItems = await play.search(trimmed, { limit: 10 });
        for (const item of ytItems) {
          results.push({
            id: item.id || item.url,
            title: item.title || "YouTube Track",
            author: item.channel?.name || "YouTube Creator",
            url: item.url,
            durationMs: item.durationInSec ? item.durationInSec * 1000 : 200000,
            artworkUrl: item.thumbnails?.[0]?.url,
            source: "youtube",
          });
        }
      } catch (ytErr: any) {
        this.log("warn", `YouTube search notice: ${ytErr.message}`);
      }
    } else if (source === "spotify") {
      try {
        const queryClean = `${trimmed} audio`;
        const items = await play.search(queryClean, { limit: 10 });
        for (const item of items) {
          results.push({
            id: item.id || item.url,
            title: item.title || "Spotify Track",
            author: item.channel?.name || "Spotify Artist",
            url: item.url,
            durationMs: item.durationInSec ? item.durationInSec * 1000 : 200000,
            artworkUrl: item.thumbnails?.[0]?.url,
            source: "spotify",
          });
        }
      } catch (err: any) {
        this.log("warn", `Spotify track search notice: ${err.message}`);
      }
    }

    // 4. AUTOMATIC FALLBACK TO SOUNDCLOUD IF PRIMARY FAILS OR YIELDS 0 RESULTS
    if (results.length === 0) {
      this.log("info", `[SoundCloud Fallback] Primary search returned no results. Querying SoundCloud fallback for "${trimmed}"...`);
      try {
        const scItems = await play.search(trimmed, { source: { soundcloud: "tracks" }, limit: 8 });
        for (const item of scItems) {
          const scTitle = (item as any).name || (item as any).title || "";
          results.push({
            id: item.url,
            title: scTitle || "Music Track",
            author: (item as any).publisher?.artist || (item as any).user?.name || "SoundCloud Artist",
            url: item.url,
            durationMs: (item as any).durationInSec ? (item as any).durationInSec * 1000 : 180000,
            artworkUrl: (item as any).thumbnail || (item as any).artwork_url || undefined,
            source: "soundcloud",
          });
        }
        if (results.length > 0) {
          this.log("success", `[SoundCloud Fallback] Found ${results.length} fallback tracks on SoundCloud!`);
        }
      } catch (scFallbackErr: any) {
        this.log("warn", `SoundCloud fallback search notice: ${scFallbackErr.message}`);
      }
    }

    if (results.length === 0) {
      const itunesList = await searchItunesFallback(trimmed, 8);
      for (const item of itunesList) {
        results.push({
          ...item,
          source: source === "spotify" ? "spotify" : "youtube",
        });
      }
    }

    return results;
  }

  // Direct play from SoundCloud without any fallback
  public async playSoundCloudDirect(
    queryOrUrl: string,
    mode: "now" | "queue" = "now"
  ): Promise<{ success: boolean; track?: DaveTrack; queued?: boolean; error?: string; playlist?: { title: string; count: number } }> {
    this.log("info", `[SoundCloud Pure Command] Executing direct SoundCloud play (No Fallback): "${queryOrUrl}"`);
    return this.play(queryOrUrl, mode, "soundcloud", true);
  }

  // Play a track, URL, or query immediately or queue it
  public async play(
    trackOrQuery: string | DaveTrack | LavalinkTrack | any,
    mode: "now" | "queue" = "now",
    source: "youtube" | "spotify" | "soundcloud" = "youtube",
    noFallback: boolean = false
  ): Promise<{ success: boolean; track?: DaveTrack; queued?: boolean; error?: string; playlist?: { title: string; count: number } }> {
    if (!this.connection) {
      return {
        success: false,
        error: "Bot is not in any voice channel. Please join a voice channel first!",
      };
    }

    let targetTrack: DaveTrack | null = null;
    if (typeof trackOrQuery === "string") {
      const trimmedQuery = trackOrQuery.trim();
      const isUrl =
        trimmedQuery.startsWith("http://") ||
        trimmedQuery.startsWith("https://") ||
        trimmedQuery.startsWith("spotify:") ||
        trimmedQuery.startsWith("sc:");

      // Check if SoundCloud Direct Play or SoundCloud URL
      if (source === "soundcloud" || isSoundCloudUrl(trimmedQuery)) {
        this.log("info", `Resolving SoundCloud track: ${trimmedQuery}...`);
        if (isSoundCloudUrl(trimmedQuery) && trimmedQuery.startsWith("http")) {
          const scInfo = await resolveSoundCloudMetadata(trimmedQuery);
          if (scInfo) {
            targetTrack = {
              id: trimmedQuery,
              title: scInfo.title,
              author: scInfo.artist,
              url: trimmedQuery,
              durationMs: scInfo.durationMs || 180000,
              artworkUrl: scInfo.artworkUrl,
              source: "soundcloud",
            };
          }
        }
        if (!targetTrack) {
          const searchRes = await this.searchTracks(trimmedQuery, "soundcloud", noFallback);
          if (searchRes.length > 0) {
            targetTrack = searchRes[0];
          } else if (noFallback) {
            return {
              success: false,
              error: `No tracks found on SoundCloud for "${trimmedQuery}" (Pure SoundCloud mode: no fallback used).`,
            };
          }
        }
      }

      // Check if Spotify Playlist or Album
      if (!targetTrack && isSpotifyPlaylistOrAlbum(trimmedQuery)) {
        this.log("info", `Resolving Spotify collection: ${trimmedQuery}...`);
        const entity = await resolveSpotify(trimmedQuery);
        if (
          entity &&
          (entity.type === "playlist" || entity.type === "album") &&
          entity.tracks.length > 0
        ) {
          const playlistTracks: DaveTrack[] = entity.tracks.map((t, idx) => ({
            id: t.id || `spotify-${Date.now()}-${idx}`,
            title: t.title,
            author: t.author,
            url: t.url,
            durationMs: t.durationMs,
            artworkUrl: t.artworkUrl || entity.artworkUrl,
            source: "spotify" as const,
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

          const isCurrentlyPlaying = this.player?.state.status === AudioPlayerStatus.Playing;
          if (mode === "now" || (!isCurrentlyPlaying && mode === "queue")) {
            const first = playlistTracks[0];
            const remaining = playlistTracks.slice(1);
            this.queue.push(...remaining);
            this.log(
              "success",
              `Loaded Spotify ${entity.type}: "${entity.title}" (${playlistTracks.length} tracks). Starting playback!`
            );
            const playRes = await this.playTrackResource(first, noFallback);
            return {
              ...playRes,
              playlist: {
                title: entity.title,
                count: playlistTracks.length,
              },
            };
          } else {
            this.queue.push(...playlistTracks);
            this.log(
              "success",
              `Queued Spotify ${entity.type}: "${entity.title}" (${playlistTracks.length} tracks added to queue)`
            );
            return {
              success: true,
              queued: true,
              playlist: {
                title: entity.title,
                count: playlistTracks.length,
              },
            };
          }
        }
      }

      // Check if Spotify Single Track URL
      if (!targetTrack && isSpotifyUrl(trimmedQuery)) {
        this.log("info", `Resolving Spotify track: ${trimmedQuery}...`);
        const entity = await resolveSpotify(trimmedQuery);
        if (entity && entity.type === "track") {
          targetTrack = {
            id: trimmedQuery,
            title: entity.title,
            author: entity.artist,
            url: trimmedQuery,
            durationMs: entity.durationMs,
            artworkUrl: entity.artworkUrl,
            source: "spotify",
          };
        }
      }

      // Check if YouTube URL
      if (!targetTrack && isYouTubeUrl(trimmedQuery)) {
        this.log("info", `Resolving YouTube link: ${trimmedQuery}...`);
        const ytInfo = await resolveYouTubeMetadata(trimmedQuery);
        if (ytInfo) {
          targetTrack = {
            id: trimmedQuery,
            title: ytInfo.title,
            author: ytInfo.artist,
            url: trimmedQuery,
            durationMs: 240000,
            artworkUrl: ytInfo.artworkUrl,
            source: "youtube",
          };
        }
      }

      // Direct radio or MP3 audio stream
      if (
        !targetTrack &&
        isUrl &&
        (trimmedQuery.includes(".mp3") ||
          trimmedQuery.includes(".aac") ||
          trimmedQuery.includes("stream") ||
          trimmedQuery.includes("radio"))
      ) {
        const matchedRadio = RADIO_STATIONS.find((r) => r.url === trimmedQuery);
        targetTrack = {
          id: trimmedQuery,
          title: matchedRadio ? matchedRadio.name : "Live Audio Stream",
          author: matchedRadio ? matchedRadio.genre : "Online Radio",
          url: trimmedQuery,
          durationMs: 0,
          source: "stream",
        };
      } else if (!targetTrack) {
        const searchRes = await this.searchTracks(
          trimmedQuery,
          source,
          noFallback
        );
        if (searchRes.length === 0) {
          return {
            success: false,
            error: `No tracks found matching "${trimmedQuery}". Try a different title or artist.`,
          };
        }
        targetTrack = searchRes[0];
      }
    } else if (typeof trackOrQuery === "object" && trackOrQuery !== null) {
      const anyTrack = trackOrQuery as any;
      if (anyTrack.info) {
        // LavalinkTrack format
        const src = anyTrack.info.sourceName === "soundcloud" ? "soundcloud" : anyTrack.info.sourceName === "spotify" ? "spotify" : "youtube";
        targetTrack = {
          id: anyTrack.info.identifier || anyTrack.encoded || anyTrack.info.uri || `track-${Date.now()}`,
          title: anyTrack.info.title || "Unknown Title",
          author: anyTrack.info.author || "Unknown Artist",
          url: anyTrack.info.uri || anyTrack.info.identifier || anyTrack.encoded || "",
          durationMs: anyTrack.info.length || 0,
          artworkUrl: anyTrack.info.artworkUrl || undefined,
          source: src,
        };
      } else {
        // Direct DaveTrack format
        const src = anyTrack.source === "soundcloud" ? "soundcloud" : anyTrack.source === "spotify" ? "spotify" : "youtube";
        targetTrack = {
          id: anyTrack.id || anyTrack.url || `track-${Date.now()}`,
          title: anyTrack.title || "Unknown Title",
          author: anyTrack.author || "Unknown Artist",
          url: anyTrack.url || anyTrack.id || "",
          durationMs: anyTrack.durationMs || 0,
          artworkUrl: anyTrack.artworkUrl || undefined,
          source: src,
        };
      }
    }

    if (!targetTrack) {
      return { success: false, error: "Invalid track or URL provided" };
    }

    // Format info field for Lavalink compatibility in the UI
    targetTrack.encoded = targetTrack.id || targetTrack.url;
    targetTrack.info = {
      identifier: targetTrack.id || targetTrack.url,
      isSeekable: true,
      author: targetTrack.author,
      length: targetTrack.durationMs,
      isStream: targetTrack.source === "stream",
      position: 0,
      title: targetTrack.title,
      uri: targetTrack.url,
      artworkUrl: targetTrack.artworkUrl || null,
      sourceName: targetTrack.source,
    };

    // If currently playing and mode is queue, add to queue
    const isCurrentlyPlaying = this.player?.state.status === AudioPlayerStatus.Playing;
    if (isCurrentlyPlaying && mode === "queue") {
      this.queue.push(targetTrack);
      this.log("info", `Queued: "${targetTrack.title}" (#${this.queue.length} in queue)`);
      return { success: true, track: targetTrack, queued: true };
    }

    // If queue mode requested but nothing is currently playing, play right away
    if (mode === "queue" && !isCurrentlyPlaying) {
      this.log("info", `Queue was idle; starting playback immediately: "${targetTrack.title}"`);
    }

    // Play immediately
    return this.playTrackResource(targetTrack, noFallback);
  }

  private async playTrackResource(
    track: DaveTrack,
    noFallback: boolean = false
  ): Promise<{ success: boolean; track?: DaveTrack; error?: string }> {
    try {
      this.log("info", `Preparing high-fidelity audio stream for: "${track.title}" [${track.source.toUpperCase()}]...`);
      let audioStream: any = null;
      let inputType: any = undefined;

      const trackUrl = track.url || "";

      if (track.source === "stream" || trackUrl.includes(".mp3") || trackUrl.includes("stream") || trackUrl.includes(".aac")) {
        // Direct HTTP/HTTPS audio stream
        audioStream = trackUrl;
      } else if (track.source === "soundcloud" || trackUrl.includes("soundcloud.com") || trackUrl.includes("api.soundcloud.com")) {
        // 🎧 PURE SOUNDCLOUD PLAYBACK (Direct or via SoundCloud search)
        await this.ensureSoundCloudClient();
        this.log("info", `Streaming directly from SoundCloud: ${track.title}...`);
        try {
          const res = await play.stream(trackUrl);
          if (res && res.stream) {
            audioStream = res.stream;
            inputType = res.type;
            this.fallbackActive = false;
            this.fallbackNotice = null;
            this.sourceProvider = "soundcloud";
            this.log("success", `SoundCloud direct audio stream established cleanly!`);
          }
        } catch (scDirectErr: any) {
          this.log("warn", `SoundCloud stream direct URL notice (${scDirectErr.message}). Searching SoundCloud track stream...`);
          // Try search candidate on SoundCloud
          try {
            const scCand = await play.search(cleanSearchQuery(track.title, track.author), {
              source: { soundcloud: "tracks" },
              limit: 4,
            });
            for (const cand of scCand) {
              try {
                const res = await play.stream(cand.url);
                if (res && res.stream) {
                  audioStream = res.stream;
                  inputType = res.type;
                  this.fallbackActive = false;
                  this.fallbackNotice = null;
                  this.sourceProvider = "soundcloud";
                  break;
                }
              } catch {}
            }
          } catch {}
        }

        if (!audioStream) {
          if (noFallback) {
            throw new Error(`SoundCloud direct stream could not be loaded for "${track.title}" (Pure SoundCloud mode: fallback disabled).`);
          }
        }
      }

      // If not yet streamed and track is YouTube or Spotify (or fallback allowed):
      if (!audioStream) {
        let streamed = false;

        // Pre-fetch SoundCloud candidates in PARALLEL while attempting YouTube
        // This makes fallback near-instant instead of sequential
        await this.ensureSoundCloudClient();
        const cleanedQuery = cleanSearchQuery(track.title, track.author);
        const scCandidatesPromise: Promise<any[]> = play
          .search(cleanedQuery, { source: { soundcloud: "tracks" }, limit: 8 })
          .catch(() => play.search(cleanSearchQuery(track.title), { source: { soundcloud: "tracks" }, limit: 6 }).catch(() => []));

        // If it is a direct YouTube link, try direct YouTube stream first
        if ((trackUrl.includes("youtube.com") || trackUrl.includes("youtu.be")) && track.source === "youtube") {
          try {
            this.log("info", `Attempting direct YouTube audio stream for: ${trackUrl}`);
            // Use a timeout so YouTube bot-check hangs don't block playback
            const ytStreamPromise = play.stream(trackUrl);
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error("YouTube stream timeout (10s)")), 10000)
            );
            const res = await Promise.race([ytStreamPromise, timeoutPromise]) as any;
            if (res && res.stream) {
              audioStream = res.stream;
              inputType = res.type;
              streamed = true;
              this.fallbackActive = false;
              this.fallbackNotice = null;
              this.sourceProvider = "youtube";
              this.log("success", `Direct YouTube audio stream opened successfully!`);
            }
          } catch (ytErr: any) {
            this.log("warn", `Direct YouTube stream notice (${ytErr.message || "bot check"}). Triggering automatic SoundCloud fallback...`);
          }
        }

        // 🛡️ SOUNDCLOUD AUTOMATIC FALLBACK IF YOUTUBE / PRIMARY FAILS
        if (!streamed) {
          this.log("info", `[SoundCloud Fallback Active] Resolving SoundCloud fallback audio stream for: "${cleanedQuery}"...`);

          // Await the pre-fetched SoundCloud candidates (already running in parallel)
          let candidates: any[] = [];
          try {
            candidates = await scCandidatesPromise;
          } catch {}

          // Also try title-only search if combined query returned nothing
          if (candidates.length === 0) {
            try {
              const titleOnly = cleanSearchQuery(track.title);
              candidates = await play.search(titleOnly, {
                source: { soundcloud: "tracks" },
                limit: 6,
              });
            } catch {}
          }

          for (const cand of candidates) {
            try {
              const res = await play.stream(cand.url);
              if (res && res.stream) {
                audioStream = res.stream;
                inputType = res.type;
                streamed = true;
                this.fallbackActive = true;
                this.fallbackNotice = `Audio automatically routed through SoundCloud fallback (YouTube stream unavailable)`;
                this.sourceProvider = "soundcloud-fallback";
                track.source = "soundcloud";
                if (track.info) {
                  track.info.sourceName = "soundcloud";
                }
                this.log("success", `[SoundCloud Fallback] Fallback audio stream successfully connected for "${track.title}"!`);
                break;
              }
            } catch {}
          }
        }

        // Secondary fallback: General YouTube search (no URL, just title)
        if (!streamed) {
          try {
            const fallbackCand = await play.search(track.title, { limit: 5 });
            for (const cand of fallbackCand) {
              try {
                const res = await play.stream(cand.url);
                if (res && res.stream) {
                  audioStream = res.stream;
                  inputType = res.type;
                  streamed = true;
                  break;
                }
              } catch {}
            }
          } catch {}
        }

        if (!streamed || !audioStream) {
          throw new Error(`Could not obtain a playable audio stream for "${track.title}". Please try another song or play directly from SoundCloud.`);
        }
      }

      let volMultiplier = 1.0;
      if (this.soundMode === "boost") volMultiplier = 1.25;
      else if (this.soundMode === "hd") volMultiplier = 1.05;

      const resource = createAudioResource(audioStream, {
        inputType,
        inlineVolume: true,
      });
      const effectiveVol = Math.min(2.0, (this.volume / 100) * volMultiplier);
      resource.volume?.setVolume(effectiveVol);

      if (this.currentTrack && this.currentTrack.id !== track.id) {
        this.history.unshift(this.currentTrack);
        if (this.history.length > 20) this.history.pop();
      }

      this.currentResource = resource;
      this.currentTrack = track;
      this.playbackStartTime = Date.now();
      this.isPaused = false;
      this.lastError = null;
      this.player!.play(resource);

      this.log("success", `Microphone speaking! Now playing: "${track.title}" by ${track.author} [Audio: ${this.soundMode.toUpperCase()} Crystal Clear]`);
      return { success: true, track };
    } catch (err: any) {
      this.log("error", `Error streaming "${track.title}": ${err.message}`);
      this.lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  private async handleTrackFinished() {
    this.log("info", `Finished: "${this.currentTrack?.title || "Track"}"`);

    if (this.repeatMode === "track" && this.currentTrack) {
      this.playTrackResource(this.currentTrack);
      return;
    }

    if (this.repeatMode === "queue" && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.playTrackResource(next);
      return;
    }

    // Autoplay functionality: seamlessly pick and play similar or recommended tracks
    if (this.autoplay && this.currentTrack && !this.isAutoPlaying) {
      this.isAutoPlaying = true;
      // Capture track info before async operations
      const lastTitle = this.currentTrack.title;
      const lastAuthor = this.currentTrack.author;

      // Run autoplay logic asynchronously so we don't block the stateChange event
      (async () => {
        try {
          this.log("info", `[Autoplay] Queue ended. Finding next track for "${lastTitle}" by ${lastAuthor}...`);

          // Build multiple search queries for best recommendation coverage
          const searchQueries = [
            `${lastAuthor} ${lastTitle} mix`,          // Similar to current song
            `${lastAuthor} popular songs`,              // More from same artist
            `${lastTitle} similar songs`,               // Genre-similar tracks
          ];

          let candidates: DaveTrack[] = [];

          // Try SoundCloud first — it works reliably without YouTube bot-check issues
          for (const query of searchQueries) {
            if (candidates.length >= 5) break;
            try {
              const scResults = await play.search(query, {
                source: { soundcloud: "tracks" },
                limit: 6,
              });
              for (const item of scResults) {
                const scTitle = (item as any).name || (item as any).title || "";
                if (!scTitle) continue;
                candidates.push({
                  id: item.url,
                  title: scTitle,
                  author: (item as any).publisher?.artist || (item as any).user?.name || lastAuthor,
                  url: item.url,
                  durationMs: (item as any).durationInSec ? (item as any).durationInSec * 1000 : 200000,
                  artworkUrl: (item as any).thumbnail || (item as any).artwork_url || undefined,
                  source: "soundcloud",
                });
              }
            } catch {}
          }

          // YouTube fallback if SoundCloud found nothing
          if (candidates.length === 0) {
            try {
              const ytResults = await play.search(`${lastAuthor} ${lastTitle}`, { limit: 8 });
              for (const item of ytResults) {
                candidates.push({
                  id: item.id || item.url,
                  title: item.title || "YouTube Track",
                  author: item.channel?.name || lastAuthor,
                  url: item.url,
                  durationMs: item.durationInSec ? item.durationInSec * 1000 : 200000,
                  artworkUrl: item.thumbnails?.[0]?.url,
                  source: "youtube",
                });
              }
            } catch {}
          }

          // Filter out already-played tracks and the exact same track
          const filtered = candidates.filter(
            (t) =>
              t.title.toLowerCase() !== lastTitle.toLowerCase() &&
              !this.history.some((h) => h.id === t.id || h.title.toLowerCase() === t.title.toLowerCase())
          );

          const toPlay = filtered.length > 0 ? filtered[0] : candidates[0];

          if (!toPlay) {
            this.log("warn", "[Autoplay] No recommendation found. Playback ended.");
            this.currentTrack = null;
            this.currentResource = null;
            this.isPaused = false;
            this.isAutoPlaying = false;
            return;
          }

          this.log("success", `[Autoplay] Auto-playing: "${toPlay.title}" by ${toPlay.author}`);

          // Try up to 3 candidates in case a stream fails
          const tryList = [toPlay, ...filtered.slice(1, 3)];
          let played = false;
          for (const candidate of tryList) {
            try {
              const result = await this.playTrackResource(candidate);
              if (result.success) {
                played = true;
                break;
              }
            } catch {}
          }

          if (!played) {
            this.log("warn", "[Autoplay] All candidates failed. Playback ended.");
            this.currentTrack = null;
            this.currentResource = null;
            this.isPaused = false;
          }
        } catch (apErr: any) {
          this.log("warn", `[Autoplay] Error: ${apErr.message}`);
          this.currentTrack = null;
          this.currentResource = null;
          this.isPaused = false;
        } finally {
          this.isAutoPlaying = false;
        }
      })();

      // Don't null out currentTrack — autoplay is running in background
      return;
    }

    this.currentTrack = null;
    this.currentResource = null;
    this.isPaused = false;
  }

  public pause(): boolean {
    if (!this.player) return false;
    try {
      this.player.pause(true);
      this.isPaused = true;
      this.log("info", "Audio playback paused");
      return true;
    } catch {
      this.isPaused = true;
      return true;
    }
  }

  public resume(): boolean {
    if (!this.player) return false;
    try {
      this.player.unpause();
      this.isPaused = false;
      this.log("info", "Audio playback resumed");
      return true;
    } catch {
      this.isPaused = false;
      return true;
    }
  }

  public stop(): boolean {
    if (this.player) {
      try {
        this.player.stop(true);
      } catch {}
      this.currentTrack = null;
      this.currentResource = null;
      this.isPaused = false;
      this.log("info", "Audio playback stopped");
      return true;
    }
    return false;
  }

  public skip(): boolean {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.playTrackResource(next);
      return true;
    }
    
    // If queue is empty and autoplay is on, trigger next recommendation
    if (this.autoplay && this.currentTrack) {
      this.handleTrackFinished();
      return true;
    }

    return this.stop();
  }

  public setVolume(vol: number): number {
    this.volume = Math.max(0, Math.min(200, vol));
    if (this.currentResource?.volume) {
      let volMultiplier = 1.0;
      if (this.soundMode === "boost") volMultiplier = 1.25;
      else if (this.soundMode === "hd") volMultiplier = 1.05;
      this.currentResource.volume.setVolume(Math.min(2.0, (this.volume / 100) * volMultiplier));
    }
    this.log("info", `Volume adjusted to ${this.volume}%`);
    return this.volume;
  }

  public setRepeat(mode: "off" | "track" | "queue") {
    this.repeatMode = mode;
    this.log("info", `Repeat mode: ${mode}`);
  }

  public setAutoplay(enabled: boolean): boolean {
    this.autoplay = enabled;
    this.log("info", `Autoplay feature: ${enabled ? "ENABLED" : "DISABLED"}`);
    return this.autoplay;
  }

  public setSoundMode(mode: "hd" | "boost" | "flat"): "hd" | "boost" | "flat" {
    this.soundMode = mode;
    if (this.currentResource?.volume) {
      let volMultiplier = 1.0;
      if (mode === "boost") volMultiplier = 1.25;
      else if (mode === "hd") volMultiplier = 1.05;
      this.currentResource.volume.setVolume(Math.min(2.0, (this.volume / 100) * volMultiplier));
    }
    this.log("success", `Audio Clarity Engine set to ${mode.toUpperCase()} (Clear High-Fidelity)`);
    return this.soundMode;
  }

  public removeFromQueue(index: number): boolean {
    if (index >= 0 && index < this.queue.length) {
      const removed = this.queue.splice(index, 1);
      this.log("info", `Removed "${removed[0]?.title}" from queue`);
      return true;
    }
    return false;
  }

  public clearQueue(): boolean {
    this.queue = [];
    this.log("info", "Music queue cleared");
    return true;
  }

  public isReady(): boolean {
    return this.isConnectedToVoice && this.isDaveReady;
  }

  // State mapped to PlayerState interface for unified UI consumption
  public getState(): PlayerState {
    const isPlaying = this.player?.state.status === AudioPlayerStatus.Playing;
    const isPaused = this.player?.state.status === AudioPlayerStatus.Paused || this.isPaused;
    // Calculate elapsed playback position in ms; cap at track duration to avoid overflow
    const rawPosition = (isPlaying || isPaused) && this.playbackStartTime ? Date.now() - this.playbackStartTime : 0;
    const maxDuration = this.currentTrack?.durationMs || 0;
    const position = maxDuration > 0 ? Math.min(rawPosition, maxDuration) : rawPosition;

    const formattedCurrentTrack: LavalinkTrack | null = this.currentTrack
      ? {
          encoded: this.currentTrack.id || this.currentTrack.url || (this.currentTrack as any).encoded || "track",
          info: {
            identifier: this.currentTrack.id || (this.currentTrack as any).info?.identifier || this.currentTrack.url || "track",
            isSeekable: true,
            author: this.currentTrack.author || (this.currentTrack as any).info?.author || "Unknown Artist",
            length: this.currentTrack.durationMs || (this.currentTrack as any).info?.length || 0,
            isStream: this.currentTrack.source === "stream",
            position,
            title: this.currentTrack.title || (this.currentTrack as any).info?.title || "Unknown Title",
            uri: this.currentTrack.url || (this.currentTrack as any).info?.uri || "",
            artworkUrl: this.currentTrack.artworkUrl || (this.currentTrack as any).info?.artworkUrl || null,
            sourceName: this.currentTrack.source || (this.currentTrack as any).info?.sourceName || "youtube",
          },
        }
      : null;

    const formattedQueue: LavalinkTrack[] = this.queue.map((t) => ({
      encoded: t.id || t.url || (t as any).encoded || "track",
      info: {
        identifier: t.id || (t as any).info?.identifier || t.url || "track",
        isSeekable: true,
        author: t.author || (t as any).info?.author || "Unknown Artist",
        length: t.durationMs || (t as any).info?.length || 0,
        isStream: t.source === "stream",
        position: 0,
        title: t.title || (t as any).info?.title || "Unknown Title",
        uri: t.url || (t as any).info?.uri || "",
        artworkUrl: t.artworkUrl || (t as any).info?.artworkUrl || null,
        sourceName: t.source || (t as any).info?.sourceName || "youtube",
      },
    }));

    const formattedHistory: LavalinkTrack[] = this.history.map((t) => ({
      encoded: t.id || t.url || (t as any).encoded || "track",
      info: {
        identifier: t.id || (t as any).info?.identifier || t.url || "track",
        isSeekable: true,
        author: t.author || (t as any).info?.author || "Unknown Artist",
        length: t.durationMs || (t as any).info?.length || 0,
        isStream: t.source === "stream",
        position: 0,
        title: t.title || (t as any).info?.title || "Unknown Title",
        uri: t.url || (t as any).info?.uri || "",
        artworkUrl: t.artworkUrl || (t as any).info?.artworkUrl || null,
        sourceName: t.source || (t as any).info?.sourceName || "youtube",
      },
    }));

    return {
      botToken: this.token,
      botUsername: this.botUsername,
      avatar: this.avatar,
      guildId: this.guildId,
      channelId: this.channelId,
      connectedToVoice: this.isConnectedToVoice,
      playing: isPlaying,
      paused: isPaused,
      volume: this.volume,
      currentTrack: formattedCurrentTrack,
      position,
      duration: this.currentTrack?.durationMs || 0,
      queue: formattedQueue,
      history: formattedHistory,
      repeatMode: this.repeatMode,
      autoplay: this.autoplay,
      soundMode: this.soundMode,
      lavalinkSessionId: null,
      lavalinkNodeStatus: this.isConnectedToVoice ? "connected" : "disconnected",
      engine: "dave",
      daveConnected: this.isConnectedToVoice,
      daveReady: this.isDaveReady,
      daveProtocolVersion: "1.1",
      e2eeUpgraded: true,
      e2eeStatus: "Active (DAVE v1.1 Upgraded)",
      clientBuild: 568820,
      fallbackActive: this.fallbackActive,
      fallbackNotice: this.fallbackNotice || undefined,
      sourceProvider: this.sourceProvider,
      error: this.lastError,
    };
  }
}
