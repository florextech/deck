"use client";

import { useEffect, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Settings, Zap, Globe, Clipboard, Terminal, Plus, X, AppWindow, ChevronLeft } from "lucide-react";
import type { ServerToClientEvents, ClientToServerEvents, DeckAction, DeckNotification } from "@open-deck/shared";

type DeckSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

type View = "deck" | "config" | "add" | "add-apps" | "add-form";
interface DetectedApp { name: string; icon: string; command: string }

export default function DeckPage() {
  const [socket, setSocket] = useState<DeckSocket | null>(null);
  const [actions, setActions] = useState<DeckAction[]>([]);
  const [notifications, setNotifications] = useState<DeckNotification[]>([]);
  const [apps, setApps] = useState<DetectedApp[]>([]);
  const [view, setView] = useState<View>("deck");
  const [formType, setFormType] = useState<"url" | "copy" | "command">("url");

  useEffect(() => {
    const s: DeckSocket = io(SERVER, { transports: ["websocket"] });
    setSocket(s);
    s.on("config:actions", setActions);
    s.on("notification:new", (n) => setNotifications((p) => [n, ...p].slice(0, 30)));
    fetch(`${SERVER}/apps`).then((r) => r.json()).then((d: { apps: DetectedApp[] }) => setApps(d.apps)).catch(() => {});
    return () => { s.disconnect(); };
  }, []);

  const execute = useCallback((action: DeckAction) => { socket?.emit("action:execute", action.id); }, [socket]);

  const save = useCallback(async (updated: DeckAction[]) => {
    await fetch(`${SERVER}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actions: updated }) });
  }, []);

  function addAction(a: DeckAction) { save([...actions, a]); setView("deck"); }
  function removeAction(id: string) { save(actions.filter((x) => x.id !== id)); }

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)]">
      {/* ─── LCD Notification Strip ─── */}
      <div className="mx-3 mt-3 flex h-9 items-center gap-2 overflow-hidden rounded-lg bg-[#111114] px-3 font-mono text-xs">
        <div className="size-1.5 shrink-0 rounded-full bg-[var(--green)] animate-pulse" />
        <AnimatePresence mode="wait">
          {notifications[0] ? (
            <motion.span key={notifications[0].id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex-1 truncate text-[var(--green)]">
              {notifications[0].title}
            </motion.span>
          ) : (
            <span className="flex-1 text-[var(--text-secondary)]">ready</span>
          )}
        </AnimatePresence>
        {notifications.length > 1 && (
          <span className="shrink-0 rounded bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">{notifications.length}</span>
        )}
      </div>

      {/* ─── Content ─── */}
      <main className="flex-1 overflow-y-auto p-3">
        {view === "deck" && <Grid actions={actions} onExecute={execute} />}
        {view === "config" && <ConfigList actions={actions} onRemove={removeAction} onAdd={() => setView("add")} />}
        {view === "add" && <AddMenu onApps={() => setView("add-apps")} onType={(t) => { setFormType(t); setView("add-form"); }} onBack={() => setView("config")} />}
        {view === "add-apps" && <AppPicker apps={apps} onPick={(a) => addAction(a)} onBack={() => setView("add")} />}
        {view === "add-form" && <AddForm type={formType} onSave={addAction} onBack={() => setView("add")} />}
      </main>

      {/* ─── Bottom Bar ─── */}
      <div className="flex shrink-0 border-t border-[var(--card-border)] bg-[var(--card)]">
        <BottomTab active={view === "deck"} onClick={() => setView("deck")} icon={<Zap size={20} />} label="Deck" />
        <BottomTab active={view !== "deck"} onClick={() => setView("config")} icon={<Settings size={20} />} label="Config" />
      </div>
    </div>
  );
}

/* ─── Grid ─── */
function Grid({ actions, onExecute }: { actions: DeckAction[]; onExecute: (a: DeckAction) => void }) {
  if (!actions.length) return <Empty />;
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
      {actions.map((a) => (
        <motion.button key={a.id} whileTap={{ scale: 0.9 }} onClick={() => onExecute(a)}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--card-border)] p-3 transition-all active:bg-[var(--card-hover)] active:border-[var(--card-border-hover)] touch-manipulation"
        >
          <ActionIcon type={a.type} />
          <span className="text-[11px] font-medium leading-tight text-center line-clamp-2 text-[var(--text)]">{a.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

/* ─── Config List ─── */
function ConfigList({ actions, onRemove, onAdd }: { actions: DeckAction[]; onRemove: (id: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-2">
      <button onClick={onAdd} className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--card-border)] bg-transparent py-4 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-dim)]">
        <Plus size={16} /> Add action
      </button>
      {actions.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--card-border)] px-4 py-3">
          <ActionIcon type={a.type} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-[var(--text)]">{a.label}</p>
            <p className="text-[11px] text-[var(--text-secondary)] truncate">{getPreview(a)}</p>
          </div>
          <button onClick={() => onRemove(a.id)} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--card-hover)] hover:text-[var(--red)]"><X size={14} /></button>
        </div>
      ))}
      {!actions.length && <Empty />}
    </div>
  );
}

/* ─── Add Menu ─── */
function AddMenu({ onApps, onType, onBack }: { onApps: () => void; onType: (t: "url" | "copy" | "command") => void; onBack: () => void }) {
  return (
    <div className="space-y-2">
      <BackBtn onClick={onBack} />
      <p className="text-sm text-[var(--text-secondary)] px-1">What should this button do?</p>
      <MenuItem icon={<AppWindow size={18} />} label="Open an app" desc="Pick from installed apps" onClick={onApps} />
      <MenuItem icon={<Globe size={18} />} label="Open a URL" desc="Website, link, etc." onClick={() => onType("url")} />
      <MenuItem icon={<Clipboard size={18} />} label="Copy text" desc="Copy to PC clipboard" onClick={() => onType("copy")} />
      <MenuItem icon={<Terminal size={18} />} label="Run a command" desc="Shell command on PC" onClick={() => onType("command")} />
    </div>
  );
}

/* ─── App Picker ─── */
function AppPicker({ apps, onPick, onBack }: { apps: DetectedApp[]; onPick: (a: DeckAction) => void; onBack: () => void }) {
  function pick(app: DetectedApp) {
    onPick({ id: crypto.randomUUID(), label: app.name, icon: app.icon, type: "command", payload: { type: "command", command: app.command } });
  }
  return (
    <div className="space-y-2">
      <BackBtn onClick={onBack} />
      {apps.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Desktop agent not connected.<br />Run <code className="text-[var(--accent)]">pnpm dev:agent</code> on your PC.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {apps.map((app) => (
          <button key={app.name} onClick={() => pick(app)} className="flex flex-col items-center gap-1.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--card-border)] p-3 transition-all active:bg-[var(--card-hover)] active:border-[var(--card-border-hover)] touch-manipulation">
            <AppWindow size={24} className="text-[var(--accent)]" />
            <span className="text-[10px] font-medium text-center leading-tight line-clamp-2 text-[var(--text)]">{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Add Form ─── */
function AddForm({ type, onSave, onBack }: { type: "url" | "copy" | "command"; onSave: (a: DeckAction) => void; onBack: () => void }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const placeholder = { url: "https://github.com", copy: "Text to copy...", command: "docker compose up -d" }[type];
  const fieldLabel = { url: "URL", copy: "Text", command: "Command" }[type];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = type === "url" ? { type: "url" as const, url: value } : type === "copy" ? { type: "copy" as const, text: value } : { type: "command" as const, command: value };
    onSave({ id: crypto.randomUUID(), label, type, payload });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <BackBtn onClick={onBack} />
      <div className="space-y-2 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--card-border)] p-4">
        <label className="block text-[11px] font-medium text-[var(--text-secondary)]">Button name</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="My action" className="w-full rounded-lg bg-[#111114] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)]" />
        <label className="block text-[11px] font-medium text-[var(--text-secondary)] pt-1">{fieldLabel}</label>
        <input value={value} onChange={(e) => setValue(e.target.value)} required placeholder={placeholder} className="w-full rounded-lg bg-[#111114] border border-[var(--card-border)] px-3 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-secondary)] focus:border-[var(--accent)]" />
      </div>
      <button type="submit" className="w-full rounded-[var(--radius)] bg-[var(--accent)] py-3 text-sm font-semibold text-[#0c0c0e] transition-opacity active:opacity-80">Add to deck</button>
    </form>
  );
}

/* ─── Shared ─── */
function ActionIcon({ type }: { type: string }) {
  const cls = "text-[var(--accent)]";
  if (type === "url") return <Globe size={22} className={cls} />;
  if (type === "copy") return <Clipboard size={22} className={cls} />;
  return <Terminal size={22} className={cls} />;
}

function MenuItem({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--card-border)] px-4 py-3.5 text-left transition-all active:bg-[var(--card-hover)] active:border-[var(--card-border-hover)] touch-manipulation">
      <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--accent-dim)] text-[var(--accent)]">{icon}</div>
      <div><p className="text-sm font-medium text-[var(--text)]">{label}</p><p className="text-[11px] text-[var(--text-secondary)]">{desc}</p></div>
    </button>
  );
}

function BottomTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 flex-col items-center gap-0.5 py-3 transition-colors ${active ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-1 text-sm text-[var(--text-secondary)] mb-2"><ChevronLeft size={16} /> Back</button>;
}

function Empty() {
  return <div className="flex h-full items-center justify-center"><p className="text-center text-sm text-[var(--text-secondary)]">No actions yet.<br />Tap <span className="text-[var(--accent)]">Config</span> to add.</p></div>;
}

function getPreview(a: DeckAction): string {
  switch (a.payload.type) {
    case "url": return a.payload.url;
    case "copy": return a.payload.text.slice(0, 40);
    case "command": return a.payload.command.slice(0, 40);
    default: return "";
  }
}
