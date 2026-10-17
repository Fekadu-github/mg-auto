import { useEffect, useState } from 'react';

// Full-screen "getting ready" screen: logo, a progress bar and a list of steps that tick off one by one.
export default function Splash({ steps, ms }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep(s => Math.min(s + 1, steps.length)), Math.max(ms / steps.length, 300));
    return () => clearInterval(id);
  }, [steps.length, ms]);
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-in">
        <div className="splash-ring"><img src="/madeg-logo.png" alt="" /></div>
        <div className="splash-t">MADEG <span>Garage</span></div>
        <div className="splash-s">MG Auto · Workshop system</div>
        <div className="ldbar" style={{ '--ms': ms + 'ms' }} aria-hidden="true"><i /></div>
        <ul className="splash-steps">
          {steps.map((s, i) => <li key={s} className={i < step ? 'd' : i === step ? 'c' : ''}><span aria-hidden="true">{i < step ? '✓' : i === step ? '›' : '·'}</span>{s}</li>)}
        </ul>
      </div>
    </div>
  );
}
