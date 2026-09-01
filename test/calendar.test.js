import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedUrl,
  buildSubscriptionUrl,
  decodeSetupPayload,
  normalizeConnection,
  upcomingLessons,
} from "../calendar.js";

const connection = {
  version: 1,
  serviceUrl: "https://calendar.example/ignored/path",
  calendarId: "sit-private-01",
  readToken: "read_token_123456",
};

test("decodes and validates the extension's private iPhone setup payload", () => {
  const encoded = Buffer.from(JSON.stringify(connection), "utf8").toString("base64url");
  assert.deepEqual(decodeSetupPayload(encoded), {
    ...connection,
    serviceUrl: "https://calendar.example",
  });
});

test("requires HTTPS outside local development", () => {
  assert.throws(
    () => normalizeConnection({ ...connection, serviceUrl: "http://calendar.example" }),
    /HTTPS/,
  );
  assert.equal(
    normalizeConnection({ ...connection, serviceUrl: "http://127.0.0.1:8787" }).serviceUrl,
    "http://127.0.0.1:8787",
  );
});

test("builds protected JSON and Apple Calendar subscription URLs", () => {
  const feed = new URL(buildFeedUrl(connection));
  assert.equal(feed.pathname, "/v1/timetables/sit-private-01.json");
  assert.equal(feed.searchParams.get("token"), "read_token_123456");

  const subscription = buildSubscriptionUrl(connection);
  assert.match(subscription, /^webcal:\/\/calendar\.example\/v1\/timetables\/sit-private-01\.ics\?/);
  assert.match(subscription, /token=read_token_123456/);
});

test("shows only the next active or future lessons in chronological order", () => {
  const events = [
    {
      kind: "lesson",
      title: "Past lesson",
      start: "2026-09-01T08:00:00+08:00",
      end: "2026-09-01T09:00:00+08:00",
    },
    {
      kind: "lesson",
      title: "Next lesson",
      start: "2026-09-01T11:00:00+08:00",
      end: "2026-09-01T13:00:00+08:00",
    },
    {
      kind: "exam",
      title: "Exam",
      start: "2026-09-01T10:30:00+08:00",
      end: "2026-09-01T12:00:00+08:00",
    },
    {
      kind: "lesson",
      title: "In progress",
      start: "2026-09-01T09:30:00+08:00",
      end: "2026-09-01T10:30:00+08:00",
    },
  ];

  const result = upcomingLessons(events, new Date("2026-09-01T10:00:00+08:00"));
  assert.deepEqual(result.map((event) => event.title), ["In progress", "Next lesson"]);
});
