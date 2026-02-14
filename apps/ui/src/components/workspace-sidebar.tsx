import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderTree,
  Globe,
  GripVertical,
  MoonStar,
  Plus,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type WorkspaceItem, childrenOf } from "@/lib/workspace";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarProps {
  items: WorkspaceItem[];
  selectedItemId: string | null;
  onSelect: (item: WorkspaceItem) => void;
  onToggleGroup: (id: string) => void;
  onAddGroup: () => void;
  onAddTab: (parentId: string | null) => void;
  onMoveByDrop: (activeId: string, overId: string) => void;
  onCloseTab: (id: string) => void;
  onOpenSettings: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

interface VisibleTreeRow {
  item: WorkspaceItem;
  depth: number;
}

const rowBaseClass =
  "group flex min-w-0 w-full items-center gap-1 rounded-md border border-transparent pr-2 text-left transition-colors";
const selectedRowClass = "bg-primary/15 text-primary";
const idleRowClass = "hover:bg-accent/60";

export function WorkspaceSidebar({
  items,
  selectedItemId,
  onSelect,
  onToggleGroup,
  onAddGroup,
  onAddTab,
  onMoveByDrop,
  onCloseTab,
  onOpenSettings,
  isDarkMode,
  onToggleTheme,
}: WorkspaceSidebarProps) {
  const rows = useMemo(() => buildVisibleRows(items), [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(event: DragEndEvent) {
    const activeId = `${event.active.id}`;
    const overId = event.over?.id ? `${event.over.id}` : null;
    if (!overId || activeId === overId) {
      return;
    }
    onMoveByDrop(activeId, overId);
  }

  return (
    <aside className="flex min-h-[280px] flex-col border-b border-border/70 bg-card/70 md:border-b-0 md:border-r">
      <header className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FolderTree className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Pulse</p>
            <p className="text-[11px] text-muted-foreground">Workspace Tree</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onAddGroup}>
          <Plus className="h-3.5 w-3.5" />
          Group
        </Button>
      </header>

      <ScrollArea className="h-full">
        <div className="space-y-1 p-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((row) => row.item.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <SortableTreeRow
                  key={row.item.id}
                  row={row}
                  selected={selectedItemId === row.item.id}
                  onSelect={onSelect}
                  onToggleGroup={onToggleGroup}
                  onAddTab={onAddTab}
                  onCloseTab={onCloseTab}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>

      <footer className="mt-auto flex items-center justify-between border-t border-border/70 px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings2 className="icon-float h-4 w-4 transition-transform hover:rotate-12" />
        </Button>
      </footer>
    </aside>
  );
}

interface SortableTreeRowProps {
  row: VisibleTreeRow;
  selected: boolean;
  onSelect: (item: WorkspaceItem) => void;
  onToggleGroup: (id: string) => void;
  onAddTab: (parentId: string | null) => void;
  onCloseTab: (id: string) => void;
}

function SortableTreeRow({
  row,
  selected,
  onSelect,
  onToggleGroup,
  onAddTab,
  onCloseTab,
}: SortableTreeRowProps) {
  const { item, depth } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            rowBaseClass,
            selected ? selectedRowClass : idleRowClass,
            item.kind === "group" ? "h-9" : "h-8",
          )}
          onClick={() => onSelect(item)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(item);
            }
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
            {item.kind === "group" ? (
              <button
                type="button"
                className="shrink-0 rounded-sm p-1 hover:bg-background/80"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleGroup(item.id);
                }}
                aria-label={item.collapsed ? "Expand group" : "Collapse group"}
              >
                {item.collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}

            {item.kind === "browser-tab" ? (
              <Globe className="h-3.5 w-3.5 shrink-0 opacity-80" />
            ) : item.kind === "group" ? (
              <FolderTree className="h-3.5 w-3.5 shrink-0 opacity-80" />
            ) : (
              <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-80" />
            )}
            <span className="min-w-0 truncate text-sm">{item.title}</span>
          </div>

          {item.kind === "group" ? (
            <InlineAction
              label="Add tab"
              onClick={(event) => {
                event.stopPropagation();
                onAddTab(item.id);
              }}
            >
              <Plus className="h-3 w-3" />
            </InlineAction>
          ) : null}

          {item.kind === "browser-tab" ? (
            <InlineAction
              label="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(item.id);
              }}
            >
              <X className="h-3 w-3" />
            </InlineAction>
          ) : null}

          <InlineAction
            label="Drag row"
            onClick={(event) => event.stopPropagation()}
            className="shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </InlineAction>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[130] min-w-[180px] rounded-md border border-border bg-card p-1 shadow-lg">
          <MenuItem
            onSelect={() => onSelect(item)}
            label={item.kind === "browser-tab" ? "Open Tab" : item.kind === "group" ? "Open Group" : "Open Item"}
          />
          {item.kind === "group" ? (
            <>
              <MenuItem onSelect={() => onToggleGroup(item.id)} label={item.collapsed ? "Expand Group" : "Collapse Group"} />
              <MenuItem onSelect={() => onAddTab(item.id)} label="New Tab in Group" />
            </>
          ) : null}
          {item.kind === "browser-tab" ? (
            <>
              <MenuItem onSelect={() => onAddTab(item.parentId)} label="New Tab Nearby" />
              <MenuItem onSelect={() => onCloseTab(item.id)} label="Close Tab" destructive />
            </>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function InlineAction({
  children,
  label,
  onClick,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function MenuItem({
  label,
  onSelect,
  destructive = false,
}: {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm outline-none transition-colors",
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent",
      )}
    >
      {label}
    </ContextMenu.Item>
  );
}

function buildVisibleRows(items: WorkspaceItem[]): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];
  const rootItems = childrenOf(items, null);

  for (const rootItem of rootItems) {
    rows.push({
      item: rootItem,
      depth: 0,
    });

    if (rootItem.kind === "group" && !rootItem.collapsed) {
      const groupChildren = childrenOf(items, rootItem.id);
      for (const child of groupChildren) {
        rows.push({
          item: child,
          depth: 1,
        });
      }
    }
  }

  return rows;
}
