import { useState } from 'react';
import { Dialog } from './ui.jsx';
import { ACCENTS, DENSITIES, getDisplay, setDisplay } from '../lib/display.js';

// Display settings kept on this device: row spacing, accent colour, high contrast. (Light / dark is the sun / moon button.)
export default function DisplayDialog({ onClose }) {
  const [d, setD] = useState(getDisplay());
  const set = patch => setD(setDisplay(patch));
  return (
    <Dialog title="Display" onClose={onClose}>
      <p className="mu small">These choices stay on this device only.</p>
      <div className="g">
        <fieldset className="opt"><legend>Row spacing</legend>
          {DENSITIES.map(([k, n]) => <label key={k} className="opt-r"><input type="radio" name="dens" checked={d.density === k} onChange={() => set({ density: k })} />{n}</label>)}
        </fieldset>
        <fieldset className="opt"><legend>Accent colour</legend>
          <div className="sw-row">{ACCENTS.map(([k, n]) => <label key={k} className={'sw sw-' + k + (d.accent === k ? ' on' : '')} title={n}><input type="radio" name="acc" checked={d.accent === k} onChange={() => set({ accent: k })} /><span>{n}</span></label>)}</div>
        </fieldset>
        <label className="opt-r"><input type="checkbox" checked={d.contrast} onChange={e => set({ contrast: e.target.checked })} />High contrast: stronger borders and text, easier to read in bright light</label>
      </div>
    </Dialog>
  );
}
