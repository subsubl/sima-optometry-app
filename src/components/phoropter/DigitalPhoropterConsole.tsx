/**
 * SIMA Optometry App — Digital Phoropter Console
 * Tactical Dark Refraction Deck (#08090C, #0D0F14, amber #F59E0B, emerald #10B981, rose #EF4444)
 * 
 * Clinical Features:
 * - OD (Amber) & OS (Emerald) refractive adjustment dials & steppers:
 *   - Sphere (±0.25 D / ±1.00 D)
 *   - Cylinder (±0.25 D / ±1.00 D)
 *   - Axis (±1° / ±5° rotary stepper + cardinal presets)
 *   - Monocular PD (±0.5 mm) & Binocular PD (±0.5 mm)
 *   - Prism (±0.5 Δ) & Base direction cycling (IN, OUT, UP, DOWN)
 *   - Near ADD (±0.25 D) with working distance (40cm) indicator & Total Near Power readout
 *   - Eye Occlusion mode toggles (OPEN / OCCLUDED / PINHOLE)
 *   - Optical transposition between minus-cylinder and plus-cylinder form
 *   - Live Spherical Equivalent (SE) readout
 * - Duochrome RAM-GAP ("Red Add Minus, Green Add Plus") clinical badges with direct 1-click sphere adjustments
 * - Jackson Cross-Cylinder (JCC) control bar: Position 1 vs 2 flip, Axis vs Power refinement, ±0.25D vs ±0.50D power step
 * - Compact & Expanded deck view modes for responsive clinical tablet ergonomics
 */

import React, { useState } from 'react';
import {
  ExamState,
  JccFlipPosition,
  JccPowerStep,
  JccRefinementMode,
  JccState,
  OcclusionMode,
  PrismBase,
  RefractionEyeState,
  RefractionState,
} from '../../types/exam';
import {
  calculateSphericalEquivalent,
  createDefaultJccState,
  createDefaultRefractionState,
  cycleOcclusion,
  cyclePrismBase,
  formatAxis,
  formatDiopter,
  formatPrescription,
  setEyeOcclusion,
  stepAdd,
  stepAxis,
  stepBinocularPd,
  stepCylinder,
  stepMonocularPd,
  stepPrism,
  stepSphere,
  toggleJccFlip,
  toggleJccPowerStep,
  toggleJccRefinementMode,
  transposePrescription,
} from '../../engine/refractionMath';

