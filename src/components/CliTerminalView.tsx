import React, { useState, useRef, useEffect } from "react";
import { Terminal, Send, Trash2, Play, Sparkles } from "lucide-react";
import { AppTheme, BotAccount } from "../types";

interface CliTerminalViewProps {
  theme: AppTheme;
  accounts: BotAccount[];
  onRefresh: () => void;
}

interface TerminalLine {
  id: string;
  type: "input" | "output" | "system" | "success" | "error" | "banner";
  text: string;
}

const ASCII_BANNER = `
  ___ ___ ___  ___ ___  ___ ___   __   _____ ___ ___ ___      _  ___ ___ _  _ ___ ___ 
 |   \\ _/ __|/ __/ _ \\| _ \\   \\  \\ \\ / / _ \\_ _/ __| __|  _ | |/ _ \\_ _| \\| | __| _ \\
 | |) | |\\__ \\ (_| (_) |   / |) |  \\ V / (_) | | (__| _|  | || | (_) | || .\` | _||   /
 |___/___|___/\\___\\___/|_|_\\___/    \\_/ \\___/___\\___|___|  \\__/ \\___/___|_|\\_|___|_|_\\
                         (github.com/parth-tongse/voice-joiner-v1)
                         [September 2026 Build 568820 • DAVE v1.1 E2EE Protocol]
`;

