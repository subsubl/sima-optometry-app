# SIMA Optometry App

**SIMA Optometry App** is a clinical digital visual acuity and refraction examination system built for optometry and ophthalmology lanes. It pairs a distraction-free **Patient Display** with a tactile, dark-adapted **Doctor Console** synchronized in real time over local WebSockets.

---

## Core Capabilities

### 1. Precision ISO 8596 / ETDRS Trigonometric Calibration
Every optotype is rendered as a lossless `5×5` vector grid where a standard `20/20` (`6/6`, `1.0` Decimal, `0.0` LogMAR) character subtends exactly **5 minutes of arc** ($5'$) with a **1-arcminute** ($1'$) stroke and critical gap at viewing distance $D$:

$$H(D, \text{LogMAR}) = 2 \times D \times \tan\left(\frac{5' \times 10^{\text{LogMAR}}}{2}\right)$$

- **Arbitrary Lane Geometry**: Supports direct lanes (`0.4m – 8.0m`) and folded/mirrored exam lanes ($D_{\text{patient-to-mirror}} + D_{\text{mirror-to-screen}}$) with automatic horizontal reflection (`-scale-x-100`) on the Patient Screen while maintaining an un-mirrored clinician preview.
- **Physical Pixel Pitch Calibration**: Calibrate any monitor or TV using a millimeter ruler or standard ISO ID-1 card (`85.6 mm`) from the **Settings (`⚙`)** menu.

### 2. Optotype & Aperture Suite
- **8 Optotype Families**:
  - **Sloan Letters** (`C, D, H, K, N, O, R, S, V, Z`)
  - **Snellen Letters** (`A–Z`)
  - **Tumbling E** (4 cardinal orientations)
  - **Landolt C** (8 cardinal & oblique orientations)
  - **Numbers** (`2, 3, 4, 5, 6, 8, 9`)
  - **HOTV**
  - **Pediatric Symbols** (`APPLE`, `HOUSE`, `SQUARE`, `CIRCLE`)
  - **Dynamic Optotype (Dyop)** spinning segmented ring (`CW` / `CCW`)
- **Aperture Isolation**: Full multi-line chart (`F`), single horizontal line (`L`), single vertical column (`V`), and single isolated optotype (`S`).
- **Contour Crowding Bars**: Toggleable `0.5×`, `1.0×`, and `Frame Box` contour interaction bars (`C`) for amblyopia assessment.
- **Chromatic & Polarity Filters**: Red/Green Duochrome split and full-field overlays (`D`), plus instant Black-on-White / White-on-Black polarity inversion (`I`).

### 3. Specialized Clinical Test Decks
Cycle between all 7 clinical test decks using the **`←` / `→` (Left / Right Arrow)** keys or the top mode carousel:
1. **`01 VA CHART`**: Standard & crowded visual acuity testing (`20/400` to `20/10` / `+1.3` to `-0.3` LogMAR) with letter-by-letter scoring (`1`–`5`) and automatic interpolated acuity (`20/20 -1`, `LogMAR +0.02`).
2. **`02 DUOCHROME`**: Dedicated Red (`~625nm`) / Green (`~535nm`) bichrome spherical endpoint balance chart.
3. **`03 ASTIGMATISM`**: 12-hour Astigmatic Clock Dial, $180^\circ$ rotatable Sunburst Fan & Pointer, and 19-dot Jackson Cross-Cylinder (JCC) honeycomb target.
4. **`04 BINOCULAR`**: Worth 4-Dot test (with macular $2^\circ$, standard $4^\circ$, and peripheral $6^\circ$ spread), Schober concentric rings, OXO Fixation Disparity nonius target, and dissociated OD/OS acuity balance.
5. **`05 eETDRS`**: Computerized ETDRS staircase scoring protocol with real-time LogMAR and ETDRS Letter Count (`85 - 50 × LogMAR`) calculation.
6. **`06 CONTRAST`**: Stepped Weber letter contrast ($100\%$ down to $0.8\%$) and spatial frequency sine-wave gratings ($1.5, 3, 6, 12, 18\text{ CPD}$ at $0^\circ, 45^\circ, 90^\circ, 135^\circ$).
7. **`07 MACULAR / COLOR`**: Calibrated $20 \times 20$ Amsler Grids (White-on-Black, Black-on-White, Red Scotoma, Diagonal Cross) + 8-plate pseudoisochromatic Ishihara screening and Farnsworth D-15 arrangement.

---

## Keyboard & Remote Hotkeys

| Key | Clinical Action |
| :--- | :--- |
| **`←` / `→`** | Cycle between clinical test modes (`VA Chart` ↔ `Duochrome` ↔ `Astigmatism` ↔ `Binocular` ↔ `eETDRS` ↔ `Contrast` ↔ `Macular/Color`) |
| **`↑` / `↓`** | Step optotype size **Larger** / **Smaller** (`+0.1` / `-0.1` LogMAR) |
| **`Space` / `R`** | Smart Randomize optotypes (prevents adjacent duplicates & patient memorization) |
| **`1` – `5`** | Score optotype `#1`–`#5` on active line (`Untested` → `Correct ✓` → `Incorrect ✕`) |
| **`[` / `]`** | Step isolated target position (`Single` / `Vertical Column`) or Astigmatism axis |
| **`F` / `L` / `V` / `S`** | Switch aperture isolation: **F**ull Chart, **L**ine, **V**ertical Column, **S**ingle Optotype |
| **`C`** | Cycle Contour Crowding Bars (`Off` → `0.5×` → `1.0×` → `Box`) |
| **`D`** | Cycle Duochrome Filter (`Clear` → `R/G Split` → `Red` → `Green`) |
| **`I`** | Invert Contrast Polarity (`Black-on-White` ↔ `White-on-Black`) |
| **`N`** | Cycle Acuity Notation (`20/xx` → `6/xx` → `Decimal` → `LogMAR`) |
| **`B`** | Toggle Patient Screen Blackout |

---

## Quick Start

### Install & Run
```bash
npm install
npm start
```
- **Doctor Console**: `http://localhost:3020/#/doctor` (or `http://<LAN_IP>:3020/#/doctor`)
- **Patient Display**: `http://localhost:3020/#/patient` (or `http://<LAN_IP>:3020/#/patient`)

### LAN Tablet & iPad Remote Pairing
To use an iPad, tablet, or phone as a wireless controller in the exam lane:
1. Ensure both the computer running SIMA and the tablet are connected to the same Wi-Fi / local network.
2. Click **Pair Remote** in the top navigation bar of the Doctor Console.
3. Scan the displayed QR code or navigate to `http://<LAN_IP>:3020/#/doctor`.

> [!NOTE]
> **Linux Firewall Note**: If your computer runs Ubuntu / Pop!_OS and the firewall (`ufw`) is enabled, allow incoming connections to port 3020:
> ```bash
> sudo ufw allow 3020/tcp
> ```

### Docker Deployment (Instant LAN Access)
To run containerized with automatic network bridging:
```bash
docker compose up -d
```
The server will be immediately accessible to all LAN devices at `http://<LAN_IP>:3020`.

### Desktop App (Electron Multi-Monitor Mode)
```bash
npm run electron:start
# or
./start-optisuite.sh
```
When two monitors are detected, the Electron host automatically opens the **Patient Display** fullscreen on the secondary monitor and launches the **Doctor Console** on the primary display.

### Run Tests
```bash
npm test
```
