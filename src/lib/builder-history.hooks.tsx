import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  describeChange,
  emptyHistory,
  type HistoryEntry,
  type HistoryState,
  type HistoryTable,
  inversePatch,
  parseHistoryState,
  record as pushEntry,
  redo as redoState,
  undo as undoState,
} from "@/lib/builder-history";

export type BuilderHistory = {
  canUndo: boolean;
  canRedo: boolean;
  /** Label of the change Undo would reverse, for tooltips. */
  undoLabel: string | null;
  redoLabel: string | null;
  isApplying: boolean;
  /**
   * Records an edit that is about to be written. `row` is the row as it exists
   * now (usually from the content cache) so the inverse can be derived.
   */
  capture: (input: {
    table: HistoryTable;
    rowId: string;
    row: Record<string, unknown> | null | undefined;
    patch: Record<string, unknown>;
  }) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
};

const NOOP: BuilderHistory = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  isApplying: false,
  capture: () => {},
  undo: () => {},
  redo: () => {},
  clear: () => {},
};

const BuilderHistoryContext = createContext<BuilderHistory>(NOOP);

/**
 * Session undo/redo for every builder edit.
 *
 * Edits are captured at the mutation layer, so any panel that saves a page,
 * section or component is reversible without its own history plumbing — and
 * changes an AI command applies are reversible the same way. Writes made while
 * undoing are applied directly here, never through the capturing mutations, so
 * undo can never re-enter the history and loop.
 */
export function BuilderHistoryProvider({
  organizationId,
  children,
}: {
  organizationId: string | undefined;
  children: ReactNode;
}) {
  const [state, setState] = useState<HistoryState>(emptyHistory);
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();
  const orgRef = useRef(organizationId);
  const hydratedOrgRef = useRef<string | undefined>(undefined);
  orgRef.current = organizationId;

  // A different workspace means a different site: never let one project's
  // history apply writes to another.
  useEffect(() => {
    if (!organizationId) {
      hydratedOrgRef.current = undefined;
      setState(emptyHistory);
      return;
    }
    const key = `revora:builder-history:${organizationId}`;
    setState(parseHistoryState(window.localStorage.getItem(key)));
    hydratedOrgRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || hydratedOrgRef.current !== organizationId) return;
    const key = `revora:builder-history:${organizationId}`;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage may be unavailable in a private browser. Editing still works;
      // only reload persistence is unavailable for that browser session.
    }
  }, [organizationId, state]);

  const capture = useCallback<BuilderHistory["capture"]>(({ table, rowId, row, patch }) => {
    const pair = inversePatch(row, patch);
    if (!pair) return;
    const entry: HistoryEntry = {
      id: `${rowId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      label: describeChange(table, pair.after),
      at: Date.now(),
      table,
      rowId,
      before: pair.before,
      after: pair.after,
    };
    setState((current) => pushEntry(current, entry));
  }, []);

  const apply = useCallback(
    async (
      table: HistoryTable,
      rowId: string,
      patch: Record<string, unknown>,
      description: string,
    ) => {
      const orgId = orgRef.current;
      if (!orgId) return false;
      setIsApplying(true);
      try {
        const { error } = await supabase
          .from(table)
          .update(patch as never)
          .eq("id", rowId)
          .eq("organization_id", orgId);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["website_content", orgId] });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["production-readiness", orgId] }),
          queryClient.invalidateQueries({ queryKey: ["production-status", orgId] }),
          queryClient.invalidateQueries({ queryKey: ["build_readiness", orgId] }),
        ]);
        toast.success(description);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't apply that. Your work is unchanged.",
        );
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [queryClient],
  );

  const undo = useCallback(() => {
    const step = undoState(state);
    if (!step) return;
    void apply(step.entry.table, step.entry.rowId, step.patch, `Undid ${step.entry.label}.`).then(
      (ok) => {
        // Only move the cursor once the database actually accepted the write,
        // so a failed undo leaves the stack exactly where it was.
        if (ok) setState(step.state);
      },
    );
  }, [apply, state]);

  const redo = useCallback(() => {
    const step = redoState(state);
    if (!step) return;
    void apply(step.entry.table, step.entry.rowId, step.patch, `Redid ${step.entry.label}.`).then(
      (ok) => {
        if (ok) setState(step.state);
      },
    );
  }, [apply, state]);

  const clear = useCallback(() => {
    const orgId = orgRef.current;
    if (orgId) window.localStorage.removeItem(`revora:builder-history:${orgId}`);
    setState(emptyHistory);
  }, []);

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y). Typing inside an input keeps
  // the browser's own text undo, which is what a writer expects.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["input", "textarea", "select"].includes(target.tagName.toLowerCase()))
      ) {
        return;
      }
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const value = useMemo<BuilderHistory>(
    () => ({
      canUndo: state.past.length > 0 && !isApplying,
      canRedo: state.future.length > 0 && !isApplying,
      undoLabel: state.past[state.past.length - 1]?.label ?? null,
      redoLabel: state.future[0]?.label ?? null,
      isApplying,
      capture,
      undo,
      redo,
      clear,
    }),
    [capture, clear, isApplying, redo, state, undo],
  );

  return <BuilderHistoryContext.Provider value={value}>{children}</BuilderHistoryContext.Provider>;
}

/**
 * Reads the builder history. Outside the provider this returns inert no-ops, so
 * shared mutation hooks can capture unconditionally.
 */
export function useBuilderHistory() {
  return useContext(BuilderHistoryContext);
}
