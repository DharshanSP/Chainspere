import { describe, expect, it } from "vitest";
import { conversationIdFor, isValidAddress, normalizeAddress, shortAddress } from "../src/lib/address";
import { parseHash } from "../src/router";

const ADDR = "0xAbCdEf0123456789abcdef0123456789ABCDEF01";

describe("address helpers", () => {
  it("validates 0x addresses", () => {
    expect(isValidAddress(ADDR)).toBe(true);
    expect(isValidAddress("0xnope")).toBe(false);
  });

  it("normalizes to lowercase", () => {
    expect(normalizeAddress(ADDR)).toBe(ADDR.toLowerCase());
    expect(() => normalizeAddress("nope")).toThrow();
  });

  it("shortens for display", () => {
    expect(shortAddress(ADDR)).toBe("0xAbCd…EF01");
  });

  it("builds conversation ids from peers", () => {
    expect(conversationIdFor(ADDR as `0x${string}`)).toBe(ADDR.toLowerCase());
  });
});

describe("hash router", () => {
  it("parses each route", () => {
    expect(parseHash("")).toEqual({ name: "chats" });
    expect(parseHash("#/signin")).toEqual({ name: "signin" });
    expect(parseHash("#/contacts")).toEqual({ name: "contacts" });
    expect(parseHash("#/settings")).toEqual({ name: "settings" });
    expect(parseHash("#/chats")).toEqual({ name: "chats" });
    expect(parseHash(`#/chats/${ADDR.toLowerCase()}`)).toEqual({ name: "chat", peer: ADDR.toLowerCase() });
  });

  it("falls back to chats for unknown paths", () => {
    expect(parseHash("#/nope")).toEqual({ name: "chats" });
  });
});
