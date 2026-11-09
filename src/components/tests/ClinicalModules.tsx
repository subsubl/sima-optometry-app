import React, { useEffect, useRef } from 'react';
import { ExamState } from '../../types/exam';
import {
  calculateOneDegreePx,
  calculateOptotypeHeightPx,
  getPixelsPerMm,
} from '../../engine/acuityMath';
import { OptotypeSvg } from '../optotypes/OptotypeSvg';

interface ModuleProps {
  state: ExamState;
  scaleFactor?: number;
  onUpdateState?: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
}

export const D15_HUE_CAPS = [
  '#3B82A6', // 0: Pilot / Reference Cap
  '#3E8D9E', // 1
  '#43968E', // 2
  '#4C9E7A', // 3
  '#5CA366', // 4
  '#74A655', // 5
  '#8FA648', // 6
  '#ABA240', // 7
  '#C29840', // 8
  '#D48947', // 9
  '#DF7856', // 10
  '#E1696B', // 11
  '#DA6183', // 12
  '#C9619B', // 13
  '#B069AE', // 14
  '#9073B8', // 15
];

/**
 * Evaluates Farnsworth D-15 cap sequence for major color confusion crossings.
 */
export function analyzeD15Arrangement(arranged: number[]): {
  crossings: number;
  status: string;
} {
  if (arranged.length < 4) {
    return { crossings: 0, status: `PLACED ${arranged.length}/16 CAPS` };
  }
  let crossings = 0;
  let rgCrossings = 0;
  let byCrossings = 0;

  for (let i = 1; i < arranged.length; i++) {
    const a = arranged[i - 1];
    const b = arranged[i];
    const diff = Math.abs(a - b);
    if (diff >= 4) {
      crossings++;
      // Protan/Deutan crossings typically bridge caps 1..6 <-> 15..9
      if ((a <= 6 && b >= 9) || (b <= 6 && a >= 9)) {
        rgCrossings++;
      } else {
        byCrossings++;
      }
    }
  }

  if (crossings === 0) {
    return {
      crossings: 0,
      status: arranged.length === 16 ? 'NORMAL TRICHROMATIC ORDER (0 CROSSINGS)' : '0 CROSSINGS SO FAR',
    };
  }
  if (rgCrossings >= byCrossings) {
    return {
      crossings,
      status: `RED-GREEN AXIS (PROTAN/DEUTAN) • ${crossings} CROSSING(S)`,
    };
  }
  return {
    crossings,
    status: `BLUE-YELLOW AXIS (TRITAN) • ${crossings} CROSSING(S)`,
  };
}

/**
 * 1. Dedicated Duochrome (Red/Green) Spherical Balance Chart
 */
