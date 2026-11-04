/**
 * Floating "talk to us" button for template sites. It is NOT a chat bot and
 * calls no AI service: it opens a small panel that calls the business (tel:)
 * or jumps to the quote form, nothing else. sms: links are never used
 * (product rule; isSafeHref rejects them too).
 *
 * It floats above the phone quick-action bar using the bar's measured height
 * (--rv-sticky-height) so it never covers a bar slot.
 */
import { useEffect, useId, useRef, useState } from "react";
import { StickyIcon } from "@/components/site/StickyIcon";

export type ChatLauncherProps = {
  businessName: string;
  telHref: string | null;
  phoneDisplay: string | null;
  quoteHref: string | null;
};

/** The panel's actions, facts only; empty when there is nothing real to offer. */
// eslint-disable-next-line react-refresh/only-export-components -- tiny pure helper kept beside its only caller so it can be tested.
export function chatLauncherActions(input: ChatLauncherProps): { key: "call" | "quote"; label: string; detail: string | null; href: string }[] {
  const actions: { key: "call" | "quote"; label: string; detail: string | null; href: string }[] = [];
  if (input.telHref && /^tel:\+?\d{7,}$/.test(input.telHref)) actions.push({ key: "call", label: "Call us", detail: input.phoneDisplay, href: input.telHref });
  if (input.quoteHref) actions.push({ key: "quote", label: "Get a quote", detail: "Send us the details", href: input.quoteHref });
  return actions;
}

export function ChatLauncher(props: ChatLauncherProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const actions = chatLauncherActions(props);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!actions.length) return null;
  return (
    <div className="rv-chat" data-testid="chat-launcher">
      <style>{CHAT_CSS}</style>
      {open ? (
        <div ref={panel} id={panelId} role="dialog" aria-label={`Contact ${props.businessName}`} className="rv-chat-panel">
          <p className="rv-chat-title">Talk to {props.businessName}</p>
          <ul>
            {actions.map((action) => (
              <li key={action.key}>
                <a href={action.href} className="rv-chat-action" data-action={action.key} onClick={() => setOpen(false)}>
                  <span className="rv-chat-icon"><StickyIcon kind={action.key === "call" ? "phone" : action.key === "quote" ? "quote" : "message"} size={20} /></span>
                  <span><strong>{action.label}</strong>{action.detail ? <small>{action.detail}</small> : null}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        ref={button}
        type="button"
        className="rv-chat-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close contact options" : `Contact ${props.businessName}`}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <StickyIcon kind="message" highlight size={24} />
        )}
      </button>
    </div>
  );
}

const CHAT_CSS = `
.rv-chat{position:fixed;right:16px;bottom:calc(var(--rv-sticky-height,0px) + 16px + env(safe-area-inset-bottom,0px));z-index:55;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
@media (min-width:768px){.rv-chat{right:28px;bottom:28px}}
.rv-chat-button{width:56px;height:56px;border-radius:999px;border:0;display:grid;place-items:center;cursor:pointer;background:var(--primary);color:var(--primary-foreground);box-shadow:0 10px 30px -6px color-mix(in srgb,var(--primary) 60%,transparent),0 2px 6px rgb(0 0 0 / .4);transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s}
.rv-chat-button:hover{transform:translateY(-2px) scale(1.04)}
.rv-chat-button:active{transform:scale(.96)}
.rv-chat-button:focus-visible{outline:3px solid var(--foreground);outline-offset:3px}
.rv-chat-panel{width:min(300px,calc(100vw - 32px));border-radius:18px;padding:16px;background:var(--popover,#171e28);color:var(--popover-foreground,#f4f6f9);border:1px solid var(--border);box-shadow:0 24px 60px -12px rgb(0 0 0 / .7);transform-origin:bottom right;animation:rv-chat-in .18s ease-out}
.rv-chat-title{margin:0 0 10px;font-weight:700;font-size:15px}
.rv-chat-panel ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.rv-chat-action{display:flex;gap:12px;align-items:center;min-height:52px;padding:10px 12px;border-radius:12px;text-decoration:none;color:inherit;background:color-mix(in srgb,var(--foreground) 5%,transparent);border:1px solid var(--border);transition:background .15s,border-color .15s}
.rv-chat-action:hover,.rv-chat-action:focus-visible{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,transparent);outline:none}
.rv-chat-action strong{display:block;font-size:15px}
.rv-chat-action small{display:block;font-size:13px;color:var(--muted-foreground)}
.rv-chat-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:color-mix(in srgb,var(--primary) 16%,transparent)}
@keyframes rv-chat-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rv-chat-panel{animation:none}.rv-chat-button{transition:none}}
`;
