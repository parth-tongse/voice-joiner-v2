import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Mic,
  MicOff,
  Headphones,
  Video,
  Tv,
  Play,
  Pause,
  Square,
  Shuffle,
  RotateCcw,
  Link,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Radio,
  Copy,
  Check,
  Music,
  Disc,
  Volume2,
  SkipForward,
  ShieldCheck,
  Award,
  Key,
  CheckCircle2,
  Sparkles,
  Wifi,
  Activity,
} from "lucide-react";
import { AppTheme, BotAccount, LogEntry, PlayerState, SystemStatus } from "../types";

interface DashboardViewProps {
  theme: AppTheme;
  status: SystemStatus | null;
  accounts: BotAccount[];
  logs: LogEntry[];
  onRefresh: () => void;
  onClearLogs: () => void;
  onGoToMusic?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  theme,
  status,
  accounts,
  logs,
  onRefresh,
  onClearLogs,
  onGoToMusic,
}) => {
  const isDark = theme === "dark";

  // Bulk input state
  const [serverId, setServerId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLicenseKey, setCopiedLicenseKey] = useState(false);

  const LICENSE_KEY = "PT-DVJ-2026-9948-LUMINA-PRO";

  const handleCopyLicense = () => {
    try {
      navigator.clipboard.writeText(LICENSE_KEY);
      setCopiedLicenseKey(true);
      setTimeout(() => setCopiedLicenseKey(false), 2500);
    } catch {}
  };

  // Quick Lavalink Playback State
  const [quickSong, setQuickSong] = useState("");
  const [isQuickPlaying, setIsQuickPlaying] = useState(false);
  const [isTestingChime, setIsTestingChime] = useState(false);
  const [quickMusicFeedback, setQuickMusicFeedback] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Ping State
  const [pingData, setPingData] = useState<{
    dashboardPingMs: number | null;
    avgGatewayPingMs: number | null;
  }>({ dashboardPingMs: null, avgGatewayPingMs: null });

  // Poll ping every 3 seconds
  useEffect(() => {
    const fetchPing = async () => {
      const t0 = Date.now();
      try {
        const res = await fetch("/api/ping");
        const roundtrip = Date.now() - t0;
        if (res.ok) {
          const data = await res.json();
          setPingData({
            dashboardPingMs: roundtrip,
            avgGatewayPingMs: data.avgGatewayPingMs ?? null,
          });
        }
      } catch {
        // ignore
      }
    };
    fetchPing();
    const interval = setInterval(fetchPing, 3000);
    return () => clearInterval(interval);
  }, []);

  // Ping color helper
  const getPingColor = (ms: number | null) => {
    if (ms === null) return "text-neutral-500";
    if (ms < 80) return "text-green-400";
    if (ms < 200) return "text-orange-400";
    return "text-red-400";
  };

  const getPingBg = (ms: number | null) => {
    if (ms === null) return isDark ? "hover:border-neutral-500/40" : "hover:border-neutral-400";
    if (ms < 80) return isDark ? "hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/5" : "hover:border-green-400 shadow-sm";
    if (ms < 200) return isDark ? "hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5" : "hover:border-orange-400 shadow-sm";
    return isDark ? "hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5" : "hover:border-red-400 shadow-sm";
  };

  const getPingIconColor = (ms: number | null) => {
    if (ms === null) return "bg-neutral-500/10 text-neutral-500";
    if (ms < 80) return "bg-green-500/10 text-green-400";
    if (ms < 200) return "bg-orange-500/10 text-orange-400";
    return "bg-red-500/10 text-red-400";
  };

  const getPingLabel = (ms: number | null) => {
    if (ms === null) return "Waiting...";
    if (ms < 80) return "Excellent";
    if (ms < 200) return "Good";
    return "High";
  };

  const handleTestChime = async () => {
    setIsTestingChime(true);
    setQuickMusicFeedback("Playing direct test chime through bot voice microphone...");
    try {
      const res = await fetch("/api/voice/test-chime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setQuickMusicFeedback("Test chime played directly through bot's microphone in voice channel!");
        if (data.playerState) setPlayerState(data.playerState);
      } else {
        setQuickMusicFeedback(`Chime failed: ${data.error || data.message || "Bot not in voice channel"}`);
      }
    } catch (err: any) {
      setQuickMusicFeedback(`Error: ${err.message}`);
    } finally {
      setIsTestingChime(false);
      setTimeout(() => setQuickMusicFeedback(null), 5000);
    }
  };

  // Poll Lavalink player state for quick controls
  useEffect(() => {
    const checkPlayer = async () => {
      try {
        const res = await fetch("/api/lavalink/player");
        if (res.ok) {
          const data = await res.json();
          setPlayerState(data);
        }
      } catch {}
    };
    checkPlayer();
    const interval = setInterval(checkPlayer, 3000);
    return () => clearInterval(interval);
  }, []);

  // Quick Play Song handler
  const handleQuickPlay = async (songToPlay?: string) => {
    const target = songToPlay || quickSong;
    if (!target.trim()) {
      setQuickMusicFeedback("Please enter a song name or YouTube link to play.");
      setTimeout(() => setQuickMusicFeedback(null), 3000);
      return;
    }

    const voiceBots = accounts.filter((b) => b.channelId && b.status === "In Voice");
    if (voiceBots.length === 0) {
      setQuickMusicFeedback("Bots must join a voice channel first before playing music! Click 'Join All to Voice' above.");
      setTimeout(() => setQuickMusicFeedback(null), 4500);
      return;
    }

    setIsQuickPlaying(true);
    setQuickMusicFeedback(`Searching and playing "${target}" on LUMINA-V1...`);

    try {
      const res = await fetch("/api/lavalink/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: target.trim(), mode: "now" }),
      });
      const data = await res.json();
      if (data.error) {
        setQuickMusicFeedback(`Playback failed: ${data.error}`);
      } else {
        setQuickMusicFeedback(`  Now Playing: "${data.track?.info?.title || target}"`);
        if (data.playerState) setPlayerState(data.playerState);
        onRefresh();
      }
    } catch (err: any) {
      setQuickMusicFeedback(`Error: ${err.message}`);
    } finally {
      setIsQuickPlaying(false);
      setTimeout(() => setQuickMusicFeedback(null), 4500);
    }
  };

  const handleTogglePlay = async () => {
    if (!playerState) return;
    const endpoint = playerState.paused ? "/api/lavalink/resume" : "/api/lavalink/pause";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: playerState.botToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
    } catch {}
  };

  const handleStopMusic = async () => {
    try {
      const res = await fetch("/api/lavalink/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: playerState?.botToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      setQuickMusicFeedback("Music playback stopped.");
      setTimeout(() => setQuickMusicFeedback(null), 3000);
    } catch {}
  };

  const handleSkipMusic = async () => {
    try {
      const res = await fetch("/api/lavalink/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: playerState?.botToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
    } catch {}
  };

  const handleLogScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (autoScroll !== isNearBottom) {
      setAutoScroll(isNearBottom);
    }
  };

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Handle Bulk Join All
  const handleJoinAll = async () => {
    if (!serverId.trim() || !channelId.trim()) {
      setActionFeedback("Please provide both Server ID and Channel ID.");
      setTimeout(() => setActionFeedback(null), 3500);
      return;
    }
    if (accounts.length === 0) {
      setActionFeedback("No accounts registered! Please add tokens first in the Accounts tab.");
      setTimeout(() => setActionFeedback(null), 3500);
      return;
    }

    setIsJoining(true);
    try {
      const res = await fetch("/api/actions/join-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: serverId.trim(), channelId: channelId.trim() }),
      });
      const data = await res.json();
      setActionFeedback(data.message || "Connecting all accounts to voice channel...");
      onRefresh();
    } catch {
      setActionFeedback("Failed to trigger bulk join.");
    } finally {
      setIsJoining(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Bulk Stop All
  const handleStopAll = async () => {
    setIsStopping(true);
    try {
      const res = await fetch("/api/actions/stop-all", { method: "POST" });
      const data = await res.json();
      setActionFeedback(data.message || "All accounts disconnected from voice.");
      onRefresh();
    } catch {
      setActionFeedback("Failed to disconnect accounts.");
    } finally {
      setIsStopping(false);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Bulk Audio / Video / Stream toggles
  const handleBulkAudio = async (mute?: boolean, deaf?: boolean) => {
    try {
      await fetch("/api/actions/bulk-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mute, deaf }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkVideo = async (video: boolean) => {
    try {
      await fetch("/api/actions/bulk-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkStream = async (stream: boolean) => {
    try {
      await fetch("/api/actions/bulk-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  // Random Event Engine
  const handleRandomEvent = async () => {
    try {
      await fetch("/api/actions/random-event", { method: "POST" });
      setActionFeedback("  Random event dispatched! Independent voice states assigned.");
      onRefresh();
      setTimeout(() => setActionFeedback(null), 3500);
    } catch {
      setActionFeedback("Random event trigger failed.");
    }
  };

  // Clear Events
  const handleClearEvents = async () => {
    try {
      await fetch("/api/actions/clear-events", { method: "POST" });
      setActionFeedback("Events cleared. All accounts set to default voice states.");
      onRefresh();
      setTimeout(() => setActionFeedback(null), 3500);
    } catch {
      setActionFeedback("Clear events failed.");
    }
  };

  // Join server invite
  const handleJoinInvite = async () => {
    if (!inviteCode.trim()) return;
    try {
      setActionFeedback("Attempting server invite join for all tokens...");
      const res = await fetch("/api/server-invite/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const data = await res.json();
      setActionFeedback(`Invite completed: ${data.successCount} succeeded, ${data.failCount} failed.`);
      setInviteCode("");
      onRefresh();
      setTimeout(() => setActionFeedback(null), 5000);
    } catch {
      setActionFeedback("Failed to join server invite.");
    }
  };

  const activeInVoice = accounts.filter((a) => a.channelId && a.status === "In Voice").length;
  const mutedCount = accounts.filter((a) => a.selfMute).length;
  const deafenedCount = accounts.filter((a) => a.selfDeaf).length;
  const streamingCount = accounts.filter((a) => a.selfStream).length;
  const videoCount = accounts.filter((a) => a.selfVideo).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Alert / Feedback */}
      {actionFeedback && (
        <div
          id="action-feedback-toast"
          className="p-3.5 rounded-xl text-xs font-medium flex items-center justify-between border bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-red-500/10 border-orange-500/30 text-orange-300 animate-fadeIn shadow-sm shadow-orange-500/10"
        >
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-400 animate-pulse" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs text-orange-400 hover:text-orange-300 hover:underline active:scale-95 transition-all duration-150"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Accounts */}
        <div
          id="stat-card-total"
          className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5"
              : "bg-white border-neutral-200 hover:border-red-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium uppercase tracking-wider">Total Accounts</span>
            <div className="p-1 rounded-md bg-red-500/10 text-red-500">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${isDark ? "text-white" : "text-neutral-900"}`}>
              {accounts.length}
            </span>
            <span className="text-xs text-red-400/80 font-medium">tokens in file</span>
          </div>
        </div>

        {/* Active In Voice */}
        <div
          id="stat-card-voice"
          className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5"
              : "bg-white border-neutral-200 hover:border-orange-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium uppercase tracking-wider">Active In Voice</span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-orange-500">{activeInVoice}</span>
            <span className="text-xs text-orange-400/80 font-medium">channels joined</span>
          </div>
        </div>

        {/* Muted / Deafened */}
        <div
          id="stat-card-audio"
          className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-yellow-500/40 hover:shadow-lg hover:shadow-yellow-500/5"
              : "bg-white border-neutral-200 hover:border-yellow-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium uppercase tracking-wider">Muted / Deafened</span>
            <div className="p-1 rounded-md bg-yellow-500/10 text-yellow-400">
              <Headphones className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${isDark ? "text-yellow-400" : "text-amber-600"}`}>
              {mutedCount} <span className="text-neutral-500 text-base font-normal">/</span> {deafenedCount}
            </span>
            <span className="text-xs text-yellow-500/80 font-medium">states active</span>
          </div>
        </div>

        {/* Video / Stream */}
        <div
          id="stat-card-media"
          className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5"
              : "bg-white border-neutral-200 hover:border-orange-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium uppercase tracking-wider">Video & Stream</span>
            <div className="p-1 rounded-md bg-orange-500/10 text-orange-400">
              <Tv className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${isDark ? "text-orange-400" : "text-orange-600"}`}>
              {videoCount} <span className="text-neutral-500 text-base font-normal">/</span> {streamingCount}
            </span>
            <span className="text-xs text-orange-400/80 font-medium">camera / screen</span>
          </div>
        </div>
      </div>

      {/* Ping Stats Row */}
      <div
        id="ping-stats-row"
        className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 ${getPingBg(pingData.avgGatewayPingMs)} ${
          isDark
            ? "bg-[#0a0a0a] border-[#1a1a1a]"
            : "bg-white border-neutral-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${getPingIconColor(pingData.avgGatewayPingMs)}`}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                isDark ? "text-white" : "text-neutral-800"
              }`}>Network Ping</span>
              <p className="text-[11px] text-neutral-500">Live latency monitor</p>
            </div>
          </div>

          {/* Ping Values */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Dashboard (HTTP) Ping */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Dashboard</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-extrabold font-mono leading-none ${
                  pingData.dashboardPingMs === null ? "text-neutral-500" : "text-orange-400"
                }`}>
                  {pingData.dashboardPingMs !== null ? pingData.dashboardPingMs : "—"}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">ms</span>
              </div>
              <span className="text-[10px] text-orange-400/70">HTTP RTT</span>
            </div>

            <div className={`h-8 w-px hidden sm:block ${
              isDark ? "bg-neutral-800" : "bg-neutral-200"
            }`} />

            {/* Gateway (Discord) Ping */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-orange-400 animate-pulse" />
                <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Discord Gateway</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl font-extrabold font-mono leading-none ${
                  getPingColor(pingData.avgGatewayPingMs)
                }`}>
                  {pingData.avgGatewayPingMs !== null ? pingData.avgGatewayPingMs : "—"}
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">ms</span>
              </div>
              <span className={`text-[10px] font-medium ${
                getPingColor(pingData.avgGatewayPingMs)
              }`}>
                {getPingLabel(pingData.avgGatewayPingMs)}
              </span>
            </div>

            {/* Ping bar indicator */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-wider">Signal</span>
              <div className="flex items-end gap-0.5 h-5">
                {[20, 40, 60, 80, 100].map((threshold, i) => {
                  const active = pingData.avgGatewayPingMs === null
                    ? false
                    : pingData.avgGatewayPingMs < (i + 1) * 60;
                  return (
                    <div
                      key={i}
                      className={`w-1.5 rounded-sm transition-all duration-500 ${
                        active
                          ? pingData.avgGatewayPingMs !== null && pingData.avgGatewayPingMs < 80
                            ? "bg-green-400"
                            : pingData.avgGatewayPingMs !== null && pingData.avgGatewayPingMs < 200
                            ? "bg-orange-400"
                            : "bg-red-400"
                          : isDark ? "bg-neutral-800" : "bg-neutral-200"
                      }`}
                      style={{ height: `${20 + i * 20}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Voice Controls Panel */}
      <div
        id="bulk-controls-panel"
        className={`p-5 rounded-2xl border transition-all duration-200 ${
          isDark
            ? "bg-[#0a0a0a] border-[#1a1a1a] shadow-lg shadow-orange-950/10"
            : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-inherit">
          <div>
            <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-white" : "text-neutral-900"}`}>
              <span>Bulk Voice Channel Controls</span>
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            </h3>
            <p className="text-xs text-neutral-500">
              Dispatches Gateway Opcode 4 (Voice State Update) synchronously to all accounts
            </p>
          </div>
          <div className="text-xs font-mono px-2.5 py-1 rounded-md bg-gradient-to-r from-orange-500/15 to-yellow-500/15 text-orange-400 border border-orange-500/30">
            Build 568820 • DAVE v1.1 Upgraded
          </div>
        </div>

        {/* Server & Channel Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Server ID (Guild ID)</label>
            <input
              id="input-server-id"
              type="text"
              placeholder="e.g. 1092837465928172635"
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-mono outline-none border transition-all duration-150 ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Voice Channel ID</label>
            <input
              id="input-channel-id"
              type="text"
              placeholder="e.g. 1092837465928172636"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-mono outline-none border transition-all duration-150 ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              }`}
            />
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Join All */}
          <button
            id="btn-join-all"
            onClick={handleJoinAll}
            disabled={isJoining}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 active:scale-95 hover:-translate-y-0.5 text-white transition-all duration-150 shadow-md shadow-orange-500/25 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isJoining ? "Joining..." : "Join All to Voice"}</span>
          </button>

          {/* Stop All */}
          <button
            id="btn-stop-all"
            onClick={handleStopAll}
            disabled={isStopping}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 hover:-translate-y-0.5 text-white transition-all duration-150 shadow-md shadow-red-500/25 disabled:opacity-50"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>{isStopping ? "Stopping..." : "Stop All (Kick)"}</span>
          </button>

          <div className="h-6 w-px bg-neutral-700/40 hidden sm:block mx-1" />

          {/* Bulk Mute / Unmute */}
          <button
            id="btn-bulk-mute"
            onClick={() => handleBulkAudio(true, undefined)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-amber-500/50 hover:text-amber-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-amber-400 hover:text-amber-700"
            }`}
          >
            <MicOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Mute All</span>
          </button>
          <button
            id="btn-bulk-unmute"
            onClick={() => handleBulkAudio(false, undefined)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-orange-500/50 hover:text-orange-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-orange-400 hover:text-orange-700"
            }`}
          >
            <Mic className="w-3.5 h-3.5 text-orange-400" />
            <span>Unmute All</span>
          </button>

          {/* Bulk Deafen / Undeafen */}
          <button
            id="btn-bulk-deaf"
            onClick={() => handleBulkAudio(undefined, true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-yellow-500/50 hover:text-yellow-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-yellow-400 hover:text-yellow-700"
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-yellow-400" />
            <span>Deafen All</span>
          </button>
          <button
            id="btn-bulk-undeaf"
            onClick={() => handleBulkAudio(undefined, false)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-amber-400/50 hover:text-amber-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-amber-400 hover:text-amber-700"
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-amber-400" />
            <span>Undeafen All</span>
          </button>

          {/* Bulk Video */}
          <button
            id="btn-bulk-video"
            onClick={() => handleBulkVideo(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-orange-500/50 hover:text-orange-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-orange-400 hover:text-orange-700"
            }`}
          >
            <Video className="w-3.5 h-3.5 text-orange-400" />
            <span>Camera Video</span>
          </button>

          {/* Bulk Stream */}
          <button
            id="btn-bulk-stream"
            onClick={() => handleBulkStream(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-red-500/50 hover:text-red-300"
                : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-red-400 hover:text-red-700"
            }`}
          >
            <Tv className="w-3.5 h-3.5 text-red-400" />
            <span>Go Live (Stream)</span>
          </button>
        </div>
      </div>

      {/* Lavalink Music Engine (LUMINA-V1) Quick Card */}
      <div
        id="lavalink-music-card"
        className={`p-5 rounded-2xl border transition-all duration-200 ${
          isDark ? "bg-[#0a0a0a] border-[#1a1a1a] shadow-lg shadow-orange-950/10" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 pb-3 border-b border-inherit">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-white" : "text-neutral-900"}`}>
                <span>Lavalink Music Engine (LUMINA-V1)</span>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Node Online
                </span>
              </h3>
              <p className="text-xs text-neutral-500">
                Lavalink v4.2.2 &bull; Host: nokia.vexanode.gg:19133 &bull; Direct audio stream to Discord Voice Channel
              </p>
            </div>
          </div>
          {onGoToMusic && (
            <button
              onClick={onGoToMusic}
              className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1 active:scale-95 hover:-translate-y-0.5 transition-all duration-150"
            >
              <span>Open Full Music Studio</span>
              <span>&rarr;</span>
            </button>
          )}
        </div>

        {/* Live Now Playing preview if active */}
        {playerState?.playing && (
          <div
            className={`mb-4 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              isDark ? "bg-[#050505] border-[#222]" : "bg-neutral-50 border-neutral-200"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-neutral-700/50 flex items-center justify-center relative">
                {playerState.currentTrack?.info.artworkUrl ? (
                  <img
                    src={playerState.currentTrack.info.artworkUrl}
                    alt="Album Art"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Disc className="w-5 h-5 text-orange-400 animate-spin" style={{ animationDuration: "5s" }} />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                    {playerState.paused ? "Paused" : "Live Streaming"}
                  </span>
                </div>
                <h4 className={`text-xs font-bold line-clamp-1 ${isDark ? "text-white" : "text-neutral-900"}`}>
                  {playerState.currentTrack?.info.title || "Unknown Track"}
                </h4>
                <p className="text-[11px] text-neutral-400 line-clamp-1">
                  {playerState.currentTrack?.info.author || "Discord Bot Voice Audio"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={handleTogglePlay}
                className="p-2 rounded-lg bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-medium active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20 transition-all duration-150"
                title={playerState.paused ? "Resume" : "Pause"}
              >
                {playerState.paused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
              </button>
              <button
                onClick={handleSkipMusic}
                className={`p-2 rounded-lg text-xs border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                  isDark ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-orange-500/40 hover:text-orange-400" : "bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200 hover:border-orange-300"
                }`}
                title="Skip to next"
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                onClick={handleStopMusic}
                className="p-2 rounded-lg bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 text-xs active:scale-95 hover:-translate-y-0.5 transition-all duration-150"
                title="Stop music"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* Quick Song Input & Play Action */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleQuickPlay();
          }}
          className="flex flex-col sm:flex-row items-center gap-2"
        >
          <div className="w-full relative">
            <input
              id="input-quick-song-name"
              type="text"
              placeholder="Enter song name, Spotify URL, or YouTube link to stream into voice..."
              value={quickSong}
              onChange={(e) => setQuickSong(e.target.value)}
              className={`w-full pl-9 pr-4 py-2.5 rounded-lg text-xs font-medium outline-none border transition-all duration-150 ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white placeholder:text-neutral-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              }`}
            />
            <Music className="w-4 h-4 text-orange-400/70 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="submit"
            id="btn-quick-play-song-dash"
            disabled={isQuickPlaying || !quickSong.trim()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 active:scale-95 hover:-translate-y-0.5 text-white transition-all duration-150 shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isQuickPlaying ? "Loading..." : "Play Song"}</span>
          </button>
          <button
            type="button"
            id="btn-test-mic-chime"
            onClick={handleTestChime}
            disabled={isTestingChime}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shrink-0 ${
              isDark
                ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30 hover:border-amber-400"
                : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300"
            }`}
            title="Sends an instant audio chime through the bot's microphone in voice channel"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isTestingChime ? "Testing..." : "Test Mic Audio"}</span>
          </button>
        </form>

        {/* Quick Suggestion Pills */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-inherit text-[11px]">
          <span className="text-neutral-500">Suggestions:</span>
          {["Alan Walker - Faded", "Imagine Dragons - Believer", "The Local Train - Choo Lo", "Sia - Unstoppable"].map(
            (title) => (
              <button
                key={title}
                type="button"
                onClick={() => {
                  setQuickSong(title);
                  handleQuickPlay(title);
                }}
                className={`px-2.5 py-0.5 rounded-full border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-orange-500/50 hover:text-orange-300"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-200 hover:border-orange-400 hover:text-orange-700"
                }`}
              >
                {title}
              </button>
            )
          )}
        </div>

        {/* Feedback Message */}
        {quickMusicFeedback && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${
              quickMusicFeedback.includes("failed") || quickMusicFeedback.includes("Error")
                ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                : isDark
                ? "bg-orange-950/20 border-orange-500/30 text-orange-300"
                : "bg-orange-50 border-orange-200 text-orange-800"
            }`}
          >
            <Radio className="w-3.5 h-3.5 shrink-0" />
            <span>{quickMusicFeedback}</span>
          </div>
        )}
      </div>

      {/* Two Secondary Feature Cards: Random Event Engine & Server Invite Joiner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Random Event Engine */}
        <div
          id="feature-random-event"
          className={`p-5 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5"
              : "bg-white border-neutral-200 hover:border-amber-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Shuffle className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-900"}`}>
                Random Event Engine
              </h4>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Stealth
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
            Individually randomizes mute, deafen, video, and stream states across all active tokens so accounts mimic
            natural user behaviors.
          </p>
          <div className="flex items-center gap-2">
            <button
              id="btn-trigger-random"
              onClick={handleRandomEvent}
              className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-orange-500 active:scale-95 hover:-translate-y-0.5 text-white transition-all duration-150 shadow-md shadow-orange-500/20"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Trigger Random Event</span>
            </button>
            <button
              id="btn-clear-events"
              onClick={handleClearEvents}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                isDark
                  ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-red-500/40 hover:text-red-400"
                  : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300 hover:border-red-300 hover:text-red-600"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Events</span>
            </button>
          </div>
        </div>

        {/* Server Invite Auto-Joiner */}
        <div
          id="feature-server-invite"
          className={`p-5 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5"
              : "bg-white border-neutral-200 hover:border-red-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                <Link className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-900"}`}>
                Server Invite Auto-Joiner
              </h4>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-red-500/10 text-red-400 border border-red-500/20">
              v10 API
            </span>
          </div>
          <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
            Quickly join all accounts to a server using an invite link or code before connecting to voice channels.
          </p>
          <div className="flex items-center gap-2">
            <input
              id="input-invite-code"
              type="text"
              placeholder="e.g. discord.gg/voice or code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono outline-none border transition-all duration-150 ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              }`}
            />
            <button
              id="btn-join-invite"
              onClick={handleJoinInvite}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 hover:from-red-500 hover:to-orange-500 active:scale-95 hover:-translate-y-0.5 text-white transition-all duration-150 shadow-md shadow-red-500/20"
            >
              Join Server
            </button>
          </div>
        </div>
      </div>

      {/* License & Registration Section */}
      <div
        id="license-registration-section"
        className={`p-5 rounded-2xl border transition-all duration-200 ${
          isDark
            ? "bg-[#0a0a0a] border-[#1a1a1a] shadow-lg shadow-orange-950/10"
            : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-inherit">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-red-500/20 border border-orange-500/30 text-amber-400 shadow-xs shadow-orange-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold tracking-tight ${isDark ? "text-white" : "text-neutral-900"}`}>
                  Software License & Registration
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  VERIFIED ACTIVE
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Official Discord Voice Joiner & Lavalink Controller Enterprise Certificate
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-3 py-1.5 rounded-lg border bg-gradient-to-r from-orange-500/15 to-red-500/15 text-orange-400 border-orange-500/30 flex items-center gap-1.5 font-semibold">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Enterprise Lifetime Tier</span>
            </span>
          </div>
        </div>

        {/* License Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Registered To */}
          <div
            id="license-owner-card"
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#050505] border-[#1f1f1f] hover:border-orange-500/40 hover:shadow-md hover:shadow-orange-500/5"
                : "bg-neutral-50 border-neutral-200 hover:border-orange-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-neutral-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Registered Owner</span>
                <CheckCircle2 className="w-4 h-4 text-orange-400" />
              </div>
              <div className={`text-lg font-extrabold tracking-wide ${isDark ? "text-white" : "text-neutral-900"}`}>
                PARTH TONGSE
              </div>
              <div className="text-xs text-neutral-400 mt-0.5 font-medium">
                Lead System Architect & Core Developer
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-inherit flex items-center justify-between text-[11px]">
              <span className="text-neutral-500">Ownership Status</span>
              <span className="font-semibold text-amber-400">Authenticated ✓</span>
            </div>
          </div>

          {/* Card 2: Master License Key */}
          <div
            id="license-key-card"
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#050505] border-[#1f1f1f] hover:border-yellow-500/40 hover:shadow-md hover:shadow-yellow-500/5"
                : "bg-neutral-50 border-neutral-200 hover:border-yellow-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-neutral-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Master License Key</span>
                <Key className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className={`font-mono text-xs font-bold tracking-wider select-all ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                  {LICENSE_KEY}
                </span>
                <button
                  id="btn-copy-license-key"
                  type="button"
                  onClick={handleCopyLicense}
                  title="Copy License Key"
                  className={`p-1.5 rounded-lg border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 flex items-center gap-1 text-[11px] font-medium shrink-0 ${
                    copiedLicenseKey
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : isDark
                      ? "bg-gradient-to-r from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25 text-orange-300 border-orange-500/30"
                      : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300 shadow-xs"
                  }`}
                >
                  {copiedLicenseKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-[11px] text-neutral-400 mt-1.5">
                Cryptographic Signature: SHA256-LUMINA-VERIFIED
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-inherit flex items-center justify-between text-[11px]">
              <span className="text-neutral-500">Validity Period</span>
              <span className="font-semibold text-orange-400">Lifetime (Never Expires)</span>
            </div>
          </div>

          {/* Card 3: Included Privileges */}
          <div
            id="license-privileges-card"
            className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 ${
              isDark
                ? "bg-[#050505] border-[#1f1f1f] hover:border-red-500/40 hover:shadow-md hover:shadow-red-500/5"
                : "bg-neutral-50 border-neutral-200 hover:border-red-300"
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-neutral-400 text-xs mb-1.5">
                <span className="font-semibold uppercase tracking-wider text-[10px]">Entitlements</span>
                <Sparkles className="w-4 h-4 text-red-400" />
              </div>
              <ul className="space-y-1.5 text-xs text-neutral-400 mt-1">
                <li className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">✓</span>
                  <span className={isDark ? "text-neutral-200" : "text-neutral-800"}>Unlimited Concurrent Bot Voice Instances</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">✓</span>
                  <span className={isDark ? "text-neutral-200" : "text-neutral-800"}>Lavalink LUMINA-V1 48kHz HD Audio Engine</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">✓</span>
                  <span className={isDark ? "text-neutral-200" : "text-neutral-800"}>DAVE v1.1 E2EE & Anti-Detection Gateway v10 (Upgraded & Verified)</span>
                </li>
              </ul>
            </div>

            <div className="mt-3 pt-3 border-t border-inherit flex items-center justify-between text-[11px]">
              <span className="text-neutral-500">License ID</span>
              <span className="font-mono font-medium text-red-400">LIC-2026-PT-001</span>
            </div>
          </div>
        </div>

        {/* Certificate Disclaimer & Copyright Footer */}
        <div className={`mt-4 pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] ${
          isDark ? "border-[#1a1a1a] text-neutral-500" : "border-neutral-200 text-neutral-500"
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span>Licensed exclusively to <strong className={isDark ? "text-amber-400" : "text-amber-700"}>PARTH TONGSE</strong></span>
            <span>&bull;</span>
            <span>All enterprise features activated</span>
          </div>
          <div>
            <span>Copyright &copy; 2026 <strong>PARTH TONGSE</strong>. All rights reserved.</span>
          </div>
        </div>
      </div>

      {/* Live Event Logs Console */}
      <div
        id="logs-console-card"
        className={`rounded-2xl border overflow-hidden transition-colors ${
          isDark ? "bg-[#050505] border-[#1a1a1a]" : "bg-neutral-900 border-neutral-800 text-neutral-100 shadow-md"
        }`}
      >
        <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shadow-xs shadow-orange-500" />
            <span className="text-xs font-semibold tracking-wide uppercase text-neutral-300 font-mono">
              Live Gateway Activity Log
            </span>
            <span className="text-[10px] text-amber-500/80 font-mono">({logs.length} entries)</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-neutral-400 cursor-pointer text-[11px]">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded text-orange-500 accent-orange-500"
              />
              <span>Auto-scroll</span>
            </label>
            <button
              id="btn-clear-logs"
              onClick={onClearLogs}
              className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-400 active:scale-95 hover:-translate-y-0.5 transition-all duration-150"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Terminal Log Output Window */}
        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          className="p-4 h-64 overflow-y-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-800"
        >
          {logs.length === 0 ? (
            <div className="text-neutral-600 text-center py-10 italic">
              Gateway log buffer is empty. Connect accounts or execute actions to see real-time events.
            </div>
          ) : (
            logs.map((log) => {
              const colorClass =
                log.level === "success"
                  ? "text-emerald-400"
                  : log.level === "warn"
                  ? "text-amber-400"
                  : log.level === "error"
                  ? "text-rose-400"
                  : "text-neutral-300";
              return (
                <div key={log.id} className="flex items-start gap-2.5 leading-relaxed hover:bg-white/5 px-1 py-0.5 rounded">
                  <span className="text-neutral-600 text-[11px] shrink-0 select-none">[{log.timestamp}]</span>
                  <span
                    className={`text-[10px] uppercase font-bold px-1 rounded shrink-0 select-none ${
                      log.level === "success"
                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                        : log.level === "warn"
                        ? "bg-amber-950/80 text-amber-400 border border-amber-800"
                        : log.level === "error"
                        ? "bg-rose-950/80 text-rose-400 border border-rose-800"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {log.level}
                  </span>
                  {log.tokenPreview && (
                    <span className="text-blue-400/90 text-[11px] shrink-0">[{log.tokenPreview}]</span>
                  )}
                  <span className={`${colorClass} break-all`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