export const CliTerminalView: React.FC<CliTerminalViewProps> = ({ theme, accounts, onRefresh }) => {
  const isDark = theme === "dark";
  const [inputVal, setInputVal] = useState("");
  const [history, setHistory] = useState<TerminalLine[]>([
    { id: "banner-1", type: "banner", text: ASCII_BANNER },
    {
      id: "sys-1",
      type: "system",
      text: "  Discord Voice Joiner v1 CLI Terminal Initialized. Type 'help' for command list or 'wizard' for guided setup.",
    },
  ]);

  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [wizardData, setWizardData] = useState<{
    sameChannel?: boolean;
    serverId?: string;
    channelId?: string;
    randomEvent?: boolean;
    mute?: boolean;
    deaf?: boolean;
    stream?: boolean;
    video?: boolean;
  }>({});

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [history]);

  const addLine = (text: string, type: TerminalLine["type"] = "output") => {
    setHistory((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, text, type }]);
  };

  const handleCommand = async (cmdStr: string) => {
    const raw = cmdStr.trim();
    if (!raw) return;

    addLine(`> ${raw}`, "input");
    setInputVal("");

    // If wizard is active
    if (wizardStep !== null) {
      handleWizardInput(raw);
      return;
    }

    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case "help":
        addLine("Available CLI Commands:");
        addLine("  join <serverId> <channelId>  - Connect all registered accounts to a voice channel");
        addLine("  stop                         - Disconnect all accounts from voice channel");
        addLine("  exit                         - Alias for stop; kicks all tokens and standby");
        addLine("  wizard                       - Launch the interactive configuration wizard");
        addLine("  mute [on/off]                - Bulk toggle mute for all tokens");
        addLine("  deaf [on/off]                - Bulk toggle deafen for all tokens");
        addLine("  video [on/off]               - Bulk toggle video camera for all tokens");
        addLine("  stream [on/off]              - Bulk toggle screen share for all tokens");
        addLine("  random                       - Trigger Random Event Engine (mimic human voice events)");
        addLine("  clear-events                 - Reset all random events to default");
        addLine("  e2ee                         - Synchronize and verify DAVE v1.1 E2EE protocol");
        addLine("  status                       - Display summary of accounts and gateway sessions");
        addLine("  clear                        - Clear terminal screen");
        break;

      case "e2ee":
      case "upgrade-e2ee":
        addLine("[+] Triggering DAVE v1.1 E2EE Protocol re-synchronization...", "system");
        try {
          const res = await fetch("/api/e2ee/upgrade", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            addLine(`[✓] ${data.message}`, "success");
            addLine(`[i] Protocol: DAVE v${data.daveProtocolVersion} | Build: ${data.clientBuildNumber} (v${data.clientVersion})`, "system");
          } else {
            addLine(`[!] ${data.error || "Failed"}`, "error");
          }
        } catch (err: any) {
          addLine(`[!] ${err.message}`, "error");
        }
        break;

      case "clear":
      case "cls":
        setHistory([]);
        break;

      case "status":
        const inVoice = accounts.filter((a) => a.channelId && a.status === "In Voice").length;
        addLine(`Total Registered Tokens: ${accounts.length}`);
        addLine(`Active in Voice Channel: ${inVoice}`);
        addLine(`Connected to Gateway:    ${accounts.filter((a) => a.status === "Connected").length}`);
        addLine(`Muted: ${accounts.filter((a) => a.selfMute).length} | Deafened: ${accounts.filter((a) => a.selfDeaf).length}`);
        addLine(`Video: ${accounts.filter((a) => a.selfVideo).length} | Streaming: ${accounts.filter((a) => a.selfStream).length}`);
        break;

      case "wizard":
        setWizardStep(1);
        setWizardData({});
        addLine("\n[WIZARD] Launching interactive setup...");
        addLine("> Will all tokens join the same server and channel? (y/n):", "system");
        break;

      case "join":
        if (args.length < 2) {
          addLine("Error: Usage: join <serverId> <channelId>", "error");
          return;
        }
        addLine(`[+] Joining ${accounts.length} accounts to Server: ${args[0]} | Channel: ${args[1]}...`, "system");
        try {
          const res = await fetch("/api/actions/join-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guildId: args[0], channelId: args[1] }),
          });
          const data = await res.json();
          addLine(`[✓] ${data.message}`, "success");
          onRefresh();
        } catch {
          addLine("[!] Failed to dispatch join request.", "error");
        }
        break;

      case "stop":
      case "exit":
        addLine("[+] Kicking tokens from voice channels...", "system");
        try {
          await fetch("/api/actions/stop-all", { method: "POST" });
          addLine("[✓] All tokens successfully left voice channels.", "success");
          onRefresh();
        } catch {
          addLine("[!] Failed to stop tokens.", "error");
        }
        break;

      case "mute":
        const mVal = args[0] ? args[0].toLowerCase() === "on" : true;
        await fetch("/api/actions/bulk-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute: mVal }),
        });
        addLine(`[✓] Mute set to ${mVal ? "ON" : "OFF"} for all tokens.`, "success");
        onRefresh();
        break;

      case "deaf":
        const dVal = args[0] ? args[0].toLowerCase() === "on" : true;
        await fetch("/api/actions/bulk-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deaf: dVal }),
        });
        addLine(`[✓] Deafen set to ${dVal ? "ON" : "OFF"} for all tokens.`, "success");
        onRefresh();
        break;

      case "video":
        const vVal = args[0] ? args[0].toLowerCase() === "on" : true;
        await fetch("/api/actions/bulk-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video: vVal }),
        });
        addLine(`[✓] Video Camera set to ${vVal ? "ON" : "OFF"} for all tokens.`, "success");
        onRefresh();
        break;

      case "stream":
        const sVal = args[0] ? args[0].toLowerCase() === "on" : true;
        await fetch("/api/actions/bulk-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream: sVal }),
        });
        addLine(`[✓] Stream Screen Share set to ${sVal ? "ON" : "OFF"} for all tokens.`, "success");
        onRefresh();
        break;

      case "random":
        await fetch("/api/actions/random-event", { method: "POST" });
        addLine("[✓] Random Event Engine triggered! States distributed across tokens.", "success");
        onRefresh();
        break;

      case "clear-events":
        await fetch("/api/actions/clear-events", { method: "POST" });
        addLine("[✓] All events cleared. Default voice state restored.", "success");
        onRefresh();
        break;

      default:
        addLine(`Unknown command: '${cmd}'. Type 'help' to see valid commands.`, "error");
        break;
    }
  };

  const handleWizardInput = async (raw: string) => {
    const val = raw.toLowerCase().trim();

    if (wizardStep === 1) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, sameChannel: val === "y" }));
      setWizardStep(2);
      addLine("> Server ID: ", "system");
    } else if (wizardStep === 2) {
      if (!/^\d+$/.test(raw)) {
        addLine("Server ID must contain numeric digits. Try again:", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, serverId: raw }));
      setWizardStep(3);
      addLine("> Channel ID: ", "system");
    } else if (wizardStep === 3) {
      if (!/^\d+$/.test(raw)) {
        addLine("Channel ID must contain numeric digits. Try again:", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, channelId: raw }));
      setWizardStep(4);
      addLine("> Random Event (Manual selection will be disabled) (y/n): ", "system");
    } else if (wizardStep === 4) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      const isRandom = val === "y";
      setWizardData((prev) => ({ ...prev, randomEvent: isRandom }));
      if (isRandom) {
        // Execute wizard finish
        finishWizard({ ...wizardData, randomEvent: true });
      } else {
        setWizardStep(5);
        addLine("> Deafen: (y/n) ", "system");
      }
    } else if (wizardStep === 5) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, deaf: val === "y" }));
      setWizardStep(6);
      addLine("> Mute: (y/n) ", "system");
    } else if (wizardStep === 6) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, mute: val === "y" }));
      setWizardStep(7);
      addLine("> Stream: (y/n) ", "system");
    } else if (wizardStep === 7) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      setWizardData((prev) => ({ ...prev, stream: val === "y" }));
      setWizardStep(8);
      addLine("> Video: (y/n) ", "system");
    } else if (wizardStep === 8) {
      if (val !== "y" && val !== "n") {
        addLine("Please enter 'y' or 'n':", "error");
        return;
      }
      finishWizard({ ...wizardData, video: val === "y" });
    }
  };

  const finishWizard = async (finalData: any) => {
    setWizardStep(null);
    addLine("\n[WIZARD] Applying configuration...", "system");

    if (finalData.serverId && finalData.channelId) {
      await fetch("/api/actions/join-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: finalData.serverId, channelId: finalData.channelId }),
      });
      addLine(`[+] Join dispatched to ${finalData.serverId} / ${finalData.channelId}`, "success");
    }

    if (finalData.randomEvent) {
      await fetch("/api/actions/random-event", { method: "POST" });
      addLine("[+] Random Event distribution applied to all connected tokens.", "success");
    } else {
      if (finalData.mute !== undefined || finalData.deaf !== undefined) {
        await fetch("/api/actions/bulk-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mute: finalData.mute, deaf: finalData.deaf }),
        });
      }
      if (finalData.video !== undefined) {
        await fetch("/api/actions/bulk-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video: finalData.video }),
        });
      }
      if (finalData.stream !== undefined) {
        await fetch("/api/actions/bulk-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream: finalData.stream }),
        });
      }
      addLine("[+] Custom audio/video/stream states dispatched.", "success");
    }

    addLine("[!] All accounts connected. Type 'exit' to kick tokens.", "success");
    onRefresh();
  };

  return (
    <div className="space-y-4 pb-12">
      {/* CLI Header card */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              Interactive CLI Terminal
            </h3>
            <p className="text-xs text-neutral-500">Recreating the Python VDS/VPS command line mode from cli/main.py</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCommand("wizard")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch Wizard</span>
          </button>
          <button
            onClick={() => setHistory([])}
            className={`p-2 rounded-lg border text-neutral-400 hover:text-white transition-all duration-150 active:scale-95 hover:-translate-y-0.5 ${
              isDark ? "bg-[#111] border-[#222] hover:border-red-500/40 hover:text-red-400" : "bg-neutral-100 border-neutral-300 hover:border-red-400 hover:text-red-600"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div
        onClick={() => inputRef.current?.focus()}
        className="rounded-2xl border border-neutral-800 bg-[#000000] text-neutral-200 shadow-2xl p-4 sm:p-6 font-mono text-xs overflow-hidden flex flex-col h-[520px]"
      >
        {/* Top Terminal Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800/80 select-none">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-[11px] text-neutral-500 font-sans">bash — discord-voice-joiner (cli mode)</span>
          </div>
          <span className="text-[11px] text-neutral-600 font-mono">24/7 Engine active</span>
        </div>

        {/* Scrollable output area */}
        <div
          ref={terminalContainerRef}
          className="flex-1 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin scrollbar-thumb-neutral-800"
        >
          {history.map((line) => {
            if (line.type === "banner") {
              return (
                <pre key={line.id} className="text-cyan-400 font-bold text-[10px] sm:text-xs leading-tight select-none">
                  {line.text}
                </pre>
              );
            }
            if (line.type === "input") {
              return (
                <div key={line.id} className="text-white font-semibold">
                  {line.text}
                </div>
              );
            }
            if (line.type === "success") {
              return (
                <div key={line.id} className="text-emerald-400">
                  {line.text}
                </div>
              );
            }
            if (line.type === "error") {
              return (
                <div key={line.id} className="text-rose-400">
                  {line.text}
                </div>
              );
            }
            if (line.type === "system") {
              return (
                <div key={line.id} className="text-amber-300">
                  {line.text}
                </div>
              );
            }
            return (
              <div key={line.id} className="text-neutral-300">
                {line.text}
              </div>
            );
          })}
        </div>

        {/* Input line */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCommand(inputVal);
          }}
          className="pt-3 border-t border-neutral-800/80 flex items-center gap-2"
        >
          <span className="text-emerald-400 font-bold select-none">{">"}</span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={
              wizardStep !== null ? "Enter response..." : "Type command (e.g. 'join <serverId> <channelId>', 'wizard', 'help')..."
            }
            className="flex-1 bg-transparent text-white outline-none border-none font-mono text-xs placeholder:text-neutral-600"
          />
          <button type="submit" className="p-1.5 rounded text-neutral-400 hover:text-white transition-colors">
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
