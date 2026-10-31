/**
 * Illustrative before/after comparison: a generic "typical outdated site"
 * mockup against a Revora-style design. Both sides are drawn placeholders, not
 * a real customer's site, and show no metrics, testimonials or results.
 * Draggable (pointer) and keyboard accessible (slider role: arrows, Home, End, PageUp/PageDown).
 */
import { useCallback, useRef, useState } from "react";

const GOLD = "#DAA932";
const INK = "#0A0A0C";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function BeforeAfterSlider({ className = "" }: { className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);

  const moveTo = useCallback((clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    setPosition(clamp(((clientX - box.left) / box.width) * 100));
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -5,
      ArrowDown: -5,
      ArrowRight: 5,
      ArrowUp: 5,
      PageDown: -15,
      PageUp: 15,
    };
    if (event.key in step) {
      event.preventDefault();
      setPosition((current) => clamp(current + step[event.key]!));
    } else if (event.key === "Home") {
      event.preventDefault();
      setPosition(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setPosition(100);
    }
  };

  const rounded = Math.round(position);

  return (
    <figure className={className}>
      <div
        ref={track}
        className="relative aspect-[16/11] w-full select-none overflow-hidden rounded-2xl border border-border sm:aspect-[16/9]"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event.clientX);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <RevoraStyleSide />
        {/* The outdated side is clipped, never resized, so its layout does not squash while dragging. */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <OutdatedSide />
        </div>

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
          Before: typical outdated site
        </span>
        <span
          className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: GOLD, color: INK }}
        >
          After: Revora-style design
        </span>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white">
          Illustrative example
        </span>

        <div
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{ left: `${position}%`, background: GOLD }}
          aria-hidden="true"
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Compare a typical outdated website with a Revora-style design"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
          aria-valuetext={`${rounded}% of the outdated example shown, ${100 - rounded}% of the Revora-style example shown`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/70"
          style={{ left: `${position}%`, background: INK, borderColor: GOLD, color: GOLD }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[12px] text-muted-foreground">
        Illustrative example: generic mockups, not a real customer's website or results. Drag the
        handle, or focus it and use the arrow keys.
      </figcaption>
    </figure>
  );
}

/** A generic cluttered, dated page. Placeholder text only. */
function OutdatedSide() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      style={{
        background: "#e9e9e0",
        color: "#222",
        fontFamily: '"Times New Roman", Times, serif',
      }}
    >
      <div className="px-3 pb-1 pt-12 text-center" style={{ background: "#2b4a9b", color: "#fff" }}>
        <p className="text-[clamp(14px,3.2vw,22px)] font-bold">Welcome To Our Website!!!</p>
        <p className="text-[10px] italic">Your Business Name Here</p>
      </div>
      <div
        className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 border-y border-gray-400 bg-gray-300 px-2 py-1 text-[10px]"
        style={{ color: "#0000ee" }}
      >
        {["Home", "About Us", "Services", "Products", "Links", "Guestbook", "Contact"].map(
          (label) => (
            <span key={label} className="underline">
              {label}
            </span>
          ),
        )}
      </div>
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1.5 p-2">
        <div className="space-y-1 border border-gray-400 bg-white p-1.5 text-[9px] leading-tight">
          <p className="font-bold" style={{ color: "#c00000" }}>
            NEWS
          </p>
          <p>Click here for more information about our company and what we offer.</p>
          <p className="underline" style={{ color: "#0000ee" }}>
            Click here
          </p>
        </div>
        <div className="space-y-1 border border-gray-400 bg-white p-1.5 text-[9px] leading-tight">
          <div className="grid h-12 place-items-center bg-gray-200 text-[9px] text-gray-500">
            [ small blurry photo ]
          </div>
          <p>
            We are a company that provides many services. Please look around and contact us for more
            details. We have been meaning to update this page.
          </p>
          <p>Call for a quote. Email us for a quote. Visit us for a quote.</p>
        </div>
        <div className="space-y-1 border border-gray-400 bg-white p-1.5 text-[9px] leading-tight">
          <p className="font-bold">Links</p>
          <p className="underline" style={{ color: "#0000ee" }}>
            Friend's page
          </p>
          <p className="underline" style={{ color: "#0000ee" }}>
            Another page
          </p>
          <p className="underline" style={{ color: "#551a8b" }}>
            Old page
          </p>
        </div>
      </div>
      <p className="px-2 text-center text-[8px] text-gray-500">
        Best viewed in an old browser. Not mobile friendly.
      </p>
    </div>
  );
}

/** A generic modern layout in Revora's gold-on-black look. Placeholder text only. */
function RevoraStyleSide() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden font-sans"
      style={{ background: INK, color: "#f5f3ee" }}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-12 sm:px-6">
        <span className="font-display text-[13px] font-semibold tracking-tight">Your Business</span>
        <span className="hidden gap-4 text-[11px] opacity-70 sm:flex">
          <span>Services</span>
          <span>About</span>
          <span>Contact</span>
        </span>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: GOLD, color: INK }}
        >
          Get a quote
        </span>
      </div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <p className="font-display text-[clamp(16px,3.6vw,30px)] font-semibold leading-tight">
          Your service, <span style={{ color: GOLD }}>easy to book online.</span>
        </p>
        <p className="mt-1.5 max-w-[34ch] text-[clamp(10px,1.5vw,13px)] opacity-70">
          A clear message, fast pages and a button people can find on a phone.
        </p>
        <span
          className="mt-3 inline-block rounded-full px-4 py-1.5 text-[11px] font-semibold"
          style={{ background: GOLD, color: INK }}
        >
          Request a free quote
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 px-4 sm:px-6">
        {["Service one", "Service two", "Service three"].map((label) => (
          <div
            key={label}
            className="rounded-lg border p-2"
            style={{ borderColor: "rgba(218,169,50,.35)", background: "rgba(255,255,255,.04)" }}
          >
            <div className="mb-1.5 h-1.5 w-6 rounded-full" style={{ background: GOLD }} />
            <p className="font-display text-[11px] font-semibold">{label}</p>
            <p className="mt-0.5 text-[9px] opacity-60">Short description of the service.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
