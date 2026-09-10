'use client'

import { useState } from 'react'

export default function ProposalPrintControls({ internal }: { internal: boolean }) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(internal ? 'landscape' : 'portrait')
  const [color, setColor] = useState<'color' | 'grayscale'>('color')

  return (
    <div className="proposal-print-controls">
      <style>{`
        @page { size: letter ${orientation}; margin: 0.45in; }
        @media print {
          .print-root { padding: 0; max-width: none; filter: ${color === 'grayscale' ? 'grayscale(1)' : 'none'}; }
          .print-root, .print-root * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          ${internal && orientation === 'portrait' ? `
            .print-root table { font-size: 8px; }
            .print-root th, .print-root td { padding: 5px 2px; letter-spacing: 0; }
            .print-root th { font-size: 8px; }
            .print-root td:not(.num) { overflow-wrap: anywhere; }
            .print-root .notes { font-size: 8px; }
          ` : ''}
        }
        .proposal-print-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
        .proposal-print-controls label { display: grid; gap: 4px; font-size: 12px; font-weight: 700; }
        .proposal-print-controls select { min-height: 38px; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 7px; background: white; color: #111827; }
        .proposal-print-help { flex-basis: 100%; font-size: 11px; color: #6b7280; }
      `}</style>
      <label>
        Orientation
        <select value={orientation} onChange={event => setOrientation(event.target.value as 'portrait' | 'landscape')}>
          <option value="portrait">Portrait (vertical)</option>
          <option value="landscape">Landscape (horizontal)</option>
        </select>
      </label>
      <label>
        Color
        <select value={color} onChange={event => setColor(event.target.value as 'color' | 'grayscale')}>
          <option value="color">Color</option>
          <option value="grayscale">Black and white</option>
        </select>
      </label>
      <button type="button" className="print-btn" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <p className="proposal-print-help">
        {internal && 'Landscape gives the internal cost columns more room. '}
        For color on paper, also select color in your printer settings.
      </p>
    </div>
  )
}
