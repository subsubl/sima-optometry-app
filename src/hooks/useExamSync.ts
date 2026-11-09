import { useCallback, useEffect, useRef, useState } from 'react';
import { CalibrationConfig, ExamState } from '../types/exam';
import { DEFAULT_EXAM_STATE } from '../engine/examDefaults';

const CALIBRATION_STORAGE_KEY = 'optisuite_2020_calibration_v1';

export interface NetworkPairingInfo {
  lanIp: string;
  port: number;
  doctorUrl: string;
  patientUrl: string;
  qrDataUrl: string;
  connectedClients: number;
}

function loadSavedCalibration(): CalibrationConfig {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_EXAM_STATE.calibration, ...parsed };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_EXAM_STATE.calibration;
}

export function useExamSync() {
  const [state, setState] = useState<ExamState>(() => ({
    ...DEFAULT_EXAM_STATE,
    calibration: loadSavedCalibration(),
  }));
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkPairingInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Fetch LAN IP and QR code from local server
  const refreshNetworkInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data: NetworkPairingInfo = await res.json();
        setNetworkInfo(data);
      }
    } catch {
      // Fallback if running without backend API
      const origin = window.location.origin;
      setNetworkInfo({
        lanIp: window.location.hostname,
        port: Number(window.location.port) || 80,
        doctorUrl: `${origin}/#/doctor`,
        patientUrl: `${origin}/#/patient`,
        qrDataUrl: '',
        connectedClients: 1,
      });
    }
  }, []);

  useEffect(() => {
    refreshNetworkInfo();
    const timer = setInterval(refreshNetworkInfo, 8000);
    return () => clearInterval(timer);
  }, [refreshNetworkInfo]);

  // Connect to WebSocket & BroadcastChannel
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    // Local BroadcastChannel for zero-latency same-machine multi-window sync
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('optisuite_2020_channel');
      bc.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'STATE_UPDATE') {
          setState(ev.data.payload);
        }
      };
      bcRef.current = bc;
    }

    const connectWs = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) return;
        setIsConnected(true);
        // Send saved calibration if local machine has calibrated it
        const savedCal = loadSavedCalibration();
        ws.send(
          JSON.stringify({
            type: 'CALIBRATION_INIT',
            payload: savedCal,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE_SYNC' && msg.payload) {
            setState(msg.payload);
            if (msg.payload.calibration) {
              localStorage.setItem(
                CALIBRATION_STORAGE_KEY,
                JSON.stringify(msg.payload.calibration)
              );
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setIsConnected(false);
        reconnectTimer = setTimeout(connectWs, 1200);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
      if (bcRef.current) bcRef.current.close();
    };
  }, []);

  // Dispatch partial state updates or functional state updates
  const updateState = useCallback((updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => {
    setState((prev) => {
      const next: ExamState =
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };

      // Persist calibration locally whenever changed
      if (next.calibration !== prev.calibration) {
        try {
          localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next.calibration));
        } catch {
          // ignore
        }
      }

      // Broadcast via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'STATE_PATCH',
            payload: next,
          })
        );
      }

      // Broadcast via local BroadcastChannel
      if (bcRef.current) {
        bcRef.current.postMessage({
          type: 'STATE_UPDATE',
          payload: next,
        });
      }

      return next;
    });
  }, []);

  const randomizeOptotypes = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      randomSeed: prev.randomSeed + 1,
      currentLineScores: ['untested', 'untested', 'untested', 'untested', 'untested'],
    }));
  }, [updateState]);

  const resetSession = useCallback(() => {
    updateState((prev) => ({
      ...DEFAULT_EXAM_STATE,
      calibration: prev.calibration,
      doctorNotation: prev.doctorNotation,
      randomSeed: prev.randomSeed + 1,
    }));
  }, [updateState]);

  return {
    state,
    updateState,
    randomizeOptotypes,
    resetSession,
    isConnected,
    networkInfo,
    refreshNetworkInfo,
  };
}
