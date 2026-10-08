import "@testing-library/jest-dom/vitest";

const FAKE_STORE_SENDER = {
  STORE_SENDER_FIRST_NAME: "Remitente",
  STORE_SENDER_LAST_NAME: "De Prueba",
  STORE_SENDER_EMAIL: "envios@ejemplo.test",
  STORE_SENDER_PHONE: "3000000000",
  STORE_SENDER_ADDRESS: "Calle 123 # 45-67, Apto 101",
};
for (const [key, value] of Object.entries(FAKE_STORE_SENDER)) process.env[key] ??= value;

if (typeof window !== "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverMock;
}
