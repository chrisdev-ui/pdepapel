"use client";

import axios from "axios";
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";

import { REMOTE_SCAN_POLL_MS, type ScannerSessionStatus } from "@/lib/scanner-pairing";

export type RemoteScannerStatus = "idle" | "creating" | ScannerSessionStatus | "error";

export interface RemoteScan {
  id: string;
  code: string;
  createdAt: string;
}

export interface RemoteScannerState {
  status: RemoteScannerStatus;
  code: string | null;
  pairUrl: string | null;
  expiresAt: string | null;
  deviceLabel: string | null;
  pairedAt: string | null;
  lastScan: RemoteScan | null;
  /** Qué botón de escanear recibe las lecturas del celular. */
  activeTargetId: string | null;
  error: string | null;
}

interface StoredSession {
  code: string;
  pairUrl: string;
  expiresAt: string;
  cursor: string | null;
}

const IDLE: RemoteScannerState = {
  status: "idle",
  code: null,
  pairUrl: null,
  expiresAt: null,
  deviceLabel: null,
  pairedAt: null,
  lastScan: null,
  activeTargetId: null,
  error: null,
};

const storageKey = (storeId: string) => `pdepapel:escaner:${storeId}`;

type Listener = () => void;
type ScanHandler = (code: string) => void;

/**
 * Un controlador por tienda, compartido por todos los botones de escanear de
 * la página: una sola sesión, una sola consulta cada 1,5 s, y las lecturas
 * van al botón activo (el primero que se montó, o el último desde el que se
 * abrió la ventana de vinculación). La sesión se guarda en `sessionStorage`
 * para que sobreviva al cambiar de pantalla dentro de la misma pestaña.
 */
class RemoteScannerController {
  private state: RemoteScannerState = IDLE;
  private listeners = new Set<Listener>();
  private targets = new Map<string, ScanHandler>();
  private order: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private cursor: string | null = null;
  private seen = new Set<string>();

