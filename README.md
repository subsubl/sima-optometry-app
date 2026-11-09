# SIMA Optometry App

[![Version](https://img.shields.io/badge/version-1.0.1-amber.svg?style=flat-square)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![ISO 8596 Compliant](https://img.shields.io/badge/Optotypes-ISO%208596%20%2F%20ETDRS-emerald.svg?style=flat-square)](#precision-iso-8596--etdrs-trigonometric-calibration)
[![React 18](https://img.shields.io/badge/React-18.3.1-61dafb.svg?style=flat-square)](https://react.dev/)
[![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6.2-3178c6.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg?style=flat-square)](https://nodejs.org/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ed.svg?style=flat-square)](#docker-deployment-instant-lan-access)
[![Electron Distribution](https://img.shields.io/badge/Electron-Linux%20AppImage%20%26%20deb-47848F.svg?style=flat-square)](#desktop-app-electron-multi-monitor-mode)

**SIMA Optometry App** is a clinical-grade digital visual acuity projection and subjective refraction examination suite engineered for modern optometry clinics, ophthalmology lanes, and refractive surgery centers. It pairs a distraction-free, mathematically calibrated **Patient Display** with an ergonomic, dark-adapted **Doctor Remote Console** (`#08090C`, `#0D0F14`, tactical amber `#F59E0B`), synchronized bidirectionally in real time via an enterprise-grade WebSocket engine.

---

## Table of Contents

- [Architectural Overview](#architectural-overview)
- [What's New in Version 1.0.1](#whats-new-in-version-101)
- [Digital Phoropter Console](#digital-phoropter-console)
- [Clinical Optometry Testing Capabilities](#clinical-optometry-testing-capabilities)
  - [1. Precision ISO 8596 / ETDRS Trigonometric Calibration](#1-precision-iso-8596--etdrs-trigonometric-calibration)
  - [2. Jackson Cross-Cylinder (JCC) Simulator](#2-jackson-cross-cylinder-jcc-simulator)
  - [3. Duochrome Chromatic Defocus & RAM-GAP Guidance](#3-duochrome-chromatic-defocus--ram-gap-guidance)
  - [4. Calibrated 40cm Presbyopia Reading Card](#4-calibrated-40cm-presbyopia-reading-card)
  - [5. Astigmatism Dial & Sunburst Fan Suite](#5-astigmatism-dial--sunburst-fan-suite)
  - [6. Contrast Sensitivity & Sine-Wave Gratings](#6-contrast-sensitivity--sine-wave-gratings)
  - [7. Binocular Balance & Worth 4-Dot Test](#7-binocular-balance--worth-4-dot-test)
  - [8. Computerized eETDRS Staircase Wizard](#8-computerized-eetdrs-staircase-wizard)
  - [9. Macular Assessment & Farnsworth D-15 Color Arrangement](#9-macular-assessment--farnsworth-d-15-color-arrangement)
- [High-LogMAR Acuity Scoring Math Correction](#high-logmar-acuity-scoring-math-correction)
- [Multi-Screen Real-Time WebSocket Synchronization](#multi-screen-real-time-websocket-synchronization)
- [Performance & Rendering Optimizations](#performance--rendering-optimizations)
- [Keyboard & Remote Hotkeys](#keyboard--remote-hotkeys)
- [Installation, Build, & Deployment](#installation-build--deployment)
  - [Quick Start](#quick-start)
  - [Production Web Build](#production-web-build)
  - [Automated Unit & Stress Testing](#automated-unit--stress-testing)
  - [Linux Desktop Distribution Packages (AppImage & DEB)](#linux-desktop-distribution-packages-appimage--deb)
  - [Docker Container Deployment](#docker-container-deployment)
  - [Multi-Monitor Exam Lane Setup (Electron Host)](#multi-monitor-exam-lane-setup-electron-host)
  - [Wireless LAN Tablet & iPad Remote Pairing](#wireless-lan-tablet--ipad-remote-pairing)
- [Authoritative Standards & Citations](#authoritative-standards--citations)
- [License](#license)

---

## Architectural Overview

SIMA Optometry App is architected into four decoupled layers designed for latency-critical clinical interactions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHYSICAL EXAM LANE                              │
│                                                                        │
│  ┌────────────────────────┐                  ┌──────────────────────┐  │
│  │     PATIENT DISPLAY    │                  │ DOCTOR REMOTE CONSOLE│  │
│  │ (Secondary / Projector)│                  │  (Primary / Tablet)  │  │
│  │  - Zero UI Clutter     │                  │  - Tactical Phoropter│  │
│  │  - ISO 8596 Optotypes  │                  │  - Live SE Readouts  │  │
│  │  - Folded Lane Mirror  │                  │  - Letter Scoring    │  │
│  └───────────▲────────────┘                  └──────────▲───────────┘  │
│              │                                          │              │
└──────────────┼──────────────────────────────────────────┼──────────────┘
               │                                          │
       WebSocket (Local LAN)                      WebSocket (Local LAN)
       Fallback: BroadcastChannel                 Fallback: BroadcastChannel
               │                                          │
┌──────────────▼──────────────────────────────────────────▼──────────────┐
│                    NODE.JS / ESM SYNCHRONIZATION SERVER                │
│                                                                        │
│  • Causal Message Envelope Sequencing (Monotonic Seq + Origin UUID)     │
│  • Origin-Based Echo Suppression                                       │
│  • 25-Second RFC 6455 Ping/Pong Heartbeat & Zombie Socket Reaper        │
│  • Defensive State Sanitization & Boundary Clamping Engine              │
│  • Cold-Start State Hydration & In-Memory QR Code Rasterization Cache   │
│  • Embedded Express Static Host (Port 3020)                            │
└──────────────────────────────────▲─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│                    DELIVERY & RUNTIME TARGETS                          │
│                                                                        │
│  1. Web App (Vite + React 18 + Tailwind CSS v4)                        │
│  2. Dual-Window Desktop Host (Electron 45 + electron-builder)           │
│  3. Production Multi-Stage Container (Docker Alpine + Node 20)          │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Presentation Layer (Patient Display)**: High-precision lane display rendering pure vector optotypes (Sloan, Snellen, Landolt C, Tumbling E, Numbers, HOTV, Pediatric, spinning Dyops), specialized astigmatic dials, Duochrome splits, and calibrated reading cards. Fully responsive to arbitrary room throw distances ($0.4\text{m} - 8.0\text{m}$) and folded mirror setups.
2. **Controller Layer (Doctor Remote Console)**: Tactical dark phoropter command center (`#08090C`, `#0D0F14`) allowing clinicians to remotely step chart size, isolate lines/columns/letters, evaluate letter scores, and control full OD/OS digital phoropter dials (Sphere, Cylinder, Axis, PD, Prism, Near ADD, and Occlusion).
3. **Synchronization Layer**: Bidirectional WebSocket backbone with versioned message envelopes (`type`, `senderId`, `seq`, `timestamp`, `payload`), origin-based echo suppression, causal sequence ordering, automatic exponential backoff reconnection with jitter, and server-side zombie socket reaping.
4. **Execution & Distribution Layer**: Packaged for web browsers (`npm run build`), native Linux desktop environments with automatic multi-monitor routing (`npm run dist:linux`), and containerized cloud/on-premise deployments (`docker compose up --build`).

---

## What's New in Version 1.0.1

### Version 1.0.1 Highlights & Changelog

- **Digital Phoropter Console Deck (`DigitalPhoropterConsole.tsx`)**:
  - Full OD (Tactical Amber) and OS (Emerald) refraction bays integrated beneath the optical viewport.
  - Sphere dials: $-20.00\text{ D}$ to $+20.00\text{ D}$ ($\pm 0.25\text{ D}$ fine, $\pm 1.00\text{ D}$ coarse).
  - Cylinder dials: $-10.00\text{ D}$ to $+10.00\text{ D}$ ($\pm 0.25\text{ D}$ fine, $\pm 1.00\text{ D}$ coarse).
  - Axis dials: $1^\circ$ to $180^\circ$ cyclic modulo arithmetic ($\pm 1^\circ$ fine, $\pm 5^\circ$ rotary, cardinal presets $90^\circ, 180^\circ, 45^\circ, 135^\circ$).
  - Monocular PD ($25.0 - 40.0\text{ mm}$) and Binocular PD ($50.0 - 80.0\text{ mm}$) with toggleable synchronous link.
  - Prism Diopters ($0.0 - 20.0\ \Delta$ in $0.5\ \Delta$ steps) with cyclic base orientation (`IN` $\to$ `OUT` $\to$ `UP` $\to$ `DOWN`).
  - Near Addition (ADD): $0.00\text{ D}$ to $+4.00\text{ D}$ with live $40\text{cm}$ working distance accommodative demand and Total Near Power readouts.
  - Aperture Occlusion: `OPEN`, `OCCLUDED`, and `PINHOLE` modes with instant 1-click eye isolation (`OD`, `OU`, `OS`).
  - Optical Transposition: Instant 1-click transformation between minus-cylinder and plus-cylinder notation.
  - Real-time Spherical Equivalent ($SE = S + C/2$) readout.

- **Jackson Cross-Cylinder (JCC) Simulator (`JccCrossCylinderDisplay`)**:
  - Interactive 19-dot hexagonal honeycomb fixation target.
  - Position 1 vs Position 2 flip toggle with color-coded power indicators.
  - Dual clinical refinement modes: `AXIS` mode (straddling cylinder axis at $\pm 45^\circ$ with "Chase the Red" steer actions) and `POWER` mode (aligned parallel and perpendicular to cylinder axis).
  - Power step toggle ($\pm 0.25\text{ D}$ vs $\pm 0.50\text{ D}$) with automatic Spherical Equivalent preservation ($\pm 0.25\text{ D}$ sphere compensation for every $0.50\text{ D}$ cylinder change).

- **Duochrome RAM-GAP Clinical Guidance & Optotype Harmonization**:
  - Standardized bilateral symmetric matched Sloan letter pairs (`OE`, `DHZ`, `RCK`, `VSN`) across red ($~625\text{nm}$) and green ($~535\text{nm}$) fields to eliminate character legibility and astigmatic meridian bias.
  - Integrated 1-click **RAM-GAP** (*Red Add Minus, Green Add Plus*) steer buttons with instant sphere adjustments ($-0.25\text{ D}$ Red / $+0.25\text{ D}$ Green) and chromatic balance confirmation lock.

- **Calibrated 40cm Near Vision Presbyopia Reading Card (`NearReadingCardDisplay`)**:
  - Optometrically calibrated for standard $40\text{cm}$ ($16\text{ in}$) reading distance with $+2.50\text{ D}$ accommodative demand.
  - Graded paragraphs across 7 standardized tiers: **N4** ($J1+$, $0.4\text{M}$, $20/20$) through **N18** ($J14$, $2.0\text{M}$, $20/100$).
  - Tier isolation buttons and direct Near ADD refinement steppers.

- **High-LogMAR Acuity Scoring Math Correction (`acuityMath.ts`)**:
  - Dynamic optotype count denominator for lines with 1 to 4 letters ($20/400$ to $20/100$), eliminating false penalties and ghost scores.
  - Mathematical majority-rule passing thresholds ($\ge 1$ of $1-2$, $\ge 2$ of $3-4$, $\ge 3$ of $5$).
  - Clamped clinical hotkeys (`1`–`5`, `[`, `]`) preventing mutation of unrendered letters.

- **WebSocket Synchronization Hardening & Server Resilience (`server/index.mjs` & `useExamSync.ts`)**:
  - Protocol message envelope (`SyncMessageEnvelope`) with monotonic sequence numbers, persistent client session UUIDs, and origin-based echo suppression.
  - Causal sequence ordering preventing retrograde packet overwrite.
  - 25-second server ping/pong heartbeat with automatic zombie socket reaper for mobile/tablet drops.
  - Cold-start calibration resilience bootstrapping server state on patient display connection.
  - In-memory QR code cache (`qrMemoryCache`) eliminating redundant PNG rasterization.
  - Client-side exponential backoff reconnection with bounded random jitter.
  - Pure React state updaters isolating network and storage side-effects outside `setState`.

- **Performance & Build Optimizations**:
  - **97.4% build module transformation reduction**: Pruned heavy icon library import in favor of inline vector SVG, slashing transformed modules from 1,590 to 41 and cutting build duration from 1.88s to 0.93s.
  - **Pure Vector Landolt C Path**: Replaced dynamic SVG masks and random DOM IDs with a mathematically exact closed vector arc, eliminating GPU mask churn and DOM texture thrashing.
  - **ChartStage Pagination Double-Render Elimination**: Refactored layout calculation to use synchronous memoization (`useRef` + `useMemo`), resolving stationary chart views in a single render pass.
  - **Tactical Dark Amber Palette**: Refined custom dark range sliders and replaced brand cyan with tactical amber `#F59E0B`.

- **Test Suite Expansion**:
  - Total automated unit tests expanded to **178 passing tests** across 10 test files (100% pass rate), covering acuity math permutations, refraction arithmetic, cyclic axis wrap-around, JCC flip mechanics, and live server sync fuzzing.

---

## Digital Phoropter Console

Mounted directly below the central optical viewport in the Doctor Remote Console, the **Digital Phoropter Console** provides tactile, responsive control over subjective refraction parameters for both right (OD) and left (OS) eyes:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              DIGITAL PHOROPTER CONSOLE                                 │
│  [Tested Eye: OD | OU | OS]   [Linked PD: ON]   [Transpose Form]   [Zero Prescription] │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│        RIGHT EYE (OD) — AMBER BAY        │         LEFT EYE (OS) — EMERALD BAY         │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│  SPHERE:   [-1.00] [-0.25] +0.00 [+0.25] [+1.00]   │  SPHERE:   [-1.00] [-0.25] +0.00 [+0.25] [+1.00] │
│  CYLINDER: [-1.00] [-0.25] -0.50 [+0.25] [+1.00]   │  CYLINDER: [-1.00] [-0.25]  0.00 [+0.25] [+1.00] │
│  AXIS:     [-5°]   [-1°]   180°  [+1°]   [+5°]     │  AXIS:     [-5°]   [-1°]   090°  [+1°]   [+5°]    │
│  PRESETS:  [90°]   [180°]  [45°] [135°]            │  PRESETS:  [90°]   [180°]  [45°] [135°]           │
│  PD:       [-0.5]  32.0 mm [+0.5] (Mono)           │  PD:       [-0.5]  32.0 mm [+0.5] (Mono)          │
│  PRISM:    [-0.5]  0.0 Δ   [+0.5] [Base: IN]       │  PRISM:    [-0.5]  0.0 Δ   [+0.5] [Base: IN]      │
│  NEAR ADD: [-0.25] +2.00 D [+0.25] (Tot: +2.00D)   │  NEAR ADD: [-0.25] +2.00 D [+0.25] (Tot: +2.00D)  │
│  APERTURE: [OPEN]  [OCCLUDED]  [PINHOLE]           │  APERTURE: [OPEN]  [OCCLUDED]  [PINHOLE]          │
│  SE:       -0.25 D                                 │  SE:       +0.00 D                                │
├──────────────────────────────────────────┴─────────────────────────────────────────────┤
│  RAM-GAP: [RED SHARPER (-0.25D)]   [BALANCED / EQUAL ✓]   [GREEN SHARPER (+0.25D)]     │
│  JCC BAR: [FLIP JCC (POS 1/2)]   [MODE: AXIS/POWER]   [STEP: ±0.25D/±0.50D]            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Refraction State Specifications

| Parameter | Clinical Range | Step Size | Modulo / Clamping Behavior |
| :--- | :--- | :--- | :--- |
| **Sphere ($S$)** | $-20.00\text{ D}$ to $+20.00\text{ D}$ | $\pm 0.25\text{ D}$ (fine) / $\pm 1.00\text{ D}$ (coarse) | Clamped to $[-20.00, +20.00]$, rounded to 2 decimal places |
| **Cylinder ($C$)** | $-10.00\text{ D}$ to $+10.00\text{ D}$ | $\pm 0.25\text{ D}$ (fine) / $\pm 1.00\text{ D}$ (coarse) | Clamped to $[-10.00, +10.00]$, rounded to 2 decimal places |
| **Axis ($\theta$)** | $1^\circ$ to $180^\circ$ | $\pm 1^\circ$ (fine) / $\pm 5^\circ$ (rotary) | Strict cyclic wrap: $(((\theta - 1 + \Delta) \pmod{180} + 180) \pmod{180}) + 1$ |
| **Monocular PD** | $25.0\text{ mm}$ to $40.0\text{ mm}$ | $\pm 0.5\text{ mm}$ | Clamped to $[25.0, 40.0]$ |
| **Binocular PD** | $50.0\text{ mm}$ to $80.0\text{ mm}$ | $\pm 0.5\text{ mm}$ | Linked sync splits equally to OD/OS monocular PDs |
| **Prism ($\Delta$)** | $0.0\ \Delta$ to $20.0\ \Delta$ | $\pm 0.5\ \Delta$ | Clamped to $[0.0, 20.0]$ |
| **Prism Base** | `IN`, `OUT`, `UP`, `DOWN` | 1-click cycle | Rotates `IN` $\to$ `OUT` $\to$ `UP` $\to$ `DOWN` $\to$ `IN` |
| **Near ADD** | $0.00\text{ D}$ to $+4.00\text{ D}$ | $\pm 0.25\text{ D}$ | Lower bounded at $0.00\text{ D}$ (prevents negative near adds) |
| **Occlusion** | `OPEN`, `OCCLUDED`, `PINHOLE`| 1-click toggle | Cycles aperture mode or configures monocular testing |

### Optical Transposition & Spherical Equivalent

- **Transposition**: Converts between minus-cylinder and plus-cylinder form instantaneously:
  $$S' = S + C, \quad C' = -C, \quad \theta' = (\theta + 90^\circ - 1 \pmod{180}) + 1$$
- **Spherical Equivalent (SE)**: Continuously computed and displayed for both eyes:
  $$\text{SE} = S + \frac{C}{2}$$

---

## Clinical Optometry Testing Capabilities

### 1. Precision ISO 8596 / ETDRS Trigonometric Calibration

Optotype dimensions are rendered using an exact $5\times 5$ vector grid where a standard $20/20$ ($6/6$, $1.0$ Decimal, $0.0$ LogMAR) character subtends exactly **5 minutes of arc** ($5'$) with a **1-arcminute** ($1'$) stroke width and critical opening at viewing distance $D$:

$$H(D, \text{LogMAR}) = 2 \times D \times \tan\left(\frac{5' \times 10^{\text{LogMAR}}}{2}\right)$$

Physical screen pixel pitch is calibrated in millimeters via standard ID-1 card ($85.6\text{ mm}$) or millimeter ruler in the **Settings (`⚙`)** modal. Arbitrary lane geometries ($0.4\text{m} - 8.0\text{m}$) and folded mirror lanes ($D_{\text{patient-to-mirror}} + D_{\text{mirror-to-screen}}$) are supported with zero optical distortion.

#### Supported Optotype Suites
1. **Sloan Letters**: Standard ETDRS cohort (`C, D, H, K, N, O, R, S, V, Z`).
2. **Snellen Letters**: Classical alphabet (`A–Z`).
3. **Tumbling E**: 4 cardinal orientations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$).
4. **Landolt C**: 8 cardinal & oblique orientations with pure closed vector paths.
5. **Numbers**: High-legibility numerals (`2, 3, 4, 5, 6, 8, 9`).
6. **HOTV**: Pediatric amblyopia matching cohort.
7. **Pediatric Symbols**: Graded symbols (`APPLE`, `HOUSE`, `SQUARE`, `CIRCLE`).
8. **Dynamic Optotype (Dyop)**: Rotating segmented rings with variable RPM for motion visual threshold testing.

---

### 2. Jackson Cross-Cylinder (JCC) Simulator

Accessible via **`03 ASTIGMATISM`** $\to$ **`JCC Dots`**, this module replicates a handheld or automated $\pm 0.25\text{ D}$ / $\pm 0.50\text{ D}$ Stokes/Jackson cross-cylinder lens:

```
          White (+)
             \
              \     Axis Guide (---)
               \   /
                ● ● ●
              ● ● ● ● ●
            ● ● ● ● ● ● ●    (19-Dot Honeycomb)
              ● ● ● ● ●
                ● ● ●
                 /   \
                /     \
                       Red (−)
```

- **Fixation Target**: 19-dot hexagonal honeycomb array positioned at the center of the field.
- **Position 1 vs Position 2**: Toggling positions flips the principal meridians of the cross-cylinder lens by $90^\circ$.
- **Axis Refinement Mode**:
  - Handle is aligned with the spectacle cylinder axis; red and white markers straddle the axis at $\pm 45^\circ$.
  - Clinician asks: *"Is the honeycomb sharper with lens 1 or lens 2?"*
  - Clinician rotates the axis toward the **Red Marker** ("Chase the Red") of the preferred lens position.
- **Power Refinement Mode**:
  - Principal axes are aligned directly with and perpendicular to the spectacle cylinder axis.
  - Clinician asks: *"Are the dots clearer with lens 1 or lens 2?"*
  - If the red axis is clearer, cylinder power is increased by $-0.25\text{ D}$ (more minus). If white is clearer, cylinder power is reduced by $+0.25\text{ D}$ (less minus).
  - **Spherical Equivalent Compensation**: For every $0.50\text{ D}$ increase in cylinder power, the system automatically adds $+0.25\text{ D}$ to sphere, maintaining the circle of least confusion on the retina.

---

### 3. Duochrome Chromatic Defocus & RAM-GAP Guidance

Accessible via **`02 DUOCHROME`** or pressing **`D`**:

- **Physical Optical Principle**: Longitudinal chromatic aberration causes shorter wavelengths (Green, $\sim 535\text{ nm}$) to refract more strongly and focus anterior to the retina, while longer wavelengths (Red, $\sim 625\text{ nm}$) refract less and focus posterior to the retina.
- **Bilateral Symmetric Optotypes**: Matched Sloan letter pairs (`OE`, `DHZ`, `RCK`, `VSN`) provide identical stroke complexity across both red and green backgrounds, eliminating letter recognition bias.
- **RAM-GAP Clinical Protocol**:
  - **Red Sharper**: Focus is anterior to retina (eye is under-minused / over-plussed) $\to$ **Add Minus** ($-0.25\text{ D}$ sphere).
  - **Green Sharper**: Focus is posterior to retina (eye is over-minused / under-plussed) $\to$ **Add Plus** ($+0.25\text{ D}$ sphere).
  - **Balanced**: Chromatic intervals straddle the retina equally $\to$ **Refractive Endpoint Reached**.
  - One-click buttons in the Doctor Console execute these step changes directly on the active eye.

---

### 4. Calibrated 40cm Presbyopia Reading Card

Accessible via **`08 NEAR VISION`**:

- **Physical Calibration**: Formatted specifically for a $40\text{cm}$ ($16\text{ in}$) reading distance, representing standard reading and computer ergonomics with a $+2.50\text{ D}$ accommodative demand.
- **Graded Paragraphs**:
  - **N4** ($J1+$, $0.4\text{M}$, $20/20$ distance equiv., LogMAR $0.00$)
  - **N5** ($J1$, $0.5\text{M}$, $20/25$ distance equiv., LogMAR $+0.10$)
  - **N6** ($J2$, $0.6\text{M}$, $20/30$ distance equiv., LogMAR $+0.20$)
  - **N8** ($J3$, $0.8\text{M}$, $20/40$ distance equiv., LogMAR $+0.30$)
  - **N10** ($J7$, $1.0\text{M}$, $20/50$ distance equiv., LogMAR $+0.40$)
  - **N14** ($J10$, $1.6\text{M}$, $20/80$ distance equiv., LogMAR $+0.60$)
  - **N18** ($J14$, $2.0\text{M}$, $20/100$ distance equiv., LogMAR $+0.70$)
- **Tier Isolation & ADD Stepper**: Click any paragraph or tier button (`N4` through `N18` or `ALL`) to isolate text. Step reading addition directly in $+0.25\text{ D}$ increments while monitoring total near power.

---

### 5. Astigmatism Dial & Sunburst Fan Suite

- **12-Hour Clock Dial**: Standard $30^\circ$ ray intervals ($12$ to $6$, $1$ to $7$, etc.) for determining astigmatic principal meridians.
- **Rotatable Sunburst Fan**: $180^\circ$ fan with $10^\circ$ markings and rotatable guide cursor, allowing precise measurement of cylinder axis before cross-cylinder refinement.

---

### 6. Contrast Sensitivity & Sine-Wave Gratings

- **Stepped Weber Letter Contrast**: Calibrated contrast reduction from $100\%$ down to $0.8\%$ ($100\%, 50\%, 25\%, 12.5\%, 6.25\%, 3.1\%, 1.6\%, 0.8\%$) for early cataract, glaucoma, and post-refractive surgery evaluation.
- **Spatial Frequency Sine-Wave Gratings**: High-definition grating patches at $1.5, 3.0, 6.0, 12.0,$ and $18.0\text{ cycles/degree}$ (CPD) with variable orientations ($0^\circ, 45^\circ, 90^\circ, 135^\circ$).

---

### 7. Binocular Balance & Worth 4-Dot Test

- **Worth 4-Dot Test**: Calibrated red/green filter targets with 1 Red (top), 2 Green (horizontal), and 1 White (bottom) dots. Features variable angular spreads:
  - **Macular**: $2^\circ$ angular spread.
  - **Standard**: $4^\circ$ angular spread.
  - **Peripheral**: $6^\circ$ angular spread.
- **Fixation Disparity & Nonius Targets**: OXO targets, horizontal and vertical polarized nonius lines, and Schober concentric rings for heterophoria and binocular alignment.

---

### 8. Computerized eETDRS Staircase Wizard

- Automated ETDRS multi-phase protocol conforming to clinical trial standards:
  - Phase 1: Rapid screening line isolation.
  - Phase 2: Letter-by-letter scoring across lines.
  - Phase 3: Exact Letter Count calculation ($85 - 50 \times \text{LogMAR}$) and final LogMAR determination.

---

### 9. Macular Assessment & Farnsworth D-15 Color Arrangement

- **$20\times 20$ Amsler Grids**: Calibrated $10^\circ$ macular field grids with fixation target in 4 clinical modes: White-on-Black, Black-on-White, Red Scotoma, and Diagonal Cross.
- **Farnsworth D-15 Color Arrangement**: Complete 15-cap plus 1 pilot cap interactive hue arrangement test with automatic Protan, Deutan, and Tritan axis crossing detection.
- **Ishihara Pseudoisochromatic Plates**: Standard screening plates with randomized presentation.

---

## High-LogMAR Acuity Scoring Math Correction

In standard vision testing charts, lower acuity lines ($20/400$ to $20/100$) contain fewer than 5 letters (e.g. 1 letter on $20/400$, 2 on $20/200$, 3 on $20/150$, 4 on $20/100$). Version 1.0.1 introduces a dynamic optotype denominator that computes letter credit strictly based on the visible capacity of the active line:

### Mathematical Model

Given active line LogMAR $L$, effective displayed optotype count $N_{\text{eff}} \in [1, 5]$, and correctly identified letters $N_{\text{correct}} \in [0, N_{\text{eff}}]$:

$$\text{Missed Count: } M = N_{\text{eff}} - N_{\text{correct}}$$

$$\text{Per-Letter Weight: } W = \frac{0.10}{N_{\text{eff}}}$$

$$\text{Interpolated LogMAR: } L_{\text{interpolated}} = L + M \times W$$

$$\text{Majority Pass Threshold: } T_{\text{pass}} = \left\lceil \frac{N_{\text{eff}}}{2} \right\rceil$$

### Acuity Notation Formatting Rules

| Condition | Acuity Label Modifier | Example ($20/400$, $N_{\text{eff}}=1$) |
| :--- | :--- | :--- |
| $N_{\text{correct}} = N_{\text{eff}}$ | Base notation + ` (Full)` | `20/400 (Full)` ($1.30\text{ LogMAR}$) |
| $N_{\text{correct}} = 0$ | Base notation + ` (0/N)` | `20/400 (0/1)` ($1.40\text{ LogMAR}$) |
| $N_{\text{correct}} \ge T_{\text{pass}}$ | Base notation + ` -M` | `20/100 -1` ($0.725\text{ LogMAR}$) |
| $N_{\text{correct}} < T_{\text{pass}}$ | Previous baseline notation + ` +N_correct` | `20/125 +1` ($0.775\text{ LogMAR}$) |

- **Zero Ghost Penalties**: On $20/400$ ($1.30\text{ LogMAR}$, 1 letter), correctly reading the single letter now yields exact $1.30\text{ LogMAR}$ and `'20/400 (Full)'`.
- **Hotkey Guarding**: Scoring hotkeys (`1`–`5`) and single-letter navigation (`[`, `]`) are strictly clamped to $N_{\text{eff}}$, preventing accidental entry of phantom scores for invisible positions.

---

## Multi-Screen Real-Time WebSocket Synchronization

SIMA Optometry App utilizes a fault-tolerant, low-latency WebSocket protocol engine for reliable multi-screen examination lane operations:

```
┌─────────────────────────────────────────────────────────────┐
│                 TYPED PROTOCOL ENVELOPE                     │
│                                                             │
│  {                                                          │
│    "type": "STATE_PATCH" | "STATE_SYNC" | "CALIBRATION_INIT",│
│    "senderId": "client_f8a91c_1731182400",                  │
│    "seq": 42,                                               │
│    "timestamp": 1731182400123,                              │
│    "payload": { ... }                                       │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Core Synchronization Features

1. **Origin-Based Echo Suppression**: Each client tab generates a unique session UUID stored in `sessionStorage`. Incoming packets where `senderId === clientSessionId` are discarded immediately, preventing circular echo loops.
2. **Causal Sequence Ordering**: The receiver tracks the highest monotonic sequence number per sender (`lastSeqMap`). Stale or out-of-order packets (`seq <= lastSeq`) from delayed network paths are safely dropped.
3. **25-Second Heartbeat & Zombie Reaper**: The server emits ping frames every 25 seconds. If a client fails to return an RFC 6455 pong frame or `{ type: "PONG" }` envelope before the next interval, `client.terminate()` is invoked, immediately cleaning up zombie connections and updating live client counts.
4. **Server Schema Validation & Prototype Pollution Defense**: Incoming state mutations are sanitized against strict clinical boundaries before merging into `currentExamState`. Keys such as `__proto__`, `constructor`, and `prototype` are stripped to guarantee security.
5. **In-Memory QR Code Caching (`qrMemoryCache`)**: Pairing QR code PNG data URLs are cached in memory keyed by URL. Repeated GET requests to `/api/network-info` resolve in $O(1)$ time with $0\text{ms}$ CPU rasterization overhead.
6. **Cold-Start Calibration Resilience**: If the Patient Display boots before the Doctor Console (`currentExamState === null`), `CALIBRATION_INIT` initializes the server state using the monitor's saved millimeter calibration and immediately broadcasts `STATE_SYNC` to all late-joining clients.
7. **Exponential Backoff with Jitter**: When a client loses connection, it reconnects using bounded exponential backoff with additive jitter:
   $$\text{Delay} = \min\left(10000\text{ ms}, 800\text{ ms} \times 1.5^{\text{attempt}} + \text{rand}(0, 400)\text{ ms}\right)$$
8. **Side-Effect Extraction in React**: All network socket transmissions (`ws.send`) and local storage writes (`localStorage`, `BroadcastChannel`) are executed outside React 18 `setState` functional updaters, preventing duplicate dispatches in Concurrent / StrictMode.

---

## Performance & Rendering Optimizations

| Optimization | Previous State | v1.0.1 Optimized State | Performance Impact |
| :--- | :--- | :--- | :--- |
| **Build Module Transformations** | 1,590 modules transformed via `tsc -b && vite build` | **41 modules transformed** | **97.4% reduction** in build module overhead; build time reduced from $1.88\text{s}$ to $0.93\text{s}$ |
| **Landolt C SVG Path Rendering** | Dynamic SVG masks with random IDs (`landolt-mask-${Math.random()}`) | **Single pure vector path**: `d="M 4.9495,3.0 A 2.5 2.5 0 1 1 4.9495,2.0 L 3.9142,2.0 A 1.5 1.5 0 1 0 3.9142,3.0 Z"` | Eliminates DOM mask churn, texture recompilation, and offscreen alpha compositing |
| **ChartStage Pagination Render Cycle** | Secondary render pass forced by `useState` + `useEffect` layout sync | **Synchronous layout memoization** via `useRef` + `useMemo` | Resolves pagination in exactly **1 render pass** with 0 layout shift |
| **Network Telemetry Polling** | Unconditional 8-second polling on all routes | **Route-aware polling**: disabled entirely on Patient Display (`role === 'patient'`) | Eliminates 100% of background polling traffic from the exam presentation display |
| **QR Code Rasterization** | Regenerated 240x240 PNG on every network query | **In-memory data URL cache** (`qrMemoryCache`) | Reduces QR response latency from $15-30\text{ms}$ to $<1\text{ms}$ |

---

## Keyboard & Remote Hotkeys

| Key | Clinical Action | Scope |
| :--- | :--- | :--- |
| **`←` / `→`** | Cycle clinical decks (`VA Chart` $\leftrightarrow$ `Duochrome` $\leftrightarrow$ `Astigmatism` $\leftrightarrow$ `Binocular` $\leftrightarrow$ `eETDRS` $\leftrightarrow$ `Contrast` $\leftrightarrow$ `Macular` $\leftrightarrow$ `Near Vision`) | Global |
| **`↑` / `↓`** | Step optotype size **Larger** / **Smaller** ($\pm 0.10\text{ LogMAR}$) | VA Chart |
| **`Space` / `R`** | Smart Randomize optotypes (prevents adjacent duplicates and memorization) | VA Chart / Modules |
| **`1` – `5`** | Score optotypes `#1`–`#5` on active line (`Untested` $\to$ `Correct ✓` $\to$ `Incorrect ✕`) | VA Chart / eETDRS |
| **`[` / `]`** | Step isolated letter index (Single / Column isolation) or Astigmatism axis | VA Chart / Astigmatism |
| **`F`** | Aperture: **F**ull Multi-Line Chart | VA Chart |
| **`L`** | Aperture: Single Horizontal **L**ine Isolation | VA Chart |
| **`V`** | Aperture: Single **V**ertical Column Isolation | VA Chart |
| **`S`** | Aperture: **S**ingle Optotype Isolation | VA Chart |
| **`C`** | Cycle Contour Crowding Bars (`Off` $\to$ `0.5×` $\to$ `1.0×` $\to$ `Box`) | VA Chart |
| **`D`** | Cycle Duochrome Filter (`Clear` $\to$ `R/G Split` $\to$ `Red Field` $\to$ `Green Field`) | Global |
| **`I`** | Invert Contrast Polarity (`Black-on-White` $\leftrightarrow$ `White-on-Black`) | Global |
| **`N`** | Cycle Acuity Notation (`20/xx Snellen` $\to$ `6/xx Metric` $\to$ `Decimal` $\to$ `LogMAR`) | Global |
| **`B`** | Toggle Patient Screen Blackout | Presentation |

---

## Installation, Build, & Deployment

### Quick Start

Ensure [Node.js](https://nodejs.org/) v20.0.0 or higher is installed:

```bash
# Clone the repository
git clone https://github.com/subsubl/sima-optometry-app.git
cd sima-optometry-app

# Install dependencies
npm install

# Start the integrated HTTP & WebSocket server
npm start
```

Open your browser to:
- **Doctor Remote Console**: `http://localhost:3020/#/doctor` (or `http://<LAN_IP>:3020/#/doctor`)
- **Patient Display**: `http://localhost:3020/#/patient` (or `http://<LAN_IP>:3020/#/patient`)

---

### Production Web Build

To compile the TypeScript codebase and bundle static assets with Vite:

```bash
npm run build
```

The production output will be generated in `dist/`. Vite transforms 41 modules in under 1 second.

---

### Automated Unit & Stress Testing

Run the full Vitest suite (178 unit tests covering acuity formulas, high-LogMAR line scoring, phoropter math, JCC mechanics, and WebSocket synchronization):

```bash
npm test
```

---

### Linux Desktop Distribution Packages (AppImage & DEB)

To build standalone Linux desktop distribution packages via `electron-builder`:

```bash
npm run dist:linux
```

This compiles the production web bundle and outputs:
- `release/SIMA Optometry App-1.0.1.AppImage` (portable universal Linux binary)
- `release/sima-optometry-app_1.0.1_amd64.deb` (Debian / Ubuntu / Linux Mint package)

---

### Docker Container Deployment

Run SIMA Optometry App containerized with host network bridging for instantaneous LAN discovery:

#### Using Docker Compose (Recommended)

```bash
docker compose up --build -d
```

#### Using Docker CLI Directly

```bash
# Build production image
docker build -t sima-optometry-app:1.0.1 .

# Run container exposing port 3020
docker run -d \
  --name sima-optometry-app \
  --restart unless-stopped \
  -p 3020:3020 \
  sima-optometry-app:1.0.1
```

Once running, the application is accessible to all computers, tablets, and smart TVs on the local network at `http://<LAN_IP>:3020`.

---

### Multi-Monitor Exam Lane Setup (Electron Host)

When running the native Electron application on a dual-monitor exam workstation:

```bash
npm run electron:start
# or
./start-optisuite.sh
```

- If **two monitors** are detected: The **Patient Display** automatically opens fullscreen on the secondary monitor (projector / lane TV), while the **Doctor Remote Console** launches on the primary practitioner display.
- If **one monitor** is detected: The Doctor Console opens in standard desktop window mode with a shortcut button to launch the Patient Display in an independent window.

---

### Wireless LAN Tablet & iPad Remote Pairing

To operate the Doctor Remote Console wirelessly from an iPad, Android tablet, or smartphone:

1. Connect the tablet to the same local Wi-Fi / LAN network as the workstation.
2. In the Doctor Console, click **Pair Remote** (`QR`) in the top navigation bar.
3. Scan the displayed QR code with your tablet's camera, or navigate directly to `http://<LAN_IP>:3020/#/doctor`.
4. Changes made on the tablet update the patient screen instantly with sub-millisecond local latency.

> [!NOTE]
> **Linux Firewall Configuration**: If running Ubuntu, Pop!_OS, or Debian with `ufw` enabled, ensure port 3020 is accessible to LAN peers:
> ```bash
> sudo ufw allow 3020/tcp
> ```

---

## Authoritative Standards & Citations

- **ISO 8596:2017**: *Ophthalmic optics — Visual acuity testing — Standard and clinical optotypes and their presentation*.
- **ETDRS Report No. 1**: *Design of the Early Treatment Diabetic Retinopathy Study charts*. Ophthalmology, 1985.
- **Jackson, E.**: *Trial Sets of Small Lenses, and a Consideration of Their Form*. Trans Am Ophthalmol Soc, 1887 (Jackson Cross-Cylinder principle).
- **Bennett, A. G.**: *Ophthalmic Test Types*. British Journal of Physiological Optics, 1965.

---

## License

Distributed under the **MIT License**. See `LICENSE` for complete terms.