export interface DigitalPhoropterConsoleProps {
  state: ExamState;
  updateState: (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => void;
  className?: string;
}

export const DigitalPhoropterConsole: React.FC<DigitalPhoropterConsoleProps> = ({
  state,
  updateState,
  className = '',
}) => {
  // Defensive fallbacks for safety during network hydration
  const refraction: RefractionState = state.refraction || createDefaultRefractionState();
  const jcc: JccState = state.jcc || createDefaultJccState();

  // Active eye focus for single-eye guidance (Duochrome RAM-GAP & JCC)
  // If OS is open and OD is occluded -> OS; otherwise default to OD
  const defaultFocusedEye: 'OD' | 'OS' =
    refraction.os.occlusion === 'OPEN' && refraction.od.occlusion !== 'OPEN' ? 'OS' : 'OD';
  const [focusedEye, setFocusedEye] = useState<'OD' | 'OS'>(defaultFocusedEye);

  // Deck view toggle: expanded full dials vs compact telemetry bar
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Link binocular PD adjustment to monocular PDs
  const [isPdLinked, setIsPdLinked] = useState<boolean>(true);

  // Endpoint lock confirmation indicator for Duochrome
  const [duochromeLocked, setDuochromeLocked] = useState<boolean>(false);

  // -------------------------------------------------------------
  // State Mutation Helpers
  // -------------------------------------------------------------
  const updateRefraction = (fn: (prev: RefractionState) => RefractionState) => {
    updateState((prev) => {
      const currentRef = prev.refraction || createDefaultRefractionState();
      return {
        ...prev,
        refraction: fn(currentRef),
      };
    });
  };

  const updateEye = (
    eye: 'od' | 'os',
    fn: (prevEye: RefractionEyeState) => RefractionEyeState
  ) => {
    updateRefraction((ref) => ({
      ...ref,
      [eye]: fn(ref[eye]),
    }));
  };

  const updateJcc = (fn: (prevJcc: JccState) => JccState) => {
    updateState((prev) => {
      const currentJcc = prev.jcc || createDefaultJccState();
      return {
        ...prev,
        jcc: fn(currentJcc),
      };
    });
  };

  // Top-Level Eye Isolation (OD / OU / OS)
  const handleSetTestedEye = (testedEye: 'OD' | 'OS' | 'OU') => {
    if (testedEye === 'OD') setFocusedEye('OD');
    if (testedEye === 'OS') setFocusedEye('OS');
    updateRefraction((ref) => setEyeOcclusion(ref, testedEye));
  };

  // Step Sphere on specified eye
  const handleStepSphere = (eye: 'od' | 'os', delta: number) => {
    setDuochromeLocked(false);
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      sphere: stepSphere(prevEye.sphere, delta),
    }));
  };

  // Step Cylinder on specified eye
  const handleStepCylinder = (eye: 'od' | 'os', delta: number) => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      cylinder: stepCylinder(prevEye.cylinder, delta),
    }));
  };

  // Step Axis on specified eye
  const handleStepAxis = (eye: 'od' | 'os', deltaDeg: number) => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      axis: stepAxis(prevEye.axis, deltaDeg),
    }));
  };

  // Set explicit Axis angle
  const handleSetAxis = (eye: 'od' | 'os', angleDeg: number) => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      axis: stepAxis(angleDeg, 0),
    }));
  };

  // Step Monocular PD
  const handleStepMonocularPd = (eye: 'od' | 'os', delta: number) => {
    updateRefraction((ref) => {
      const nextMonocular = stepMonocularPd(ref[eye].pd, delta);
      const otherEye = eye === 'od' ? 'os' : 'od';
      const nextBinocular = isPdLinked
        ? Math.round((nextMonocular + ref[otherEye].pd) * 10) / 10
        : ref.binocularPd;
      return {
        ...ref,
        [eye]: { ...ref[eye], pd: nextMonocular },
        binocularPd: stepBinocularPd(nextBinocular, 0),
      };
    });
  };

  // Step Binocular PD
  const handleStepBinocularPd = (delta: number) => {
    updateRefraction((ref) => {
      const nextBinocular = stepBinocularPd(ref.binocularPd, delta);
      if (isPdLinked) {
        const half = Math.round((nextBinocular / 2) * 10) / 10;
        return {
          ...ref,
          binocularPd: nextBinocular,
          od: { ...ref.od, pd: stepMonocularPd(half, 0) },
          os: { ...ref.os, pd: stepMonocularPd(half, 0) },
        };
      }
      return {
        ...ref,
        binocularPd: nextBinocular,
      };
    });
  };

  // Step Prism Diopters
  const handleStepPrism = (eye: 'od' | 'os', delta: number) => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      prism: stepPrism(prevEye.prism, delta),
    }));
  };

  // Cycle Prism Base Direction (IN -> OUT -> UP -> DOWN -> IN)
  const handleCyclePrismBase = (eye: 'od' | 'os') => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      prismBase: cyclePrismBase(prevEye.prismBase),
    }));
  };

  // Step Near ADD
  const handleStepAdd = (eye: 'od' | 'os', delta: number) => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      add: stepAdd(prevEye.add, delta),
    }));
  };

  // Cycle Monocular Occlusion Mode (OPEN -> OCCLUDED -> PINHOLE -> OPEN)
  const handleCycleOcclusion = (eye: 'od' | 'os') => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      occlusion: cycleOcclusion(prevEye.occlusion),
    }));
  };

  // Transpose Prescription between Minus-Cylinder and Plus-Cylinder
  const handleTranspose = (eye: 'od' | 'os') => {
    updateEye(eye, (prevEye) => {
      const transposed = transposePrescription(
        prevEye.sphere,
        prevEye.cylinder,
        prevEye.axis
      );
      return {
        ...prevEye,
        sphere: transposed.sphere,
        cylinder: transposed.cylinder,
        axis: transposed.axis,
      };
    });
  };

  // Zero Out Eye Prescription
  const handleZeroPrescription = (eye: 'od' | 'os') => {
    updateEye(eye, (prevEye) => ({
      ...prevEye,
      sphere: 0.0,
      cylinder: 0.0,
      axis: 180,
      prism: 0.0,
      add: 0.0,
    }));
  };

  // Copy OD to OS (Symmetric starting prescription)
  const handleCopyOdToOs = () => {
    updateRefraction((ref) => ({
      ...ref,
      os: {
        ...ref.os,
        sphere: ref.od.sphere,
        cylinder: ref.od.cylinder,
        axis: ref.od.axis,
        add: ref.od.add,
      },
    }));
  };

  // -------------------------------------------------------------
  // Duochrome RAM-GAP Clinical Actions
  // "Red Add Minus, Green Add Plus"
  // -------------------------------------------------------------
  const activeEyeKey: 'od' | 'os' = focusedEye.toLowerCase() as 'od' | 'os';

  const handleDuochromeRedSharper = () => {
    setDuochromeLocked(false);
    // Red sharper -> add minus sphere (-0.25 D)
    handleStepSphere(activeEyeKey, -0.25);
  };

  const handleDuochromeGreenSharper = () => {
    setDuochromeLocked(false);
    // Green sharper -> add plus sphere (+0.25 D)
    handleStepSphere(activeEyeKey, +0.25);
  };

  const handleDuochromeBalanced = () => {
    setDuochromeLocked(true);
  };

  // -------------------------------------------------------------
  // JCC Clinical Refinement Actions
  // -------------------------------------------------------------
  const handleJccFlip = () => {
    updateJcc((prev) => ({
      ...prev,
      flipPosition: toggleJccFlip(prev.flipPosition),
    }));
  };

  const handleJccToggleMode = () => {
    updateJcc((prev) => ({
      ...prev,
      refinementMode: toggleJccRefinementMode(prev.refinementMode),
    }));
  };

  const handleJccToggleStep = () => {
    updateJcc((prev) => ({
      ...prev,
      powerStep: toggleJccPowerStep(prev.powerStep),
    }));
  };

  // JCC Axis Refinement Steers
  const handleJccAxisSteer = (direction: 'red' | 'white') => {
    // If Position 1 (Red) is clearer: steer axis toward red marker (e.g. -5°)
    // If Position 2 (White) is clearer: steer axis toward white marker (e.g. +5°)
    const delta = direction === 'red' ? -5 : 5;
    handleStepAxis(activeEyeKey, delta);
  };

  // JCC Power Refinement Steers (maintaining spherical equivalent)
  const handleJccPowerAdjust = (direction: 'more_minus' | 'less_minus') => {
    const step = jcc.powerStep;
    const cylDelta = direction === 'more_minus' ? -step : step;
    updateEye(activeEyeKey, (prevEye) => {
      const nextCyl = stepCylinder(prevEye.cylinder, cylDelta);
      // For every 0.50D cylinder change, adjust sphere by 0.25D to keep circle of least confusion on retina
      let nextSph = prevEye.sphere;
      if (Math.abs(cylDelta) >= 0.5) {
        const sphDelta = direction === 'more_minus' ? 0.25 : -0.25;
        nextSph = stepSphere(prevEye.sphere, sphDelta);
      }
      return {
        ...prevEye,
        sphere: nextSph,
        cylinder: nextCyl,
      };
    });
  };

  // Check if clinical modules are actively demanding specialized decks
  const isDuochromeActive =
    state.activeCategory === 'duochrome_balance' || state.duochromeOverlay !== 'none';
  const isJccActive =
    state.activeCategory === 'astigmatism' && state.astigmatismMode === 'jcc_dots';

  // -------------------------------------------------------------
  // Sub-Component: Render Single Eye Refraction Bay (OD or OS)
  // -------------------------------------------------------------
  const renderEyeBay = (eye: 'od' | 'os') => {
    const isOd = eye === 'od';
    const eyeLabel = isOd ? 'OD' : 'OS';
    const eyeName = isOd ? 'RIGHT EYE' : 'LEFT EYE';
    const eyeState = refraction[eye];
    const isFocused = focusedEye === eyeLabel;

    // Tactical Color Tokens per Eye
    const accentText = isOd ? 'text-amber-400' : 'text-emerald-400';
    const accentBg = isOd ? 'bg-amber-500' : 'bg-emerald-500';
    const accentBorder = isOd ? 'border-amber-500/60' : 'border-emerald-500/60';
    const tagBorder = isOd ? 'border-amber-400' : 'border-emerald-400';

    // Occlusion Badge Styling
    let occlusionBadge = (
      <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-500/80 text-emerald-300 font-bold text-[10px]">
        ● OPEN
      </span>
    );
    if (eyeState.occlusion === 'OCCLUDED') {
      occlusionBadge = (
        <span className="px-2 py-0.5 bg-rose-950/90 border border-rose-500/80 text-rose-300 font-bold text-[10px]">
          ■ OCCLUDED
        </span>
      );
    } else if (eyeState.occlusion === 'PINHOLE') {
      occlusionBadge = (
        <span className="px-2 py-0.5 bg-amber-950/90 border border-amber-500/80 text-amber-300 font-bold text-[10px]">
          ◎ PINHOLE
        </span>
      );
    }

    const se = calculateSphericalEquivalent(eyeState.sphere, eyeState.cylinder);
    const totalNearSphere = Math.round((eyeState.sphere + eyeState.add) * 100) / 100;

    return (
      <div
        key={eye}
        onClick={() => setFocusedEye(eyeLabel)}
        className={`flex-1 flex flex-col gap-2 p-2.5 bg-[#0D0F14] border transition-all cursor-pointer ${
          isFocused ? `${accentBorder} ring-1 ring-amber-500/30` : 'border-[#1E2330]'
        }`}
      >
        {/* Eye Header Bar */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1A1F2C]">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-xs font-black tracking-wider text-black border ${tagBorder} ${accentBg}`}
            >
              {eyeLabel}
            </span>
            <span className="text-[11px] font-mono tracking-wider text-slate-300 font-semibold uppercase">
              {eyeName}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCycleOcclusion(eye);
              }}
              title="Cycle Occlusion (Open / Occluded / Pinhole)"
              className="cursor-pointer"
            >
              {occlusionBadge}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTranspose(eye);
              }}
              title="Transpose Prescription (+/- Cylinder)"
              className="px-1.5 py-0.5 bg-[#141824] hover:bg-[#1E2538] border border-[#262E44] text-[9px] text-slate-400 hover:text-white uppercase font-mono cursor-pointer"
            >
              ± TRANS
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleZeroPrescription(eye);
              }}
              title="Reset Sphere & Cylinder to 0.00"
              className="px-1.5 py-0.5 bg-[#141824] hover:bg-rose-950/60 border border-[#262E44] hover:border-rose-600/50 text-[9px] text-slate-400 hover:text-rose-300 uppercase font-mono cursor-pointer"
            >
              ZERO
            </button>
          </div>
        </div>

        {/* Compact Prescription Readout Bar */}
        <div className="flex items-baseline justify-between px-2 py-1 bg-[#08090C] border border-[#1A1E29] font-mono text-xs">
          <span className="text-slate-400 text-[10px] tracking-wider uppercase">Rx:</span>
          <span className={`font-bold tracking-tight ${accentText}`}>
            {formatPrescription(eyeState)}
          </span>
          <span className="text-[10px] text-slate-400">
            SE: <strong className="text-slate-200">{formatDiopter(se)} D</strong>
          </span>
        </div>

        {/* 1. SPHERE DIAL SECTION */}
        <div className="bg-[#12151E] border border-[#1E2433] p-1.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span>SPHERE POWER</span>
            <span className="text-slate-500 font-mono">[-20.00 to +20.00 D]</span>
          </div>
          <div className="flex items-center gap-1 font-mono">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSphere(eye, -1.0);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              -1.00
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSphere(eye, -0.25);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              -0.25
            </button>

            {/* Glowing Tactical LCD Value */}
            <div className="w-24 py-1 bg-[#080A0E] border border-[#262D3E] flex items-center justify-center">
              <span className={`text-lg font-black tracking-tight ${accentText}`}>
                {formatDiopter(eyeState.sphere)}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSphere(eye, 0.25);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              +0.25
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepSphere(eye, 1.0);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              +1.00
            </button>
          </div>
        </div>

        {/* 2. CYLINDER DIAL SECTION */}
        <div className="bg-[#12151E] border border-[#1E2433] p-1.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span>CYLINDER POWER</span>
            <span className="text-slate-500 font-mono">[-10.00 to +10.00 D]</span>
          </div>
          <div className="flex items-center gap-1 font-mono">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepCylinder(eye, -1.0);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              -1.00
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepCylinder(eye, -0.25);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              -0.25
            </button>

            {/* Glowing Tactical LCD Value */}
            <div className="w-24 py-1 bg-[#080A0E] border border-[#262D3E] flex items-center justify-center">
              <span className="text-lg font-black tracking-tight text-white">
                {formatDiopter(eyeState.cylinder)}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepCylinder(eye, 0.25);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              +0.25
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepCylinder(eye, 1.0);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              +1.00
            </button>
          </div>
        </div>

        {/* 3. AXIS ROTARY STEPPER & CARDINAL BUTTONS */}
        <div className="bg-[#12151E] border border-[#1E2433] p-1.5 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span>CYLINDER AXIS</span>
            <div className="flex items-center gap-1">
              {[90, 180, 45, 135].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetAxis(eye, deg);
                  }}
                  className={`px-1.5 py-0.5 text-[9px] font-mono border cursor-pointer ${
                    eyeState.axis === deg
                      ? 'bg-amber-500 text-black border-amber-400 font-bold'
                      : 'bg-[#151924] border-[#262E44] text-slate-400 hover:text-white'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 font-mono">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepAxis(eye, -5);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              -5°
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepAxis(eye, -1);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              -1°
            </button>

            {/* Glowing Tactical LCD Value */}
            <div className="w-24 py-1 bg-[#080A0E] border border-[#262D3E] flex items-center justify-center">
              <span className={`text-lg font-black tracking-tight ${accentText}`}>
                {formatAxis(eyeState.axis)}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepAxis(eye, 1);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#22293A] active:bg-amber-500 active:text-black border border-[#283144] text-white text-xs font-bold cursor-pointer"
            >
              +1°
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepAxis(eye, 5);
              }}
              className="flex-1 py-1.5 bg-[#161A24] hover:bg-[#202738] active:bg-amber-500 active:text-black border border-[#252C3D] text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              +5°
            </button>
          </div>
        </div>

        {/* 4. AUXILIARY REGISTERS: MONOCULAR PD, PRISM & NEAR ADD */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5 font-mono text-[11px]">
          {/* Monocular PD */}
          <div className="bg-[#12151E] border border-[#1E2433] p-1 flex flex-col items-center">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">
              MONO PD
            </span>
            <div className="flex items-center gap-1 w-full justify-between">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepMonocularPd(eye, -0.5);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                -
              </button>
              <span className="font-bold text-slate-100 text-xs">
                {eyeState.pd.toFixed(1)}
                <span className="text-[9px] text-slate-400 ml-0.5">mm</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepMonocularPd(eye, 0.5);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Prism & Base */}
          <div className="bg-[#12151E] border border-[#1E2433] p-1 flex flex-col items-center">
            <div className="flex items-center justify-between w-full px-0.5 mb-0.5">
              <span className="text-[9px] text-slate-400 uppercase tracking-wider">
                PRISM Δ
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCyclePrismBase(eye);
                }}
                title="Cycle Prism Base: IN / OUT / UP / DOWN"
                className="text-[9px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                [{eyeState.prismBase}]
              </button>
            </div>
            <div className="flex items-center gap-1 w-full justify-between">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepPrism(eye, -0.5);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                -
              </button>
              <span className="font-bold text-slate-100 text-xs">
                {eyeState.prism.toFixed(1)}Δ
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepPrism(eye, 0.5);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Near ADD */}
          <div className="bg-[#12151E] border border-[#1E2433] p-1 flex flex-col items-center">
            <div className="flex items-center justify-between w-full px-0.5 mb-0.5">
              <span className="text-[9px] text-slate-400 uppercase tracking-wider">
                NEAR ADD
              </span>
              <span className="text-[9px] text-slate-500" title="Total Near Sphere: SPH + ADD">
                Σ {formatDiopter(totalNearSphere)}
              </span>
            </div>
            <div className="flex items-center gap-1 w-full justify-between">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepAdd(eye, -0.25);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                -
              </button>
              <span className="font-bold text-emerald-400 text-xs">
                +{eyeState.add.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepAdd(eye, 0.25);
                }}
                className="w-6 py-0.5 bg-[#161A24] hover:bg-[#22293A] border border-[#252C3D] text-xs font-bold text-slate-300 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`bg-[#08090C] border border-[#1E2330] flex flex-col select-none font-sans ${className}`}
    >
      {/* ========================================================= */}
      {/* MASTER PHOROPTER INSTRUMENT TOOLBAR                       */}
      {/* ========================================================= */}
      <div className="bg-[#0B0D12] border-b border-[#1E2330] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 font-mono">
        {/* Left: Active Eye Isolation (OD / OU / OS) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            APERTURE:
          </span>
          <div className="flex border border-[#262C3D] overflow-hidden">
            <button
              type="button"
              onClick={() => handleSetTestedEye('OD')}
              className={`px-2.5 py-1 text-xs font-black cursor-pointer transition ${
                refraction.od.occlusion === 'OPEN' && refraction.os.occlusion !== 'OPEN'
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#12151E] text-slate-400 hover:text-white'
              }`}
            >
              OD ONLY
            </button>
            <button
              type="button"
              onClick={() => handleSetTestedEye('OU')}
              className={`px-2.5 py-1 text-xs font-black cursor-pointer transition ${
                refraction.od.occlusion === 'OPEN' && refraction.os.occlusion === 'OPEN'
                  ? 'bg-[#1E2638] text-white border-x border-[#333E56]'
                  : 'bg-[#12151E] text-slate-400 hover:text-white border-x border-[#262C3D]'
              }`}
            >
              OU BINOCULAR
            </button>
            <button
              type="button"
              onClick={() => handleSetTestedEye('OS')}
              className={`px-2.5 py-1 text-xs font-black cursor-pointer transition ${
                refraction.os.occlusion === 'OPEN' && refraction.od.occlusion !== 'OPEN'
                  ? 'bg-emerald-500 text-black'
                  : 'bg-[#12151E] text-slate-400 hover:text-white'
              }`}
            >
              OS ONLY
            </button>
          </div>
        </div>

        {/* Center: Binocular PD Stepper */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">
            BINOCULAR PD:
          </span>
          <div className="flex items-center gap-1 bg-[#12151E] border border-[#262C3D] px-1 py-0.5">
            <button
              type="button"
              onClick={() => handleStepBinocularPd(-0.5)}
              className="px-1.5 py-0.5 bg-[#171B26] hover:bg-[#252C3E] text-slate-300 font-bold cursor-pointer"
            >
              -
            </button>
            <span className="font-bold text-white px-1.5">
              {refraction.binocularPd.toFixed(1)}{' '}
              <span className="text-[10px] text-slate-400">mm</span>
            </span>
            <button
              type="button"
              onClick={() => handleStepBinocularPd(0.5)}
              className="px-1.5 py-0.5 bg-[#171B26] hover:bg-[#252C3E] text-slate-300 font-bold cursor-pointer"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsPdLinked(!isPdLinked)}
            title="Toggle Monocular / Binocular PD Auto-Link"
            className={`px-1.5 py-0.5 border text-[9px] uppercase cursor-pointer ${
              isPdLinked
                ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
                : 'bg-[#12151E] border-[#262C3D] text-slate-500'
            }`}
          >
            {isPdLinked ? 'LINKED' : 'INDEP'}
          </button>
        </div>

        {/* Right: Quick Routine Actions & Collapse Toggle */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handleCopyOdToOs}
            title="Copy OD Sphere, Cylinder & Axis to OS"
            className="px-2 py-1 bg-[#12151E] hover:bg-[#1A1F2C] border border-[#252C3D] text-slate-300 hover:text-white text-[10px] uppercase font-bold cursor-pointer"
          >
            OD → OS
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2.5 py-1 bg-[#151924] hover:bg-[#202738] border border-[#283144] text-amber-400 text-[10px] uppercase font-bold cursor-pointer"
          >
            {isExpanded ? '▲ COMPACT' : '▼ FULL DIALS'}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* DUOCHROME RAM-GAP CLINICAL GUIDANCE STRIP                 */}
      {/* "Red Add Minus, Green Add Plus" (Active on Duochrome)    */}
      {/* ========================================================= */}
      {isDuochromeActive && (
        <div className="bg-gradient-to-r from-red-950/60 via-[#0B0D12] to-emerald-950/60 border-b border-[#2D3446] px-3 py-2 flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs font-black tracking-wider text-slate-200">
              DUOCHROME RAM-GAP:
            </span>
            <span className="text-[11px] text-slate-400">
              Red Add Minus, Green Add Plus • Testing{' '}
              <strong className={focusedEye === 'OD' ? 'text-amber-400' : 'text-emerald-400'}>
                {focusedEye}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDuochromeRedSharper}
              className="px-3 py-1.5 bg-red-900/90 hover:bg-red-800 active:scale-[0.98] border border-red-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-950/50"
            >
              <span>◄ RED SHARPER</span>
              <span className="px-1 bg-black/40 text-red-200 text-[10px] rounded">
                -0.25 D
              </span>
            </button>

            <button
              type="button"
              onClick={handleDuochromeBalanced}
              className={`px-3 py-1.5 border font-bold text-xs uppercase cursor-pointer transition ${
                duochromeLocked
                  ? 'bg-amber-500 text-black border-amber-400 font-black shadow-lg shadow-amber-500/30'
                  : 'bg-[#151924] hover:bg-[#202738] border-[#2C3448] text-slate-200'
              }`}
            >
              {duochromeLocked ? '✓ BALANCED (LOCKED)' : 'EQUAL / BALANCED'}
            </button>

            <button
              type="button"
              onClick={handleDuochromeGreenSharper}
              className="px-3 py-1.5 bg-emerald-900/90 hover:bg-emerald-800 active:scale-[0.98] border border-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              <span>GREEN SHARPER ►</span>
              <span className="px-1 bg-black/40 text-emerald-200 text-[10px] rounded">
                +0.25 D
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* JACKSON CROSS-CYLINDER (JCC) CLINICAL CONTROL BAR        */}
      {/* Position 1 vs 2 Flip, Axis vs Power, Power Steps         */}
      {/* ========================================================= */}
      {isJccActive && (
        <div className="bg-[#0D1017] border-b border-[#252C3D] px-3 py-2 flex flex-wrap items-center justify-between gap-2 font-mono">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-[#171D2A] border border-[#2C354A] text-amber-400 font-black text-xs">
              JCC CONTROLLER
            </span>
            <span className="text-[11px] text-slate-300">
              Refining{' '}
              <strong className={focusedEye === 'OD' ? 'text-amber-400' : 'text-emerald-400'}>
                {focusedEye}
              </strong>{' '}
              Astigmatism
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 1 vs 2 Flip Button */}
            <button
              type="button"
              onClick={handleJccFlip}
              className={`px-3 py-1.5 border font-black text-xs flex items-center gap-2 cursor-pointer transition active:scale-[0.98] ${
                jcc.flipPosition === 1
                  ? 'bg-rose-950/90 border-rose-500 text-rose-200 shadow-lg shadow-rose-950/40'
                  : 'bg-slate-800 border-white text-white shadow-lg shadow-white/10'
              }`}
            >
              <span>FLIP JCC [SPACE / J]</span>
              <span className="px-1.5 py-0.2 bg-black/50 text-[10px] rounded uppercase font-bold">
                {jcc.flipPosition === 1 ? 'POS 1 (RED)' : 'POS 2 (WHITE)'}
              </span>
            </button>

            {/* Axis vs Power Toggle */}
            <div className="flex border border-[#283144]">
              <button
                type="button"
                onClick={handleJccToggleMode}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer ${
                  jcc.refinementMode === 'AXIS'
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#12151E] text-slate-400 hover:text-white'
                }`}
              >
                AXIS (45° STRADDLE)
              </button>
              <button
                type="button"
                onClick={handleJccToggleMode}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase cursor-pointer ${
                  jcc.refinementMode === 'POWER'
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#12151E] text-slate-400 hover:text-white'
                }`}
              >
                POWER (PARALLEL)
              </button>
            </div>

            {/* Power Step Toggle: 0.25 vs 0.50 */}
            <button
              type="button"
              onClick={handleJccToggleStep}
              className="px-2 py-1 bg-[#151924] hover:bg-[#202738] border border-[#283144] text-[10px] text-slate-300 font-bold uppercase cursor-pointer"
            >
              STEP: ±{jcc.powerStep.toFixed(2)} D
            </button>
          </div>

          {/* Contextual Clinical Quick Steer Actions */}
          <div className="w-full pt-1.5 border-t border-[#1A1F2C] flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px]">
              {jcc.refinementMode === 'AXIS'
                ? 'Doctor prompt: "Is 1 or 2 clearer, or about the same?"'
                : 'Doctor prompt: "Is 1 or 2 clearer, or about the same?"'}
            </span>
            <div className="flex items-center gap-1.5">
              {jcc.refinementMode === 'AXIS' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleJccAxisSteer('red')}
                    className="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/60 text-rose-200 font-bold cursor-pointer"
                  >
                    1 CLEARER (-5° TO RED)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJccAxisSteer('white')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-400 text-white font-bold cursor-pointer"
                  >
                    2 CLEARER (+5° TO WHITE)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleJccPowerAdjust('more_minus')}
                    className="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/60 text-rose-200 font-bold cursor-pointer"
                  >
                    1 CLEARER (ADD -0.25D CYL)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJccPowerAdjust('less_minus')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-400 text-white font-bold cursor-pointer"
                  >
                    2 CLEARER (DROP +0.25D CYL)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DUAL EYE REFRACTION BAYS: OD & OS                         */}
      {/* ========================================================= */}
      {isExpanded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
          {renderEyeBay('od')}
          {renderEyeBay('os')}
        </div>
      ) : (
        /* Compact Single-Row Telemetry HUD */
        <div className="grid grid-cols-2 gap-2 p-2 font-mono text-xs">
          {(['od', 'os'] as const).map((eye) => {
            const isOd = eye === 'od';
            const eyeLabel = isOd ? 'OD' : 'OS';
            const eyeState = refraction[eye];
            const accent = isOd ? 'text-amber-400' : 'text-emerald-400';
            return (
              <div
                key={eye}
                onClick={() => setFocusedEye(eyeLabel)}
                className="bg-[#0D0F14] border border-[#1E2330] p-2 flex items-center justify-between cursor-pointer hover:border-slate-600"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-black font-black text-[10px] ${
                      isOd ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  >
                    {eyeLabel}
                  </span>
                  <span className={`font-bold ${accent}`}>
                    {formatPrescription(eyeState)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStepSphere(eye, -0.25);
                    }}
                    className="px-1.5 py-0.5 bg-[#161A24] text-slate-300 font-bold border border-[#252C3D]"
                  >
                    -
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStepSphere(eye, 0.25);
                    }}
                    className="px-1.5 py-0.5 bg-[#161A24] text-slate-300 font-bold border border-[#252C3D]"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
