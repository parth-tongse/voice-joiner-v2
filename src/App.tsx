import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./components/DashboardView";
import { AccountsView } from "./components/AccountsView";
import { MusicPlayerView } from "./components/MusicPlayerView";
import { CliTerminalView } from "./components/CliTerminalView";
import { ProtocolView } from "./components/ProtocolView";
import { ActiveTab, AppTheme, BotAccount, LogEntry, SystemStatus } from "./types";
import { Plus, Radio, RefreshCw } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    try {
      const saved = localStorage.getItem("discord_active_tab") as ActiveTab;
      if (saved && ["dashboard", "music", "accounts", "cli", "protocol"].includes(saved)) {
        return saved;
      }
    } catch {}
    return "dashboard";
  });

  const setActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem("discord_active_tab", tab);
    } catch {}
  }, []);

  const [theme, setTheme] = useState<AppTheme>("dark");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [accounts, setAccounts] = useState<BotAccount[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toggle AMOLED Black vs Full White
  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, tokensRes, logsRes] = await Promise.all([
        fetch("/api/system/status").catch(() => null),
        fetch("/api/tokens").catch(() => null),
        fetch("/api/logs").catch(() => null),
      ]);
      if (statusRes && statusRes.ok) {
        const s = await statusRes.json();
        setStatus(s);
      }
      if (tokensRes && tokensRes.ok) {
        const t = await tokensRes.json();
        setAccounts(t);
      }
      if (logsRes && logsRes.ok) {
        const l = await logsRes.json();
        setLogs(l);
      }
    } catch {
      // Silently ignore background polling network interruptions
    }
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  };

  // Periodic polling every 3 seconds to keep WebSocket and voice states synchronized
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const isDark = theme === "dark";
  const connectedCount = accounts.filter((a) => a.status === "Connected" || a.status === "In Voice").length;

  return (
    <div
      id="app-root-container"
      className={`min-h-screen flex transition-colors duration-200 ${
        isDark ? "bg-[#000000] text-neutral-200" : "bg-[#ffffff] text-neutral-800"
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
        connectedCount={connectedCount}
        totalTokens={accounts.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top App Bar */}
        <header
          id="app-header"
          className={`h-16 shrink-0 px-6 border-b flex items-center justify-between transition-colors ${
            isDark ? "bg-[#050505] border-[#161616]" : "bg-white border-neutral-200 shadow-xs"
          }`}
        >
          <div className="flex items-center gap-3">
            <h1 className={`text-base font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              {activeTab === "dashboard" && "Live Voice Dashboard"}
              {activeTab === "music" && "Lavalink Audio Studio (LUMINA-V1)"}
              {activeTab === "accounts" && "Account Token Management"}
              {activeTab === "cli" && "CLI Interactive Terminal"}
              {activeTab === "protocol" && "September 2026 Integrity & E2EE Specs"}
            </h1>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isDark ? "bg-[#111] text-orange-400/90 border border-orange-500/30" : "bg-orange-50 text-orange-600 border border-orange-200"
              }`}
            >
              Build 568820 • DAVE v1.1
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator badge */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
                isDark
                  ? "bg-[#0c0c0c] border-[#1a1a1a] text-neutral-300"
                  : "bg-neutral-50 border-neutral-200 text-neutral-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-xs shadow-orange-500" />
              <span className="text-amber-400 font-semibold">{connectedCount}</span>
              <span>online</span>
            </div>

            {/* Manual refresh button */}
            <button
              onClick={handleManualRefresh}
              title="Refresh status"
              className={`p-2 rounded-lg border text-neutral-400 hover:text-orange-400 transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                isDark
                  ? "bg-[#0c0c0c] border-[#1a1a1a] hover:bg-[#161616] hover:border-orange-500/40"
                  : "bg-neutral-50 border-neutral-200 hover:border-orange-300"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-orange-500" : ""}`} />
            </button>

            {/* Quick Add Token shortcut */}
            {activeTab !== "accounts" && (
              <button
                onClick={() => setActiveTab("accounts")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white shadow-sm shadow-orange-500/20 active:scale-95 hover:-translate-y-0.5 transition-all duration-150"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manage Tokens</span>
              </button>
            )}
          </div>
        </header>

        {/* Tab View Container */}
        <div className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {activeTab === "dashboard" && (
            <DashboardView
              theme={theme}
              status={status}
              accounts={accounts}
              logs={logs}
              onRefresh={fetchData}
              onClearLogs={handleClearLogs}
              onGoToMusic={() => setActiveTab("music")}
            />
          )}

          {activeTab === "music" && (
            <MusicPlayerView
              theme={theme}
              accounts={accounts}
              onGoToDashboard={() => setActiveTab("dashboard")}
            />
          )}

          {activeTab === "accounts" && (
            <AccountsView theme={theme} accounts={accounts} onRefresh={fetchData} />
          )}

          {activeTab === "cli" && (
            <CliTerminalView theme={theme} accounts={accounts} onRefresh={fetchData} />
          )}

          {activeTab === "protocol" && <ProtocolView theme={theme} status={status} />}
        </div>
      </main>
    </div>
  );
}
