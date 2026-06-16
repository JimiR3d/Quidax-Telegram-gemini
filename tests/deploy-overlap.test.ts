import { describe, it, expect } from "vitest";
import {
  resolveConnectDelayMs,
  DEFAULT_CONNECT_DELAY_MS,
  MAX_CONNECT_DELAY_MS,
} from "../deploy-overlap";

describe("resolveConnectDelayMs — default when unset/blank/garbage", () => {
  it("returns the default when the env var is undefined", () => {
    expect(resolveConnectDelayMs(undefined)).toBe(DEFAULT_CONNECT_DELAY_MS);
  });

  it("returns the default when the env var is null", () => {
    expect(resolveConnectDelayMs(null)).toBe(DEFAULT_CONNECT_DELAY_MS);
  });

  it("returns the default for an empty or whitespace string", () => {
    expect(resolveConnectDelayMs("")).toBe(DEFAULT_CONNECT_DELAY_MS);
    expect(resolveConnectDelayMs("   ")).toBe(DEFAULT_CONNECT_DELAY_MS);
  });

  it("returns the default for a non-numeric string", () => {
    expect(resolveConnectDelayMs("soon")).toBe(DEFAULT_CONNECT_DELAY_MS);
    expect(resolveConnectDelayMs("60s")).toBe(DEFAULT_CONNECT_DELAY_MS);
  });

  it("honours a caller-supplied default", () => {
    expect(resolveConnectDelayMs(undefined, 12345)).toBe(12345);
  });
});

describe("resolveConnectDelayMs — explicit disable (0 / negative)", () => {
  it("treats '0' as disabled", () => {
    expect(resolveConnectDelayMs("0")).toBe(0);
  });

  it("treats a negative value as disabled (never waits negative time)", () => {
    expect(resolveConnectDelayMs("-1")).toBe(0);
    expect(resolveConnectDelayMs("-90000")).toBe(0);
  });
});

describe("resolveConnectDelayMs — valid values and clamping", () => {
  it("passes through a normal positive value", () => {
    expect(resolveConnectDelayMs("45000")).toBe(45000);
  });

  it("floors a fractional value to an integer", () => {
    expect(resolveConnectDelayMs("1500.9")).toBe(1500);
  });

  it("clamps anything above the max", () => {
    expect(resolveConnectDelayMs("9999999")).toBe(MAX_CONNECT_DELAY_MS);
  });

  it("allows exactly the max", () => {
    expect(resolveConnectDelayMs(String(MAX_CONNECT_DELAY_MS))).toBe(
      MAX_CONNECT_DELAY_MS,
    );
  });

  it("the default is within the allowed range", () => {
    expect(DEFAULT_CONNECT_DELAY_MS).toBeGreaterThan(0);
    expect(DEFAULT_CONNECT_DELAY_MS).toBeLessThanOrEqual(MAX_CONNECT_DELAY_MS);
  });
});
