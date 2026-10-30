/**
 * Custom-styled select for customer sites (quality bar #1), following the
 * WAI-ARIA select-only combobox pattern: a focusable combobox that opens a
 * listbox, with arrow keys, Home/End, Page keys, Enter/Space, Escape, Tab and
 * type-to-select, and aria-activedescendant for screen readers.
 *
 * Progressive enhancement: the server and a no-JavaScript visitor get a
 * native select element with the same name and values; after hydration the custom
 * control takes over and submits through a hidden input with the identical
 * name/value, so FormData is unchanged either way.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { selectKeyAction, typeaheadIndex } from "@/lib/site-select";
import { cn } from "@/lib/utils";

export type SiteSelectOption = { value: string; label: string };

export function SiteSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  options,
  labelledBy,
  ariaLabel,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly SiteSelectOption[];
  /** id of the visible label element (preferred). */
  labelledBy?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const auto = useId();
  const baseId = id ?? `rv-select-${auto.replace(/:/g, "")}`;
  const listId = `${baseId}-list`;
  const [live, setLive] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === current));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  useEffect(() => setLive(true), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (value === undefined) setInner(option.value);
    if (option.value !== current) onChange?.(option.value);
  };

  if (!live) {
    // Server / no-JS: a native select with the same name and values.
    return (
      <select
        id={baseId}
        name={name}
        {...(value !== undefined ? { value, onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: current })}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        className={cn("h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px]", className)}
      >
        {options.map((o, i) => (
          <option key={`${i}-${o.value}`} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = selectKeyAction(event.key, open, open ? active : selectedIndex, options.length, event.altKey);
    if (action.kind === "none") {
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        typed.current.text = now - typed.current.at > 700 ? event.key : typed.current.text + event.key;
        typed.current.at = now;
        const hit = typeaheadIndex(options.map((o) => o.label), typed.current.text, open ? active : selectedIndex);
        if (hit >= 0) {
          if (open) setActive(hit);
          else choose(hit);
        }
      }
      return;
    }
    if (action.kind === "choose" && event.key === "Tab") {
      choose(action.active);
      setOpen(false);
      return; // let focus move on
    }
    event.preventDefault();
    if (action.kind === "open") {
      setActive(action.active);
      setOpen(true);
    } else if (action.kind === "move") setActive(action.active);
    else if (action.kind === "choose") {
      choose(action.active);
      setOpen(false);
    } else if (action.kind === "close") setOpen(false);
  };

  const shown = options[selectedIndex];
  return (
    <div ref={root} className={cn("relative w-full", className)} data-site-select="">
      {name !== undefined ? <input type="hidden" name={name} value={current} /> : null}
      <div
        id={baseId}
        role="combobox"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-activedescendant={open ? `${baseId}-o${active}` : undefined}
        onKeyDown={onKeyDown}
        onClick={() => {
          setActive(selectedIndex);
          setOpen((o) => !o);
        }}
        className="flex h-11 w-full cursor-pointer select-none items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-left text-[15px] transition-[border-color,box-shadow] duration-200 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-expanded:border-primary motion-reduce:transition-none"
      >
        <span className="truncate">{shown?.label ?? ""}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </div>
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : ariaLabel}
        tabIndex={-1}
        hidden={!open}
        className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[0_18px_40px_-12px_rgba(0,0,0,.35)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
      >
        {options.map((o, i) => (
          <li
            key={`${i}-${o.value}`}
            id={`${baseId}-o${i}`}
            data-index={i}
            role="option"
            aria-selected={i === selectedIndex}
            data-active={open && i === active ? "" : undefined}
            onPointerMove={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              choose(i);
              setOpen(false);
              document.getElementById(baseId)?.focus();
            }}
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-[15px] data-[active]:bg-primary/10 aria-selected:font-semibold"
          >
            <span>{o.label}</span>
            {i === selectedIndex ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