export const DuochromeBalanceDisplay: React.FC<ModuleProps> = ({ state, scaleFactor = 1 }) => {
  const basePx = Math.max(16, calculateOptotypeHeightPx(state.calibration, state.activeLogMAR) * scaleFactor);
  const rows = [
    { mult: 1.58, left: ['O', 'E'],      right: ['O', 'E'] },
    { mult: 1.26, left: ['D', 'H', 'Z'], right: ['D', 'H', 'Z'] },
    { mult: 1.0,  left: ['R', 'C', 'K'], right: ['R', 'C', 'K'] },
    { mult: 0.79, left: ['V', 'S', 'N'], right: ['V', 'S', 'N'] },
  ];

  return (
    <div className="w-full h-full flex select-none overflow-hidden">
      {/* Left Half: Chromatic Red (~625nm) */}
      <div
        className="w-1/2 h-full flex flex-col items-end justify-center pr-[4%] gap-6"
        style={{ backgroundColor: '#DC2626', color: '#000000' }}
      >
        <svg width={basePx * 2.2} height={basePx * 2.2} viewBox="0 0 100 100" className="mb-2">
          <circle cx="50" cy="50" r="42" fill="none" stroke="black" strokeWidth="7" />
          <circle cx="50" cy="50" r="24" fill="none" stroke="black" strokeWidth="7" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="black" strokeWidth="6" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="black" strokeWidth="6" />
        </svg>

        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center justify-end" style={{ gap: `${basePx * row.mult * 0.8}px` }}>
            {row.left.map((sym, i) => (
              <OptotypeSvg key={i} symbol={sym} sizePx={basePx * row.mult} color="#000000" />
            ))}
          </div>
        ))}
      </div>

      {/* Right Half: Chromatic Green (~535nm) */}
      <div
        className="w-1/2 h-full flex flex-col items-start justify-center pl-[4%] gap-6"
        style={{ backgroundColor: '#16A34A', color: '#000000' }}
      >
        <svg width={basePx * 2.2} height={basePx * 2.2} viewBox="0 0 100 100" className="mb-2">
          <circle cx="50" cy="50" r="42" fill="none" stroke="black" strokeWidth="7" />
          <circle cx="50" cy="50" r="24" fill="none" stroke="black" strokeWidth="7" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="black" strokeWidth="6" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="black" strokeWidth="6" />
        </svg>

        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center justify-start" style={{ gap: `${basePx * row.mult * 0.8}px` }}>
            {row.right.map((sym, i) => (
              <OptotypeSvg key={i} symbol={sym} sizePx={basePx * row.mult} color="#000000" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Jackson Cross-Cylinder (JCC) Honeycomb & Cross-Cylinder Power Display
 * Supports Position 1 vs Position 2 flip toggle, Axis vs Power refinement modes,
 * and dynamically renders Red and White power dots aligned with cylinder axis.
 */
export const JccCrossCylinderDisplay: React.FC<ModuleProps> = ({
  state,
  scaleFactor = 1,
  onUpdateState,
}) => {
  const oneDegPx = Math.max(24, calculateOneDegreePx(state.calibration) * scaleFactor);
  const radius = Math.min(340 * scaleFactor, oneDegPx * 4.5);
  const fgColor = state.invertPolarity ? '#FFFFFF' : '#000000';
  const bgColor = state.invertPolarity ? '#000000' : '#FFFFFF';

  const jcc = state.jcc || { flipPosition: 1, refinementMode: 'AXIS', powerStep: 0.25 };
  const flip = jcc.flipPosition;
  const mode = jcc.refinementMode;
  const powerStep = jcc.powerStep;
  const cylAxis = ((state.astigmatismAxisDeg % 180) + 180) % 180;

  // Calculate Red and White marker angles
  let redDeg: number;
  let whiteDeg: number;

  if (mode === 'AXIS') {
    // Straddle cylinder axis at +/- 45 degrees
    redDeg = flip === 1 ? cylAxis - 45 : cylAxis + 45;
    whiteDeg = flip === 1 ? cylAxis + 45 : cylAxis - 45;
  } else {
    // Parallel and perpendicular to cylinder axis
    redDeg = flip === 1 ? cylAxis : cylAxis + 90;
    whiteDeg = flip === 1 ? cylAxis + 90 : cylAxis;
  }

  redDeg = ((redDeg % 180) + 180) % 180;
  whiteDeg = ((whiteDeg % 180) + 180) % 180;

  // 19-Dot Hexagonal Honeycomb Target Coordinates
  const hexCoords: Array<[number, number]> = [
    [0, 0],
    [1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0], [-0.5, -0.866], [0.5, -0.866],
    [2, 0], [1.5, 0.866], [1, 1.732], [0, 1.732], [-1, 1.732], [-1.5, 0.866],
    [-2, 0], [-1.5, -0.866], [-1, -1.732], [0, -1.732], [1, -1.732], [1.5, -0.866],
  ];

  // Helper to project polar degree angle to SVG Cartesian coordinates
  const polarToSvg = (deg: number, r: number) => {
    const rad = ((180 - deg) * Math.PI) / 180;
    return {
      x: Math.cos(rad) * r,
      y: -Math.sin(rad) * r,
    };
  };

  const handleFlip = () => {
    if (!onUpdateState) return;
    onUpdateState((prev) => ({
      ...prev,
      jcc: {
        ...prev.jcc,
        flipPosition: prev.jcc?.flipPosition === 1 ? 2 : 1,
      },
    }));
  };

  const handleToggleMode = () => {
    if (!onUpdateState) return;
    onUpdateState((prev) => ({
      ...prev,
      jcc: {
        ...prev.jcc,
        refinementMode: prev.jcc?.refinementMode === 'AXIS' ? 'POWER' : 'AXIS',
      },
    }));
  };

  const handleToggleStep = () => {
    if (!onUpdateState) return;
    onUpdateState((prev) => ({
      ...prev,
      jcc: {
        ...prev.jcc,
        powerStep: prev.jcc?.powerStep === 0.25 ? 0.5 : 0.25,
      },
    }));
  };

  const axisP1 = polarToSvg(cylAxis, 142);
  const axisP2 = polarToSvg(cylAxis + 180, 142);

  const redP1 = polarToSvg(redDeg, 142);
  const redP2 = polarToSvg(redDeg + 180, 142);

  const whiteP1 = polarToSvg(whiteDeg, 142);
  const whiteP2 = polarToSvg(whiteDeg + 180, 142);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 select-none relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* Tactical HUD Header */}
      <div className="absolute top-2 sm:top-4 flex items-center gap-2 sm:gap-3 font-mono z-10">
        <button
          type="button"
          onClick={handleFlip}
          disabled={!onUpdateState}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded border border-amber-600 shadow cursor-pointer transition active:scale-95 flex items-center gap-1.5"
        >
          <span>FLIP JCC</span>
          <span className="bg-black text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
            POS {flip}
          </span>
        </button>

        <button
          type="button"
          onClick={handleToggleMode}
          disabled={!onUpdateState}
          className="px-3 py-1.5 bg-[#12151E] hover:bg-[#1E2330] text-neutral-200 text-xs uppercase tracking-wider rounded border border-[#2A3142] cursor-pointer transition flex items-center gap-1.5"
        >
          <span className="text-neutral-500 text-[10px]">MODE:</span>
          <span className="font-bold text-amber-400">{mode}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleStep}
          disabled={!onUpdateState}
          className="px-2.5 py-1.5 bg-[#12151E] hover:bg-[#1E2330] text-neutral-300 text-xs rounded border border-[#2A3142] cursor-pointer transition"
        >
          <span className="text-neutral-500 text-[10px] mr-1">STEP:</span>
          <span className="font-bold text-white">±{powerStep.toFixed(2)} D</span>
        </button>
      </div>

      {/* Cross-Cylinder Graphic */}
      <div className="relative flex items-center justify-center my-auto">
        <svg
          width={radius * 2.5}
          height={radius * 2.5}
          viewBox="-170 -170 340 340"
          className="overflow-visible"
        >
          {/* Outer Bezel Guide Ring */}
          <circle
            cx="0"
            cy="0"
            r="142"
            fill="none"
            stroke={fgColor}
            strokeWidth="2.5"
            strokeOpacity="0.25"
          />

          {/* Spectacle Cylinder Axis Alignment Hairline */}
          <line
            x1={axisP1.x}
            y1={axisP1.y}
            x2={axisP2.x}
            y2={axisP2.y}
            stroke="#F59E0B"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            strokeOpacity="0.75"
          />

          {/* Central 19-Dot Hexagonal Honeycomb Target */}
          {hexCoords.map(([hx, hy], idx) => (
            <circle
              key={`dot-${idx}`}
              cx={hx * 32}
              cy={hy * 32}
              r={9.0}
              fill={fgColor}
            />
          ))}

          {/* RED Minus-Cylinder Power Dots */}
          {[redP1, redP2].map((p, i) => (
            <g key={`red-${i}`} transform={`translate(${p.x}, ${p.y})`}>
              <circle cx="0" cy="0" r="13" fill="#EF4444" stroke="#7F1D1D" strokeWidth="2.5" />
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="14"
                fontWeight="900"
                fontFamily="sans-serif"
              >
                −
              </text>
            </g>
          ))}

          {/* WHITE Plus-Cylinder Power Dots */}
          {[whiteP1, whiteP2].map((p, i) => (
            <g key={`white-${i}`} transform={`translate(${p.x}, ${p.y})`}>
              <circle cx="0" cy="0" r="13" fill="#FFFFFF" stroke="#374151" strokeWidth="2.5" />
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fill="#111827"
                fontSize="14"
                fontWeight="900"
                fontFamily="sans-serif"
              >
                +
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Clinical Guidance Footer */}
      <div className="absolute bottom-2 sm:bottom-4 text-center font-mono text-[10px] sm:text-[11px] max-w-xl px-3 py-1.5 sm:px-4 sm:py-2 bg-[#0D0F14]/90 border border-[#1E2330] rounded text-neutral-300 pointer-events-none">
        {mode === 'AXIS' ? (
          <div>
            <span className="text-amber-400 font-bold">AXIS REFINEMENT:</span> Ask patient:
            "Is the honeycomb clearer on 1 or 2?" Rotate spectacle cylinder axis toward the
            <span className="text-red-400 font-bold ml-1">RED DOT</span> of the clearer position.
          </div>
        ) : (
          <div>
            <span className="text-amber-400 font-bold">POWER REFINEMENT:</span> Ask patient:
            "Is 1 or 2 clearer?" If Red clearer:
            <span className="text-red-400 font-bold ml-1">Add -0.25D Cyl</span>. If White clearer:
            <span className="text-white font-bold ml-1">Subtract -0.25D Cyl</span>.
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 2. Astigmatism Suite: Clock Dial, Sunburst Fan, and Jackson Cross-Cylinder (JCC) Dots
 */
export const AstigmatismDisplay: React.FC<ModuleProps> = ({ state, scaleFactor = 1, onUpdateState }) => {
  const oneDegPx = Math.max(24, calculateOneDegreePx(state.calibration) * scaleFactor);
  const radius = Math.min(340 * scaleFactor, oneDegPx * 4.5);
  const fgColor = state.invertPolarity ? '#FFFFFF' : '#000000';
  const bgColor = state.invertPolarity ? '#000000' : '#FFFFFF';
  const accentColor = '#EF4444';

  if (state.astigmatismMode === 'jcc_dots') {
    return (
      <JccCrossCylinderDisplay
        state={state}
        scaleFactor={scaleFactor}
        onUpdateState={onUpdateState}
      />
    );
  }

  if (state.astigmatismMode === 'sunburst') {
    const angles = Array.from({ length: 19 }, (_, i) => i * 10);
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <svg width={radius * 2.6} height={radius * 2.2} viewBox="-220 -190 440 260">
          {angles.map((deg) => {
            const rad = ((180 - deg) * Math.PI) / 180;
            const x1 = Math.cos(rad) * 48;
            const y1 = -Math.sin(rad) * 48;
            const x2 = Math.cos(rad) * 165;
            const y2 = -Math.sin(rad) * 165;
            const tx = Math.cos(rad) * 186;
            const ty = -Math.sin(rad) * 186;
            const isSelected = Math.abs(state.astigmatismAxisDeg - deg) <= 5;
            return (
              <g key={deg}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isSelected ? accentColor : fgColor}
                  strokeWidth={isSelected ? '4.5' : '3'}
                />
                <text
                  x={tx}
                  y={ty + 4}
                  textAnchor="middle"
                  fill={isSelected ? accentColor : fgColor}
                  fontSize="11"
                  fontWeight="bold"
                >
                  {deg}°
                </text>
              </g>
            );
          })}
          <g transform={`rotate(${90 - state.astigmatismAxisDeg} 0 0)`}>
            <polygon points="0,-38 -10,-18 10,-18" fill={accentColor} />
            <rect x="-5" y="10" width="10" height="32" fill={fgColor} />
            <rect x="-21" y="21" width="42" height="10" fill={fgColor} />
          </g>
        </svg>
      </div>
    );
  }

  const clockHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
      <svg width={radius * 2.5} height={radius * 2.5} viewBox="-200 -200 400 400">
        {[0, 30, 60, 90, 120, 150].map((deg) => {
          const isHighlighted =
            Math.abs(((180 - state.astigmatismAxisDeg) % 180) - deg) < 15;
          const strokeCol = isHighlighted ? accentColor : fgColor;
          return (
            <g key={deg} transform={`rotate(${deg})`}>
              {[-6, 0, 6].map((offset) => (
                <React.Fragment key={offset}>
                  <line x1={offset} y1="-138" x2={offset} y2="-34" stroke={strokeCol} strokeWidth="3" />
                  <line x1={offset} y1="34" x2={offset} y2="138" stroke={strokeCol} strokeWidth="3" />
                </React.Fragment>
              ))}
            </g>
          );
        })}

        <circle cx="0" cy="0" r="34" fill="none" stroke={fgColor} strokeWidth="2.5" />
        <circle cx="0" cy="0" r="4" fill={accentColor} />

        {clockHours.map((hr, idx) => {
          const angleRad = ((idx * 30 - 90) * Math.PI) / 180;
          const x = Math.cos(angleRad) * 166;
          const y = Math.sin(angleRad) * 166;
          return (
            <text
              key={hr}
              x={x}
              y={y + 7}
              textAnchor="middle"
              fill={fgColor}
              fontSize="20"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              {hr}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * 3. Binocular & Phoria Suite: Worth 4-Dot, Schober, Fixation Disparity (OXO), and Binocular Balance
 */
export const BinocularDisplay: React.FC<ModuleProps> = ({ state, scaleFactor = 1 }) => {
  const oneDegPx = Math.max(22, calculateOneDegreePx(state.calibration) * scaleFactor);

  if (state.binocularMode === 'worth_4_dot') {
    const spread = oneDegPx * 1.8 * state.worthDotSpread;
    const dotSize = Math.max(14 * scaleFactor, spread * 0.28);
    return (
      <div className="w-full h-full flex items-center justify-center bg-black select-none">
        <div className="relative" style={{ width: `${spread * 2.5}px`, height: `${spread * 2.5}px` }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 rotate-45"
            style={{
              top: `calc(50% - ${spread}px - ${dotSize / 2}px)`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              backgroundColor: '#EF4444',
              boxShadow: '0 0 12px rgba(239,68,68,0.4)',
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(50% - ${spread}px - ${dotSize / 2}px)`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              backgroundColor: '#22C55E',
              boxShadow: '0 0 12px rgba(34,197,94,0.4)',
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `calc(50% + ${spread}px - ${dotSize / 2}px)`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              backgroundColor: '#22C55E',
              boxShadow: '0 0 12px rgba(34,197,94,0.4)',
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: `calc(50% + ${spread}px - ${dotSize / 2}px)`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 0 12px rgba(255,255,255,0.4)',
            }}
          />
        </div>
      </div>
    );
  }

  if (state.binocularMode === 'schober') {
    const size = oneDegPx * 4.5;
    return (
      <div className="w-full h-full flex items-center justify-center bg-black select-none">
        <svg width={size} height={size} viewBox="-120 -120 240 240">
          <circle cx="0" cy="0" r="95" fill="none" stroke="#22C55E" strokeWidth="8" />
          <circle cx="0" cy="0" r="62" fill="none" stroke="#22C55E" strokeWidth="6" />
          <line x1="-38" y1="0" x2="38" y2="0" stroke="#EF4444" strokeWidth="8" />
          <line x1="0" y1="-38" x2="0" y2="38" stroke="#EF4444" strokeWidth="8" />
        </svg>
      </div>
    );
  }

  if (state.binocularMode === 'fixation_disparity') {
    const size = oneDegPx * 4.5;
    return (
      <div className="w-full h-full flex items-center justify-center bg-black select-none">
        <svg width={size} height={size} viewBox="-140 -140 280 280">
          <rect x="-85" y="-36" width="170" height="72" rx="8" fill="#111827" stroke="#FFFFFF" strokeWidth="4" />
          <text
            x="0"
            y="14"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="42"
            fontWeight="bold"
            letterSpacing="12"
            fontFamily="sans-serif"
          >
            OXO
          </text>
          <rect x="-4" y="-115" width="8" height="62" fill="#EF4444" />
          <rect x="-4" y="53" width="8" height="62" fill="#22C55E" />
          <rect x="-135" y="-4" width="38" height="8" fill="#EF4444" />
          <rect x="97" y="-4" width="38" height="8" fill="#22C55E" />
        </svg>
      </div>
    );
  }

  const optoPx = Math.max(16, calculateOptotypeHeightPx(state.calibration, state.activeLogMAR) * scaleFactor);
  const topLetters = ['H', 'K', 'O', 'N', 'S'];
  const bottomLetters = ['D', 'Z', 'V', 'C', 'R'];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-12 bg-black text-white select-none">
      <div className="flex flex-col items-center gap-2 px-8 py-5 rounded-xl border border-red-500/40 bg-red-950/20">
        <div className="flex items-center" style={{ gap: `${optoPx}px` }}>
          {topLetters.map((sym, i) => (
            <OptotypeSvg key={i} symbol={sym} sizePx={optoPx} color="#EF4444" />
          ))}
        </div>
      </div>

      <div className="w-64 h-1.5 bg-white rounded-full" />

      <div className="flex flex-col items-center gap-2 px-8 py-5 rounded-xl border border-green-500/40 bg-green-950/20">
        <div className="flex items-center" style={{ gap: `${optoPx}px` }}>
          {bottomLetters.map((sym, i) => (
            <OptotypeSvg key={i} symbol={sym} sizePx={optoPx} color="#22C55E" />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 4. Contrast Sensitivity Suite: Stepped Letter Contrast & Sine-Wave Spatial Frequency Gratings
 */
export const ContrastSensitivityDisplay: React.FC<ModuleProps> = ({ state, scaleFactor = 1 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { mode, contrastPercent, letterLogMAR, spatialFrequencyCpd, gratingAngleDeg } = state.contrastWizard;
  const oneDegPx = Math.max(24, calculateOneDegreePx(state.calibration) * scaleFactor);

  useEffect(() => {
    if (mode !== 'sine_grating' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const contrast = Math.max(0.005, Math.min(1.0, contrastPercent / 100));
    const angleRad = (gratingAngleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const cyclesPerPixel = spatialFrequencyCpd / oneDegPx;
    const radius = size / 2;

    for (let y = 0; y < size; y++) {
      const dy = y - radius;
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;

        if (dist > radius) {
          data[idx] = 128;
          data[idx + 1] = 128;
          data[idx + 2] = 128;
          data[idx + 3] = 255;
        } else {
          const edgeRatio = dist / radius;
          const envelope = edgeRatio > 0.85 ? 0.5 * (1 + Math.cos(((edgeRatio - 0.85) / 0.15) * Math.PI)) : 1.0;
          const proj = dx * cosA + dy * sinA;
          const wave = Math.sin(2 * Math.PI * cyclesPerPixel * proj);
          const lum = Math.round(128 * (1 + contrast * envelope * wave));
          data[idx] = lum;
          data[idx + 1] = lum;
          data[idx + 2] = lum;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [mode, contrastPercent, spatialFrequencyCpd, gratingAngleDeg, oneDegPx]);

  if (mode === 'sine_grating') {
    const patchPx = Math.round(Math.min(360 * scaleFactor, oneDegPx * 5));
    return (
      <div
        className="w-full h-full flex items-center justify-center select-none"
        style={{ backgroundColor: 'rgb(128, 128, 128)' }}
      >
        <canvas
          ref={canvasRef}
          width={Math.max(120, patchPx)}
          height={Math.max(120, patchPx)}
          className="rounded-full shadow-sm"
        />
      </div>
    );
  }

  const optoPx = Math.max(14, calculateOptotypeHeightPx(state.calibration, letterLogMAR) * scaleFactor);
  const letters = ['C', 'D', 'H', 'K', 'N'];
  const grayVal = Math.round(255 * (1 - Math.max(0.005, Math.min(1, contrastPercent / 100))));
  const letterColor = `rgb(${grayVal}, ${grayVal}, ${grayVal})`;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white select-none">
      <div className="flex items-center justify-center" style={{ gap: `${optoPx}px` }}>
        {letters.map((sym, i) => (
          <OptotypeSvg key={i} symbol={sym} sizePx={optoPx} color={letterColor} />
        ))}
      </div>
    </div>
  );
};

/**
 * 5. Macular Amsler Grid & Color Vision Screening Plates (Including Interactive Farnsworth D-15)
 */
export const ISHIHARA_PLATES = [
  { number: '12', type: 'Control Plate (All patients read 12)', fgColors: ['#E86F38', '#F2854B'], bgColors: ['#7A9A55', '#8FB065', '#648544'] },
  { number: '8',  type: 'Red-Green Screening (Normal: 8, Deficient: 3)', fgColors: ['#E0634E', '#EB7D6A'], bgColors: ['#8BA862', '#6E914E', '#A3B875'] },
  { number: '29', type: 'Red-Green Screening (Normal: 29, Deficient: 70)', fgColors: ['#DC5B49', '#E67A63'], bgColors: ['#7D9E58', '#96B26E', '#628442'] },
  { number: '5',  type: 'Red-Green Screening (Normal: 5, Deficient: 2)', fgColors: ['#709D54', '#86B369'], bgColors: ['#D96B4E', '#E88367', '#C4553B'] },
  { number: '74', type: 'Red-Green Screening (Normal: 74, Deficient: 21)', fgColors: ['#69964D', '#80AD62'], bgColors: ['#DE6E52', '#EA886E', '#C95A3E'] },
  { number: '45', type: 'Transformation Plate (Normal: 45)', fgColors: ['#E26A48', '#EE8666'], bgColors: ['#7A9E54', '#92B46A', '#60833D'] },
  { number: '6',  type: 'Vanishing Plate (Normal: 6)', fgColors: ['#73A157', '#8BBA6F'], bgColors: ['#DD6C4E', '#EA876B', '#C6563A'] },
  { number: '16', type: 'Protan / Deutan Differentiation (Normal: 16)', fgColors: ['#D85858', '#E67373'], bgColors: ['#788A72', '#8E9F88', '#63735E'] },
];

export const MacularColorDisplay: React.FC<ModuleProps> = ({
  state,
  scaleFactor = 1,
  onUpdateState,
}) => {
  const mode = state.macularColorMode;
  const oneDegPx = Math.max(18, calculateOneDegreePx(state.calibration) * scaleFactor);

  if (mode === 'color_ishihara') {
    const plate = ISHIHARA_PLATES[state.colorPlateIndex % ISHIHARA_PLATES.length];
    const size = Math.min(360 * scaleFactor, oneDegPx * 6);

    const dots: Array<{ cx: number; cy: number; r: number; isFg: boolean; colorIdx: number }> = [];
    for (let ring = 0; ring <= 12; ring++) {
      const count = ring === 0 ? 1 : Math.round(ring * 6.2);
      const rad = ring * 7.5;
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2 + ring * 0.37;
        const cx = 100 + Math.cos(theta) * rad;
        const cy = 100 + Math.sin(theta) * rad;
        const r = 3.1 + ((ring + i) % 3) * 0.65;
        dots.push({ cx, cy, r, isFg: false, colorIdx: (ring + i) % 3 });
      }
    }

    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-900 select-none">
        <svg width={size} height={size} viewBox="0 0 200 200">
          <defs>
            <mask id="ishihara-num-mask">
              <rect x="0" y="0" width="200" height="200" fill="black" />
              <text
                x="100"
                y="134"
                textAnchor="middle"
                fill="white"
                fontSize="96"
                fontWeight="900"
                fontFamily="sans-serif"
              >
                {plate.number}
              </text>
            </mask>
          </defs>
          <circle cx="100" cy="100" r="96" fill="#171717" />
          <g>
            {dots.map((d, idx) => (
              <circle
                key={`bg-${idx}`}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill={plate.bgColors[d.colorIdx % plate.bgColors.length]}
              />
            ))}
          </g>
          <g mask="url(#ishihara-num-mask)">
            {dots.map((d, idx) => (
              <circle
                key={`fg-${idx}`}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill={plate.fgColors[d.colorIdx % plate.fgColors.length]}
              />
            ))}
          </g>
        </svg>
      </div>
    );
  }

  if (mode === 'color_d15') {
    const capSize = Math.max(20, Math.round(44 * scaleFactor));
    const arranged = state.d15ArrangedCaps?.length ? state.d15ArrangedCaps : [0];
    const remaining = state.d15RemainingCaps || [];

    const handlePlaceCap = (capIdx: number) => {
      if (!onUpdateState) return;
      onUpdateState((prev) => ({
        ...prev,
        d15ArrangedCaps: [...(prev.d15ArrangedCaps || [0]), capIdx],
        d15RemainingCaps: (prev.d15RemainingCaps || []).filter((c) => c !== capIdx),
      }));
    };

    const handleRemoveCap = (capIdx: number) => {
      if (!onUpdateState || capIdx === 0) return;
      onUpdateState((prev) => ({
        ...prev,
        d15ArrangedCaps: (prev.d15ArrangedCaps || [0]).filter((c) => c !== capIdx),
        d15RemainingCaps: [...(prev.d15RemainingCaps || []), capIdx],
      }));
    };

    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#121316] gap-6 p-4 select-none font-mono">
        {/* Placed Sequence Tray */}
        <div className="w-full max-w-5xl bg-[#1A1C22] border border-[#2C313D] p-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400">
            ARRANGED SEQUENCE (START FROM REF CAP)
          </div>
          <div className="flex flex-wrap items-center gap-2 min-h-[52px]">
            {arranged.map((capIdx) => (
              <button
                key={`placed-${capIdx}`}
                type="button"
                onClick={() => handleRemoveCap(capIdx)}
                disabled={!onUpdateState || capIdx === 0}
                className={`flex flex-col items-center gap-1 ${
                  onUpdateState && capIdx !== 0 ? 'cursor-pointer hover:scale-105 transition' : ''
                }`}
              >
                <div
                  className={`rounded-full border-2 shadow-md ${
                    capIdx === 0 ? 'border-amber-400' : 'border-neutral-800'
                  }`}
                  style={{
                    width: `${capSize}px`,
                    height: `${capSize}px`,
                    backgroundColor: D15_HUE_CAPS[capIdx],
                  }}
                />
                {capIdx === 0 && (
                  <span className="text-[9px] text-amber-400 font-bold">REF</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Unplaced Shuffled Caps Pool */}
        {remaining.length > 0 && (
          <div className="w-full max-w-5xl bg-[#0D0E12] border border-[#222630] p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">
              SELECT NEXT CLOSEST HUE ({remaining.length} REMAINING)
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {remaining.map((capIdx) => (
                <button
                  key={`rem-${capIdx}`}
                  type="button"
                  onClick={() => handlePlaceCap(capIdx)}
                  disabled={!onUpdateState}
                  className={onUpdateState ? 'cursor-pointer hover:scale-110 transition' : ''}
                >
                  <div
                    className="rounded-full border-2 border-neutral-800 shadow-md"
                    style={{
                      width: `${capSize}px`,
                      height: `${capSize}px`,
                      backgroundColor: D15_HUE_CAPS[capIdx],
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Amsler Grid (20x20 grid)
  const gridPx = Math.min(420 * scaleFactor, oneDegPx * 8);
  const isBlackBg = mode !== 'amsler_inverted';
  const bgColor = isBlackBg ? '#000000' : '#FFFFFF';
  const lineColor = mode === 'amsler_red' ? '#EF4444' : isBlackBg ? '#FFFFFF' : '#000000';
  const lines = Array.from({ length: 21 }, (_, i) => i * 10);

  return (
    <div className="w-full h-full flex items-center justify-center select-none" style={{ backgroundColor: bgColor }}>
      <svg width={gridPx} height={gridPx} viewBox="0 0 200 200">
        {lines.map((pos) => (
          <React.Fragment key={pos}>
            <line x1={pos} y1="0" x2={pos} y2="200" stroke={lineColor} strokeWidth={pos === 100 ? '1.4' : '0.75'} />
            <line x1="0" y1={pos} x2="200" y2={pos} stroke={lineColor} strokeWidth={pos === 100 ? '1.4' : '0.75'} />
          </React.Fragment>
        ))}
        {mode === 'amsler_diagonal' && (
          <>
            <line x1="0" y1="0" x2="200" y2="200" stroke={lineColor} strokeWidth="1.2" />
            <line x1="200" y1="0" x2="0" y2="200" stroke={lineColor} strokeWidth="1.2" />
          </>
        )}
        <circle cx="100" cy="100" r="3.2" fill={mode === 'amsler_red' ? '#EF4444' : lineColor} />
      </svg>
    </div>
  );
};

export interface NearVisionTier {
  id: string;
  jaeger: string;
  nPoint: string;
  mUnit: string;
  snellenDistanceEquiv: string;
  logMAR: number;
  text: string;
}

export const NEAR_VISION_TIERS: NearVisionTier[] = [
  {
    id: 'N4',
    jaeger: 'J1+',
    nPoint: 'N4',
    mUnit: '0.4M',
    snellenDistanceEquiv: '20/20',
    logMAR: 0.0,
    text: 'Accommodation declines progressively with age due to decreased elasticity of the crystalline lens capsule. Precise near point refraction determines the optimal reading addition for comfortable binocular focus at forty centimeters.',
  },
  {
    id: 'N5',
    jaeger: 'J1',
    nPoint: 'N5',
    mUnit: '0.5M',
    snellenDistanceEquiv: '20/25',
    logMAR: 0.1,
    text: 'Presbyopia manifests when the accommodative amplitude drops below three diopters, necessitating plus lens addition for standard reading and digital screen tasks.',
  },
  {
    id: 'N6',
    jaeger: 'J2',
    nPoint: 'N6',
    mUnit: '0.6M',
    snellenDistanceEquiv: '20/30',
    logMAR: 0.2,
    text: 'Standard newsprint and mobile device typography correspond to this visual acuity level. Refinement of spherical reading power ensures clear vision without ocular strain.',
  },
  {
    id: 'N8',
    jaeger: 'J3',
    nPoint: 'N8',
    mUnit: '0.8M',
    snellenDistanceEquiv: '20/40',
    logMAR: 0.3,
    text: 'Comfortable reading vision requires a reserve of at least one third of total accommodative amplitude to prevent asthenopia during prolonged near work.',
  },
  {
    id: 'N10',
    jaeger: 'J7',
    nPoint: 'N10',
    mUnit: '1.0M',
    snellenDistanceEquiv: '20/50',
    logMAR: 0.4,
    text: 'Graded reading paragraphs provide standardized text for evaluating reading fluency, critical print size, and optimal magnification for presbyopic correction.',
  },
  {
    id: 'N14',
    jaeger: 'J10',
    nPoint: 'N14',
    mUnit: '1.6M',
    snellenDistanceEquiv: '20/80',
    logMAR: 0.6,
    text: 'Large print reading cards assist in determining low-vision requirements and intermediate working distance adaptations.',
  },
  {
    id: 'N18',
    jaeger: 'J14',
    nPoint: 'N18',
    mUnit: '2.0M',
    snellenDistanceEquiv: '20/100',
    logMAR: 0.7,
    text: 'HIGH CONTRAST HEADLINE FOR RAPID NEAR ACUITY SCREENING AND MONOCULAR OCCLUSION VERIFICATION.',
  },
];

/**
 * Calibrated 40cm Presbyopia Reading Card Display
 * Renders standardized optometric paragraphs (N4 to N18 / J1+ to J14)
 * with millimeter-calibrated optical scaling and near ADD controls.
 */
export const NearReadingCardDisplay: React.FC<ModuleProps> = ({
  state,
  scaleFactor = 1,
  onUpdateState,
}) => {
  const [isolatedTierId, setIsolatedTierId] = React.useState<string | 'ALL'>('ALL');

  // Exact optical scaling at 40cm (0.40m) viewing distance
  const ppm = getPixelsPerMm(state.calibration);
  const dMeters = 0.40; // Calibrated 40cm working distance
  const fiveArcMinRad = (5 * Math.PI) / (60 * 180);

  const calculateNearFontPx = (logMAR: number) => {
    const angleRad = fiveArcMinRad * Math.pow(10, logMAR);
    const capHeightMm = 2 * (dMeters * 1000) * Math.tan(angleRad / 2);
    const capHeightPx = capHeightMm * ppm * scaleFactor;
    // Standard serif font cap-height ratio is ~0.70 of total font size
    const fontSize = capHeightPx / 0.70;
    // Ensure readable minimum in scaled down doctor previews
    return Math.max(10 * scaleFactor, Math.round(fontSize * 10) / 10);
  };

  const isDark = state.invertPolarity;
  const cardBg = isDark ? '#0A0C10' : '#FAFAFA';
  const cardBorder = isDark ? '#1F2430' : '#E5E7EB';
  const textColor = isDark ? '#E2E8F0' : '#111827';
  const metaColor = isDark ? '#94A3B8' : '#6B7280';

  const odAdd = state.refraction?.od?.add ?? 0;
  const osAdd = state.refraction?.os?.add ?? 0;

  const handleStepAdd = (delta: number) => {
    if (!onUpdateState) return;
    onUpdateState((prev) => ({
      ...prev,
      refraction: {
        ...prev.refraction,
        od: {
          ...prev.refraction.od,
          add: Math.max(0, Math.min(4.0, Math.round((prev.refraction.od.add + delta) * 100) / 100)),
        },
        os: {
          ...prev.refraction.os,
          add: Math.max(0, Math.min(4.0, Math.round((prev.refraction.os.add + delta) * 100) / 100)),
        },
      },
    }));
  };

  const visibleTiers =
    isolatedTierId === 'ALL'
      ? NEAR_VISION_TIERS
      : NEAR_VISION_TIERS.filter((t) => t.id === isolatedTierId);

  return (
    <div
      className="w-full h-full flex flex-col items-center select-none overflow-y-auto p-3 sm:p-6"
      style={{ backgroundColor: isDark ? '#050608' : '#E5E7EB' }}
    >
      {/* Telemetry Header Bar */}
      <div className="w-full max-w-4xl bg-[#0D0F14] border border-[#1E2330] p-2.5 sm:p-3 rounded mb-3 font-mono text-xs flex flex-wrap items-center justify-between gap-2 sm:gap-3 shadow">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded font-bold text-[10px] sm:text-xs">
            CALIBRATED 40 CM (16 IN)
          </span>
          <span className="text-neutral-400 text-[11px] sm:text-xs hidden sm:inline">
            ACCOMMODATIVE DEMAND: <strong className="text-white">+2.50 D</strong>
          </span>
        </div>

        {/* Near ADD Refinement Stepper */}
        <div className="flex items-center gap-2">
          <span className="text-neutral-400 text-[11px] sm:text-xs">ADD:</span>
          <span className="font-bold text-amber-400 font-mono text-[11px] sm:text-xs">
            OD +{odAdd.toFixed(2)} / OS +{osAdd.toFixed(2)}
          </span>
          {onUpdateState && (
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => handleStepAdd(-0.25)}
                className="px-2 py-0.5 bg-[#1A1F2C] hover:bg-[#252C3E] text-neutral-200 border border-[#2D3548] rounded cursor-pointer text-xs"
              >
                −0.25
              </button>
              <button
                type="button"
                onClick={() => handleStepAdd(0.25)}
                className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded cursor-pointer text-xs"
              >
                +0.25
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Paragraph Tier Filter Buttons */}
      <div className="w-full max-w-4xl flex items-center justify-start gap-1.5 overflow-x-auto pb-2 mb-3 font-mono text-[11px]">
        <button
          type="button"
          onClick={() => setIsolatedTierId('ALL')}
          className={`px-2.5 py-1 rounded border cursor-pointer shrink-0 ${
            isolatedTierId === 'ALL'
              ? 'bg-amber-500 text-black border-amber-400 font-bold'
              : 'bg-[#12151E] text-neutral-400 border-[#222836]'
          }`}
        >
          ALL (FULL CARD)
        </button>
        {NEAR_VISION_TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => setIsolatedTierId(tier.id)}
            className={`px-2 py-1 rounded border cursor-pointer shrink-0 ${
              isolatedTierId === tier.id
                ? 'bg-amber-500 text-black border-amber-400 font-bold'
                : 'bg-[#12151E] text-neutral-400 border-[#222836]'
            }`}
          >
            {tier.id} ({tier.jaeger})
          </button>
        ))}
      </div>

      {/* Calibrated Reading Card Body */}
      <div
        className="w-full max-w-4xl shadow-xl border rounded p-4 sm:p-8 space-y-4 sm:space-y-6 transition-colors"
        style={{
          backgroundColor: cardBg,
          borderColor: cardBorder,
          color: textColor,
        }}
      >
        <div className="border-b pb-2 sm:pb-3 mb-3 sm:mb-4 flex items-center justify-between" style={{ borderColor: cardBorder }}>
          <span className="font-serif font-black tracking-wider text-xs sm:text-sm uppercase">
            Standard Optometric Near Vision Reading Card
          </span>
          <span className="font-mono text-[9px] sm:text-[10px]" style={{ color: metaColor }}>
            ISO 8596 CALIBRATED • 40 CM
          </span>
        </div>

        {visibleTiers.map((tier) => {
          const fontPx = calculateNearFontPx(tier.logMAR);
          return (
            <div
              key={tier.id}
              className="space-y-1 sm:space-y-1.5 pb-3 sm:pb-4 border-b last:border-b-0 cursor-pointer hover:opacity-90"
              style={{ borderColor: cardBorder }}
              onClick={() => setIsolatedTierId(isolatedTierId === tier.id ? 'ALL' : tier.id)}
            >
              <div className="flex items-center gap-2 font-mono text-[9px] sm:text-[10px]" style={{ color: metaColor }}>
                <span className="font-bold text-amber-500">[{tier.id}]</span>
                <span>{tier.jaeger}</span>
                <span>•</span>
                <span>{tier.mUnit}</span>
                <span>•</span>
                <span>{tier.snellenDistanceEquiv}</span>
                <span>•</span>
                <span>LogMAR +{tier.logMAR.toFixed(1)}</span>
              </div>
              <p
                className="font-serif leading-relaxed text-justify"
                style={{ fontSize: `${fontPx}px` }}
              >
                {tier.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

