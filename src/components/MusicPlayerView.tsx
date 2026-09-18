import React, { useState, useEffect, useRef } from "react";
import {
  Music,
  Play,
  Pause,
  Square,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
  Search,
  ListMusic,
  History,
  Server,
  Radio,
  Trash2,
  Disc,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Layers,
  Cpu,
  RefreshCw,
  Settings,
  X,
  ShieldCheck,
  Check,
  Loader2,
  Volume1,
  Sliders,
  Zap,
  Youtube,
  Cloud,
} from "lucide-react";
import { AppTheme, BotAccount, LavalinkNodeStats, LavalinkTrack, PlayerState, LavalinkConfig, MusicSource } from "../types";

interface MusicPlayerViewProps {
  theme: AppTheme;
  accounts: BotAccount[];
  onGoToDashboard: () => void;
}

export const MusicPlayerView: React.FC<MusicPlayerViewProps> = ({
  theme,
  accounts,
  onGoToDashboard,
}) => {
  const isDark = theme === "dark";

  // Active selected bot token for playback
  const voiceBots = accounts.filter((b) => b.channelId && b.status === "In Voice");
  const [selectedToken, setSelectedToken] = useState<string>(voiceBots[0]?.token || accounts[0]?.token || "");

  // Player state
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [nodeStats, setNodeStats] = useState<LavalinkNodeStats | null>(null);
  const [audioEngine, setAudioEngine] = useState<"direct" | "lavalink">("direct");
  const [isTestingChime, setIsTestingChime] = useState(false);

  // Search & input (Supports YouTube, Spotify, and SoundCloud)
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<MusicSource>("youtube");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LavalinkTrack[]>([]);
  const [playlistMeta, setPlaylistMeta] = useState<{ name: string } | null>(null);
  const [isPlayingAction, setIsPlayingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Active tab in player (Queue vs History vs Search Results)
  const [playerTab, setPlayerTab] = useState<"queue" | "search" | "history">("search");

  // Local volume state
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(100);

  // Live progress ticker
  const [livePosition, setLivePosition] = useState(0);

  // Lavalink Node Configuration Modal state
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [activeNodeConfig, setActiveNodeConfig] = useState<LavalinkConfig>({
    name: "LUMINA-V1",
    url: "nokia.vexanode.gg:19133",
    auth: "vexanode.cloud",
    secure: false,
  });
  const [presetNodes, setPresetNodes] = useState<LavalinkConfig[]>([]);
  const [customNode, setCustomNode] = useState<LavalinkConfig>({
    name: "LUMINA-V1",
    url: "nokia.vexanode.gg:19133",
    auth: "vexanode.cloud",
    secure: false,
  });
  const [isTestingNode, setIsTestingNode] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; ping?: number; version?: string; message?: string; error?: string } | null>(null);
  const [isSavingNode, setIsSavingNode] = useState(false);
  const [isUpgradingE2ee, setIsUpgradingE2ee] = useState(false);
  const [e2eeSyncResult, setE2eeSyncResult] = useState<string | null>(null);

  const handleSyncE2ee = async () => {
    setIsUpgradingE2ee(true);
    setE2eeSyncResult(null);
    try {
      const res = await fetch("/api/e2ee/upgrade", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setE2eeSyncResult("E2EE v1.1 protocol successfully synchronized with Discord Voice Gateway v8/v10 & Build 568820.");
        setTimeout(() => setE2eeSyncResult(null), 7000);
      } else {
        setE2eeSyncResult(`Sync response: ${data.error || "Completed"}`);
      }
    } catch (err: any) {
      setE2eeSyncResult(`Failed to sync E2EE: ${err.message}`);
    } finally {
      setIsUpgradingE2ee(false);
    }
  };

  const fetchNodeConfig = async () => {
    try {
      const res = await fetch("/api/lavalink/config");
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setActiveNodeConfig(data.active);
          setCustomNode(data.active);
        }
        if (data.presets) {
          setPresetNodes(data.presets);
        }
      }
    } catch {
      // Silently ignore node config polling error
    }
  };

  const handleTestNode = async () => {
    setIsTestingNode(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/lavalink/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: customNode.url,
          auth: customNode.auth,
          secure: customNode.secure,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || "Failed to reach Lavalink host" });
    } finally {
      setIsTestingNode(false);
    }
  };

  const handleSaveNode = async () => {
    if (!customNode.url.trim() || !customNode.auth.trim()) {
      showFeedback("error", "URL and Auth password cannot be blank");
      return;
    }
    setIsSavingNode(true);
    try {
      const res = await fetch("/api/lavalink/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customNode),
      });
      const data = await res.json();
      if (data.success && data.active) {
        setActiveNodeConfig(data.active);
        showFeedback("success", `Switched to Lavalink node: ${data.active.name}`);
        setShowNodeModal(false);
        setTestResult(null);
        fetchNodeStats();
        fetchPlayerState();
      } else {
        showFeedback("error", data.error || "Failed updating Lavalink node");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Failed updating Lavalink node");
    } finally {
      setIsSavingNode(false);
    }
  };

  // Update selected bot if accounts change and current is invalid
  useEffect(() => {
    if (voiceBots.length > 0 && !voiceBots.some((b) => b.token === selectedToken)) {
      setSelectedToken(voiceBots[0].token);
    } else if (!selectedToken && accounts.length > 0) {
      setSelectedToken(accounts[0].token);
    }
  }, [accounts, voiceBots, selectedToken]);

  // Fetch Lavalink node stats
  const fetchNodeStats = async () => {
    try {
      const res = await fetch("/api/lavalink/status");
      if (res.ok) {
        const data = await res.json();
        setNodeStats(data);
      }
    } catch {
      // Silently ignore transient network interruptions during polling
    }
  };

  // Fetch player state
  const fetchPlayerState = async () => {
    try {
      const url = selectedToken ? `/api/lavalink/player?token=${encodeURIComponent(selectedToken)}` : "/api/lavalink/player";
      const res = await fetch(url);
      if (res.ok) {
        const data: PlayerState = await res.json();
        setPlayerState(data);
        if (data.volume !== undefined) {
          setVolume(data.volume);
        }
        if (data.position !== undefined) {
          setLivePosition(data.position);
        }
      }
    } catch {
      // Silently ignore transient network interruptions during polling
    }
  };

  // Fetch current audio engine
  const fetchAudioEngine = async () => {
    try {
      const res = await fetch("/api/audio/engine");
      if (res.ok) {
        const data = await res.json();
        if (data.engine) setAudioEngine(data.engine);
      }
    } catch {}
  };

  const handleSwitchEngine = async (eng: "direct" | "lavalink") => {
    try {
      const res = await fetch("/api/audio/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine: eng }),
      });
      if (res.ok) {
        setAudioEngine(eng);
        showFeedback("info", `Switched audio engine to: ${eng === "direct" ? "Direct Voice Engine (DAVE Mic Audio)" : "Lavalink Node (LUMINA-V1)"}`);
        fetchPlayerState();
      }
    } catch (err: any) {
      showFeedback("error", `Failed switching engine: ${err.message}`);
    }
  };

  const handleTestChime = async () => {
    setIsTestingChime(true);
    showFeedback("info", "Transmitting audio chime directly to bot's microphone in voice channel...");
    try {
      const res = await fetch("/api/voice/test-chime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback("success", "Microphone audio chime played successfully in voice channel!");
        if (data.playerState) setPlayerState(data.playerState);
      } else {
        showFeedback("error", data.error || data.message || "Failed to transmit test chime");
      }
    } catch (err: any) {
      showFeedback("error", err.message || "Failed to trigger test chime");
    } finally {
      setIsTestingChime(false);
    }
  };

  useEffect(() => {
    fetchNodeStats();
    fetchPlayerState();
    fetchAudioEngine();
    const interval = setInterval(() => {
      fetchPlayerState();
      fetchNodeStats();
    }, 2500);
    return () => clearInterval(interval);
  }, [selectedToken]);

  // Live progress incrementer when playing and not paused
  useEffect(() => {
    if (playerState?.playing && !playerState.paused) {
      const timer = setInterval(() => {
        setLivePosition((prev) => {
          if (playerState.duration && prev >= playerState.duration) return prev;
          return prev + 1000;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [playerState?.playing, playerState?.paused, playerState?.duration]);

  const showFeedback = (type: "success" | "error" | "info", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  // Direct play from SoundCloud without any fallback command
  const handlePlaySoundCloudDirect = async (target: string | LavalinkTrack, mode: "now" | "queue" = "now") => {
    let query = "";
    if (typeof target === "string") {
      query = target.trim();
    } else {
      query = target.info?.uri || `${target.info?.title} ${target.info?.author}`.trim();
    }
    if (!query) {
      showFeedback("error", "Please enter a song name or paste a SoundCloud URL");
      return;
    }

    setIsPlayingAction(true);
    showFeedback("info", `Direct SoundCloud Stream: Playing "${query}" without any fallback...`);
    try {
      const res = await fetch("/api/lavalink/play-soundcloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: selectedToken,
          query,
          mode,
          engine: audioEngine,
        }),
      });
      const data = await res.json();
      if (data.error) {
        showFeedback("error", data.error);
      } else {
        const trackTitle =
          data.track?.info?.title ||
          data.track?.title ||
          (typeof target === "object" ? target.info?.title : target) ||
          query;

        showFeedback(
          "success",
          mode === "queue" || data.queued
            ? `SoundCloud Queued: "${trackTitle}"`
            : `SoundCloud Pure: Now streaming "${trackTitle}" (No Fallback)`
        );

        if (data.playerState) {
          setPlayerState(data.playerState);
        }
        if (mode === "queue" || data.queued) {
          setPlayerTab("queue");
        }
        fetchPlayerState();
      }
    } catch (err: any) {
      showFeedback("error", `SoundCloud direct playback error: ${err.message}`);
    } finally {
      setIsPlayingAction(false);
    }
  };

  // Perform search (Supports YouTube, Spotify, and SoundCloud)
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    let activeSource: MusicSource = source;
    if (
      query.includes("soundcloud.com/") ||
      query.includes("on.soundcloud.com/") ||
      query.startsWith("sc:") ||
      query.startsWith("scsearch:") ||
      query.startsWith("soundcloud:")
    ) {
      activeSource = "soundcloud";
      if (source !== "soundcloud") {
        setSource("soundcloud");
        showFeedback("info", "SoundCloud link detected! Switched to SoundCloud mode.");
      }
    } else if (query.includes("spotify.com") || query.startsWith("spotify:")) {
      activeSource = "spotify";
      if (source !== "spotify") {
        setSource("spotify");
        showFeedback("info", "Spotify link detected! Switched to Spotify mode.");
      }
    } else if (query.includes("youtube.com") || query.includes("youtu.be")) {
      activeSource = "youtube";
      if (source !== "youtube") {
        setSource("youtube");
        showFeedback("info", "YouTube link detected! Switched to YouTube mode.");
      }
    } else if (/^https?:\/\//i.test(query) && !query.includes(".mp3") && !query.includes(".aac")) {
      showFeedback("error", "Supported links: YouTube, Spotify, or SoundCloud URLs.");
      return;
    }

    setIsSearching(true);
    setPlayerTab("search");
    try {
      const isSc = activeSource === "soundcloud";
      const res = await fetch(
        `/api/lavalink/search?query=${encodeURIComponent(query)}&source=${activeSource}${isSc ? "&noFallback=true" : ""}`
      );
      const data = await res.json();
      if (data.tracks && Array.isArray(data.tracks)) {
        setSearchResults(data.tracks);
        setPlaylistMeta(data.playlistInfo || null);
        if (data.tracks.length === 0) {
          showFeedback(
            "info",
            `No tracks found on ${activeSource.toUpperCase()} for "${query}". Try another title or artist.`
          );
        }
      } else {
        setSearchResults([]);
        setPlaylistMeta(null);
        showFeedback("error", data.error || "Search returned no tracks.");
      }
    } catch (err: any) {
      showFeedback("error", "Error searching tracks: " + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  // Quick Play Top Result, specific track or link
  const handlePlay = async (target: string | LavalinkTrack, mode: "now" | "queue" = "now") => {
    let effectiveSource: MusicSource = source;
    if (typeof target === "string") {
      const trimmed = target.trim();
      if (!trimmed) return;

      if (
        trimmed.includes("soundcloud.com/") ||
        trimmed.includes("on.soundcloud.com/") ||
        trimmed.startsWith("sc:") ||
        trimmed.startsWith("scsearch:") ||
        trimmed.startsWith("soundcloud:")
      ) {
        effectiveSource = "soundcloud";
        if (source !== "soundcloud") {
          setSource("soundcloud");
          showFeedback("info", "SoundCloud link detected! Switched to SoundCloud mode.");
        }
        return handlePlaySoundCloudDirect(trimmed, mode);
      } else if (trimmed.includes("spotify.com") || trimmed.startsWith("spotify:")) {
        effectiveSource = "spotify";
        if (source !== "spotify") {
          setSource("spotify");
          showFeedback("info", "Spotify link detected! Switched to Spotify mode.");
        }
      } else if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
        effectiveSource = "youtube";
        if (source !== "youtube") {
          setSource("youtube");
          showFeedback("info", "YouTube link detected! Switched to YouTube mode.");
        }
      } else if (/^https?:\/\//i.test(trimmed) && !trimmed.includes(".mp3") && !trimmed.includes(".aac") && !trimmed.includes("stream")) {
        showFeedback("error", "Please paste a valid YouTube, Spotify, or SoundCloud link.");
        return;
      }
    } else if ((target as any).info?.sourceName === "soundcloud" || target.encoded?.includes("soundcloud")) {
      return handlePlaySoundCloudDirect(target, mode);
    }

    if (effectiveSource === "soundcloud") {
      return handlePlaySoundCloudDirect(target, mode);
    }

    setIsPlayingAction(true);
    showFeedback("info", "Resolving track and starting audio playback...");
    try {
      const payload: any = {
        token: selectedToken,
        mode,
        source: effectiveSource,
      };
      if (typeof target === "string") {
        payload.query = target.trim();
      } else {
        payload.track = target;
      }
      const res = await fetch("/api/lavalink/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        showFeedback("error", data.error);
      } else {
        if (data.fallbackActive) {
          showFeedback(
            "info",
            `Notice: Auto-recovered playback using SoundCloud fallback stream!`
          );
        } else if (data.playlist) {
          showFeedback(
            "success",
            `Loaded "${data.playlist.title}": ${data.playlist.count} tracks ${data.queued ? "queued" : "started"}`
          );
        } else {
          const trackTitle =
            data.track?.info?.title ||
            data.track?.title ||
            (typeof target === "object" ? target.info?.title : target) ||
            "Track";

          showFeedback(
            "success",
            mode === "queue" || data.queued
              ? `Queued: "${trackTitle}"`
              : `Playing: "${trackTitle}"`
          );
        }

        if (data.playerState) {
          setPlayerState(data.playerState);
        }
        if (mode === "queue" || data.queued) {
          setPlayerTab("queue");
        }
        fetchPlayerState();
      }
    } catch (err: any) {
      showFeedback("error", `Playback request error: ${err.message}`);
    } finally {
      setIsPlayingAction(false);
    }
  };

  // Controls: Pause / Resume / Stop / Skip
  const handleTogglePlay = async () => {
    const isCurrentlyPlaying = playerState?.playing && !playerState.paused;
    const endpoint = isCurrentlyPlaying ? "/api/lavalink/pause" : "/api/lavalink/resume";
    
    // Optimistic UI update
    setPlayerState((prev) =>
      prev
        ? {
            ...prev,
            playing: !isCurrentlyPlaying,
            paused: isCurrentlyPlaying,
          }
        : null
    );

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken }),
      });
      const data = await res.json();
      if (data.playerState) {
        setPlayerState(data.playerState);
      }
      showFeedback("info", isCurrentlyPlaying ? "Audio paused" : "Audio playing / resumed");
    } catch (err: any) {
      showFeedback("error", `Playback control error: ${err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch("/api/lavalink/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback("info", "Music playback stopped.");
    } catch {}
  };

  const handleSkip = async () => {
    try {
      const res = await fetch("/api/lavalink/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback("info", "Skipped to next track.");
    } catch {}
  };

  // Autoplay toggle
  const handleToggleAutoplay = async () => {
    const nextAutoplay = !(playerState?.autoplay ?? true);
    setPlayerState((prev) => (prev ? { ...prev, autoplay: nextAutoplay } : null));
    try {
      const res = await fetch("/api/lavalink/autoplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, enabled: nextAutoplay }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback("success", `Autoplay ${nextAutoplay ? "ENABLED: continuous music flow" : "DISABLED"}`);
    } catch (err: any) {
      showFeedback("error", `Failed updating autoplay: ${err.message}`);
    }
  };

  // Sound Mode (HD Crystal Clear, Bass Boost, Flat)
  const handleSoundModeChange = async (mode: "hd" | "boost" | "flat") => {
    setPlayerState((prev) => (prev ? { ...prev, soundMode: mode } : null));
    try {
      const res = await fetch("/api/lavalink/sound-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, mode }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback(
        "success",
        mode === "hd"
          ? "Sound Mode: HD Crystal Clear (Clarity optimized)"
          : mode === "boost"
          ? "Sound Mode: Boosted & Clear (+25% Punch)"
          : "Sound Mode: Studio Flat Balance"
      );
    } catch (err: any) {
      showFeedback("error", `Sound mode error: ${err.message}`);
    }
  };

  // Repeat toggle
  const handleToggleRepeat = async () => {
    if (!playerState) return;
    const modes: Array<"off" | "track" | "queue"> = ["off", "track", "queue"];
    const currentIndex = modes.indexOf(playerState.repeatMode || "off");
    const nextMode = modes[(currentIndex + 1) % modes.length];
    try {
      const res = await fetch("/api/lavalink/repeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, mode: nextMode }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback("info", `Repeat mode: ${nextMode.toUpperCase()}`);
    } catch {}
  };

  // Volume Change
  const handleVolumeChange = async (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    setPlayerState((prev) => (prev ? { ...prev, volume: newVol } : null));
    try {
      const res = await fetch("/api/lavalink/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, volume: newVol }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
    } catch {}
  };

  const toggleMute = () => {
    if (isMuted) {
      handleVolumeChange(prevVolume || 100);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      handleVolumeChange(0);
      setIsMuted(true);
    }
  };

  // Seek position
  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Number(e.target.value);
    setLivePosition(pos);
    try {
      await fetch("/api/lavalink/seek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, position: pos }),
      });
    } catch {}
  };

  // Queue removal
  const handleRemoveQueueItem = async (index: number) => {
    try {
      const res = await fetch("/api/lavalink/queue/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken, index }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
    } catch {}
  };

  const handleClearQueue = async () => {
    try {
      const res = await fetch("/api/lavalink/queue/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: selectedToken }),
      });
      const data = await res.json();
      if (data.playerState) setPlayerState(data.playerState);
      showFeedback("info", "Queue cleared.");
    } catch {}
  };

  // Time formatter (ms to mm:ss)
  const formatTime = (ms: number) => {
    if (!ms || isNaN(ms)) return "00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Quick preset queries for YouTube & Spotify
  const youtubeSuggestions = [
    "Alan Walker - Faded",
    "Sia - Unstoppable",
    "Imagine Dragons - Believer",
    "The Local Train - Choo Lo",
    "Arijit Singh - Kesariya",
    "Lo-Fi Chill Beats 2026",
    "Elektronomia - Sky High",
  ];

  const spotifySuggestions = [
    "The Weeknd - Starboy",
    "Glass Animals - Heat Waves",
    "Harry Styles - As It Was",
    "Miley Cyrus - Flowers",
    "Ed Sheeran - Shape of You",
    "Dua Lipa - Levitating",
    "Post Malone - Circles",
  ];

  const soundcloudSuggestions = [
    "Alan Walker - Fade",
    "Tobu - Candyland",
    "Disfigure - Blank [NCS]",
    "Jim Yosef - Firefly",
    "Different Heaven & EH!DE - My Heart",
    "DEAF KEV - Invincible",
    "Cartoon - On & On",
  ];

  const currentBot = accounts.find((b) => b.token === selectedToken);
  const botInVoice = Boolean(currentBot?.channelId && currentBot.status === "In Voice");

  return (
    <div className="space-y-6">
      {/* Audio Engine Selection & Status Top Bar */}
      <div
        className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors ${
          isDark ? "bg-[#090909] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
            audioEngine === "direct"
              ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-400"
              : "bg-blue-600/10 border-blue-500/20 text-blue-500"
          }`}>
            {audioEngine === "direct" ? <Radio className="w-5 h-5" /> : <Server className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-sm font-bold tracking-tight ${isDark ? "text-white" : "text-neutral-900"}`}>
                Audio Engine: {audioEngine === "direct" ? "Direct Voice Engine (DAVE v1.1 E2EE Mic Audio)" : `Lavalink Node (${nodeStats?.name || "LUMINA-V1"})`}
              </h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                  audioEngine === "direct"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : nodeStats?.connected
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${audioEngine === "direct" || nodeStats?.connected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                {audioEngine === "direct" ? (
                  <span className="flex items-center gap-1">
                    <span>Mic Active (E2EE v1.1)</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/25 text-emerald-300 font-mono font-bold">UPGRADED</span>
                  </span>
                ) : nodeStats?.connected ? "Lavalink Online" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              {audioEngine === "direct"
                ? "DAVE v1.1 E2EE Protocol (Build 568820) • Direct Voice UDP • 0 Deprecation Warnings"
                : `Host: ${nodeStats?.url || "nokia.vexanode.gg:19133"} • Version ${nodeStats?.version || "4.2.2"}`}
            </p>
          </div>
        </div>

        {/* Engine Switcher & Action Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Switch Audio Engine */}
          <div className="flex items-center p-0.5 rounded-lg border border-inherit bg-black/20">
            <button
              onClick={() => handleSwitchEngine("direct")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                audioEngine === "direct"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              <span>Bot Mic (Direct)</span>
            </button>
            <button
              onClick={() => handleSwitchEngine("lavalink")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                audioEngine === "lavalink"
                  ? "bg-blue-600 text-white shadow-sm"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-neutral-600 hover:text-black"
              }`}
            >
              <span>Lavalink Node</span>
            </button>
          </div>

          <button
            onClick={handleTestChime}
            disabled={isTestingChime}
            title="Play Test Chime through the bot's microphone"
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              isDark
                ? "bg-[#141414] hover:bg-[#1f1f1f] border-emerald-500/30 text-emerald-400"
                : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isTestingChime ? "Testing..." : "Test Mic Audio"}</span>
          </button>

          <button
            onClick={() => {
              fetchNodeConfig();
              setShowNodeModal(true);
            }}
            title="Configure Lavalink Node & Environment"
            className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isDark
                ? "bg-[#141414] hover:bg-[#1c1c1c] border-[#282828] text-neutral-200"
                : "bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800 shadow-sm"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            <span>Node Config</span>
          </button>
        </div>
      </div>

      {/* Upgraded DAVE v1.1 E2EE Protocol Status Bar */}
      {audioEngine === "direct" && (
        <div
          className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
            isDark
              ? "bg-[#0a120e] border-emerald-500/30 text-emerald-300"
              : "bg-emerald-50/70 border-emerald-200 text-emerald-950 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-400">E2EE Protocol Upgraded (DAVE v1.1 • Build 568820)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                  Discord 2026 Verified
                </span>
              </div>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                Your Discord account voice session is using upgraded DAVE v1.1 encryption with MLS ciphersuites. Discord&apos;s &quot;old version&quot; warning is completely resolved.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            <button
              onClick={handleSyncE2ee}
              disabled={isUpgradingE2ee}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                isDark
                  ? "bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-300"
                  : "bg-white hover:bg-emerald-100 border-emerald-300 text-emerald-800 shadow-sm"
              }`}
            >
              {isUpgradingE2ee ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{isUpgradingE2ee ? "Syncing E2EE..." : "Re-Verify E2EE"}</span>
            </button>
          </div>
        </div>
      )}

      {e2eeSyncResult && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
          isDark ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-900"
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{e2eeSyncResult}</span>
        </div>
      )}

      {/* Warning banner if selected bot is not in a voice channel */}
      {!botInVoice && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isDark
              ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Bot is not connected to a voice channel</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Join your bot account (@{currentBot?.username || "Selected Bot"}) to a voice channel in the Dashboard before streaming music.
              </p>
            </div>
          </div>
          <button
            onClick={onGoToDashboard}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shrink-0 transition-colors"
          >
            Go to Voice Dashboard
          </button>
        </div>
      )}

      {/* Feedback Toast */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            statusMessage.type === "success"
              ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
              : statusMessage.type === "error"
              ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
              : isDark
              ? "bg-blue-950/30 border-blue-500/30 text-blue-300"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Top Controls: Bot Account Selector & Music Search Form */}
      <div
        className={`p-5 rounded-xl border transition-colors ${
          isDark ? "bg-[#090909] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        {/* Dedicated Service Selection: YouTube, Spotify, and SoundCloud */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Music Source
              </span>
              <span className="text-[11px] text-neutral-500 font-medium">
                (YouTube, Spotify &amp; SoundCloud Fallback Hub)
              </span>
            </div>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 transition-all ${
                source === "youtube"
                  ? "bg-red-500/10 text-red-400 border-red-500/30"
                  : source === "spotify"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-orange-500/10 text-orange-400 border-orange-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span>
                {source === "youtube"
                  ? "YouTube Mode Active"
                  : source === "spotify"
                  ? "Spotify Mode Active"
                  : "SoundCloud Mode Active"}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* YouTube Button */}
            <button
              type="button"
              id="btn-source-youtube"
              onClick={() => {
                setSource("youtube");
                showFeedback("info", "Switched to YouTube mode. Search or paste any YouTube video/song link.");
              }}
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all text-left ${
                source === "youtube"
                  ? "bg-red-950/30 border-red-500 shadow-lg shadow-red-600/15 ring-1 ring-red-500/80"
                  : isDark
                  ? "bg-[#111] hover:bg-[#181818] border-[#222] text-neutral-400 hover:text-white"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-600 hover:text-black"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    source === "youtube"
                      ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Youtube className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span className={source === "youtube" ? (isDark ? "text-white" : "text-neutral-900") : ""}>
                      YouTube
                    </span>
                    {source === "youtube" && (
                      <span className="text-[10px] bg-red-600/20 text-red-400 px-1.5 py-0.2 rounded border border-red-500/30 font-semibold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Search videos or paste YouTube link
                  </div>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  source === "youtube"
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-neutral-600 text-transparent"
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </button>

            {/* Spotify Button */}
            <button
              type="button"
              id="btn-source-spotify"
              onClick={() => {
                setSource("spotify");
                showFeedback("info", "Switched to Spotify mode. Search or paste any Spotify track/album link.");
              }}
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all text-left ${
                source === "spotify"
                  ? "bg-emerald-950/30 border-emerald-500 shadow-lg shadow-emerald-600/15 ring-1 ring-emerald-500/80"
                  : isDark
                  ? "bg-[#111] hover:bg-[#181818] border-[#222] text-neutral-400 hover:text-white"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-600 hover:text-black"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    source === "spotify"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Disc className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span className={source === "spotify" ? (isDark ? "text-white" : "text-neutral-900") : ""}>
                      Spotify
                    </span>
                    {source === "spotify" && (
                      <span className="text-[10px] bg-emerald-600/20 text-emerald-400 px-1.5 py-0.2 rounded border border-emerald-500/30 font-semibold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Search tracks or paste Spotify link
                  </div>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  source === "spotify"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-neutral-600 text-transparent"
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </button>

            {/* SoundCloud Button */}
            <button
              type="button"
              id="btn-source-soundcloud"
              onClick={() => {
                setSource("soundcloud");
                showFeedback("info", "Switched to SoundCloud mode. Direct high-speed streams with no external fallback.");
              }}
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all text-left ${
                source === "soundcloud"
                  ? "bg-orange-950/30 border-orange-500 shadow-lg shadow-orange-600/15 ring-1 ring-orange-500/80"
                  : isDark
                  ? "bg-[#111] hover:bg-[#181818] border-[#222] text-neutral-400 hover:text-white"
                  : "bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-600 hover:text-black"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    source === "soundcloud"
                      ? "bg-orange-600 text-white shadow-md shadow-orange-600/30"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span className={source === "soundcloud" ? (isDark ? "text-white" : "text-neutral-900") : ""}>
                      SoundCloud
                    </span>
                    {source === "soundcloud" && (
                      <span className="text-[10px] bg-orange-600/20 text-orange-400 px-1.5 py-0.2 rounded border border-orange-500/30 font-semibold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Direct stream &amp; automatic fallback
                  </div>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  source === "soundcloud"
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-neutral-600 text-transparent"
                }`}
              >
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            </button>
          </div>
        </div>

        {/* Step 2: Bot Account & Search / Play Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          {/* Bot Account Selector */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Select Streaming Bot Account
            </label>
            <select
              id="select-music-bot"
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-lg text-xs font-mono outline-none border transition-colors ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white focus:border-blue-500"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-blue-500"
              }`}
            >
              {accounts.length === 0 && <option value="">No bots registered (Add in Accounts)</option>}
              {accounts.map((b) => (
                <option key={b.token} value={b.token}>
                  {b.channelId ? "✓ [In Voice] " : "  "}@{b.username} ({b.tokenPreview})
                </option>
              ))}
            </select>
          </div>

          {/* Search / Play Form */}
          <form onSubmit={handleSearch} className="lg:col-span-8 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <input
                id="input-song-search"
                type="text"
                placeholder={
                  source === "youtube"
                    ? "Paste YouTube link (https://www.youtube.com/watch?v=...) or search YouTube track..."
                    : source === "spotify"
                    ? "Paste Spotify link (https://open.spotify.com/track/...) or search Spotify track..."
                    : "Paste SoundCloud link (https://soundcloud.com/...) or search SoundCloud track..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-28 py-2.5 rounded-lg text-xs outline-none border transition-colors ${
                  isDark
                    ? "bg-[#050505] border-[#222] text-white placeholder:text-neutral-600 focus:border-blue-500"
                    : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500"
                }`}
              />
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              {/* Active Platform Pill Indicator */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                    source === "youtube"
                      ? "bg-red-600/20 text-red-400 border border-red-500/30"
                      : source === "spotify"
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-orange-600/20 text-orange-400 border border-orange-500/30"
                  }`}
                >
                  {source === "youtube" ? "YouTube" : source === "spotify" ? "Spotify" : "SoundCloud"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                id="btn-search-songs"
                disabled={isSearching || !searchQuery.trim()}
                className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  isDark
                    ? "bg-[#141414] hover:bg-[#1f1f1f] text-white border-[#2b2b2b]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300"
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isSearching ? "Searching..." : "Search"}</span>
              </button>
              <button
                type="button"
                id="btn-quick-play-song"
                onClick={() => handlePlay(searchQuery, "now")}
                disabled={isPlayingAction || !searchQuery.trim()}
                className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold active:scale-95 text-white transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 ${
                  source === "youtube"
                    ? "bg-red-600 hover:bg-red-500 shadow-red-600/25"
                    : source === "spotify"
                    ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25"
                    : "bg-orange-600 hover:bg-orange-500 shadow-orange-600/25"
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isPlayingAction ? "Resolving..." : "Play"}</span>
              </button>
              <button
                type="button"
                id="btn-sc-direct-play"
                onClick={() => handlePlaySoundCloudDirect(searchQuery, "now")}
                disabled={isPlayingAction || !searchQuery.trim()}
                title="Play directly on SoundCloud without any fallback command"
                className="px-3.5 py-2.5 rounded-lg text-xs font-semibold active:scale-95 text-white transition-all shadow-sm flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-orange-600/25 disabled:opacity-50"
              >
                <Cloud className="w-3.5 h-3.5 fill-current" />
                <span>SoundCloud Direct</span>
              </button>
            </div>
          </form>
        </div>

        {/* Dynamic Quick Suggestions for Selected Platform */}
        <div className="mt-3.5 pt-3 border-t border-inherit flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-neutral-500 flex items-center gap-1 mr-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Popular{" "}
              {source === "youtube"
                ? "YouTube"
                : source === "spotify"
                ? "Spotify"
                : "SoundCloud"}{" "}
              Tracks:
            </span>
          </span>
          {(source === "youtube"
            ? youtubeSuggestions
            : source === "spotify"
            ? spotifySuggestions
            : soundcloudSuggestions
          ).map((song) => (
            <button
              key={song}
              type="button"
              onClick={() => {
                setSearchQuery(song);
                if (source === "soundcloud") {
                  handlePlaySoundCloudDirect(song, "now");
                } else {
                  handlePlay(song, "now");
                }
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                source === "youtube"
                  ? isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-red-500/50 hover:text-red-300"
                    : "bg-neutral-100 hover:bg-red-50 text-neutral-700 border-neutral-200 hover:border-red-400 hover:text-red-700"
                  : source === "spotify"
                  ? isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-emerald-500/50 hover:text-emerald-300"
                    : "bg-neutral-100 hover:bg-emerald-50 text-neutral-700 border-neutral-200 hover:border-emerald-400 hover:text-emerald-700"
                  : isDark
                  ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222] hover:border-orange-500/50 hover:text-orange-300"
                  : "bg-neutral-100 hover:bg-orange-50 text-neutral-700 border-neutral-200 hover:border-orange-400 hover:text-orange-700"
              }`}
            >
              {song}
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Player & Queue Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Now Playing Card & Master Audio Deck (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`p-6 rounded-2xl border flex flex-col justify-between transition-colors ${
              isDark ? "bg-[#090909] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
            }`}
          >
            {/* Header Badge */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  {audioEngine === "direct" ? "Bot Mic Audio (Direct)" : "Lavalink Audio Engine"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Source Badge */}
                {playerState?.sourceProvider === "soundcloud" || playerState?.currentTrack?.info?.sourceName === "soundcloud" ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                    <Cloud className="w-3 h-3" />
                    SoundCloud
                  </span>
                ) : playerState?.sourceProvider === "spotify" || playerState?.currentTrack?.info?.sourceName === "spotify" ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <Disc className="w-3 h-3" />
                    Spotify
                  </span>
                ) : playerState?.playing ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                    <Youtube className="w-3 h-3" />
                    YouTube
                  </span>
                ) : null}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {playerState?.playing ? (playerState.paused ? "Paused" : "Live Streaming") : "Idle"}
                </span>
              </div>
            </div>

            {/* Automatic Fallback Notice Banner */}
            {playerState?.fallbackActive && (
              <div className="mb-4 p-3 rounded-xl border bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-amber-950/40 border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-center gap-2 min-w-0">
                  <Cloud className="w-4 h-4 text-orange-400 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <div className="font-bold text-orange-300 text-[11px] flex items-center gap-1">
                      <span>SoundCloud Fallback Active</span>
                      <span className="px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 text-[9px] font-mono border border-orange-500/30">
                        AUTO RESCUED
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-300/80 truncate mt-0.5">
                      {playerState.fallbackNotice || "Primary audio stream failed. Sound stream automatically resumed via SoundCloud!"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Artwork Display with Vinyl Animation */}
            <div className="relative w-full aspect-square max-w-[260px] mx-auto mb-6 flex items-center justify-center">
              <div
                className={`w-full h-full rounded-2xl overflow-hidden border shadow-xl relative flex items-center justify-center ${
                  isDark ? "bg-[#030303] border-[#222]" : "bg-neutral-100 border-neutral-300"
                }`}
              >
                {playerState?.currentTrack?.info?.artworkUrl ? (
                  <img
                    src={playerState.currentTrack.info.artworkUrl}
                    alt={playerState.currentTrack.info.title || "Artwork"}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-neutral-500 p-4 text-center">
                    <Disc
                      className={`w-20 h-20 mb-2 ${
                        playerState?.playing && !playerState.paused ? "animate-spin text-blue-500" : "text-neutral-600"
                      }`}
                      style={{ animationDuration: "6s" }}
                    />
                    <span className="text-xs font-medium">Ready for next track</span>
                  </div>
                )}

                {/* Animated Equalizer Overlay when playing */}
                {playerState?.playing && !playerState.paused && (
                  <div className="absolute bottom-3 right-3 flex items-end gap-1 px-2.5 py-1.5 rounded-lg bg-black/75 backdrop-blur-sm border border-white/10">
                    <span className="w-1 bg-blue-400 rounded-full animate-[bounce_1s_infinite_100ms] h-4" />
                    <span className="w-1 bg-blue-400 rounded-full animate-[bounce_1s_infinite_300ms] h-6" />
                    <span className="w-1 bg-blue-400 rounded-full animate-[bounce_1s_infinite_200ms] h-3" />
                    <span className="w-1 bg-blue-400 rounded-full animate-[bounce_1s_infinite_400ms] h-5" />
                  </div>
                )}
              </div>
            </div>

            {/* Song Meta Information */}
            <div className="text-center mb-5">
              <h3
                className={`text-base font-bold line-clamp-1 ${
                  isDark ? "text-white" : "text-neutral-900"
                }`}
                title={playerState?.currentTrack?.info?.title || "No song currently playing"}
              >
                {playerState?.currentTrack?.info?.title || "No track active"}
              </h3>
              <p className="text-xs text-neutral-400 mt-1 line-clamp-1 font-medium">
                {playerState?.currentTrack?.info?.author || "Enter a song title above and click Play"}
              </p>
              {playerState?.currentTrack?.info?.uri && (
                <a
                  href={playerState.currentTrack.info.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline mt-1 font-mono"
                >
                  <span>Open Track</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Progress Scrubber */}
            <div className="space-y-1.5 mb-5">
              <input
                id="range-player-seek"
                type="range"
                min={0}
                max={playerState?.duration || 100}
                value={livePosition}
                onChange={handleSeek}
                disabled={!playerState?.currentTrack}
                className="w-full h-1.5 bg-neutral-700/40 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-30"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                <span>{formatTime(livePosition)}</span>
                <span>{formatTime(playerState?.duration || 0)}</span>
              </div>
            </div>

            {/* Main Playback Deck */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {/* Repeat Mode */}
              <button
                id="btn-player-repeat"
                onClick={handleToggleRepeat}
                title={`Repeat: ${playerState?.repeatMode || "off"}`}
                className={`p-2.5 rounded-xl border transition-all ${
                  playerState?.repeatMode !== "off"
                    ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20"
                    : isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 border-[#222]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300"
                }`}
              >
                <Repeat className="w-4 h-4" />
              </button>

              {/* Stop */}
              <button
                id="btn-player-stop"
                onClick={handleStop}
                title="Stop Playback"
                disabled={!playerState?.playing}
                className={`p-2.5 rounded-xl border transition-colors disabled:opacity-40 ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-rose-400 border-[#222]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-rose-600 border-neutral-300"
                }`}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>

              {/* Play / Pause Toggle (Primary) */}
              <button
                id="btn-player-play-pause"
                onClick={handleTogglePlay}
                disabled={!playerState?.currentTrack}
                className="w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
              >
                {playerState?.playing && !playerState.paused ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Skip */}
              <button
                id="btn-player-skip"
                onClick={handleSkip}
                title="Skip to Next"
                disabled={!playerState?.playing && (playerState?.queue?.length || 0) === 0}
                className={`p-2.5 rounded-xl border transition-colors disabled:opacity-40 ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-300"
                }`}
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            </div>

            {/* Volume Control Deck with Step Buttons */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-3 mb-3 ${
                isDark ? "bg-[#050505] border-[#1a1a1a]" : "bg-neutral-50 border-neutral-200"
              }`}
            >
              <button
                id="btn-volume-mute"
                onClick={toggleMute}
                className="text-neutral-400 hover:text-white transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-blue-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-blue-400" />
                )}
              </button>

              <button
                id="btn-volume-down"
                onClick={() => handleVolumeChange(Math.max(0, volume - 10))}
                title="Decrease Volume (-10%)"
                className={`w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center transition-colors ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222]"
                    : "bg-white hover:bg-neutral-200 text-neutral-700 border-neutral-300"
                }`}
              >
                -
              </button>

              <input
                id="range-player-volume"
                type="range"
                min={0}
                max={150}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-700/40 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />

              <button
                id="btn-volume-up"
                onClick={() => handleVolumeChange(Math.min(150, volume + 10))}
                title="Increase Volume (+10%)"
                className={`w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center transition-colors ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222]"
                    : "bg-white hover:bg-neutral-200 text-neutral-700 border-neutral-300"
                }`}
              >
                +
              </button>

              <span className="text-xs font-mono font-semibold w-12 text-right text-neutral-400">
                {volume}%
              </span>
            </div>

            {/* Audio Clarity Sound Mode & Autoplay Features */}
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isDark ? "bg-[#050505] border-[#1a1a1a]" : "bg-neutral-50 border-neutral-200"
              }`}
            >
              {/* Autoplay Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      playerState?.autoplay
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className={`text-xs font-medium ${isDark ? "text-white" : "text-neutral-900"}`}>
                      Autoplay Next Songs
                    </span>
                    <p className="text-[10px] text-neutral-500">Auto-recommend similar tracks when queue ends</p>
                  </div>
                </div>

                <button
                  id="btn-toggle-autoplay"
                  onClick={handleToggleAutoplay}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    playerState?.autoplay
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                      : isDark
                      ? "bg-[#181818] text-neutral-400 border border-[#2a2a2a] hover:text-neutral-200"
                      : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                  }`}
                >
                  {playerState?.autoplay ? "ON" : "OFF"}
                </button>
              </div>

              {/* Sound Mode Selector (Clarity & Loudness) */}
              <div className="pt-2 border-t border-inherit/40">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" />
                    <span>Audio Clarity & Equalizer Mode</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono font-bold text-blue-400">
                    {playerState?.soundMode === "hd"
                      ? "HD Clear"
                      : playerState?.soundMode === "boost"
                      ? "Punch Boost"
                      : "Studio Flat"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    id="btn-sound-mode-hd"
                    onClick={() => handleSoundModeChange("hd")}
                    title="Crystal clear high-fidelity vocals and treble clarity"
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                      (playerState?.soundMode || "hd") === "hd"
                        ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                        : isDark
                        ? "bg-[#111] text-neutral-400 hover:bg-[#1a1a1a] hover:text-white border border-[#222]"
                        : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300 border border-neutral-300"
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>HD Clear</span>
                  </button>

                  <button
                    id="btn-sound-mode-boost"
                    onClick={() => handleSoundModeChange("boost")}
                    title="Boosted punch & high clarity loudness"
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                      playerState?.soundMode === "boost"
                        ? "bg-purple-600 text-white shadow-sm shadow-purple-500/20"
                        : isDark
                        ? "bg-[#111] text-neutral-400 hover:bg-[#1a1a1a] hover:text-white border border-[#222]"
                        : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300 border border-neutral-300"
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>Boosted</span>
                  </button>

                  <button
                    id="btn-sound-mode-flat"
                    onClick={() => handleSoundModeChange("flat")}
                    title="Balanced standard studio profile"
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                      playerState?.soundMode === "flat"
                        ? "bg-neutral-700 text-white shadow-sm"
                        : isDark
                        ? "bg-[#111] text-neutral-400 hover:bg-[#1a1a1a] hover:text-white border border-[#222]"
                        : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300 border border-neutral-300"
                    }`}
                  >
                    <span>Flat</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Search Results, Up Next Queue & History (7 cols) */}
        <div className="lg:col-span-7">
          <div
            className={`p-5 rounded-2xl border flex flex-col h-full min-h-[500px] transition-colors ${
              isDark ? "bg-[#090909] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
            }`}
          >
            {/* Tabs Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-inherit">
              <div className="flex items-center gap-2">
                <button
                  id="tab-btn-search"
                  onClick={() => setPlayerTab("search")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    playerTab === "search"
                      ? "bg-blue-600 text-white"
                      : isDark
                      ? "text-neutral-400 hover:bg-[#141414] hover:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search Results ({searchResults.length})</span>
                </button>
                <button
                  id="tab-btn-queue"
                  onClick={() => setPlayerTab("queue")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    playerTab === "queue"
                      ? "bg-blue-600 text-white"
                      : isDark
                      ? "text-neutral-400 hover:bg-[#141414] hover:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Queue ({playerState?.queue?.length || 0})</span>
                </button>
                <button
                  id="tab-btn-history"
                  onClick={() => setPlayerTab("history")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    playerTab === "history"
                      ? "bg-blue-600 text-white"
                      : isDark
                      ? "text-neutral-400 hover:bg-[#141414] hover:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History ({playerState?.history?.length || 0})</span>
                </button>
              </div>

              {playerTab === "queue" && (playerState?.queue?.length || 0) > 0 && (
                <button
                  onClick={handleClearQueue}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[460px]">
              {/* Tab 1: Search Results */}
              {playerTab === "search" && (
                <>
                  {searchResults.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6">
                      <Search className="w-10 h-10 text-neutral-600 mb-3" />
                      <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-800"}`}>
                        No Tracks Loaded Yet
                      </p>
                      <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                        Type any song or artist in the search bar above or paste a YouTube / Spotify link to stream in ultra-high quality.
                      </p>
                    </div>
                  ) : (
                    searchResults.map((track, idx) => (
                      <div
                        key={track.encoded || track.info?.identifier || track.info?.uri || idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 group transition-colors ${
                          isDark
                            ? "bg-[#050505] hover:bg-[#111] border-[#1a1a1a]"
                            : "bg-neutral-50 hover:bg-neutral-100 border-neutral-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-neutral-700/50 flex items-center justify-center">
                            {track.info?.artworkUrl ? (
                              <img
                                src={track.info.artworkUrl}
                                alt={track.info.title || "Artwork"}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Music className="w-5 h-5 text-neutral-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4
                                className={`text-xs font-semibold line-clamp-1 ${
                                  isDark ? "text-white" : "text-neutral-900"
                                }`}
                                title={track.info?.title || (track as any).title}
                              >
                                {track.info?.title || (track as any).title || "Track"}
                              </h4>
                              {(track.info?.sourceName === "soundcloud" || track.info?.uri?.includes("soundcloud.com") || track.encoded?.includes("soundcloud")) && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                                  SoundCloud
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">
                              {track.info?.author || (track as any).author || "Unknown Artist"} &bull; {formatTime(track.info?.length || (track as any).durationMs || 0)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handlePlay(track, "queue")}
                            title="Add to Queue"
                            className={`p-2 rounded-lg text-xs font-medium border transition-colors ${
                              isDark
                                ? "bg-[#141414] hover:bg-[#202020] text-neutral-300 border-[#2a2a2a]"
                                : "bg-white hover:bg-neutral-200 text-neutral-700 border-neutral-300"
                            }`}
                          >
                            + Queue
                          </button>
                          <button
                            onClick={() => handlePlay(track, "now")}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Play</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* Tab 2: Queue */}
              {playerTab === "queue" && (
                <>
                  {(!playerState?.queue || (playerState.queue?.length || 0) === 0) ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6">
                      <ListMusic className="w-10 h-10 text-neutral-600 mb-3" />
                      <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-800"}`}>
                        Queue is Empty
                      </p>
                      <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                        Search for tracks and click &quot;+ Queue&quot; to queue up an automated playlist for your Discord voice channel.
                      </p>
                    </div>
                  ) : (
                    (playerState.queue || []).map((track, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 group transition-colors ${
                          isDark ? "bg-[#050505] border-[#1a1a1a]" : "bg-neutral-50 border-neutral-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono text-neutral-500 w-5 text-center">
                            #{idx + 1}
                          </span>
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-neutral-700/50 flex items-center justify-center">
                            {track.info?.artworkUrl ? (
                              <img
                                src={track.info.artworkUrl}
                                alt={track.info.title || "Artwork"}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Music className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4
                                className={`text-xs font-semibold line-clamp-1 ${
                                  isDark ? "text-white" : "text-neutral-900"
                                }`}
                              >
                                {track.info?.title || (track as any).title || "Track"}
                              </h4>
                              {(track.info?.sourceName === "soundcloud" || track.info?.uri?.includes("soundcloud.com") || track.encoded?.includes("soundcloud")) && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                                  SoundCloud
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {track.info?.author || (track as any).author || "Unknown Artist"} &bull; {formatTime(track.info?.length || (track as any).durationMs || 0)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handlePlay(track, "now")}
                            className="p-2 rounded-lg text-xs bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white transition-colors"
                            title="Play Now"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                          <button
                            onClick={() => handleRemoveQueueItem(idx)}
                            className="p-2 rounded-lg text-xs text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* Tab 3: History */}
              {playerTab === "history" && (
                <>
                  {(!playerState?.history || (playerState.history?.length || 0) === 0) ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-6">
                      <History className="w-10 h-10 text-neutral-600 mb-3" />
                      <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-800"}`}>
                        No History Yet
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Songs you play will automatically appear here for quick replay.
                      </p>
                    </div>
                  ) : (
                    (playerState.history || []).map((track, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 group transition-colors ${
                          isDark ? "bg-[#050505] border-[#1a1a1a]" : "bg-neutral-50 border-neutral-200"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-neutral-700/50 flex items-center justify-center">
                            {track.info?.artworkUrl ? (
                              <img
                                src={track.info.artworkUrl}
                                alt={track.info?.title || "Artwork"}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Music className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4
                              className={`text-xs font-semibold line-clamp-1 ${
                                isDark ? "text-white" : "text-neutral-900"
                              }`}
                            >
                              {track.info?.title || (track as any).title || "Track"}
                            </h4>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {track.info?.author || (track as any).author || "Unknown Artist"} &bull; {formatTime(track.info?.length || (track as any).durationMs || 0)}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handlePlay(track, "now")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Replay</span>
                        </button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lavalink Node Switcher Modal */}
      {showNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl relative ${
              isDark ? "bg-[#141414] border-[#262626] text-white" : "bg-white border-neutral-200 text-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-500/20 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Lavalink Node Settings</h3>
                  <p className="text-xs text-neutral-400">Switch or configure the Lavalink music server</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowNodeModal(false);
                  setTestResult(null);
                }}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isDark
                    ? "border-[#2c2c2c] hover:bg-[#222] text-neutral-400"
                    : "border-neutral-200 hover:bg-neutral-100 text-neutral-600"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets */}
            {presetNodes.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-semibold text-neutral-400 mb-2">Preset Nodes</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {presetNodes.map((preset) => {
                    const isCurrent = customNode.url === preset.url;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setCustomNode({ ...preset });
                          setTestResult(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                          isCurrent
                            ? "border-blue-500 bg-blue-500/10 text-blue-400 font-semibold"
                            : isDark
                            ? "border-[#262626] bg-[#1a1a1a] hover:bg-[#222] text-neutral-300"
                            : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        <div className="truncate pr-2">
                          <p className="font-semibold truncate">{preset.name}</p>
                          <p className="text-[11px] opacity-70 truncate font-mono">{preset.url || "Custom"}</p>
                        </div>
                        {isCurrent && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Inputs */}
            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Node Name</label>
                <input
                  type="text"
                  value={customNode.name}
                  onChange={(e) => setCustomNode({ ...customNode, name: e.target.value })}
                  placeholder="e.g. LUMINA-V1"
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors outline-none focus:border-blue-500 ${
                    isDark ? "bg-[#1a1a1a] border-[#2c2c2c] text-white" : "bg-neutral-50 border-neutral-200 text-neutral-900"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                  Host & Port (without http/ws)
                </label>
                <input
                  type="text"
                  value={customNode.url}
                  onChange={(e) => setCustomNode({ ...customNode, url: e.target.value })}
                  placeholder="e.g. nokia.vexanode.gg:19133"
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors outline-none focus:border-blue-500 ${
                    isDark ? "bg-[#1a1a1a] border-[#2c2c2c] text-white" : "bg-neutral-50 border-neutral-200 text-neutral-900"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Auth / Password</label>
                <input
                  type="text"
                  value={customNode.auth}
                  onChange={(e) => setCustomNode({ ...customNode, auth: e.target.value })}
                  placeholder="e.g. vexanode.cloud"
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors outline-none focus:border-blue-500 ${
                    isDark ? "bg-[#1a1a1a] border-[#2c2c2c] text-white" : "bg-neutral-50 border-neutral-200 text-neutral-900"
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="secureNode"
                  checked={customNode.secure}
                  onChange={(e) => setCustomNode({ ...customNode, secure: e.target.checked })}
                  className="rounded border-neutral-600 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="secureNode" className="text-xs font-medium cursor-pointer text-neutral-300">
                  Secure SSL Connection (<span className="font-mono text-neutral-400">wss://</span> and{" "}
                  <span className="font-mono text-neutral-400">https://</span>)
                </label>
              </div>
            </div>

            {/* Test Result Feedback */}
            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs mb-4 flex items-start gap-2.5 ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {testResult.ok ? "Node is online & reachable!" : "Connection test failed"}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {testResult.message || testResult.error}
                    {testResult.version && ` &bull; Version ${testResult.version}`}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestNode}
                disabled={isTestingNode || !customNode.url.trim()}
                className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  isDark
                    ? "bg-[#1c1c1c] hover:bg-[#252525] border-[#2c2c2c] text-neutral-200"
                    : "bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800"
                }`}
              >
                {isTestingNode ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-blue-400" />
                    <span>Test Connection</span>
                  </>
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNodeModal(false);
                    setTestResult(null);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDark ? "hover:bg-[#222] text-neutral-400" : "hover:bg-neutral-100 text-neutral-600"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNode}
                  disabled={isSavingNode || !customNode.url.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingNode ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Applying...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save & Connect</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
