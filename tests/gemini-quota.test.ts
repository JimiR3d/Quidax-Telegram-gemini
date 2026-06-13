import { describe, it, expect } from "vitest";
import { describeLLMError, isQuotaExhaustedError } from "../gemini-quota";

describe("describeLLMError", () => {
  it("extracts status, statusText, and errorDetails from a Gemini SDK error", () => {
    const e: any = new Error(
      "[429 Too Many Requests] You exceeded your current quota",
    );
    e.status = 429;
    e.statusText = "Too Many Requests";
    e.errorDetails = [{ reason: "RATE_LIMIT_EXCEEDED" }];
    const d = describeLLMError(e);
    expect(d.message).toContain("exceeded your current quota");
    expect(d.status).toBe(429);
    expect(d.statusText).toBe("Too Many Requests");
    expect(d.errorDetails).toEqual([{ reason: "RATE_LIMIT_EXCEEDED" }]);
  });

  it("reads status from a nested response when not top-level", () => {
    const e: any = { message: "boom", response: { status: 503, statusText: "Service Unavailable" } };
    const d = describeLLMError(e);
    expect(d.status).toBe(503);
    expect(d.statusText).toBe("Service Unavailable");
  });

  it("omits absent fields and never throws on a bare string or null", () => {
    const d = describeLLMError("plain string");
    expect(d.message).toBe("plain string");
    expect(d.status).toBeUndefined();
    expect(d.statusText).toBeUndefined();
    expect(d.errorDetails).toBeUndefined();
    expect(describeLLMError(null).message).toBe("");
  });
});

describe("isQuotaExhaustedError", () => {
  it("is true for an HTTP 429 (numeric status)", () => {
    expect(isQuotaExhaustedError({ status: 429, message: "Too Many Requests" })).toBe(true);
    expect(isQuotaExhaustedError({ response: { status: 429 }, message: "x" })).toBe(true);
  });

  it("is true for RESOURCE_EXHAUSTED / quota wording in the message", () => {
    expect(
      isQuotaExhaustedError(new Error("[429] RESOURCE_EXHAUSTED: quota")),
    ).toBe(true);
    expect(
      isQuotaExhaustedError(new Error("You exceeded your current quota, please check your plan")),
    ).toBe(true);
    expect(isQuotaExhaustedError({ status: "RESOURCE_EXHAUSTED", message: "" })).toBe(true);
  });

  it("finds quota wording buried in errorDetails", () => {
    expect(
      isQuotaExhaustedError({
        message: "request failed",
        errorDetails: [{ reason: "RESOURCE_EXHAUSTED" }],
      }),
    ).toBe(true);
  });

  it("is FALSE for a transient 503 / high-demand overload (short-backoff territory)", () => {
    expect(
      isQuotaExhaustedError(new Error("[503 Service Unavailable] The model is overloaded, high demand")),
    ).toBe(false);
    expect(isQuotaExhaustedError({ status: 503, message: "overloaded" })).toBe(false);
  });

  it("is FALSE for a timeout, a 4xx that is not 429, and a breaker fast-fail", () => {
    expect(isQuotaExhaustedError(new Error("[Timeout] Gemini exceeded 10000ms"))).toBe(false);
    expect(isQuotaExhaustedError({ status: 400, message: "invalid argument" })).toBe(false);
    expect(isQuotaExhaustedError({ status: 404, message: "model not found" })).toBe(false);
    expect(isQuotaExhaustedError(new Error("[CircuitBreaker] gemini is OPEN - fast-failing"))).toBe(false);
  });

  it("never throws on null / undefined / bare string", () => {
    expect(isQuotaExhaustedError(null)).toBe(false);
    expect(isQuotaExhaustedError(undefined)).toBe(false);
    expect(isQuotaExhaustedError("some string")).toBe(false);
  });
});
