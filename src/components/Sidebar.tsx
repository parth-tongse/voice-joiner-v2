import React from "react";
import { LayoutDashboard, Users, Terminal, ShieldCheck, Moon, Sun, Radio, Activity, Music } from "lucide-react";
import { ActiveTab, AppTheme } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  theme: AppTheme;
  toggleTheme: () => void;
  connectedCount: number;
  totalTokens: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  theme,
  toggleTheme,
  connectedCount,
  totalTokens,
}) => {
  const isDark = theme === "dark";

  const navItems = [
    { id: "dashboard" as ActiveTab, label: "Dashboard", icon: LayoutDashboard },
    { id: "music" as ActiveTab, label: "Lavalink Music", icon: Music },
    { id: "accounts" as ActiveTab, label: "Accounts", icon: Users, badge: totalTokens },
    { id: "cli" as ActiveTab, label: "CLI Terminal", icon: Terminal },
    { id: "protocol" as ActiveTab, label: "Integrity & Info", icon: ShieldCheck },
  ];

  return (
    <aside
      id="app-sidebar"
      className={`w-64 shrink-0 flex flex-col justify-between border-r transition-colors duration-200 select-none ${
        isDark
          ? "bg-[#050505] border-[#161616] text-neutral-300"
          : "bg-[#f8f9fa] border-neutral-200 text-neutral-700"
      }`}
    >
      <div>
        {/* Brand Header */}
        <div className={`p-5 border-b ${isDark ? "border-[#161616]" : "border-neutral-200"}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 via-orange-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/25 overflow-hidden transition-transform duration-200 hover:scale-105">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-sm tracking-tight ${isDark ? "text-white" : "text-neutral-900"}`}>
                  Voice Joiner
                </span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">Discord 24/7 Gateway</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                  isActive
                    ? isDark
                      ? "bg-gradient-to-r from-orange-950/40 to-transparent text-white border-l-4 border-orange-500"
                      : "bg-orange-50 text-neutral-900 border-l-4 border-orange-500 font-semibold"
                    : isDark
                    ? "text-neutral-400 hover:bg-[#111111] hover:text-orange-300 hover:translate-x-0.5"
                    : "text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 hover:translate-x-0.5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-orange-500" : ""}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-mono transition-transform ${
                      isActive
                        ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-xs shadow-orange-500/30"
                        : isDark
                        ? "bg-neutral-800 text-neutral-400"
                        : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls & Live Status */}
      <div className={`p-4 border-t ${isDark ? "border-[#161616]" : "border-neutral-200"} space-y-3`}>
        {/* Connection status indicator */}
        <div
          className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${
            isDark ? "bg-[#0c0c0c] border border-[#1a1a1a]" : "bg-neutral-100 border border-neutral-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connectedCount > 0 ? "bg-orange-500 animate-pulse shadow-xs shadow-orange-500" : "bg-yellow-500"
              }`}
            />
            <span className="font-medium">{connectedCount > 0 ? "Gateway Online" : "Idle / Standby"}</span>
          </div>
          <span className="font-mono text-[11px] text-amber-500 font-semibold">
            {connectedCount}/{totalTokens}
          </span>
        </div>

        {/* Theme Switcher Button (AMOLED vs Full White) */}
        <button
          id="btn-theme-toggle"
          onClick={toggleTheme}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-[0.98] hover:-translate-y-0.5 ${
            isDark
              ? "bg-[#0c0c0c] hover:bg-[#161616] text-neutral-300 border-[#222] hover:border-orange-500/40"
              : "bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-300 hover:border-orange-400"
          }`}
        >
          {isDark ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Switch to Full White</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-blue-500" />
              <span>Switch to AMOLED Black</span>
            </>
          )}
        </button>

        <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-blue-500" /> 24/7 Engine
          </span>
          <span>v10 API</span>
        </div>

        <div className="text-[10px] text-center text-neutral-500 border-t border-neutral-800/40 pt-2 font-mono">
          © 2026 Parth Tongse • All Rights Reserved
        </div>
      </div>
    </aside>
  );
};
