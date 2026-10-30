import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import {
  OSM_ATTRIBUTION,
  OSM_COPYRIGHT_URL,
  PHOTON_DEBOUNCE_MS,
  parsePhoton,
  photonUrl,
  type AddressSuggestion,
} from "@/lib/photon";
import { cn } from "@/lib/utils";

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onSelect">;

/**
 * Street-address input with free Photon/OpenStreetMap suggestions. Typing is
 * never blocked: any free text is a valid value, suggestions are optional, and
 * if Photon is slow or down the field is simply a normal input. Suggestions
 * show the required "© OpenStreetMap contributors" credit.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  className,
  ...rest
}: InputProps & {
  value: string;
  onChange: (value: string) => void;
  /** Called with the picked suggestion (after onChange with its street). */
  onSelect?: (place: AddressSuggestion) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const url = photonUrl(value);
    if (!url) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(url, { signal: controller.signal, headers: { accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          setItems(parsePhoton(json));
          setActive(-1);
        })
        .catch(() => undefined);
    }, PHOTON_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const pick = (place: AddressSuggestion) => {
    typed.current = false;
    onChange(place.street || place.label);
    onSelect?.(place);
    setOpen(false);
    setItems([]);
  };

  const showList = open && items.length > 0;
  return (
    <div className="relative">
      <Input
        {...rest}
        className={className}
        value={value}
        autoComplete="street-address"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          typed.current = true;
          setOpen(true);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!showList) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => (i + 1) % items.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(items[active]!);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={(event) => {
          // Let a click on a suggestion land before closing.
          setTimeout(() => setOpen(false), 150);
          rest.onBlur?.(event);
        }}
      />
      {showList ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" className="max-h-64 overflow-auto py-1 text-[13px]">
            {items.map((item, index) => (
              <li
                key={item.label}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn("cursor-pointer px-3 py-2 hover:bg-muted", index === active && "bg-muted")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(item);
                }}
              >
                {item.label}
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
            <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
              {OSM_ATTRIBUTION}
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
