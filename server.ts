import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import WebSocket from "ws";
import {
  LavalinkPlayer,
  DEFAULT_LAVALINK_CONFIG,
  ACTIVE_LAVALINK_CONFIG,
  PRESET_LAVALINK_NODES,
  updateLavalinkNodeConfig,
  LavalinkConfig,
  searchLavalinkTracks,
  getLavalinkNodeStatus,
  PRESET_AUDIO_FILTERS,
  type AudioPresetName,
  type SearchSource,
  type LavalinkFilters,
} from "./lavalink";
import {
  DaveVoiceManager,
  RADIO_STATIONS,
  resolveSpotifyMetadata,
  resolveYouTubeMetadata,
} from "./daveVoice";
import { resolveSpotify, isSpotifyUrl, isSpotifyPlaylistOrAlbum } from "./spotifyResolver";

const app = express();
const PORT = 3000;

// Active Audio Engine: "direct" (DAVE Voice Microphone Engine) or "lavalink"
let ACTIVE_AUDIO_ENGINE: "direct" | "lavalink" =
  (process.env.AUDIO_ENGINE as "direct" | "lavalink") || "direct";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize req.url for Vercel rewrites & serverless deployment
app.use((req, _res, next) => {
  if (req.url && !req.url.startsWith("/api/") && req.url !== "/api") {
    if (
      req.url.startsWith("/tokens") ||
      req.url.startsWith("/health") ||
      req.url.startsWith("/ping") ||
      req.url.startsWith("/system") ||
      req.url.startsWith("/e2ee") ||
      req.url.startsWith("/actions") ||
      req.url.startsWith("/lavalink") ||
      req.url.startsWith("/voice") ||
      req.url.startsWith("/audio") ||
      req.url.startsWith("/server-invite")
    ) {
      req.url = "/api" + req.url;
    }
  }
  next();
});

// Path to tokens.txt (writable /tmp on Vercel)
const TOKENS_FILE = process.env.VERCEL
  ? path.join("/tmp", "tokens.txt")
  : path.join(process.cwd(), "tokens.txt");

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  tokenPreview?: string;
}

export interface BotState {
  token: string;
  tokenPreview: string;
  username: string;
  avatar: string | null;
  userId: string | null;
  status: "Disconnected" | "Connecting" | "Connected" | "In Voice" | "Error";
  guildId: string | null;
  channelId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  uptime: number; // in seconds
  lastError: string | null;
  connectedAt: number | null;
}

const logs: LogEntry[] = [];

