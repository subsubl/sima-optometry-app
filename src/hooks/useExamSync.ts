import { useCallback, useEffect, useRef, useState } from 'react';
import { CalibrationConfig, ExamState, SyncMessageEnvelope, SyncMessageType } from '../types/exam';
import { DEFAULT_EXAM_STATE } from '../engine/examDefaults';
import { sanitizeExamState } from '../engine/refractionMath';

const CALIBRATION_STORAGE_KEY = 'optisuite_2020_calibration_v1';
const SESSION_STORAGE_KEY = 'optisuite_2020_client_session_id';

export interface NetworkAdapterInfo {
  name: string;
  address: string;
}

export interface NetworkPairingInfo {
  lanIp: string;
  allLanIps?: string[];
  adapters?: NetworkAdapterInfo[];
  port: number;
  doctorUrl: string;
  patientUrl: string;
  qrDataUrl: string;
  connectedClients: number;
}

export interface UseExamSyncOptions {
  /** Whether to poll /api/network-info every interval. Defaults to true on doctor console, false on patient display */
  enableNetworkPolling?: boolean;
  /** Polling interval in milliseconds. Defaults to 8000ms */
  pollingIntervalMs?: number;
}

export interface ReconnectBackoffOptions {
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

export type { SyncMessageEnvelope, SyncMessageType };

/**
 * Calculates exponential backoff delay with bounded additive jitter.
 * Defaults: 800ms base, 1.5x factor, 10000ms max, 400ms jitter range.
 */
export function computeReconnectBackoff(
  attempt: number,
  options?: ReconnectBackoffOptions,
  randomFn: () => number = Math.random
): number {
  const base = options?.baseDelayMs ?? 800;
  const factor = options?.factor ?? 1.5;
  const maxDelay = options?.maxDelayMs ?? 10000;
  const jitterRange = options?.jitterMs ?? 400;

  let safeAttempt = 0;
  if (attempt === Infinity) {
    safeAttempt = 1000;
  } else if (Number.isFinite(attempt)) {
    safeAttempt = Math.max(0, Math.floor(attempt));
  }
  const rawExponential = base * Math.pow(factor, safeAttempt);
  const cappedBase = Math.min(maxDelay, rawExponential);
  const jitter = Math.max(0, Math.min(1, randomFn())) * jitterRange;
  return Math.min(maxDelay, Math.round(cappedBase + jitter));
}

/**
 * Alias for computeReconnectBackoff supporting alternate parameter signature.
 */
export function calculateBackoffWithJitter(
  attempt: number,
  baseMs = 800,
  maxMs = 10000,
  jitterMs = 400,
  randomFn: () => number = Math.random
): number {
  return computeReconnectBackoff(
    attempt,
    { baseDelayMs: baseMs, maxDelayMs: maxMs, jitterMs },
    randomFn
  );
}

/**
 * Checks whether the current window location corresponds to the patient display route.
 */
export function isPatientDisplayRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = (window.location.hash || '').toLowerCase();
  const search = (window.location.search || '').toLowerCase();
  return hash.includes('patient') || search.includes('role=patient');
}

/**
 * Generates or retrieves a persistent client session ID for this browser tab.
 */
export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'client_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    return newId;
  } catch {
    return 'client_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  }
}

/**
 * Creates a standard protocol envelope. Supports both:
 * - createSyncEnvelope(type, payload, senderId, seq, timestamp)
 * - createSyncEnvelope(type, senderId, seq, payload, timestamp)
 */
export function createSyncEnvelope<T = any>(
  type: SyncMessageType,
  arg2: any,
  arg3?: any,
  arg4?: any,
  arg5?: any
): SyncMessageEnvelope<T> {
  if (typeof arg2 === 'string' && typeof arg3 === 'number') {
    // Signature: (type, senderId, seq, payload, timestamp)
    return {
      type,
      senderId: arg2,
      seq: arg3,
      timestamp: typeof arg5 === 'number' ? arg5 : Date.now(),
      payload: arg4 as T,
    };
  }
  // Signature: (type, payload, senderId, seq, timestamp)
  return {
    type,
    senderId: typeof arg3 === 'string' ? arg3 : 'client',
    seq: typeof arg4 === 'number' ? arg4 : 1,
    timestamp: typeof arg5 === 'number' ? arg5 : Date.now(),
    payload: arg2 as T,
  };
}

export function serializeSyncEnvelope<T>(envelope: SyncMessageEnvelope<T>): string {
  return JSON.stringify(envelope);
}

