import React, { useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Mic,
  MicOff,
  Headphones,
  Video,
  Tv,
  Play,
  Square,
  Eye,
  EyeOff,
  Copy,
  Check,
  Download,
  Search,
  Power,
  RefreshCw,
  Radio,
  FileText,
  AlertTriangle,
  CheckSquare,
  X,
} from "lucide-react";
import { AppTheme, BotAccount } from "../types";

interface AccountsViewProps {
  theme: AppTheme;
  accounts: BotAccount[];
  onRefresh: () => void;
}

interface ConfirmDeleteModalState {
  open: boolean;
  type: "single" | "bulk" | "all";
  targetToken?: string;
  targetUsername?: string;
  count?: number;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ theme, accounts, onRefresh }) => {
  const isDark = theme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [isSubmittingTokens, setIsSubmittingTokens] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());

  // Multi-select state
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());

  // Delete modal state
  const [confirmModal, setConfirmModal] = useState<ConfirmDeleteModalState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // In-app alert / notification banner
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Individual account edit state for guild & channel
  const [accountInputs, setAccountInputs] = useState<{ [token: string]: { guildId: string; channelId: string } }>({});

  const showFeedback = (type: "success" | "error" | "info", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const toggleRevealToken = (token: string) => {
    setRevealedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  // Selection handlers
  const toggleSelectToken = (token: string) => {
    setSelectedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  };

  const filteredAccounts = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase();
    return (
      acc.username.toLowerCase().includes(q) ||
      acc.token.toLowerCase().includes(q) ||
      acc.status.toLowerCase().includes(q) ||
      (acc.guildId && acc.guildId.includes(q)) ||
      (acc.channelId && acc.channelId.includes(q))
    );
  });

  const isAllFilteredSelected =
    filteredAccounts.length > 0 && filteredAccounts.every((acc) => selectedTokens.has(acc.token));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Uncheck all filtered
      setSelectedTokens((prev) => {
        const next = new Set(prev);
        filteredAccounts.forEach((acc) => next.delete(acc.token));
        return next;
      });
    } else {
      // Check all filtered
      setSelectedTokens((prev) => {
        const next = new Set(prev);
        filteredAccounts.forEach((acc) => next.add(acc.token));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedTokens(new Set());
  };

  const handleAddTokens = async () => {
    if (!tokenInput.trim()) return;
    setIsSubmittingTokens(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: tokenInput }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        // Not valid JSON (e.g. server error page)
      }
      if (!res.ok) {
        throw new Error(data.error || data.message || text || `Server error (${res.status})`);
      }
      setTokenInput("");
      setShowAddModal(false);
      showFeedback("success", `Successfully added ${data.count || "new"} token(s) to manager.`);
      onRefresh();
    } catch (e: any) {
      showFeedback("error", `Failed adding tokens: ${e.message}`);
    } finally {
      setIsSubmittingTokens(false);
    }
  };

  // Safe In-App Delete Modals (No window.confirm to avoid iframe reloads/redirects)
  const openSingleDeleteModal = (token: string, username: string) => {
    setConfirmModal({
      open: true,
      type: "single",
      targetToken: token,
      targetUsername: username,
      count: 1,
    });
  };

  const openBulkDeleteModal = () => {
    if (selectedTokens.size === 0) return;
    setConfirmModal({
      open: true,
      type: "bulk",
      count: selectedTokens.size,
    });
  };

  const openDeleteAllModal = () => {
    if (accounts.length === 0) return;
    setConfirmModal({
      open: true,
      type: "all",
      count: accounts.length,
    });
  };

  const handleExecuteDelete = async () => {
    if (!confirmModal) return;
    setIsDeleting(true);
    try {
      if (confirmModal.type === "single" && confirmModal.targetToken) {
        const token = confirmModal.targetToken;
        const res = await fetch(`/api/tokens/${encodeURIComponent(token)}`, { method: "DELETE" });
        if (res.ok) {
          setSelectedTokens((prev) => {
            const next = new Set(prev);
            next.delete(token);
            return next;
          });
          showFeedback("success", `Account @${confirmModal.targetUsername || "bot"} removed successfully.`);
          onRefresh();
        } else {
          showFeedback("error", "Failed to remove account.");
        }
      } else if (confirmModal.type === "bulk") {
        const tokensArray = Array.from(selectedTokens);
        const res = await fetch("/api/tokens/delete-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokens: tokensArray }),
        });
        const text = await res.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch {}
        if (res.ok && data.success) {
          showFeedback("success", `Successfully removed ${data.count || tokensArray.length} selected account(s).`);
          setSelectedTokens(new Set());
          onRefresh();
        } else {
          showFeedback("error", data.error || text || "Failed to remove selected accounts.");
        }
      } else if (confirmModal.type === "all") {
        const res = await fetch("/api/tokens/delete-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const text = await res.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch {}
        if (res.ok && data.success) {
          showFeedback("success", `All ${data.count || accounts.length} accounts have been removed from tokens.txt.`);
          setSelectedTokens(new Set());
          onRefresh();
        } else {
          showFeedback("error", data.error || text || "Failed to delete all accounts.");
        }
      }
    } catch (e: any) {
      showFeedback("error", `Delete failed: ${e.message}`);
    } finally {
      setIsDeleting(false);
      setConfirmModal(null);
    }
  };

  const handleConnect = async (token: string) => {
    try {
      await fetch(`/api/tokens/${encodeURIComponent(token)}/connect`, { method: "POST" });
      onRefresh();
    } catch (e: any) {
      showFeedback("error", e.message);
    }
  };

  const handleDisconnect = async (token: string) => {
    try {
      await fetch(`/api/tokens/${encodeURIComponent(token)}/disconnect`, { method: "POST" });
      onRefresh();
    } catch (e: any) {
      showFeedback("error", e.message);
    }
  };

  const handleIndividualJoin = async (token: string) => {
    const input = accountInputs[token] || {};
    const targetGuild = input.guildId || "";
    const targetChannel = input.channelId || "";
    if (!targetGuild.trim() || !targetChannel.trim()) {
      showFeedback("error", "Please enter both Server ID and Channel ID for this account.");
      return;
    }
    try {
      await fetch(`/api/tokens/${encodeURIComponent(token)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: targetGuild.trim(), channelId: targetChannel.trim() }),
      });
      showFeedback("info", `Dispatched voice join for channel ${targetChannel}`);
      onRefresh();
    } catch (e: any) {
      showFeedback("error", e.message);
    }
  };

  const handleIndividualLeave = async (token: string) => {
    try {
      await fetch(`/api/tokens/${encodeURIComponent(token)}/leave`, { method: "POST" });
      onRefresh();
    } catch (e: any) {
      showFeedback("error", e.message);
    }
  };

  const handleToggleVoiceState = async (
    token: string,
    updates: { mute?: boolean; deaf?: boolean; video?: boolean; stream?: boolean }
  ) => {
    try {
      await fetch(`/api/tokens/${encodeURIComponent(token)}/voice-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      onRefresh();
    } catch (e: any) {
      showFeedback("error", e.message);
    }
  };

  const handleExportTokens = () => {
    window.open("/api/tokens/export", "_blank");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Feedback Toast / Status Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-colors shadow-sm ${
            feedback.type === "success"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : feedback.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
              : "bg-orange-500/10 border-orange-500/30 text-orange-400"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="opacity-70 hover:opacity-100 p-1 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="search-accounts-input"
              type="text"
              placeholder="Search by username, token, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-9 pr-3.5 py-2 rounded-lg text-xs outline-none border w-64 md:w-80 transition-colors ${
                isDark
                  ? "bg-[#0a0a0a] border-[#222] text-white focus:border-blue-500"
                  : "bg-white border-neutral-300 text-neutral-900 focus:border-blue-500 shadow-sm"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh accounts"
            className={`p-2 rounded-lg border text-neutral-400 hover:text-white transition-colors ${
              isDark ? "bg-[#0a0a0a] border-[#222] hover:bg-[#151515]" : "bg-white border-neutral-300 shadow-sm"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export tokens.txt */}
          <button
            type="button"
            id="btn-export-tokens"
            onClick={handleExportTokens}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              isDark
                ? "bg-[#111111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222]"
                : "bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-300 shadow-sm"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export tokens.txt</span>
          </button>

          {/* Add Account Modal Button */}
          <button
            type="button"
            id="btn-open-add-modal"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white transition-all duration-150 shadow-sm shadow-orange-500/20 active:scale-95 hover:-translate-y-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Tokens</span>
          </button>
        </div>
      </div>

      {/* Multi-Select & Batch Deletion Action Toolbar */}
      {accounts.length > 0 && (
        <div
          className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-colors ${
            isDark ? "bg-[#080808] border-[#1c1c1c]" : "bg-neutral-50 border-neutral-200"
          }`}
        >
          {/* Left: Selection control */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="btn-select-all"
              onClick={handleToggleSelectAll}
              className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded transition-colors ${
                isDark ? "hover:bg-[#161616] text-neutral-300" : "hover:bg-neutral-200 text-neutral-700"
              }`}
            >
              {isAllFilteredSelected ? (
                <CheckSquare className="w-4 h-4 text-orange-500" />
              ) : (
                <Square className="w-4 h-4 text-neutral-500" />
              )}
              <span>
                Select All ({filteredAccounts.length})
              </span>
            </button>

            {selectedTokens.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-semibold">
                  {selectedTokens.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-[11px] text-neutral-400 hover:text-white underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Right: Deletion Actions */}
          <div className="flex items-center gap-2">
            {/* Delete Selected Button */}
            {selectedTokens.size > 0 && (
              <button
                type="button"
                id="btn-delete-selected"
                onClick={openBulkDeleteModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-sm shadow-rose-600/20 active:scale-95 animate-fadeIn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedTokens.size})</span>
              </button>
            )}

            {/* Delete All Accounts Button */}
            <button
              type="button"
              id="btn-delete-all"
              onClick={openDeleteAllModal}
              title="Disconnect and remove all accounts from tokens.txt"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isDark
                  ? "bg-rose-950/20 hover:bg-rose-900/30 text-rose-400 border-rose-500/30 hover:border-rose-500/60"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All Accounts</span>
            </button>
          </div>
        </div>
      )}

      {/* Accounts List / Cards */}
      {filteredAccounts.length === 0 ? (
        <div
          className={`p-12 text-center rounded-2xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h4 className={`text-base font-semibold mb-1 ${isDark ? "text-white" : "text-neutral-900"}`}>
            {accounts.length === 0 ? "No Discord Accounts Registered" : "No matching accounts"}
          </h4>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto mb-4">
            {accounts.length === 0
              ? "Add your Discord user tokens to tokens.txt or paste them here to start managing voice presence 24/7."
              : "Try adjusting your search query."}
          </p>
          {accounts.length === 0 && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20"
            >
              Add Your First Token
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAccounts.map((account) => {
            const isRevealed = revealedTokens.has(account.token);
            const isInVoice = account.channelId && account.status === "In Voice";
            const isSelected = selectedTokens.has(account.token);
            const inputs = accountInputs[account.token] || {
              guildId: account.guildId || "",
              channelId: account.channelId || "",
            };

            return (
              <div
                key={account.token}
                className={`p-4 rounded-xl border transition-all ${
                  isSelected
                    ? isDark
                      ? "bg-[#180e08] border-orange-500/50 shadow-sm"
                      : "bg-orange-50/70 border-orange-400 shadow-sm"
                    : isDark
                    ? "bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#262626]"
                    : "bg-white border-neutral-200 shadow-sm"
                }`}
              >
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  {/* Account Identity & Checkbox */}
                  <div className="flex items-center gap-3 min-w-[260px]">
                    {/* Multi-select checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleSelectToken(account.token)}
                      title={isSelected ? "Deselect account" : "Select account"}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-all duration-150 shrink-0 ${
                        isSelected
                          ? "bg-orange-500 text-white shadow-xs"
                          : isDark
                          ? "border border-neutral-700 hover:border-orange-500/50 bg-[#141414]"
                          : "border border-neutral-300 hover:border-orange-400 bg-neutral-50"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    <div className="relative">
                      {account.avatar ? (
                        <img
                          src={account.avatar}
                          alt={account.username}
                          className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-400 font-bold flex items-center justify-center text-sm border border-orange-500/30">
                          {account.username.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${
                          isDark ? "border-[#0a0a0a]" : "border-white"
                        } ${
                          isInVoice
                            ? "bg-orange-500 animate-pulse"
                            : account.status === "Connected"
                            ? "bg-amber-500"
                            : account.status === "Connecting"
                            ? "bg-yellow-500"
                            : "bg-neutral-500"
                        }`}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
                          @{account.username}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                            isInVoice
                              ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
                              : account.status === "Connected"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                              : account.status === "Connecting"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {isInVoice ? "In Voice Channel" : account.status}
                        </span>
                      </div>
                      {/* Token Preview */}
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
                        <span className="font-mono text-[11px]">
                          {isRevealed ? account.token : account.tokenPreview}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleRevealToken(account.token)}
                          title={isRevealed ? "Hide token" : "Reveal token"}
                          className="hover:text-neutral-300 p-0.5"
                        >
                          {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(account.token)}
                          title="Copy token"
                          className="hover:text-neutral-300 p-0.5"
                        >
                          {copiedToken === account.token ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Channel Assignment Controls (Per-Token Channel Config) */}
                  <div className="flex items-center gap-2 text-xs w-full lg:w-auto">
                    <input
                      type="text"
                      placeholder="Server ID"
                      value={inputs.guildId}
                      onChange={(e) =>
                        setAccountInputs((prev) => ({
                          ...prev,
                          [account.token]: { ...inputs, guildId: e.target.value },
                        }))
                      }
                      className={`w-32 sm:w-36 px-2.5 py-1.5 rounded-lg font-mono text-[11px] border outline-none ${
                        isDark ? "bg-[#050505] border-[#222] text-white" : "bg-neutral-50 border-neutral-300"
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Channel ID"
                      value={inputs.channelId}
                      onChange={(e) =>
                        setAccountInputs((prev) => ({
                          ...prev,
                          [account.token]: { ...inputs, channelId: e.target.value },
                        }))
                      }
                      className={`w-32 sm:w-36 px-2.5 py-1.5 rounded-lg font-mono text-[11px] border outline-none ${
                        isDark ? "bg-[#050505] border-[#222] text-white" : "bg-neutral-50 border-neutral-300"
                      }`}
                    />
                    {isInVoice ? (
                      <button
                        type="button"
                        onClick={() => handleIndividualLeave(account.token)}
                        title="Leave voice channel"
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Leave</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleIndividualJoin(account.token)}
                        title="Join voice channel"
                        className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-semibold text-[11px] flex items-center gap-1 transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Join</span>
                      </button>
                    )}
                  </div>

                  {/* Voice State Toggles & Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Mute */}
                    <button
                      type="button"
                      onClick={() => handleToggleVoiceState(account.token, { mute: !account.selfMute })}
                      title={account.selfMute ? "Unmute" : "Mute"}
                      className={`p-2 rounded-lg border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                        account.selfMute
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          : isDark
                          ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 border-[#222] hover:border-amber-500/40"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300 hover:border-amber-400"
                      }`}
                    >
                      {account.selfMute ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>

                    {/* Deafen */}
                    <button
                      type="button"
                      onClick={() => handleToggleVoiceState(account.token, { deaf: !account.selfDeaf })}
                      title={account.selfDeaf ? "Undeafen" : "Deafen"}
                      className={`p-2 rounded-lg border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                        account.selfDeaf
                          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                          : isDark
                          ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 border-[#222] hover:border-yellow-500/40"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300 hover:border-yellow-400"
                      }`}
                    >
                      {account.selfDeaf ? <Headphones className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                    </button>

                    {/* Video */}
                    <button
                      type="button"
                      onClick={() => handleToggleVoiceState(account.token, { video: !account.selfVideo })}
                      title={account.selfVideo ? "Disable Camera" : "Enable Camera"}
                      className={`p-2 rounded-lg border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                        account.selfVideo
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                          : isDark
                          ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 border-[#222] hover:border-orange-500/40"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300 hover:border-orange-400"
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>

                    {/* Stream */}
                    <button
                      type="button"
                      onClick={() => handleToggleVoiceState(account.token, { stream: !account.selfStream })}
                      title={account.selfStream ? "Stop Screen Share" : "Start Screen Share"}
                      className={`p-2 rounded-lg border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                        account.selfStream
                          ? "bg-red-500/20 text-red-400 border-red-500/40"
                          : isDark
                          ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 border-[#222] hover:border-red-500/40"
                          : "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 border-neutral-300 hover:border-red-400"
                      }`}
                    >
                      <Tv className="w-3.5 h-3.5" />
                    </button>

                    {/* Gateway Connect / Disconnect */}
                    {account.status === "Disconnected" ? (
                      <button
                        type="button"
                        onClick={() => handleConnect(account.token)}
                        title="Connect to Gateway"
                        className="p-2 rounded-lg bg-orange-600/15 hover:bg-orange-600/25 text-orange-400 border border-orange-500/30 transition-all duration-150 active:scale-95 hover:-translate-y-0.5"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDisconnect(account.token)}
                        title="Disconnect from Gateway"
                        className="p-2 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-400 border border-red-500/30 transition-all duration-150 active:scale-95 hover:-translate-y-0.5"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Delete Single Account Button */}
                    <button
                      type="button"
                      onClick={() => openSingleDeleteModal(account.token, account.username)}
                      title="Remove token from manager and tokens.txt"
                      className="p-2 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Single / Bulk / All Deletion */}
      {confirmModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-colors ${
              isDark ? "bg-[#0c0c0c] border-[#222] text-white" : "bg-white border-neutral-200 text-neutral-900"
            }`}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-500">
                  {confirmModal.type === "single" && "Remove Account"}
                  {confirmModal.type === "bulk" && `Delete ${confirmModal.count} Accounts`}
                  {confirmModal.type === "all" && "Delete All Discord Accounts"}
                </h3>
                <p className="text-xs text-neutral-400">
                  {confirmModal.type === "single" && "This account will be disconnected from voice and removed from tokens.txt."}
                  {confirmModal.type === "bulk" && `All ${confirmModal.count} selected accounts will be disconnected and removed.`}
                  {confirmModal.type === "all" && "This will remove all accounts from tokens.txt and disconnect all voice sessions."}
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-lg border text-xs font-mono mb-5 ${
                isDark ? "bg-[#141414] border-[#222] text-neutral-300" : "bg-neutral-50 border-neutral-200 text-neutral-700"
              }`}
            >
              {confirmModal.type === "single" && (
                <div>
                  Target Account: <span className="font-bold text-white">@{confirmModal.targetUsername}</span>
                </div>
              )}
              {confirmModal.type === "bulk" && (
                <div>
                  Selected Count:{" "}
                  <span className="font-bold text-rose-400">{confirmModal.count} accounts</span> marked for permanent deletion.
                </div>
              )}
              {confirmModal.type === "all" && (
                <div className="text-rose-400 font-semibold">
                  ⚠️ Action cannot be undone. All {accounts.length} accounts will be deleted.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmModal(null)}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  isDark
                    ? "bg-[#181818] hover:bg-[#222] text-neutral-300 border-[#2a2a2a]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border-neutral-300"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-execute-delete"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors shadow-sm shadow-rose-600/30 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? "Deleting..." : "Confirm & Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tokens Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div
            className={`w-full max-w-lg p-6 rounded-2xl border shadow-2xl transition-colors ${
              isDark ? "bg-[#0a0a0a] border-[#222] text-white" : "bg-white border-neutral-200 text-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Add Discord Tokens</h3>
                  <p className="text-xs text-neutral-500">Paste single token or multiple tokens (one per line)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-neutral-500 hover:text-neutral-300 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-400 mb-2">
              Tokens are automatically validated, stored in <code className="text-amber-400 font-mono">tokens.txt</code>
              , and connected to the Discord Gateway v10.
            </p>

            <textarea
              id="textarea-tokens-input"
              rows={8}
              placeholder="Paste tokens here...&#10;OTM4NzM5...&#10;MTI5NDgz..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className={`w-full p-3 rounded-xl font-mono text-xs outline-none border mb-4 transition-all duration-150 ${
                isDark
                  ? "bg-[#050505] border-[#222] text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
                  : "bg-neutral-50 border-neutral-300 text-neutral-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              }`}
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
                  isDark
                    ? "bg-[#111] hover:bg-[#1a1a1a] text-neutral-300 border-[#222]"
                    : "bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-submit-add-tokens"
                onClick={handleAddTokens}
                disabled={isSubmittingTokens || !tokenInput.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmittingTokens ? "Adding..." : "Add to tokens.txt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