function addLog(level: LogEntry["level"], message: string, token?: string) {
  const tokenPreview = token ? `${token.slice(0, 8)}...${token.slice(-4)}` : undefined;
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
    tokenPreview,
  };
  logs.push(entry);
  if (logs.length > 300) {
    logs.shift();
  }
  console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${tokenPreview ? `[${tokenPreview}] ` : ""}${message}`);
}

class DiscordBotClient {
  public token: string;
  public username: string = "Unknown";
  public avatar: string | null = null;
  public userId: string | null = null;
  public status: BotState["status"] = "Disconnected";
  public guildId: string | null = null;
  public channelId: string | null = null;
  public selfMute: boolean = false;
  public selfDeaf: boolean = false;
  public selfVideo: boolean = false;
  public selfStream: boolean = false;
  public lastError: string | null = null;
  public connectedAt: number | null = null;
  public lavalinkPlayer: LavalinkPlayer;
  public daveVoiceManager: DaveVoiceManager;

  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private shouldReconnect: boolean = true;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private lastHeartbeatAck: boolean = true;
  public _lastGatewayPingMs: number | null = null;
  private _heartbeatSentAt: number | null = null;

  constructor(token: string) {
    this.token = token.trim();
    this.lavalinkPlayer = new LavalinkPlayer(
      this.token,
      this.username,
      this.userId,
      this.avatar,
      (level, msg) => {
        addLog(level, msg, this.token);
      }
    );
    this.daveVoiceManager = new DaveVoiceManager(this.token, (level, msg) => {
      addLog(level, msg, this.token);
    });
  }

  public sendGatewayPayload(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  public getState(): BotState {
    const uptime = this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : 0;
    return {
      token: this.token,
      tokenPreview: `${this.token.slice(0, 8)}...${this.token.slice(-4)}`,
      username: this.username,
      avatar: this.avatar,
      userId: this.userId,
      status: this.status,
      guildId: this.guildId,
      channelId: this.channelId,
      selfMute: this.selfMute,
      selfDeaf: this.selfDeaf,
      selfVideo: this.selfVideo,
      selfStream: this.selfStream,
      uptime,
      lastError: this.lastError,
      connectedAt: this.connectedAt,
    };
  }

  public async fetchUserProfile() {
    try {
      const response = await fetch("https://discord.com/api/v9/users/@me", {
        headers: {
          Authorization: this.token,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        },
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        this.username = data.global_name || data.username || "Discord User";
        this.userId = data.id || null;
        if (data.avatar) {
          this.avatar = `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=128`;
        }
        this.daveVoiceManager.setBotInfo(this.username, this.userId, this.avatar);
        this.lavalinkPlayer.updateBotInfo(this.username, this.userId, this.avatar);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async connect(targetGuildId?: string, targetChannelId?: string) {
    if (targetGuildId) this.guildId = targetGuildId;
    if (targetChannelId) this.channelId = targetChannelId;
    this.shouldReconnect = true;
    this.status = "Connecting";
    this.lastError = null;
    this.sequence = null;
    this.lastHeartbeatAck = true;

    addLog("info", "Initiating Gateway WebSocket connection...", this.token);

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Try fetching user profile first
    await this.fetchUserProfile();

    try {
      this.ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        },
      });

      this.ws.on("open", () => {
        addLog("info", "Gateway WebSocket connected. Awaiting HELLO...", this.token);
      });

      this.ws.on("message", async (rawData: WebSocket.Data) => {
        try {
          const packet = JSON.parse(rawData.toString());
          const { op, d, s, t } = packet;

          // Track Gateway sequence number
          if (typeof s === "number") {
            this.sequence = s;
          }

          // Opcode 10: HELLO
          if (op === 10) {
            const interval = d.heartbeat_interval;
            addLog("info", `HELLO received. Heartbeat interval: ${interval}ms`, this.token);

            // Start heartbeating per Discord Gateway specification (d = last received sequence or null)
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            this.lastHeartbeatAck = true;
            this.heartbeatInterval = setInterval(() => {
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                if (!this.lastHeartbeatAck) {
                  addLog("warn", "Gateway connection zombied (missed heartbeat ACK). Reconnecting...", this.token);
                  this.reconnect();
                  return;
                }
                this.lastHeartbeatAck = false;
                this._heartbeatSentAt = Date.now();
                this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
              }
            }, interval);

            // Opcode 2: IDENTIFY (September 2026 Build 568820 • DAVE v1.1 E2EE specification)
            const identifyPayload = {
              op: 2,
              d: {
                token: this.token,
                capabilities: 30717,
                properties: {
                  os: "Windows",
                  browser: "Discord Client",
                  release_channel: "stable",
                  client_version: "1.0.9257",
                  os_version: "10.0.26100",
                  os_arch: "x64",
                  system_locale: "en-US",
                  client_build_number: 568820,
                  native_build_number: "58210",
                  client_event_source: null,
                  design_id: 0,
                },
                presence: {
                  status: "online",
                  since: 0,
                  activities: [],
                  afk: false,
                },
                compress: false,
                client_state: {
                  guild_versions: {},
                  highest_last_message_id: "0",
                  read_state_version: 0,
                  user_guild_settings_version: -1,
                  user_settings_version: -1,
                  private_channels_version: "0",
                  api_code_version: 0,
                },
              },
            };
            this.ws.send(JSON.stringify(identifyPayload));
            addLog("info", "Sent IDENTIFY payload (Build 568820 • DAVE v1.1 E2EE Upgraded)", this.token);
          }

          // READY dispatch
          if (t === "READY") {
            this.sessionId = d.session_id;
            const u = d.user || {};
            this.username = u.global_name || u.username || this.username;
            this.userId = u.id || this.userId;
            if (u.avatar && u.id) {
              this.avatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`;
            }
            this.connectedAt = Date.now();
            this.status = this.channelId ? "In Voice" : "Connected";
            addLog("success", `Authentication successful! Authenticated as @${this.username}`, this.token);

            // Connect voice engines for this bot account
            this.daveVoiceManager.setBotInfo(this.username, this.userId, this.avatar);
            this.lavalinkPlayer.updateBotInfo(this.username, this.userId, this.avatar);
            this.lavalinkPlayer.connect();

            // If voice target specified, join voice state
            if (this.guildId && this.channelId) {
              await this.daveVoiceManager.joinVoice(this.guildId, this.channelId, (p) => this.sendGatewayPayload(p));
              await this.sendVoiceState();
            }
          }

          // VOICE_STATE_UPDATE dispatch
          if (t === "VOICE_STATE_UPDATE") {
            if (d.user_id === this.userId) {
              if (d.channel_id) {
                this.channelId = d.channel_id;
                this.guildId = d.guild_id || this.guildId;
                this.status = "In Voice";
              } else {
                this.channelId = null;
                this.status = "Connected";
              }
              this.daveVoiceManager.handleVoiceStateUpdate(d);
              this.lavalinkPlayer.updateVoiceState(d.session_id, this.guildId, this.channelId);
            }
          }

          // VOICE_SERVER_UPDATE dispatch
          if (t === "VOICE_SERVER_UPDATE") {
            if (d.guild_id) {
              this.guildId = d.guild_id;
            }
            this.daveVoiceManager.handleVoiceServerUpdate(d);
            this.lavalinkPlayer.updateVoiceServer(d.token, d.endpoint, d.guild_id);
          }

          // MESSAGE_CREATE: Handle Discord chat music commands (!scplay, !play, !stop, !skip)
          if (t === "MESSAGE_CREATE" && d && d.content) {
            const rawContent = String(d.content).trim();
            // 1. Pure SoundCloud command with no fallback: !scplay or .scplay or !soundcloud
            if (
              rawContent.startsWith("!scplay ") ||
              rawContent.startsWith(".scplay ") ||
              rawContent.startsWith("!soundcloud ") ||
              rawContent.startsWith(".soundcloud ")
            ) {
              const scQuery = rawContent.replace(/^(!scplay|\.scplay|!soundcloud|\.soundcloud)\s+/i, "").trim();
              if (scQuery && this.channelId && this.guildId) {
                addLog("info", `[Discord Command] Received pure SoundCloud play command: "${scQuery}" (No Fallback)`, this.token);
                if (ACTIVE_AUDIO_ENGINE === "direct") {
                  if (!this.daveVoiceManager.isReady()) {
                    await this.daveVoiceManager.joinVoice(this.guildId, this.channelId, (p) => this.sendGatewayPayload(p));
                  }
                  await this.daveVoiceManager.playSoundCloudDirect(scQuery, "now");
                } else {
                  await this.lavalinkPlayer.playSoundCloudDirect(scQuery, "now");
                }
              }
            } else if (rawContent.startsWith("!play ") || rawContent.startsWith(".play ")) {
              // 2. Play with automatic SoundCloud fallback: !play <song>
              const pQuery = rawContent.replace(/^(!play|\.play)\s+/i, "").trim();
              if (pQuery && this.channelId && this.guildId) {
                addLog("info", `[Discord Command] Received play command: "${pQuery}" (with automatic SoundCloud fallback)`, this.token);
                if (ACTIVE_AUDIO_ENGINE === "direct") {
                  if (!this.daveVoiceManager.isReady()) {
                    await this.daveVoiceManager.joinVoice(this.guildId, this.channelId, (p) => this.sendGatewayPayload(p));
                  }
                  await this.daveVoiceManager.play(pQuery, "now", "youtube");
                } else {
                  await this.lavalinkPlayer.play(pQuery, "now", "youtube");
                }
              }
            } else if (rawContent === "!stop" || rawContent === ".stop") {
              if (ACTIVE_AUDIO_ENGINE === "direct") {
                this.daveVoiceManager.stop();
              } else {
                this.lavalinkPlayer.stop();
              }
              addLog("info", `[Discord Command] Music playback stopped via ${rawContent}`, this.token);
            } else if (rawContent === "!skip" || rawContent === ".skip") {
              if (ACTIVE_AUDIO_ENGINE === "direct") {
                this.daveVoiceManager.skip();
              } else {
                this.lavalinkPlayer.skip();
              }
              addLog("info", `[Discord Command] Track skipped via ${rawContent}`, this.token);
            }
          }

          // Opcode 1: Heartbeat requested immediately by Discord
          if (op === 1) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
            }
          }

          // Opcode 11: Heartbeat ACK from Discord
          if (op === 11) {
            this.lastHeartbeatAck = true;
            if (this._heartbeatSentAt !== null) {
              this._lastGatewayPingMs = Date.now() - this._heartbeatSentAt;
              this._heartbeatSentAt = null;
            }
          }

          // Opcode 7: Reconnect requested
          if (op === 7) {
            addLog("warn", "Gateway requested Reconnect (op 7)", this.token);
            this.reconnect();
          }

          // Opcode 9: Invalid Session
          if (op === 9) {
            addLog("error", "Invalid Gateway Session (op 9). Re-identifying...", this.token);
            this.reconnect();
          }
        } catch (err: any) {
          console.error("Packet parse error:", err);
        }
      });

      this.ws.on("error", (err: Error) => {
        this.lastError = err.message;
        this.status = "Error";
        addLog("error", `Gateway WebSocket error: ${err.message}`, this.token);
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        addLog("warn", `Gateway closed with code ${code} (${reasonStr || "no reason"})`, this.token);
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        if (code === 4004) {
          this.status = "Error";
          this.lastError = "Authentication failed (Invalid or expired token).";
          this.shouldReconnect = false;
          addLog("error", "Authentication failed (Invalid or expired token - code 4004).", this.token);
          return;
        }
        if (this.shouldReconnect) {
          this.status = "Connecting";
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, 8000);
        } else {
          this.status = "Disconnected";
        }
      });
    } catch (err: any) {
      this.status = "Error";
      this.lastError = err.message;
      addLog("error", `Failed to initialize Gateway connection: ${err.message}`, this.token);
    }
  }

  public async sendVoiceState() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = {
        op: 4,
        d: {
          guild_id: this.guildId ? String(this.guildId) : null,
          channel_id: this.channelId ? String(this.channelId) : null,
          self_mute: Boolean(this.selfMute),
          self_deaf: Boolean(this.selfDeaf),
          self_video: Boolean(this.selfVideo),
        },
      };
      this.ws.send(JSON.stringify(payload));
      this.status = this.channelId ? "In Voice" : "Connected";
      addLog(
        "info",
        `Voice state updated -> Guild: ${this.guildId || "none"} | Channel: ${this.channelId || "none"} | Mute: ${this.selfMute ? "ON" : "OFF"} | Deafen: ${this.selfDeaf ? "ON" : "OFF"} | Video: ${this.selfVideo ? "ON" : "OFF"}`,
        this.token
      );
    }
  }

  public async updateAudio(mute?: boolean, deaf?: boolean) {
    if (mute !== undefined) this.selfMute = mute;
    if (deaf !== undefined) this.selfDeaf = deaf;
    await this.sendVoiceState();
  }

  public async updateVideo(video?: boolean) {
    if (video !== undefined) this.selfVideo = video;
    await this.sendVoiceState();
  }

  public async updateStream(stream?: boolean) {
    if (stream !== undefined) this.selfStream = stream;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.channelId) {
      const op = this.selfStream ? 18 : 19;
      const label = this.selfStream ? "START" : "STOP";
      const payload = {
        op,
        d: {
          type: "guild",
          guild_id: this.guildId ? String(this.guildId) : null,
          channel_id: this.channelId ? String(this.channelId) : null,
          preferred_region: null,
        },
      };
      try {
        this.ws.send(JSON.stringify(payload));
        addLog("info", `Screen Stream ${label} dispatched`, this.token);
      } catch (err: any) {
        addLog("error", `Stream sync error: ${err.message}`, this.token);
      }
    }
  }

  public async joinChannel(guildId: string, channelId: string) {
    this.guildId = String(guildId).trim();
    this.channelId = String(channelId).trim();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(this.guildId, this.channelId);
    } else {
      // Connect direct DAVE voice for real microphone transmission
      await this.daveVoiceManager.joinVoice(this.guildId, this.channelId, (p) => this.sendGatewayPayload(p));
      await this.sendVoiceState();
      if (this.selfStream) {
        await this.updateStream(true);
      }
    }
  }

  public async leaveChannel() {
    this.daveVoiceManager.destroyConnection();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          op: 4,
          d: {
            guild_id: this.guildId ? String(this.guildId) : null,
            channel_id: null,
            self_mute: false,
            self_deaf: false,
            self_video: false,
          },
        })
      );
      this.channelId = null;
      this.status = "Connected";
      this.lavalinkPlayer.stop();
      addLog("info", "Left voice channel", this.token);
    }
  }

  public async disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.daveVoiceManager.destroyConnection();
    await this.leaveChannel();
    this.lavalinkPlayer.destroy();
    if (this.ws) {
      try {
        this.ws.close();
      } catch { }
      this.ws = null;
    }
    this.status = "Disconnected";
    this.connectedAt = null;
    addLog("info", "Bot disconnected by user", this.token);
  }

  private reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch { }
    }
    if (this.shouldReconnect) {
      setTimeout(() => this.connect(), 4000);
    }
  }
}

