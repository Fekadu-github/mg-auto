// Shown for a moment while a screen "opens": shimmering cards and rows instead of a blank page.
export default function PageLoader({ label = 'Loading' }) {
  return (
    <div className="pl" role="status" aria-live="polite" aria-label={label}>
      <div className="pl-note"><span className="pl-dot" />{label}<span className="dots" aria-hidden="true" /></div>
      <div className="g g2"><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" /></div>
      <div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row" /><div className="sk sk-row sk-short" />
    </div>
  );
}
