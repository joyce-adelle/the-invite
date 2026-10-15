import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseSupportRequest,
  SUPPORT_EMAIL_MAX_LENGTH,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_NAME_MAX_LENGTH,
} from "@/lib/validation/support";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  issueType: "CARD_NOT_RECEIVED",
  message: "I registered last week.",
};

function fieldErrors(input: Record<string, unknown>) {
  const result = parseSupportRequest({ ...valid, ...input });
  assert.equal(result.success, false, "expected validation to fail");
  return result.success ? {} : result.fieldErrors;
}

describe("parseSupportRequest", () => {
  it("accepts a complete request", () => {
    const result = parseSupportRequest(valid);
    assert.deepEqual(result.success && result.data, valid);
  });

  it("trims, collapses name whitespace and keeps message line breaks", () => {
    const result = parseSupportRequest({
      ...valid,
      name: "  Ada \t  Lovelace ",
      email: "  ada@example.com ",
      message: "  line one\r\nline two\rline three  ",
    });
    assert.ok(result.success);
    assert.equal(result.data.name, "Ada Lovelace");
    assert.equal(result.data.email, "ada@example.com");
    assert.equal(result.data.message, "line one\nline two\nline three");
  });

  it("strips control, zero-width and bidi-override characters", () => {
    const result = parseSupportRequest({
      ...valid,
      name: "Ad\u0000a​ Love‮lace",
      message: "hel\u0007lo\u0085 there﻿",
    });
    assert.ok(result.success);
    assert.equal(result.data.name, "Ada Lovelace");
    assert.equal(result.data.message, "hello there");
  });

  it("stores text in composed (NFC) form", () => {
    const result = parseSupportRequest({ ...valid, name: "Olá" });
    assert.ok(result.success);
    assert.equal(result.data.name, "Olá");
  });

  it("requires a name, email and issue type", () => {
    const errors = fieldErrors({ name: "  ", email: "", issueType: "" });
    assert.equal(errors.name, "Please enter your name.");
    assert.equal(errors.email, "Please enter your email address.");
    assert.equal(errors.issueType, "Please choose what you need help with.");
    assert.equal(errors.message, undefined);
  });

  it("rejects a malformed email", () => {
    for (const email of ["ada", "ada@", "@example.com", "ada @example.com"]) {
      assert.equal(fieldErrors({ email }).email, "Please enter a valid email address.", email);
    }
  });

  it("rejects an issue type that isn't one of the options", () => {
    for (const issueType of ["HACK", "other", "card_not_received", "OPEN"]) {
      assert.ok(fieldErrors({ issueType }).issueType, issueType);
    }
  });

  it("needs a message for Other, but not for the other issues", () => {
    assert.ok(fieldErrors({ issueType: "OTHER", message: "   " }).message);
    for (const issueType of ["CARD_NOT_RECEIVED", "UNABLE_TO_REGISTER", "DETAILS_INCORRECT"]) {
      assert.ok(parseSupportRequest({ ...valid, issueType, message: "" }).success, issueType);
    }
    assert.ok(parseSupportRequest({ ...valid, issueType: "OTHER", message: "Hello" }).success);
  });

  it("enforces length limits", () => {
    assert.ok(parseSupportRequest({ ...valid, name: "a".repeat(SUPPORT_NAME_MAX_LENGTH) }).success);
    assert.ok(fieldErrors({ name: "a".repeat(SUPPORT_NAME_MAX_LENGTH + 1) }).name);
    assert.ok(fieldErrors({ name: "a" }).name);

    const local = "a".repeat(SUPPORT_EMAIL_MAX_LENGTH - "@example.com".length);
    assert.ok(parseSupportRequest({ ...valid, email: `${local}@example.com` }).success);
    assert.equal(fieldErrors({ email: `${local}a@example.com` }).email, "That email address is too long.");

    assert.ok(parseSupportRequest({ ...valid, message: "m".repeat(SUPPORT_MESSAGE_MAX_LENGTH) }).success);
    assert.ok(fieldErrors({ message: "m".repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1) }).message);
  });

  it("treats non-string form values as empty", () => {
    const errors = fieldErrors({ name: null, email: new Blob(["x"]), issueType: undefined });
    assert.ok(errors.name && errors.email && errors.issueType);
  });

  it("reports the first problem for each field", () => {
    const result = parseSupportRequest({ name: "", email: "", issueType: "", message: "" });
    assert.ok(!result.success);
    assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["email", "issueType", "name"]);
  });
});
