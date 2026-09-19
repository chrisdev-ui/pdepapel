import { describe, expect, it } from "vitest";

import {
  describeDevice,
  expiryFrom,
  formatPairingCode,
  generatePairingCode,
  isValidPairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_TTL_MS,
  pairingProblem,
  pairingUrl,
  scanProblem,
  sessionStatus,
} from "@/lib/scanner-pairing";

const NOW = Date.parse("2026-09-19T12:00:00.000Z");

/**
 * El código corto solo empareja una pantalla con un celular; Clerk pone la
 * seguridad. Estas reglas deciden qué sesión sigue viva, quién puede
 * vincularse y qué celular puede enviar lecturas.
 */
describe("pairing code", () => {
  it("is six characters from an alphabet without 0/O or 1/I/L", () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
    expect(isValidPairingCode(code)).toBe(true);
    expect(PAIRING_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(generatePairingCode(() => 0)).toBe("AAAAAA");
  });

  it("normalizes what a person types and formats it for the screen", () => {
    expect(normalizePairingCode(" k7p-4q2 ")).toBe("K7P4Q2");
    expect(normalizePairingCode("k7p4q2extra")).toBe("K7P4Q2");
    expect(formatPairingCode("K7P4Q2")).toBe("K7P 4Q2");
    expect(isValidPairingCode("K7P4Q2")).toBe(true);
    expect(isValidPairingCode("K7P4Q0")).toBe(false);
    expect(isValidPairingCode("K7P4Q")).toBe(false);
  });

  it("builds the link the QR carries", () => {
    expect(pairingUrl("https://admin.papeleriapdepapel.com/", "store-1", "K7P4Q2")).toBe(
      "https://admin.papeleriapdepapel.com/store-1/escaner?codigo=K7P4Q2",
    );
  });
});

describe("session lifecycle", () => {
  const fresh = { pairedAt: null, expiresAt: expiryFrom(NOW), revokedAt: null, pairingToken: null };

  it("waits, then is paired, then expires after ten minutes of inactivity", () => {
    expect(sessionStatus(fresh, NOW)).toBe("waiting");
    const paired = { ...fresh, pairedAt: new Date(NOW), pairingToken: "t1" };
    expect(sessionStatus(paired, NOW + 1000)).toBe("paired");
    expect(sessionStatus(paired, NOW + PAIRING_TTL_MS)).toBe("expired");
    expect(pairingProblem(paired, NOW + PAIRING_TTL_MS)).toBe("EXPIRED");
    expect(pairingProblem(paired, NOW + 1000)).toBeNull();
  });

  it("is revoked once the screen unlinks it, whatever the expiry", () => {
    const revoked = { ...fresh, pairedAt: new Date(NOW), pairingToken: "t1", revokedAt: new Date(NOW + 5000) };
    expect(sessionStatus(revoked, NOW + 6000)).toBe("revoked");
    expect(pairingProblem(revoked, NOW + 6000)).toBe("REVOKED");
    expect(scanProblem(revoked, "t1", NOW + 6000)).toBe("REVOKED");
  });

  it("only the phone holding the current token can send scans: re-pairing replaces the old one", () => {
    const first = { ...fresh, pairedAt: new Date(NOW), pairingToken: "token-phone-1" };
    expect(scanProblem(first, "token-phone-1", NOW + 1000)).toBeNull();
    // Un segundo celular se vincula con el mismo código: token nuevo.
    const second = { ...first, pairingToken: "token-phone-2" };
    expect(scanProblem(second, "token-phone-1", NOW + 2000)).toBe("REPLACED");
    expect(scanProblem(second, "token-phone-2", NOW + 2000)).toBeNull();
    expect(scanProblem(fresh, "token-phone-1", NOW)).toBe("NOT_PAIRED");
    expect(scanProblem(second, null, NOW)).toBe("REPLACED");
  });

  it("names the paired device from its user agent", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(describeDevice(null)).toBe("Celular");
  });
});
