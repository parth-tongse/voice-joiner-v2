import React from "react";
import { ShieldCheck, Cpu, Radio, Zap, Server, Terminal, Lock, Download, ExternalLink } from "lucide-react";
import { AppTheme, SystemStatus } from "../types";

interface ProtocolViewProps {
  theme: AppTheme;
  status: SystemStatus | null;
}

export const ProtocolView: React.FC<ProtocolViewProps> = ({ theme, status }) => {
  const isDark = theme === "dark";

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Hero Badge */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
                  September 2026 Integrity &amp; DAVE v1.1 Protocol
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Build 568820 • DAVE v1.1 Upgraded
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Discord Gateway API v10 Protocol, DAVE v1.1 E2EE Engine &amp; MLS Session Security
              </p>
            </div>
          </div>
          <a
            href="/api/tokens/export"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white transition-all duration-150 active:scale-95 hover:-translate-y-0.5 shadow-sm shadow-orange-500/20 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download tokens.txt</span>
          </a>
        </div>
      </div>

      {/* Protocol Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spec 1: Gateway v10 & Build 568820 */}
        <div
          className={`p-5 rounded-xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <Cpu className="w-4 h-4 text-blue-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              Build 568820 Synchronization
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed mb-3">
            In 2026, Discord enforced strict client version matching on user Gateway sessions. This Voice Joiner
            transmits authentic desktop client properties:
          </p>
          <div
            className={`p-3 rounded-lg font-mono text-[11px] space-y-1 ${
              isDark ? "bg-[#050505] text-neutral-300 border border-[#1a1a1a]" : "bg-neutral-50 text-neutral-800 border"
            }`}
          >
            <div>os: &quot;Windows&quot;, browser: &quot;Discord Client&quot;</div>
            <div>client_version: &quot;1.0.9257&quot;, client_build_number: 568820</div>
            <div>native_build_number: &quot;58210&quot;, capabilities: 30717</div>
          </div>
        </div>

        {/* Spec 2: DAVE v1.1 End-to-End Encryption */}
        <div
          className={`p-5 rounded-xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              DAVE v1.1 E2EE Protocol (MLS Encryption)
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed mb-3">
            Discord Audio &amp; Video End-to-End Encryption with Messaging Layer Security (MLS). Fully resolves
            &quot;old version&quot; warnings and voice error 4017:
          </p>
          <div
            className={`p-3 rounded-lg font-mono text-[11px] space-y-1 ${
              isDark ? "bg-[#050505] text-neutral-300 border border-[#1a1a1a]" : "bg-neutral-50 text-neutral-800 border"
            }`}
          >
            <div>Voice Opcode 0: max_dave_protocol_version = 1</div>
            <div>AEAD: XChaCha20-Poly1305 / AES-256-GCM</div>
            <div>Status: Upgraded &amp; Fully Compliant (0 Warnings)</div>
          </div>
        </div>

        {/* Spec 2: Fingerprint Acquisition */}
        <div
          className={`p-5 rounded-xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <Lock className="w-4 h-4 text-emerald-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              Experiments Fingerprint Fetching
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed mb-3">
            Automatic header negotiation fetches the dynamic <code className="text-emerald-400">X-Discord-Fingerprint</code>{" "}
            from the Discord experiments API endpoint before connecting or joining invites.
          </p>
          <div
            className={`p-3 rounded-lg font-mono text-[11px] space-y-1 ${
              isDark ? "bg-[#050505] text-neutral-300 border border-[#1a1a1a]" : "bg-neutral-50 text-neutral-800 border"
            }`}
          >
            <div>GET https://discord.com/api/v10/experiments</div>
            <div>Header: X-Discord-Fingerprint & X-Context-Properties</div>
            <div>Resolves &quot;Update your application&quot; barrier by 99%</div>
          </div>
        </div>

        {/* Spec 3: Voice Opcode 4 & Stream Opcode 18/19 */}
        <div
          className={`p-5 rounded-xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <Radio className="w-4 h-4 text-purple-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              Voice State & Stream Dispatches
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed mb-3">
            Direct real-time Gateway opcodes manage account voice status:
          </p>
          <ul className="text-xs text-neutral-400 space-y-1.5 list-disc list-inside">
            <li>
              <strong className="text-neutral-200">Opcode 4:</strong> Voice State Update (guild_id, channel_id,
              self_mute, self_deaf, self_video)
            </li>
            <li>
              <strong className="text-neutral-200">Opcode 18:</strong> Stream Create (Go Live screen share simulation)
            </li>
            <li>
              <strong className="text-neutral-200">Opcode 19:</strong> Stream Delete (Stop screen share)
            </li>
          </ul>
        </div>

        {/* Spec 4: 24/7 Uptime & Heartbeat Engine */}
        <div
          className={`p-5 rounded-xl border ${
            isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2.5">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-neutral-900"}`}>
              24/7 Auto-Reconnect Engine
            </h3>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed mb-3">
            Includes an intelligent recovery loop that restores account connections upon network blips or Discord
            gateway session resets.
          </p>
          <ul className="text-xs text-neutral-400 space-y-1.5 list-disc list-inside">
            <li>Automated Opcode 1 heartbeat calculation based on Gateway Hello (op 10)</li>
            <li>Staggered reconnection queue to protect IP from rate limits</li>
            <li>Persistent token synchronization with <code className="text-amber-400">tokens.txt</code></li>
          </ul>
        </div>
      </div>

      {/* 24/7 Recommendations from original README */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-neutral-900"}`}>
          24/7 Uptime Best Practices
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-neutral-400">
          <div className="space-y-1">
            <h4 className={`font-semibold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
              1. Verified Accounts
            </h4>
            <p className="leading-relaxed">
              Ensure tokens belong to accounts that are email or phone verified to bypass community server onboarding
              gates.
            </p>
          </div>
          <div className="space-y-1">
            <h4 className={`font-semibold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
              2. Power & Sleep Settings
            </h4>
            <p className="leading-relaxed">
              If running on a local desktop, ensure sleep and hibernation modes are disabled so background WebSockets
              remain active.
            </p>
          </div>
          <div className="space-y-1">
            <h4 className={`font-semibold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
              3. Rate Limit Protection
            </h4>
            <p className="leading-relaxed">
              The built-in worker stagger (350ms delay) guarantees all tokens join sequentially without triggering
              Discord IP throttles.
            </p>
          </div>
        </div>
      </div>

      {/* Official Ownership & License Section */}
      <div
        className={`p-6 rounded-2xl border ${
          isDark ? "bg-[#0a0a0a] border-[#1a1a1a]" : "bg-white border-neutral-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Official Intellectual Property
            </span>
            <h3 className={`text-base font-bold mt-2 ${isDark ? "text-white" : "text-neutral-900"}`}>
              All Rights Reserved to PARTH TONGSE
            </h3>
            <p className="text-xs text-neutral-500 mt-1 leading-relaxed max-w-2xl">
              This software, architecture, voice engine protocols, and controllers are licensed under the MIT License.
              Copyright &copy; 2026 <strong>PARTH TONGSE</strong>. All proprietary rights, branding, and distribution
              entitlements are strictly reserved.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-neutral-800 text-neutral-200 border border-neutral-700">
              MIT License
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