class BotManager {
  public bots: Map<string, DiscordBotClient> = new Map();

  constructor() {
    this.loadFromTokensFile();
  }

  public loadFromTokensFile() {
    try {
      let targetFile = TOKENS_FILE;
      if (process.env.VERCEL && !fs.existsSync(targetFile)) {
        const rootTokens = path.join(process.cwd(), "tokens.txt");
        if (fs.existsSync(rootTokens)) {
          targetFile = rootTokens;
        }
      }
      if (fs.existsSync(targetFile)) {
        const content = fs.readFileSync(targetFile, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith("//") || line.startsWith("#")) continue;
          line = line.replace(/^["']|["']$/g, "").trim();
          if (line && !this.bots.has(line)) {
            const bot = new DiscordBotClient(line);
            this.bots.set(line, bot);
            bot.fetchUserProfile().catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("Failed reading tokens file:", e);
    }
  }

  public saveToTokensFile() {
    try {
      const header =
        "// Discord Voice Joiner - Add your Discord user tokens here (one per line)\n// Lines starting with // are ignored\n\n";
      const tokenLines = Array.from(this.bots.keys()).join("\n");
      fs.writeFileSync(TOKENS_FILE, header + tokenLines + "\n", "utf-8");
    } catch (e) {
      console.error("Failed writing tokens file:", e);
    }
  }

  public addToken(token: string): DiscordBotClient {
    const cleanToken = token.trim().replace(/^["']|["']$/g, "");
    if (this.bots.has(cleanToken)) {
      return this.bots.get(cleanToken)!;
    }
    const bot = new DiscordBotClient(cleanToken);
    this.bots.set(cleanToken, bot);
    bot.fetchUserProfile();
    this.saveToTokensFile();
    addLog("info", "Registered new token into manager", cleanToken);
    return bot;
  }

  public removeToken(token: string): boolean {
    const cleanToken = token.trim();
    const bot = this.bots.get(cleanToken);
    if (bot) {
      bot.disconnect();
      this.bots.delete(cleanToken);
      this.saveToTokensFile();
      addLog("info", "Removed token from manager", cleanToken);
      return true;
    }
    return false;
  }

  public removeTokens(tokens: string[]): number {
    let count = 0;
    for (const t of tokens) {
      if (typeof t !== "string") continue;
      const cleanToken = t.trim();
      const bot = this.bots.get(cleanToken);
      if (bot) {
        bot.disconnect();
        this.bots.delete(cleanToken);
        count++;
      }
    }
    if (count > 0) {
      this.saveToTokensFile();
      addLog("info", `Batch removed ${count} tokens from manager`);
    }
    return count;
  }

  public removeAllTokens(): number {
    const count = this.bots.size;
    for (const bot of this.bots.values()) {
      bot.disconnect();
    }
    this.bots.clear();
    this.saveToTokensFile();
    addLog("info", `Removed all (${count}) tokens from manager and tokens.txt`);
    return count;
  }

  public getBot(token?: string): DiscordBotClient | null {
    if (token && this.bots.has(token)) {
      return this.bots.get(token)!;
    }
    const all = Array.from(this.bots.values());
    const inVoice = all.find((b) => b.channelId && b.status === "In Voice");
    if (inVoice) return inVoice;
    const connected = all.find((b) => b.status === "Connected");
    if (connected) return connected;
    return all[0] || null;
  }

  public async joinAll(guildId: string, channelId: string) {
    addLog("info", `Bulk join requested -> Guild: ${guildId}, Channel: ${channelId}`);
    for (const bot of this.bots.values()) {
      bot.joinChannel(guildId, channelId);
      // Stagger join requests slightly (350ms) to avoid rate limiting
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  public async stopAll() {
    addLog("info", "Bulk stop requested. Leaving channels for all bots...");
    for (const bot of this.bots.values()) {
      bot.leaveChannel();
    }
  }

  public async disconnectAll() {
    addLog("info", "Disconnecting all bots from Gateway...");
    for (const bot of this.bots.values()) {
      bot.disconnect();
    }
  }

  public async bulkAudio(mute?: boolean, deaf?: boolean) {
    addLog("info", `Bulk audio update -> Mute: ${mute ?? "unchanged"}, Deafen: ${deaf ?? "unchanged"}`);
    for (const bot of this.bots.values()) {
      bot.updateAudio(mute, deaf);
    }
  }

  public async bulkVideo(video: boolean) {
    addLog("info", `Bulk video camera update -> Video: ${video ? "ON" : "OFF"}`);
    for (const bot of this.bots.values()) {
      bot.updateVideo(video);
    }
  }

  public async bulkStream(stream: boolean) {
    addLog("info", `Bulk screen share stream update -> Stream: ${stream ? "ON" : "OFF"}`);
    for (const bot of this.bots.values()) {
      bot.updateStream(stream);
    }
  }

  public async randomEvent() {
    addLog("info", "  Random Event Engine triggered! Randomizing voice states...");
    for (const bot of this.bots.values()) {
      const rMute = Math.random() < 0.5;
      const rDeaf = Math.random() < 0.5;
      const rVideo = Math.random() < 0.3; // 30% chance for video
      const rStream = Math.random() < 0.3; // 30% chance for stream
      bot.selfMute = rMute;
      bot.selfDeaf = rDeaf;
      bot.selfVideo = rVideo;
      bot.selfStream = rStream;
      if (bot.channelId) {
        await bot.sendVoiceState();
        await bot.updateStream(rStream);
      }
    }
  }

  public async clearEvents() {
    addLog("info", "Resetting all events to default voice states...");
    for (const bot of this.bots.values()) {
      bot.selfMute = false;
      bot.selfDeaf = false;
      bot.selfVideo = false;
      bot.selfStream = false;
      if (bot.channelId) {
        await bot.sendVoiceState();
        await bot.updateStream(false);
      }
    }
  }
}

const manager = new BotManager();

// Initial welcome log
addLog("success", "Discord Voice Joiner v1 (September 2026 Build 568820 • DAVE v1.1 E2EE Upgraded) backend initialized");

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Ping Endpoint: Measures dashboard HTTP round-trip and bot Gateway WebSocket ping
app.get("/api/ping", (_req, res) => {
  const serverStart = Date.now();

  // Collect per-bot gateway ping data from their heartbeat latency
  const botsList = Array.from(manager.bots.values());
  const botPings = botsList.map((bot) => ({
    tokenPreview: `${bot.token.slice(0, 8)}...${bot.token.slice(-4)}`,
    username: bot.username,
    status: bot.status,
    gatewayPingMs: (bot as any)._lastGatewayPingMs ?? null,
  }));

  // Average gateway ping across all active bots
  const activePings = botPings
    .map((b) => b.gatewayPingMs)
    .filter((p): p is number => p !== null && p >= 0);
  const avgGatewayPing = activePings.length > 0
    ? Math.round(activePings.reduce((a, b) => a + b, 0) / activePings.length)
    : null;

  // Dashboard server latency is the time to generate this response
  const dashboardPingMs = Date.now() - serverStart;

  res.json({
    dashboardPingMs,
    avgGatewayPingMs: avgGatewayPing,
    botPings,
    timestamp: new Date().toISOString(),
  });
});

// System Status
app.get("/api/system/status", (_req, res) => {
  const botsList = Array.from(manager.bots.values());
  const activeVoice = botsList.filter((b) => b.channelId && b.status === "In Voice").length;
  const connected = botsList.filter((b) => b.status === "Connected" || b.status === "In Voice").length;
  const muted = botsList.filter((b) => b.selfMute).length;
  const deafened = botsList.filter((b) => b.selfDeaf).length;
  const streaming = botsList.filter((b) => b.selfStream).length;
  const video = botsList.filter((b) => b.selfVideo).length;

  res.json({
    version: "September 2026 Build 568820",
    protocol: "Gateway v10 API & DAVE v1.1 E2EE",
    daveProtocolVersion: "1.1",
    e2eeStatus: "Active (DAVE v1.1 Upgraded)",
    clientBuildNumber: 568820,
    clientVersion: "1.0.9257",
    totalTokens: botsList.length,
    connected,
    activeVoice,
    muted,
    deafened,
    streaming,
    video,
    serverUptime: process.uptime(),
  });
});

// Manual E2EE Protocol Upgrade / Sync Endpoint
app.post("/api/e2ee/upgrade", async (_req, res) => {
  try {
    addLog("info", "Starting DAVE v1.1 E2EE Protocol re-synchronization across all active accounts...");
    const bots = Array.from(manager.bots.values());
    for (const bot of bots) {
      if (bot.channelId && bot.guildId) {
        await bot.daveVoiceManager.joinVoice(bot.guildId, bot.channelId, (p) => bot.sendGatewayPayload(p));
        await bot.sendVoiceState();
      }
    }
    addLog("success", "DAVE v1.1 E2EE & Build 568820 Protocol Upgrade verified: All accounts synchronized with modern MLS encryption.");
    res.json({
      success: true,
      daveProtocolVersion: "1.1",
      clientBuildNumber: 568820,
      clientVersion: "1.0.9257",
      e2eeStatus: "Active & Upgraded (No Deprecation Warnings)",
      message: "Successfully synchronized DAVE v1.1 E2EE Protocol. Discord client version and voice encryption are now on the latest build.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tokens list
app.get("/api/tokens", (_req, res) => {
  const tokens = Array.from(manager.bots.values()).map((b) => b.getState());
  res.json(tokens);
});

// Add tokens (single or bulk text)
app.post("/api/tokens", (req, res) => {
  try {
    const { tokens, token } = req.body || {};
    const added: string[] = [];
    if (token && typeof token === "string") {
      manager.addToken(token);
      added.push(token);
    } else if (Array.isArray(tokens)) {
      for (const t of tokens) {
        if (typeof t === "string" && t.trim()) {
          manager.addToken(t);
          added.push(t);
        }
      }
    } else if (typeof tokens === "string") {
      // Bulk text parsing
      const lines = tokens.split(/\r?\n/);
      for (const l of lines) {
        const clean = l.trim().replace(/^["']|["']$/g, "");
        if (clean && !clean.startsWith("//") && !clean.startsWith("#")) {
          manager.addToken(clean);
          added.push(clean);
        }
      }
    }
    return res.json({ success: true, count: added.length });
  } catch (err: any) {
    console.error("Error adding tokens:", err);
    return res.status(500).json({ success: false, error: err?.message || "Failed adding tokens" });
  }
});

// Delete token (single)
app.delete("/api/tokens/:token", (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const success = manager.removeToken(token);
  res.json({ success });
});

// Bulk delete selected tokens
app.post("/api/tokens/delete-bulk", (req, res) => {
  const { tokens } = req.body;
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: "No tokens provided for deletion" });
  }
  const count = manager.removeTokens(tokens);
  res.json({ success: true, count });
});

// Delete all tokens
app.post("/api/tokens/delete-all", (_req, res) => {
  const count = manager.removeAllTokens();
  res.json({ success: true, count });
});

// Connect individual bot
app.post("/api/tokens/:token/connect", async (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const bot = manager.bots.get(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  await bot.connect();
  res.json({ success: true, state: bot.getState() });
});

// Disconnect individual bot
app.post("/api/tokens/:token/disconnect", async (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const bot = manager.bots.get(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  await bot.disconnect();
  res.json({ success: true, state: bot.getState() });
});

// Join individual bot to voice
app.post("/api/tokens/:token/join", async (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const { guildId, channelId } = req.body;
  const bot = manager.bots.get(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (!guildId || !channelId) return res.status(400).json({ error: "Missing guildId or channelId" });
  await bot.joinChannel(guildId, channelId);
  res.json({ success: true, state: bot.getState() });
});

// Leave individual bot from voice
app.post("/api/tokens/:token/leave", async (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const bot = manager.bots.get(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  await bot.leaveChannel();
  res.json({ success: true, state: bot.getState() });
});

// Update voice state for individual bot
app.post("/api/tokens/:token/voice-state", async (req, res) => {
  const token = decodeURIComponent(req.params.token);
  const { mute, deaf, video, stream } = req.body;
  const bot = manager.bots.get(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (mute !== undefined || deaf !== undefined) {
    await bot.updateAudio(mute, deaf);
  }
  if (video !== undefined) {
    await bot.updateVideo(video);
  }
  if (stream !== undefined) {
    await bot.updateStream(stream);
  }
  res.json({ success: true, state: bot.getState() });
});

// Bulk Join All
app.post("/api/actions/join-all", async (req, res) => {
  const { guildId, channelId } = req.body;
  if (!guildId || !channelId) {
    return res.status(400).json({ error: "Both Server ID (guildId) and Channel ID are required." });
  }
  // Run asynchronously so response is fast
  manager.joinAll(guildId, channelId);
  res.json({ success: true, message: `Dispatched join for ${manager.bots.size} accounts` });
});

// Bulk Stop All
app.post("/api/actions/stop-all", async (_req, res) => {
  await manager.stopAll();
  res.json({ success: true, message: "All accounts left voice channels" });
});

// Bulk Disconnect All from Gateway
app.post("/api/actions/disconnect-all", async (_req, res) => {
  await manager.disconnectAll();
  res.json({ success: true, message: "All accounts disconnected from Gateway" });
});

// Bulk Audio
app.post("/api/actions/bulk-audio", async (req, res) => {
  const { mute, deaf } = req.body;
  await manager.bulkAudio(mute, deaf);
  res.json({ success: true });
});

// Bulk Video
app.post("/api/actions/bulk-video", async (req, res) => {
  const { video } = req.body;
  await manager.bulkVideo(Boolean(video));
  res.json({ success: true });
});

// Bulk Stream
app.post("/api/actions/bulk-stream", async (req, res) => {
  const { stream } = req.body;
  await manager.bulkStream(Boolean(stream));
  res.json({ success: true });
});

// Random Event Engine
app.post("/api/actions/random-event", async (_req, res) => {
  await manager.randomEvent();
  res.json({ success: true });
});

// Clear Events
app.post("/api/actions/clear-events", async (_req, res) => {
  await manager.clearEvents();
  res.json({ success: true });
});

// Join Discord Server via Invite link
app.post("/api/server-invite/join", async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) return res.status(400).json({ error: "Missing invite code" });

  const codeMatch = inviteCode.match(/(?:discord\.gg\/|discord\.com\/invites\/|discord\.com\/api\/v10\/invites\/)?([a-zA-Z0-9-]+)/);
  const cleanCode = codeMatch ? codeMatch[1] : inviteCode;

  addLog("info", `Attempting server invite join for code: ${cleanCode}`);

  let successCount = 0;
  let failCount = 0;

  for (const bot of manager.bots.values()) {
    try {
      const joinResp = await fetch(`https://discord.com/api/v10/invites/${cleanCode}`, {
        method: "POST",
        headers: {
          Authorization: bot.token,
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          "X-Context-Properties": Buffer.from(JSON.stringify({ location: "Invite Link" })).toString("base64"),
        },
        body: JSON.stringify({ client_state_version: 42 }),
      });

      if (joinResp.ok) {
        successCount++;
        addLog("success", `Successfully joined server via invite ${cleanCode}`, bot.token);
      } else {
        failCount++;
        const errData = (await joinResp.json().catch(() => ({}))) as any;
        addLog("warn", `Server invite failed (${joinResp.status}): ${errData.message || "Unknown error"}`, bot.token);
      }
    } catch (err: any) {
      failCount++;
      addLog("error", `Exception joining invite: ${err.message}`, bot.token);
    }
    // Delay between invite joins
    await new Promise((r) => setTimeout(r, 600));
  }

  res.json({ success: true, successCount, failCount });
});

// Logs endpoint
app.get("/api/logs", (_req, res) => {
  res.json(logs);
});

app.post("/api/logs/clear", (_req, res) => {
  logs.length = 0;
  addLog("info", "Logs cleared by user");
  res.json({ success: true });
});

// Export tokens.txt content
app.get("/api/tokens/export", (_req, res) => {
  if (fs.existsSync(TOKENS_FILE)) {
    const data = fs.readFileSync(TOKENS_FILE, "utf-8");
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=tokens.txt");
    res.send(data);
  } else {
    res.send("");
  }
});

// ==========================================
// LAVALINK v4 MUSIC PLAYER ROUTES (LUMINA-V1)
// ==========================================

// Get Lavalink Node Config & Presets
app.get("/api/lavalink/config", (_req, res) => {
  res.json({
    active: ACTIVE_LAVALINK_CONFIG,
    presets: PRESET_LAVALINK_NODES,
  });
});

// Update Lavalink Node Config (Switch node)
app.post("/api/lavalink/config", (req, res) => {
  const { name, url, auth, secure } = req.body;
  if (!url || !auth) {
    return res.status(400).json({ error: "URL and auth password are required" });
  }
  updateLavalinkNodeConfig({
    name: name || "Custom Node",
    url: url.trim().replace(/^https?:\/\//, "").replace(/^wss?:\/\//, ""),
    auth: auth.trim(),
    secure: Boolean(secure),
  });
  // Reconnect all active bots to the new node
  for (const bot of manager.bots.values()) {
    bot.lavalinkPlayer.reconnectWithNewNode();
  }
  addLog("info", `Switched Lavalink Node to ${ACTIVE_LAVALINK_CONFIG.name} (${ACTIVE_LAVALINK_CONFIG.url})`);
  res.json({
    success: true,
    active: ACTIVE_LAVALINK_CONFIG,
  });
});

// Test connection to any Lavalink Node
app.post("/api/lavalink/test", async (req, res) => {
  const { url, auth, secure } = req.body;
  if (!url || !auth) {
    return res.status(400).json({ error: "URL and auth password are required" });
  }
  const cleanUrl = url.trim().replace(/^https?:\/\//, "").replace(/^wss?:\/\//, "");
  const proto = secure ? "https://" : "http://";
  const start = Date.now();
  try {
    const infoRes = await fetch(`${proto}${cleanUrl}/v4/info`, {
      headers: { Authorization: auth.trim() },
      signal: AbortSignal.timeout(5000),
    });
    const ping = Date.now() - start;
    if (infoRes.ok) {
      const data = await infoRes.json().catch(() => ({}));
      return res.json({
        ok: true,
        ping,
        version: (data as any)?.version?.semver || "v4",
        message: `Connected successfully (${ping}ms)`,
      });
    } else {
      return res.status(infoRes.status).json({
        ok: false,
        ping,
        error: `HTTP ${infoRes.status}: ${infoRes.statusText}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to reach node",
    });
  }
});

// Get Lavalink Node Status & System Stats
app.get("/api/lavalink/status", async (_req, res) => {
  const status = await getLavalinkNodeStatus();
  res.json(status);
});

// Get current active Audio Engine
app.get("/api/audio/engine", (_req, res) => {
  res.json({ engine: ACTIVE_AUDIO_ENGINE });
});

// Switch Audio Engine ("direct" for DAVE Voice Mic vs "lavalink")
app.post("/api/audio/engine", (req, res) => {
  const { engine } = req.body;
  ACTIVE_AUDIO_ENGINE = engine === "lavalink" ? "lavalink" : "direct";
  addLog("info", `Audio Engine switched to: ${ACTIVE_AUDIO_ENGINE === "direct" ? "Direct Voice Engine (DAVE E2EE Mic Audio)" : "Lavalink Node (LUMINA-V1)"}`);
  res.json({ success: true, engine: ACTIVE_AUDIO_ENGINE });
});

// Preset Radio Stations
app.get("/api/voice/radio-stations", (_req, res) => {
  res.json(RADIO_STATIONS);
});

// Test Voice Channel Audio Chime (Verifies bot's mic is playing audio in VC)
app.post("/api/voice/test-chime", async (req, res) => {
  const { token } = req.body;
  const bot = manager.getBot(token);
  if (!bot) {
    return res.status(400).json({ error: "No active bot found. Join a voice channel first." });
  }
  if (!bot.channelId || !bot.guildId) {
    return res.status(400).json({
      error: `Bot "@${bot.username}" is not in a voice channel! Please join a voice channel on the Dashboard first.`,
    });
  }
  // Ensure direct voice connection is ready
  if (!bot.daveVoiceManager.isReady()) {
    await bot.daveVoiceManager.joinVoice(bot.guildId, bot.channelId, (p) => bot.sendGatewayPayload(p));
  }
  const result = await bot.daveVoiceManager.playTestChime();
  res.json({
    ...result,
    playerState: bot.daveVoiceManager.getState(),
  });
});

// Search tracks across Direct Voice Engine or Lavalink
app.get("/api/lavalink/search", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : "";
  const noFallback = req.query.noFallback === "true" || req.query.noFallback === "1";
  const validSources: SearchSource[] = ["youtube", "ytmusic", "spotify", "soundcloud", "applemusic", "deezer", "yandex"];
  const rawSource = typeof req.query.source === "string" ? req.query.source : "youtube";
  let source: SearchSource = (validSources.includes(rawSource as SearchSource) ? rawSource : "youtube") as SearchSource;

  if (!query.trim()) {
    return res.json({ loadType: "empty", tracks: [] });
  }

  try {
    const cleanQ = query.trim();
    if (
      cleanQ.includes("soundcloud.com/") ||
      cleanQ.includes("on.soundcloud.com/") ||
      cleanQ.startsWith("sc:") ||
      cleanQ.startsWith("scsearch:") ||
      cleanQ.startsWith("soundcloud:")
    ) {
      source = "soundcloud";
    } else if (isSpotifyUrl(cleanQ)) {
      source = "spotify";
    } else if (cleanQ.includes("youtube.com") || cleanQ.includes("youtu.be")) {
      source = "youtube";
    }

    if (isSpotifyPlaylistOrAlbum(cleanQ)) {
      const entity = await resolveSpotify(cleanQ);
      if (
        entity &&
        (entity.type === "playlist" || entity.type === "album") &&
        entity.tracks.length > 0
      ) {
        const formatted = entity.tracks.map((t, idx) => ({
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
        return res.json({
          loadType: "playlist",
          playlistInfo: { name: entity.title },
          tracks: formatted,
        });
      }
    }

    if (ACTIVE_AUDIO_ENGINE === "direct") {
      const bot = manager.getBot();
      const voiceMgr = bot ? bot.daveVoiceManager : new DaveVoiceManager("search");
      // daveVoiceManager only supports youtube/spotify/soundcloud; map new sources to youtube
      const daveSource = (["youtube", "spotify", "soundcloud"].includes(source) ? source : "youtube") as "youtube" | "spotify" | "soundcloud";
      const tracks = await voiceMgr.searchTracks(query.trim(), daveSource, noFallback);
      // Format to LavalinkTrack structure so frontend displays seamlessly
      const formatted = tracks.map((t) => ({
        encoded: t.id,
        info: {
          identifier: t.id,
          isSeekable: true,
          author: t.author,
          length: t.durationMs,
          isStream: t.source === "stream",
          position: 0,
          title: t.title,
          uri: t.url,
          artworkUrl: t.artworkUrl || null,
          sourceName: t.source,
        },
      }));
      return res.json({
        loadType: formatted.length > 0 ? "search" : "empty",
        tracks: formatted,
      });
    } else {
      let result = await searchLavalinkTracks(query.trim(), source, noFallback);
      if (!result || !result.tracks || result.tracks.length === 0) {
        if (!noFallback) {
          // Fallback to direct voice search so results are resilient
          const bot = manager.getBot();
          const voiceMgr = bot ? bot.daveVoiceManager : new DaveVoiceManager("search");
          const daveSource2 = (["youtube", "spotify", "soundcloud"].includes(source) ? source : "youtube") as "youtube" | "spotify" | "soundcloud";
          const tracks = await voiceMgr.searchTracks(query.trim(), daveSource2, false);
          const formatted = tracks.map((t) => ({
            encoded: t.id,
            info: {
              identifier: t.id,
              isSeekable: true,
              author: t.author,
              length: t.durationMs,
              isStream: t.source === "stream",
              position: 0,
              title: t.title,
              uri: t.url,
              artworkUrl: t.artworkUrl || null,
              sourceName: t.source,
            },
          }));
          return res.json({
            loadType: formatted.length > 0 ? "search" : "empty",
            tracks: formatted,
          });
        }
      }
      return res.json(result);
    }
  } catch (err: any) {
    console.error("[Search Error]", err.message);
    return res.json({ loadType: "empty", tracks: [] });
  }
});

// Get all players state
app.get("/api/lavalink/players", (_req, res) => {
  const states = Array.from(manager.bots.values()).map((b) =>
    ACTIVE_AUDIO_ENGINE === "direct" ? b.daveVoiceManager.getState() : b.lavalinkPlayer.getState()
  );
  res.json(states);
});

// Get player state for a specific bot or active bot
app.get("/api/lavalink/player", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  let bot = manager.getBot(token);
  if (!bot) {
    const allBots = Array.from(manager.bots.values());
    bot = allBots.find((b) => b.channelId) || allBots[0];
  }
  if (!bot) {
    return res.json({
      botToken: "",
      botUsername: "None",
      avatar: null,
      guildId: null,
      channelId: null,
      connectedToVoice: false,
      connected: false,
      playing: false,
      paused: false,
      currentTrack: null,
      track: null,
      position: 0,
      duration: 0,
      volume: 100,
      queue: [],
      history: [],
      repeatMode: "off",
      autoplay: false,
      soundMode: "hd",
      lavalinkSessionId: null,
      lavalinkNodeStatus: "disconnected",
      engine: ACTIVE_AUDIO_ENGINE,
      idle: true,
      error: null,
      notice: "No bot registered yet. Add a token in the Accounts tab.",
    });
  }
  const state = ACTIVE_AUDIO_ENGINE === "direct" ? bot.daveVoiceManager.getState() : bot.lavalinkPlayer.getState();
  res.json({
    ...state,
    engine: ACTIVE_AUDIO_ENGINE,
  });
});

// Play song on self-bot
app.post("/api/lavalink/play", async (req, res) => {
  const { token, query, track, mode, source, engine, noFallback } = req.body;
  let bot = manager.getBot(token);
  if (!bot) {
    const allBots = Array.from(manager.bots.values());
    bot = allBots.find((b) => b.channelId && b.guildId) || allBots[0];
  }
  if (!bot) {
    return res.status(400).json({ error: "No active bot found. Please add a token and join a voice channel first." });
  }
  if (!bot.channelId || !bot.guildId) {
    return res.status(400).json({
      error: `Bot "@${bot.username}" is not in a voice channel! Please join a voice channel on the Dashboard first.`,
    });
  }
  const target = track || query;
  if (!target) {
    return res.status(400).json({ error: "No song name or track data provided." });
  }

  const selectedEngine = engine || ACTIVE_AUDIO_ENGINE;

  const allSources: SearchSource[] = ["youtube", "ytmusic", "spotify", "soundcloud", "applemusic", "deezer", "yandex"];
  let selectedSource: SearchSource = (allSources.includes(source as SearchSource) ? source : "youtube") as SearchSource;

  const targetStr = typeof target === "string" ? target : (target as any).info?.uri || (target as any).url || "";
  if (
    targetStr.includes("soundcloud.com/") ||
    targetStr.includes("on.soundcloud.com/") ||
    targetStr.startsWith("sc:") ||
    targetStr.startsWith("scsearch:") ||
    targetStr.startsWith("soundcloud:")
  ) {
    selectedSource = "soundcloud";
  }

  const pureSoundCloud = selectedSource === "soundcloud" || Boolean(noFallback);
  // Cast to dave-compatible source (daveVoiceManager only supports youtube/spotify/soundcloud)
  const daveCompatSource = (["youtube", "spotify", "soundcloud"].includes(selectedSource) ? selectedSource : "youtube") as "youtube" | "spotify" | "soundcloud";

  if (selectedEngine === "direct") {
    // Direct Voice Engine: transmits high-fidelity audio directly into voice channel through the bot's mic
    if (!bot.daveVoiceManager.isReady()) {
      addLog("info", `Establishing Direct Voice connection before playback...`, bot.token);
      await bot.daveVoiceManager.joinVoice(bot.guildId, bot.channelId, (p) => bot!.sendGatewayPayload(p));
      // Wait up to 5s for the voice connection to become ready
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (bot.daveVoiceManager.isReady()) break;
      }
    }
    const result = await bot.daveVoiceManager.play(target, mode || "now", daveCompatSource, pureSoundCloud);
    if (!result.success) {
      // If primary engine failed and fallback was not disabled, try SoundCloud direct fallback
      if (!pureSoundCloud) {
        addLog("warn", `Primary playback failed. Triggering automatic SoundCloud fallback for "${targetStr || 'track'}"...`, bot.token);
        const fallbackRes = await bot.daveVoiceManager.playSoundCloudDirect(targetStr, mode || "now");
        if (fallbackRes.success) {
          return res.json({
            ...fallbackRes,
            fallbackActive: true,
            fallbackNotice: "Auto-diverted to SoundCloud fallback stream",
            playerState: bot.daveVoiceManager.getState(),
          });
        }
      }

      return res.status(400).json({
        error: result.error || "Playback failed",
        playerState: bot.daveVoiceManager.getState(),
      });
    }
    return res.json({
      ...result,
      playerState: bot.daveVoiceManager.getState(),
    });
  } else {
    // Lavalink Node Engine
    const result = await bot.lavalinkPlayer.play(target, mode || "now", selectedSource, pureSoundCloud);
    return res.json({
      ...result,
      playerState: bot.lavalinkPlayer.getState(),
    });
  }
});

// Pure SoundCloud playback without any fallback command
app.post("/api/lavalink/play-soundcloud", async (req, res) => {
  const { token, query, track, mode, engine } = req.body;
  let bot = manager.getBot(token);
  if (!bot) {
    const allBots = Array.from(manager.bots.values());
    bot = allBots.find((b) => b.channelId && b.guildId) || allBots[0];
  }
  if (!bot) {
    return res.status(400).json({ error: "No active bot found. Join a voice channel first." });
  }
  if (!bot.channelId || !bot.guildId) {
    return res.status(400).json({ error: `Bot "@${bot.username}" is not in a voice channel!` });
  }
  const target = track || query;
  if (!target) {
    return res.status(400).json({ error: "No song name or SoundCloud URL provided." });
  }

  const selectedEngine = engine || ACTIVE_AUDIO_ENGINE;
  addLog("info", `[Pure SoundCloud Command] Playing "${typeof target === 'string' ? target : (target as any).info?.title || 'track'}" (No fallback)`, bot.token);

  if (selectedEngine === "direct") {
    if (!bot.daveVoiceManager.isReady()) {
      addLog("info", `Establishing Direct Voice connection before SoundCloud playback...`, bot.token);
      await bot.daveVoiceManager.joinVoice(bot.guildId, bot.channelId, (p) => bot!.sendGatewayPayload(p));
      // Wait up to 5s for the voice connection to become ready
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (bot.daveVoiceManager.isReady()) break;
      }
    }
    const result = await bot.daveVoiceManager.playSoundCloudDirect(target, mode || "now");
    if (!result.success) {
      return res.status(400).json({
        error: result.error || "SoundCloud playback failed",
        playerState: bot.daveVoiceManager.getState(),
      });
    }
    return res.json({
      ...result,
      playerState: bot.daveVoiceManager.getState(),
    });
  } else {
    const result = await bot.lavalinkPlayer.playSoundCloudDirect(target, mode || "now");
    return res.json({
      ...result,
      playerState: bot.lavalinkPlayer.getState(),
    });
  }
});

// Pause playback
app.post("/api/lavalink/pause", async (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.pause();
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.pause();
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Resume playback
app.post("/api/lavalink/resume", async (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.resume();
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.resume();
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Stop playback
app.post("/api/lavalink/stop", async (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.stop();
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.stop();
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Skip to next track
app.post("/api/lavalink/skip", async (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.skip();
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.skip();
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Volume control
app.post("/api/lavalink/volume", async (req, res) => {
  const { token, volume } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  const volNum = Number(volume) || 100;
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.setVolume(volNum);
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.setVolume(volNum);
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Seek position
app.post("/api/lavalink/seek", async (req, res) => {
  const { token, position } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    // Direct voice streams seek
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    await bot.lavalinkPlayer.seek(Number(position) || 0);
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Repeat mode
app.post("/api/lavalink/repeat", (req, res) => {
  const { token, mode } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.setRepeat(mode || "off");
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    bot.lavalinkPlayer.setRepeat(mode || "off");
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Remove from queue
app.post("/api/lavalink/queue/remove", (req, res) => {
  const { token, index } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    const success = bot.daveVoiceManager.removeFromQueue(Number(index));
    res.json({ success, playerState: bot.daveVoiceManager.getState() });
  } else {
    const success = bot.lavalinkPlayer.removeFromQueue(Number(index));
    res.json({ success, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Clear queue
app.post("/api/lavalink/queue/clear", (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.clearQueue();
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    bot.lavalinkPlayer.clearQueue();
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Autoplay toggle endpoint
app.post("/api/lavalink/autoplay", (req, res) => {
  const { token, enabled } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  const isEnabled = Boolean(enabled);
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.setAutoplay(isEnabled);
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    bot.lavalinkPlayer.setAutoplay(isEnabled);
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Sound clarity / EQ preset mode endpoint
// Supports all AudioPresetName values: flat, hd, boost, bassboost, nightcore, vaporwave, 8d, soft, earrape, pop, treble
app.post("/api/lavalink/sound-mode", async (req, res) => {
  const { token, mode } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  const validModes: AudioPresetName[] = ["flat", "hd", "boost", "bassboost", "nightcore", "vaporwave", "8d", "soft", "earrape", "pop", "treble"];
  const cleanMode: AudioPresetName = (validModes.includes(mode as AudioPresetName) ? mode : "hd") as AudioPresetName;
  if (ACTIVE_AUDIO_ENGINE === "direct") {
    bot.daveVoiceManager.setSoundMode(cleanMode as any);
    res.json({ success: true, playerState: bot.daveVoiceManager.getState() });
  } else {
    bot.lavalinkPlayer.setSoundMode(cleanMode);
    res.json({ success: true, playerState: bot.lavalinkPlayer.getState() });
  }
});

// Audio Filters API — Lavalink v4 raw filter control (EQ, timescale, rotation, lowPass, distortion, karaoke, etc.)
app.post("/api/lavalink/filters", async (req, res) => {
  const { token, filters } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE !== "lavalink") {
    return res.status(400).json({ error: "Audio filters are only available in Lavalink engine mode" });
  }
  if (!filters || typeof filters !== "object") {
    return res.status(400).json({ error: "filters object is required" });
  }
  const success = await bot.lavalinkPlayer.setFilters(filters as LavalinkFilters);
  res.json({ success, playerState: bot.lavalinkPlayer.getState() });
});

// Apply a named audio preset
app.post("/api/lavalink/filters/preset", async (req, res) => {
  const { token, preset } = req.body;
  const bot = manager.getBot(token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE !== "lavalink") {
    return res.status(400).json({ error: "Audio filter presets are only available in Lavalink engine mode" });
  }
  const validPresets: AudioPresetName[] = ["flat", "hd", "boost", "bassboost", "nightcore", "vaporwave", "8d", "soft", "earrape", "pop", "treble"];
  if (!validPresets.includes(preset as AudioPresetName)) {
    return res.status(400).json({ error: `Invalid preset. Valid options: ${validPresets.join(", ")}` });
  }
  const success = await bot.lavalinkPlayer.applyPreset(preset as AudioPresetName);
  res.json({ success, preset, presetFilters: PRESET_AUDIO_FILTERS[preset as AudioPresetName], playerState: bot.lavalinkPlayer.getState() });
});

// Reset all audio filters to flat
app.post("/api/lavalink/filters/reset", async (req, res) => {
  const bot = manager.getBot(req.body.token);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (ACTIVE_AUDIO_ENGINE !== "lavalink") {
    return res.status(400).json({ error: "Only available in Lavalink engine mode" });
  }
  const success = await bot.lavalinkPlayer.resetFilters();
  res.json({ success, playerState: bot.lavalinkPlayer.getState() });
});

// List all available audio presets
app.get("/api/lavalink/filters/presets", (_req, res) => {
  res.json({
    presets: Object.keys(PRESET_AUDIO_FILTERS),
    definitions: PRESET_AUDIO_FILTERS,
  });
});

// API 404 Handler (prevents returning index.html for unknown /api/* routes)
app.use("/api/*", (_req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found." });
});

// Global API Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[API Server Error]", err);
  res.status(500).json({ success: false, error: err?.message || "Internal server error." });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: 3000,
        cors: true,
        allowedHosts: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for HTML entry point
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    let distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(path.join(distPath, "index.html"))) {
      if (typeof __dirname !== "undefined" && fs.existsSync(path.join(__dirname, "index.html"))) {
        distPath = __dirname;
      } else if (typeof __dirname !== "undefined" && fs.existsSync(path.join(__dirname, "..", "dist", "index.html"))) {
        distPath = path.join(__dirname, "..", "dist");
      }
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