export function deserializeSyncEnvelope<T = any>(
  raw: string | Buffer | ArrayBuffer
): SyncMessageEnvelope<T> | null {
  try {
    const str = typeof raw === 'string' ? raw : raw.toString();
    const parsed = JSON.parse(str);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const validTypes = ['STATE_PATCH', 'STATE_SYNC', 'CALIBRATION_INIT', 'PING', 'PONG', 'ACK'];
    if (!validTypes.includes(parsed.type)) return null;
    if (typeof parsed.senderId !== 'string' || parsed.senderId.trim() === '') return null;
    if (typeof parsed.seq !== 'number' || !Number.isInteger(parsed.seq) || parsed.seq < 0) return null;
    if (typeof parsed.timestamp !== 'number' || !Number.isFinite(parsed.timestamp) || parsed.timestamp <= 0) return null;

    return parsed as SyncMessageEnvelope<T>;
  } catch {
    return null;
  }
}

export function shouldApplySyncEnvelope(
  envelope: SyncMessageEnvelope,
  currentClientId: string,
  lastAppliedSeqMap: Map<string, number>
): boolean {
  // Echo suppression: Ignore self-originated updates
  if (envelope.senderId === currentClientId) {
    return false;
  }
  // Sequence ordering: Ignore duplicate or retrograde updates
  const lastSeq = lastAppliedSeqMap.get(envelope.senderId) ?? -1;
  if (envelope.seq <= lastSeq) {
    return false;
  }
  return true;
}

