import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyCronHmac,
  verifyDeviceIngestHmac,
} from "./hmacAuth.js";

const SECRET = "unit-test-secret-min-16chars";

function sign(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

describe("verifyCronHmac", () => {
  it("accepts a valid timestamp + signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(SECRET, ts);
    expect(
      verifyCronHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: sig,
        skewSeconds: 300,
      })
    ).toBe(true);
  });

  it("rejects when timestamp is outside skew window", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    const sig = sign(SECRET, ts);
    expect(
      verifyCronHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: sig,
        skewSeconds: 300,
      })
    ).toBe(false);
  });

  it("rejects when signature is wrong", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(
      verifyCronHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: "00".repeat(32),
        skewSeconds: 300,
      })
    ).toBe(false);
  });
});

describe("verifyDeviceIngestHmac", () => {
  const body = JSON.stringify({
    hardwareId: "hw-1",
    readings: [{ measuredAt: "2030-06-01T00:00:00.000Z", tempC: 22 }],
  });

  function expectedSig(ts: string, rawBody: string): string {
    const hash = crypto.createHash("sha256").update(rawBody).digest("hex");
    return sign(SECRET, `${ts}\n${hash}`);
  }

  it("accepts a correctly signed body", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(
      verifyDeviceIngestHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: expectedSig(ts, body),
        rawBody: body,
        skewSeconds: 300,
      })
    ).toBe(true);
  });

  it("rejects when body is tampered after signing", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = expectedSig(ts, body);
    const tampered = body.replace("22", "99");
    expect(
      verifyDeviceIngestHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: sig,
        rawBody: tampered,
        skewSeconds: 300,
      })
    ).toBe(false);
  });

  it("rejects stale timestamps", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    expect(
      verifyDeviceIngestHmac({
        secret: SECRET,
        timestampHeader: ts,
        signatureHeader: expectedSig(ts, body),
        rawBody: body,
        skewSeconds: 300,
      })
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifyDeviceIngestHmac({
        secret: SECRET,
        timestampHeader: undefined,
        signatureHeader: undefined,
        rawBody: body,
        skewSeconds: 300,
      })
    ).toBe(false);
  });
});
