/**
 * Lightweight decorative lighting for Revora's marketing homepage.
 * CSS-only layers avoid image requests and remain static for reduced-motion users.
 */
export function CinematicBackdrop() {
  return (
    <div className="cinematic-backdrop" aria-hidden="true">
      <div className="cinematic-backdrop__grid" />
      <div className="cinematic-backdrop__glow cinematic-backdrop__glow--gold" />
      <div className="cinematic-backdrop__glow cinematic-backdrop__glow--blue" />
      <div className="cinematic-backdrop__glow cinematic-backdrop__glow--slate" />
      <div className="cinematic-backdrop__horizon" />
    </div>
  );
}