export function createSequenceGenerator(senderId: string) {
  let seq = 0;
  return {
    senderId,
    nextEnvelope: <T>(type: SyncMessageType, payload: T) => {
      seq += 1;
      return createSyncEnvelope(type, payload, senderId, seq);
    },
    getCurrentSeq: () => seq,
  };
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

export function useExamSync(options: UseExamSyncOptions = {}) {
  const {
    enableNetworkPolling = !isPatientDisplayRoute(),
    pollingIntervalMs = 8000,
  } = options;

  const [state, setState] = useState<ExamState>(() => ({
    ...DEFAULT_EXAM_STATE,
    calibration: loadSavedCalibration(),
  }));
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkPairingInfo | null>(null);

  const clientSessionIdRef = useRef<string>(getOrCreateSessionId());
  const seqRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const stateRef = useRef<ExamState>(state);
  const lastSeqMapRef = useRef<Map<string, number>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Maintain stateRef synchronously with React state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Fetch LAN IP and QR code from local server
  const refreshNetworkInfo = useCallback(async (requestedIp?: string) => {
    try {
      const url = requestedIp
        ? `/api/network-info?ip=${encodeURIComponent(requestedIp)}`
        : '/api/network-info';
      const res = await fetch(url);
      if (res.ok) {
        const data: NetworkPairingInfo = await res.json();
        setNetworkInfo(data);
      }
    } catch {
      // Fallback if running without backend API
      const origin = window.location.origin;
      setNetworkInfo({
        lanIp: window.location.hostname,
        allLanIps: [window.location.hostname],
        port: Number(window.location.port) || 80,
        doctorUrl: `${origin}/#/doctor`,
        patientUrl: `${origin}/#/patient`,
        qrDataUrl: '',
        connectedClients: 1,
      });
    }
  }, []);

  // Conditional network polling: disabled on PatientDisplay
  useEffect(() => {
    if (!enableNetworkPolling) return;

    refreshNetworkInfo();
    const timer = setInterval(() => {
      refreshNetworkInfo();
    }, pollingIntervalMs);

    return () => clearInterval(timer);
  }, [enableNetworkPolling, pollingIntervalMs, refreshNetworkInfo]);

  // Connect to WebSocket & BroadcastChannel
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    // Local BroadcastChannel for zero-latency same-machine multi-window sync
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('optisuite_2020_channel');
      bc.onmessage = (ev) => {
        try {
          const data = ev.data;
          if (!data) return;

          // Echo suppression: ignore messages from our own session
          if (data.senderId && data.senderId === clientSessionIdRef.current) {
            return;
          }

          // Causal sequence tracking per sender
          if (data.senderId && typeof data.seq === 'number') {
            const lastSeq = lastSeqMapRef.current.get(data.senderId) ?? -1;
            if (data.seq <= lastSeq) {
              return;
            }
            lastSeqMapRef.current.set(data.senderId, data.seq);
          }

          if (
            data.type === 'STATE_UPDATE' ||
            data.type === 'STATE_PATCH' ||
            data.type === 'STATE_SYNC'
          ) {
            const rawPayload = data.payload !== undefined ? data.payload : data;
            const sanitized = sanitizeExamState(rawPayload);
            stateRef.current = sanitized;
            setState(sanitized);

            if (sanitized.calibration) {
              try {
                localStorage.setItem(
                  CALIBRATION_STORAGE_KEY,
                  JSON.stringify(sanitized.calibration)
                );
              } catch {
                // ignore storage errors
              }
            }
          }
        } catch (err) {
          console.warn('[BroadcastChannel] Error parsing message:', err);
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
        // Reset exponential backoff attempts on successful connect
        reconnectAttemptsRef.current = 0;

        // Send saved calibration in standard envelope
        const savedCal = loadSavedCalibration();
        seqRef.current += 1;
        const envelope = createSyncEnvelope(
          'CALIBRATION_INIT',
          savedCal,
          clientSessionIdRef.current,
          seqRef.current
        );
        try {
          ws.send(JSON.stringify(envelope));
        } catch (err) {
          console.warn('[WebSocket] Initial calibration send failed:', err);
        }
      };

      ws.onmessage = (event) => {
        try {
          const rawStr = typeof event.data === 'string' ? event.data : event.data.toString();
          const msg = JSON.parse(rawStr);
          if (!msg || typeof msg !== 'object') return;

          // Handle server-side ping heartbeat by responding with PONG
          if (msg.type === 'PING') {
            if (ws.readyState === WebSocket.OPEN) {
              seqRef.current += 1;
              const pong = createSyncEnvelope(
                'PONG',
                null,
                clientSessionIdRef.current,
                seqRef.current
              );
              ws.send(JSON.stringify(pong));
            }
            return;
          }

          // Echo suppression: ignore messages originated by our own client session
          if (msg.senderId && msg.senderId === clientSessionIdRef.current) {
            return;
          }

          // Causal sequence tracking per sender
          if (msg.senderId && typeof msg.seq === 'number') {
            const lastSeq = lastSeqMapRef.current.get(msg.senderId) ?? -1;
            if (msg.seq <= lastSeq) {
              return;
            }
            lastSeqMapRef.current.set(msg.senderId, msg.seq);
          }

          if (msg.type === 'STATE_SYNC' && msg.payload) {
            const sanitized = sanitizeExamState(msg.payload);
            stateRef.current = sanitized;
            setState(sanitized);

            if (sanitized.calibration) {
              try {
                localStorage.setItem(
                  CALIBRATION_STORAGE_KEY,
                  JSON.stringify(sanitized.calibration)
                );
              } catch {
                // ignore storage errors
              }
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setIsConnected(false);

        // Compute exponential backoff with jitter
        const delay = computeReconnectBackoff(reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimer = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      };
    };

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignore
        }
      }
      if (bcRef.current) {
        try {
          bcRef.current.close();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  // Dispatch state updates with side effects extracted OUTSIDE of setState
  const updateState = useCallback(
    (updater: Partial<ExamState> | ((prev: ExamState) => ExamState)) => {
      const prevState = stateRef.current;
      const nextState: ExamState =
        typeof updater === 'function' ? updater(prevState) : { ...prevState, ...updater };

      // Update stateRef immediately to allow rapid sequential updates within the same tick
      stateRef.current = nextState;
      // Pure React state update — NO SIDE EFFECTS INSIDE
      setState(nextState);

      // --- Side effects extracted OUT of setState updater ---

      // 1. LocalStorage calibration persistence
      if (nextState.calibration !== prevState.calibration) {
        try {
          localStorage.setItem(
            CALIBRATION_STORAGE_KEY,
            JSON.stringify(nextState.calibration)
          );
        } catch {
          // ignore storage errors
        }
      }

      // 2. Broadcast via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        seqRef.current += 1;
        const envelope = createSyncEnvelope(
          'STATE_PATCH',
          nextState,
          clientSessionIdRef.current,
          seqRef.current
        );
        try {
          wsRef.current.send(JSON.stringify(envelope));
        } catch (err) {
          console.warn('[WebSocket] Send failed:', err);
        }
      }

      // 3. Broadcast via local BroadcastChannel
      if (bcRef.current) {
        seqRef.current += 1;
        const envelope = createSyncEnvelope(
          'STATE_PATCH',
          nextState,
          clientSessionIdRef.current,
          seqRef.current
        );
        try {
          bcRef.current.postMessage(envelope);
        } catch (err) {
          console.warn('[BroadcastChannel] Post failed:', err);
        }
      }
    },
    []
  );

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
    clientSessionId: clientSessionIdRef.current,
  };
}

