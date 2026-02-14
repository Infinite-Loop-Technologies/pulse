import { HardDriveDownload, Keyboard, MoonStar, Settings2, ShieldCheck, Sun, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { type CommandDefinition, type ShortcutMap } from "@/lib/commands";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  shortcuts: ShortcutMap;
  commands: CommandDefinition[];
}

type PanelKey = "general" | "shortcuts";

const cardClass =
  "rounded-xl border border-border/80 bg-card/95 p-4 shadow-[0_14px_40px_-20px_rgba(7,10,20,0.85)]";

export function SettingsModal({
  open,
  onClose,
  isDarkMode,
  onToggleTheme,
  shortcuts,
  commands,
}: SettingsModalProps) {
  const [activePanel, setActivePanel] = useState<PanelKey>("general");

  const categorizedCommands = useMemo(() => {
    const grouped = new Map<string, CommandDefinition[]>();
    for (const command of commands) {
      const existing = grouped.get(command.category) ?? [];
      existing.push(command);
      grouped.set(command.category, existing);
    }
    return Array.from(grouped.entries());
  }, [commands]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(5,8,17,0.72)] px-4 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-[0_24px_90px_-38px_rgba(0,0,0,0.85)] md:grid-cols-[220px_1fr]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pulse settings"
      >
        <aside className="border-b border-border/70 bg-card/70 p-4 md:border-b-0 md:border-r">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preferences</p>
            <h2 className="text-lg font-semibold">Pulse Settings</h2>
          </div>
          <div className="space-y-1">
            <SidebarButton
              active={activePanel === "general"}
              icon={<Settings2 className="h-4 w-4" />}
              label="General"
              onClick={() => setActivePanel("general")}
            />
            <SidebarButton
              active={activePanel === "shortcuts"}
              icon={<Keyboard className="h-4 w-4" />}
              label="Keyboard"
              onClick={() => setActivePanel("shortcuts")}
            />
          </div>
        </aside>

        <div className="flex max-h-[75vh] flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <p className="text-sm font-medium">
              {activePanel === "general" ? "General Settings" : "Keyboard Shortcuts"}
            </p>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === "general" ? (
              <GeneralPanel isDarkMode={isDarkMode} onToggleTheme={onToggleTheme} />
            ) : (
              <ShortcutsPanel shortcuts={shortcuts} categorizedCommands={categorizedCommands} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function GeneralPanel({
  isDarkMode,
  onToggleTheme,
}: {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className={cardClass}>
        <div className="mb-3 flex items-center gap-2">
          <MoonStar className={cn("h-4 w-4 text-primary", isDarkMode && "animate-pulse")} />
          <p className="text-sm font-medium">Appearance</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/65 p-3">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">
              Pulse starts in dark mode by default and remembers your choice.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleTheme}>
            {isDarkMode ? (
              <>
                <Sun className="h-3.5 w-3.5" />
                Switch to Light
              </>
            ) : (
              <>
                <MoonStar className="h-3.5 w-3.5" />
                Switch to Dark
              </>
            )}
          </Button>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-2 flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Persistence</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Workspace state is autosaved with host-managed crash-safe persistence and backup recovery.
        </p>
      </div>

      <div className={cardClass}>
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Capability Boundary</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Commands are mapped to explicit capability tags and routed through the trusted Pulse UI
          bridge.
        </p>
      </div>
    </div>
  );
}

function ShortcutsPanel({
  shortcuts,
  categorizedCommands,
}: {
  shortcuts: ShortcutMap;
  categorizedCommands: Array<[string, CommandDefinition[]]>;
}) {
  return (
    <div className="space-y-4">
      {categorizedCommands.map(([category, commands]) => (
        <section key={category} className={cardClass}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {category}
          </h3>
          <div className="space-y-2">
            {commands.map((command) => (
              <div
                key={command.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{command.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{command.description}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-primary/80">
                    capability: {command.capability}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {(shortcuts[command.id] ?? command.defaultShortcuts).map((shortcut) => (
                    <kbd
                      key={`${command.id}-${shortcut}`}
                      className="rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] font-medium text-foreground"
                    >
                      {shortcut}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
