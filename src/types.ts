export type BotStatus = "Disconnected" | "Connecting" | "Connected" | "In Voice" | "Error";

export interface BotAccount {
  token: string;
  tokenPreview: string;
  username: string;
  avatar: string | null;
  userId: string | null;
  status: BotStatus;
  guildId: string | null;
  channelId: string | null;
  selfMute: boolean;
  selfDeaf: boolean;
  selfVideo: boolean;
  selfStream: boolean;
  uptime: number;
  lastError: string | null;
  connectedAt: number | null;
}

export interface SystemStatus {
  version: string;
  protocol: string;
  daveProtocolVersion?: string;
  e2eeStatus?: string;
  clientBuildNumber?: number;
  clientVersion?: string;
  totalTokens: number;
  connected: number;
  activeVoice: number;
  muted: number;
  deafened: number;
  streaming: number;
  video: number;
  serverUptime: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  tokenPreview?: string;
}

export type ActiveTab = "dashboard" | "accounts" | "music" | "cli" | "protocol";
export type AppTheme = "dark" | "light"; // dark = AMOLED Black, light = Full White

export interface LavalinkTrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number; // in milliseconds
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

export type MusicSource = "youtube" | "spotify" | "soundcloud";

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
  soundMode?: "hd" | "boost" | "flat";
  lavalinkSessionId: string | null;
  lavalinkNodeStatus: "connected" | "connecting" | "disconnected" | "error";
  engine?: "dave" | "lavalink";
  daveConnected?: boolean;
  daveReady?: boolean;
  daveProtocolVersion?: string;
  e2eeUpgraded?: boolean;
  e2eeStatus?: string;
  clientBuild?: number;
  fallbackActive?: boolean;
  fallbackNotice?: string;
  sourceProvider?: string;
  error: string | null;
}

export interface LavalinkConfig {
  name: string;
  url: string;
  auth: string;
  secure: boolean;
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
