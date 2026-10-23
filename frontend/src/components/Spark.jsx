import { sparkPoints } from '../lib/insight.js';
// A small line of the values over time. Decoration plus a text label for screen readers.
export default function Spark({ values, label, w = 120, h = 32 }) {
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <polyline points={sparkPoints(values, w, h)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
