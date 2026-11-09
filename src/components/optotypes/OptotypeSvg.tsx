import React from 'react';

interface OptotypeSvgProps {
  symbol: string;
  sizePx: number;
  color?: string;
  opacity?: number;
  dyopDirection?: 'cw' | 'ccw';
  dyopRpm?: number;
  className?: string;
}

/**
 * Renders mathematically exact 5x5 grid vector optotypes (ISO 8596 / ETDRS 1:5 stroke-to-height ratio).
 * In the 5x5 coordinate space:
 * - Total bounding box: 5.0 x 5.0 units (5 arcminutes at 0.0 LogMAR)
 * - Stroke width & critical gap: 1.0 unit (1 arcminute at 0.0 LogMAR)
 */
export const OptotypeSvg: React.FC<OptotypeSvgProps> = ({
  symbol,
  sizePx,
  color = 'currentColor',
  opacity = 1,
  dyopDirection = 'cw',
  dyopRpm = 40,
  className = '',
}) => {
  const renderGlyph = () => {
    switch (symbol) {
      // === LANDOLT C (8 Orientations) ===
      case 'C':
      case 'C_RIGHT':
      case 'C_DOWN':
      case 'C_LEFT':
      case 'C_UP':
      case 'C_UP_RIGHT':
      case 'C_DOWN_RIGHT':
      case 'C_DOWN_LEFT':
      case 'C_UP_LEFT': {
        const angleMap: Record<string, number> = {
          C: 0,
          C_RIGHT: 0,
          C_DOWN_RIGHT: 45,
          C_DOWN: 90,
          C_DOWN_LEFT: 135,
          C_LEFT: 180,
          C_UP_LEFT: 225,
          C_UP: 270,
          C_UP_RIGHT: 315,
        };
        const rot = angleMap[symbol] ?? 0;
        const maskId = `landolt-mask-${symbol}-${Math.random().toString(36).slice(2, 7)}`;
        return (
          <g transform={`rotate(${rot} 2.5 2.5)`}>
            <defs>
              <mask id={maskId}>
                <rect x="-1" y="-1" width="7" height="7" fill="white" />
                {/* Inner hole of radius 1.5 (diameter 3.0) */}
                <circle cx="2.5" cy="2.5" r="1.5" fill="black" />
                {/* 1-unit gap on the right side (y from 2.0 to 3.0) */}
                <rect x="2.5" y="2.0" width="3.0" height="1.0" fill="black" />
              </mask>
            </defs>
            <circle cx="2.5" cy="2.5" r="2.5" fill={color} mask={`url(#${maskId})`} />
          </g>
        );
      }

      // === TUMBLING E (4 Orientations) & SNELLEN E ===
      case 'E':
      case 'E_RIGHT':
      case 'E_DOWN':
      case 'E_LEFT':
      case 'E_UP': {
        const angleMap: Record<string, number> = {
          E: 0,
          E_RIGHT: 0,
          E_DOWN: 90,
          E_LEFT: 180,
          E_UP: 270,
        };
        const rot = angleMap[symbol] ?? 0;
        return (
          <g transform={`rotate(${rot} 2.5 2.5)`} fill={color}>
            {/* Left vertical spine (width 1, height 5) */}
            <rect x="0" y="0" width="1" height="5" />
            {/* Top bar */}
            <rect x="0" y="0" width="5" height="1" />
            {/* Middle bar */}
            <rect x="0" y="2" width="4.5" height="1" />
            {/* Bottom bar */}
            <rect x="0" y="4" width="5" height="1" />
          </g>
        );
      }

      // === SLOAN & SNELLEN LETTERS (5x5 Grid, 1-unit stroke) ===
      case 'D':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M0,0 H2.6 A2.4,2.5 0 0,1 5,2.5 A2.4,2.5 0 0,1 2.6,5 H0 Z M1,1 V4 H2.5 A1.4,1.5 0 0,0 4,2.5 A1.4,1.5 0 0,0 2.5,1 Z"
          />
        );

      case 'H':
        return (
          <path
            fill={color}
            d="M0,0 H1 V2 H4 V0 H5 V5 H4 V3 H1 V5 H0 Z"
          />
        );

      case 'K':
        return (
          <path
            fill={color}
            d="M0,0 H1 V2.1 L3.7,0 H5 L2.2,2.3 L5,5 H3.6 L1.5,3 L1,3.4 V5 H0 Z"
          />
        );

      case 'N':
        return (
          <path
            fill={color}
            d="M0,0 H1.1 L4,3.6 V0 H5 V5 H3.9 L1,1.4 V5 H0 Z"
          />
        );

      case 'O':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M2.5,0 A2.5,2.5 0 1,1 2.499,0 Z M2.5,1 A1.5,1.5 0 1,0 2.501,1 Z"
          />
        );

      case 'R':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M0,0 H3 A1.6,1.5 0 0,1 4.6,1.5 A1.5,1.4 0 0,1 3.4,2.9 L5,5 H3.8 L2.3,3 H1 V5 H0 Z M1,1 V2 H2.9 A0.6,0.5 0 0,0 3.5,1.5 A0.6,0.5 0 0,0 2.9,1 Z"
          />
        );

      case 'S':
        return (
          <path
            fill={color}
            d="M4.8,1.3 H3.7 C3.6,0.9 3.1,0.8 2.5,0.8 C1.6,0.8 1.1,1.0 1.1,1.4 C1.1,1.8 1.6,1.9 2.7,2.1 C4.1,2.3 5,2.7 5,3.6 C5,4.5 4.0,5 2.5,5 C1.0,5 0.1,4.4 0,3.5 H1.1 C1.2,4.0 1.7,4.2 2.5,4.2 C3.4,4.2 3.9,3.9 3.9,3.6 C3.9,3.2 3.4,3.0 2.2,2.8 C0.9,2.6 0.1,2.2 0.1,1.4 C0.1,0.5 1.1,0 2.5,0 C3.9,0 4.7,0.5 4.8,1.3 Z"
          />
        );

      case 'V':
        return (
          <path
            fill={color}
            d="M0,0 H1.1 L2.5,3.7 L3.9,0 H5 L3.0,5 H2.0 Z"
          />
        );

      case 'Z':
        return (
          <path
            fill={color}
            d="M0,0 H5 V1 L1.4,4 H5 V5 H0 V4 L3.6,1 H0 Z"
          />
        );

      case 'F':
        return (
          <path
            fill={color}
            d="M0,0 H5 V1 H1 V2 H4.2 V3 H1 V5 H0 Z"
          />
        );

      case 'L':
        return (
          <path
            fill={color}
            d="M0,0 H1 V4 H5 V5 H0 Z"
          />
        );

      case 'P':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M0,0 H3.1 A1.6,1.5 0 0,1 4.8,1.5 A1.6,1.5 0 0,1 3.1,3 H1 V5 H0 Z M1,1 V2 H3.0 A0.7,0.5 0 0,0 3.7,1.5 A0.7,0.5 0 0,0 3.0,1 Z"
          />
        );

      case 'T':
        return (
          <path
            fill={color}
            d="M0,0 H5 V1 H3 V5 H2 V1 H0 Z"
          />
        );

      // === NUMBERS (5x5 Grid) ===
      case '2':
        return (
          <path
            fill={color}
            d="M0.2,1.6 A2.3,1.6 0 0,1 2.5,0 A2.3,1.5 0 0,1 4.8,1.5 C4.8,2.4 4.0,3.0 1.6,4.0 H5 V5 H0 V4.1 C2.8,2.6 3.7,2.1 3.7,1.5 A1.2,0.7 0 0,0 2.5,0.9 A1.2,0.8 0 0,0 1.3,1.6 Z"
          />
        );

      case '3':
        return (
          <path
            fill={color}
            d="M0.2,1.2 C0.4,0.4 1.3,0 2.5,0 C3.9,0 4.8,0.6 4.8,1.4 C4.8,2.0 4.3,2.3 3.6,2.4 C4.4,2.6 5.0,3.0 5.0,3.7 C5.0,4.5 4.0,5.0 2.5,5.0 C1.1,5.0 0.2,4.5 0,3.6 H1.1 C1.2,4.0 1.8,4.2 2.5,4.2 C3.3,4.2 3.9,3.9 3.9,3.5 C3.9,3.1 3.3,2.9 2.2,2.9 H1.8 V2.1 H2.2 C3.2,2.1 3.7,1.8 3.7,1.4 C3.7,1.0 3.2,0.8 2.5,0.8 C1.8,0.8 1.3,1.0 1.2,1.4 Z"
          />
        );

      case '4':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M3.0,0 H4.0 V3.2 H5.0 V4.1 H4.0 V5.0 H3.0 V4.1 H0 V3.2 Z M3.0,1.2 L1.1,3.2 H3.0 Z"
          />
        );

      case '5':
        return (
          <path
            fill={color}
            d="M0.3,0 H4.7 V0.9 H1.2 L1.0,2.0 C1.5,1.7 2.1,1.6 2.7,1.6 C4.1,1.6 5.0,2.3 5.0,3.3 C5.0,4.3 4.0,5.0 2.5,5.0 C1.1,5.0 0.2,4.4 0,3.5 H1.1 C1.2,3.9 1.7,4.1 2.5,4.1 C3.3,4.1 3.9,3.8 3.9,3.3 C3.9,2.7 3.3,2.4 2.5,2.4 C1.8,2.4 1.3,2.6 1.0,2.9 L0.1,2.7 Z"
          />
        );

      case '6':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M4.7,1.2 H3.6 C3.4,0.9 3.0,0.8 2.6,0.8 C1.6,0.8 1.1,1.4 1.0,2.3 C1.5,1.9 2.0,1.8 2.7,1.8 C4.0,1.8 5.0,2.4 5.0,3.4 C5.0,4.4 4.0,5.0 2.6,5.0 C1.0,5.0 0,4.0 0,2.6 C0,1.0 1.0,0 2.6,0 C3.8,0 4.5,0.4 4.7,1.2 Z M2.5,2.6 C1.7,2.6 1.2,2.9 1.2,3.4 C1.2,3.9 1.7,4.2 2.5,4.2 C3.3,4.2 3.9,3.9 3.9,3.4 C3.9,2.9 3.3,2.6 2.5,2.6 Z"
          />
        );

      case '8':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M2.5,0 C3.9,0 4.8,0.5 4.8,1.3 C4.8,1.9 4.4,2.2 3.7,2.4 C4.5,2.6 5.0,3.0 5.0,3.7 C5.0,4.5 4.0,5.0 2.5,5.0 C1.0,5.0 0,4.5 0,3.7 C0,3.0 0.5,2.6 1.3,2.4 C0.6,2.2 0.2,1.9 0.2,1.3 C0.2,0.5 1.1,0 2.5,0 Z M2.5,0.8 C1.7,0.8 1.3,1.0 1.3,1.4 C1.3,1.8 1.7,2.0 2.5,2.0 C3.3,2.0 3.7,1.8 3.7,1.4 C3.7,1.0 3.3,0.8 2.5,0.8 Z M2.5,2.8 C1.6,2.8 1.1,3.1 1.1,3.6 C1.1,4.0 1.6,4.2 2.5,4.2 C3.4,4.2 3.9,4.0 3.9,3.6 C3.9,3.1 3.4,2.8 2.5,2.8 Z"
          />
        );

      case '9':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M0.3,3.8 H1.4 C1.6,4.1 2.0,4.2 2.4,4.2 C3.4,4.2 3.9,3.6 4.0,2.7 C3.5,3.1 3.0,3.2 2.3,3.2 C1.0,3.2 0,2.6 0,1.6 C0,0.6 1.0,0 2.4,0 C4.0,0 5.0,1.0 5.0,2.4 C5.0,4.0 4.0,5.0 2.4,5.0 C1.2,5.0 0.5,4.6 0.3,3.8 Z M2.5,0.8 C1.7,0.8 1.1,1.1 1.1,1.6 C1.1,2.1 1.7,2.4 2.5,2.4 C3.3,2.4 3.8,2.1 3.8,1.6 C3.8,1.1 3.3,0.8 2.5,0.8 Z"
          />
        );

      // === PEDIATRIC STANDARDIZED SYMBOLS (LEA / ISO Style 5x5 Stroke) ===
      case 'SQUARE':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M0.2,0.2 H4.8 V4.8 H0.2 Z M1.1,1.1 V3.9 H3.9 V1.1 Z"
          />
        );

      case 'CIRCLE':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M2.5,0 A2.5,2.5 0 1,1 2.499,0 Z M2.5,0.95 A1.55,1.55 0 1,0 2.501,0.95 Z"
          />
        );

      case 'HOUSE':
        return (
          <path
            fill={color}
            fillRule="evenodd"
            d="M2.5,0 L4.9,2.1 V5.0 H0.1 V2.1 Z M2.5,1.25 L1.05,2.5 V4.05 H3.95 V2.5 Z"
          />
        );

      case 'APPLE':
        return (
          <g fill={color}>
            {/* Stem */}
            <rect x="2.2" y="0" width="0.6" height="0.9" rx="0.2" />
            {/* Symmetrical Apple / Heart Outline */}
            <path
              fillRule="evenodd"
              d="M2.5,1.0 C1.8,0.5 0.1,0.8 0.1,2.3 C0.1,3.7 1.7,4.7 2.5,5.0 C3.3,4.7 4.9,3.7 4.9,2.3 C4.9,0.8 3.2,0.5 2.5,1.0 Z M2.5,1.9 C2.9,1.5 3.9,1.6 3.9,2.35 C3.9,3.2 2.9,3.85 2.5,4.05 C2.1,3.85 1.1,3.2 1.1,2.35 C1.1,1.6 2.1,1.5 2.5,1.9 Z"
            />
          </g>
        );

      // === DYOP (Dynamic Segmented Spinning Ring) ===
      case 'DYOP_RING': {
        const durationSec = Math.max(0.5, 60 / Math.max(5, dyopRpm));
        return (
          <g
            style={{
              transformOrigin: '2.5px 2.5px',
              animation: `spin-${dyopDirection} ${durationSec}s linear infinite`,
            }}
          >
            <circle
              cx="2.5"
              cy="2.5"
              r="2.0"
              fill="none"
              stroke={color}
              strokeWidth="1.0"
              strokeDasharray="0.785 0.785"
            />
          </g>
        );
      }

      default:
        return (
          <text
            x="2.5"
            y="4.3"
            textAnchor="middle"
            fill={color}
            fontSize="4.8"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {symbol}
          </text>
        );
    }
  };

  return (
    <svg
      viewBox="0 0 5 5"
      width={sizePx}
      height={sizePx}
      style={{
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        opacity,
        flexShrink: 0,
      }}
      className={`select-none overflow-visible ${className}`}
      aria-label={symbol}
    >
      {renderGlyph()}
    </svg>
  );
};