  constructor(private readonly storeId: string) {
    this.restore();
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  register(id: string, handler: ScanHandler) {
    this.targets.set(id, handler);
    if (!this.order.includes(id)) this.order.push(id);
    if (!this.state.activeTargetId) this.set({ activeTargetId: this.order[0] ?? null });
    this.schedule(0);
    return () => {
      this.targets.delete(id);
      this.order = this.order.filter((item) => item !== id);
      if (this.state.activeTargetId === id) this.set({ activeTargetId: this.order[0] ?? null });
      if (this.targets.size === 0) this.clearTimer();
    };
  }

  /** «Recibir aquí»: el botón desde el que se abre la ventana pasa a recibir. */
  claim(id: string) {
    if (this.targets.has(id) && this.state.activeTargetId !== id) this.set({ activeTargetId: id });
  }

  /** Genera un código nuevo (también para «Generar otro código»). */
  async start() {
    if (!this.storeId || this.state.status === "creating") return;
    this.clearTimer();
    this.set({ ...IDLE, activeTargetId: this.state.activeTargetId, status: "creating" });
    try {
      const response = await axios.post(`/api/${this.storeId}/scanner-sessions`);
      const { code, pairUrl, expiresAt } = response.data as { code: string; pairUrl: string; expiresAt: string };
      this.cursor = null;
      this.seen.clear();
      this.persist({ code, pairUrl, expiresAt, cursor: null });
      this.set({ status: "waiting", code, pairUrl, expiresAt, deviceLabel: null, pairedAt: null, lastScan: null, error: null });
      this.schedule(0);
    } catch {
      this.set({ status: "error", error: "No se pudo generar el código. Revisa la conexión e inténtalo de nuevo." });
    }
  }

  /** «Desvincular»: la sesión deja de aceptar lecturas. */
  async stop() {
    const code = this.state.code;
    this.clearTimer();
    this.persist(null);
    this.set({ ...IDLE, activeTargetId: this.state.activeTargetId });
    if (code) {
      try {
        await axios.delete(`/api/${this.storeId}/scanner-sessions/${code}`);
      } catch {
        // Ya no se consulta más: si el borrado falla, la sesión vence sola.
      }
    }
  }

  private restore() {
    if (typeof window === "undefined" || !this.storeId) return;
    try {
      const raw = window.sessionStorage.getItem(storageKey(this.storeId));
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredSession;
      if (!stored.code || Date.parse(stored.expiresAt) <= Date.now()) {
        window.sessionStorage.removeItem(storageKey(this.storeId));
        return;
      }
      this.cursor = stored.cursor;
      this.state = { ...IDLE, status: "waiting", code: stored.code, pairUrl: stored.pairUrl, expiresAt: stored.expiresAt };
    } catch {
      // Sin almacenamiento: la sesión vive solo en esta página.
    }
  }

  private persist(session: StoredSession | null) {
    if (typeof window === "undefined") return;
    try {
      if (session) window.sessionStorage.setItem(storageKey(this.storeId), JSON.stringify(session));
      else window.sessionStorage.removeItem(storageKey(this.storeId));
    } catch {
      // Sin almacenamiento: nada que guardar.
    }
  }

  private set(patch: Partial<RemoteScannerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number) {
    this.clearTimer();
    if (!this.state.code || this.targets.size === 0) return;
    if (this.state.status !== "waiting" && this.state.status !== "paired") return;
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private async poll() {
    if (this.polling || !this.state.code) return;
    this.polling = true;
    try {
      const response = await axios.get(`/api/${this.storeId}/scanner-sessions/${this.state.code}`, {
        params: this.cursor ? { after: this.cursor } : {},
      });
      const data = response.data as {
        status: ScannerSessionStatus;
        deviceLabel: string | null;
        pairedAt: string | null;
        expiresAt: string;
        scans: RemoteScan[];
      };
      const fresh = data.scans.filter((scan) => !this.seen.has(scan.id));
      fresh.forEach((scan) => this.seen.add(scan.id));
      if (data.scans.length > 0) this.cursor = data.scans[data.scans.length - 1].createdAt;
      this.persist({ code: this.state.code, pairUrl: this.state.pairUrl ?? "", expiresAt: data.expiresAt, cursor: this.cursor });
      this.set({
        status: data.status,
        deviceLabel: data.deviceLabel,
        pairedAt: data.pairedAt,
        expiresAt: data.expiresAt,
        lastScan: fresh.length > 0 ? fresh[fresh.length - 1] : this.state.lastScan,
        error: null,
      });
      const target = (this.state.activeTargetId && this.targets.get(this.state.activeTargetId)) || this.targets.get(this.order[0]);
      if (target) fresh.forEach((scan) => target(scan.code));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.persist(null);
        this.set({ ...IDLE, activeTargetId: this.state.activeTargetId });
      } else {
        this.set({ error: "Sin conexión con el panel; se reintenta." });
      }
    } finally {
      this.polling = false;
      this.schedule(REMOTE_SCAN_POLL_MS);
    }
  }
}

const controllers = new Map<string, RemoteScannerController>();

export function getRemoteScannerController(storeId: string) {
  let controller = controllers.get(storeId);
  if (!controller) {
    controller = new RemoteScannerController(storeId);
    controllers.set(storeId, controller);
  }
  return controller;
}

/** Solo para pruebas: olvida los controladores y su estado. */
export function resetRemoteScannerControllers() {
  controllers.clear();
}

const getServerSnapshot = () => IDLE;

/**
 * Cada botón de escanear se registra como destino de las lecturas del celular.
 * `onScan` recibe el código tal cual, igual que la cámara local.
 */
export function useRemoteScanner(storeId: string, onScan: (code: string) => void) {
  const id = useId();
  const controller = storeId ? getRemoteScannerController(storeId) : null;
  const handlerRef = useRef(onScan);
  useEffect(() => {
    handlerRef.current = onScan;
  }, [onScan]);

  const subscribe = useCallback((listener: Listener) => (controller ? controller.subscribe(listener) : () => undefined), [controller]);
  const state = useSyncExternalStore(subscribe, () => (controller ? controller.getState() : IDLE), getServerSnapshot);

  useEffect(() => {
    if (!controller) return;
    return controller.register(id, (code) => handlerRef.current(code));
  }, [controller, id]);

  return {
    ...state,
    enabled: Boolean(controller),
    receiving: state.activeTargetId === id && (state.status === "paired" || state.status === "waiting"),
    start: () => controller?.start(),
    stop: () => controller?.stop(),
    claim: () => controller?.claim(id),
  };
}

export type RemoteScanner = ReturnType<typeof useRemoteScanner>;
