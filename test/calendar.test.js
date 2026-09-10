import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedUrl,
  buildEventEditUrl,
  buildPushConfigUrl,
  buildPushSubscriptionsUrl,
  buildSubscriptionUrl,
  decodeSetupPayload,
  fromSingaporeDateTimeInput,
  normalizeConnection,
  toSingaporeDateTimeInput,
  upcomingLessons,
  urlBase64ToUint8Array,
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
    editToken: "",
  });
});

test("decodes a version 2 setup link with private editing access", () => {
  const editable = { ...connection, version: 2, editToken: "edit_token_123456" };
  const encoded = Buffer.from(JSON.stringify(editable), "utf8").toString("base64url");
  assert.deepEqual(decodeSetupPayload(encoded), {
    ...editable,
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

  assert.equal(
    buildEventEditUrl(connection, "lesson-test-001"),
    "https://calendar.example/v1/timetables/sit-private-01/events/lesson-test-001",
  );
  const pushConfig = new URL(buildPushConfigUrl(connection));
  assert.equal(pushConfig.pathname, "/v1/timetables/sit-private-01/push-config");
  assert.equal(pushConfig.searchParams.get("token"), "read_token_123456");
  assert.equal(
    buildPushSubscriptionsUrl(connection),
    "https://calendar.example/v1/timetables/sit-private-01/push-subscriptions",
  );
});

test("converts editable date-times to and from fixed Singapore time", () => {
  assert.equal(toSingaporeDateTimeInput("2026-09-01T01:30:00.000Z"), "2026-09-01T09:30");
  assert.equal(fromSingaporeDateTimeInput("2026-09-01T09:30"), "2026-09-01T01:30:00.000Z");
});

test("decodes a VAPID application server key", () => {
  assert.deepEqual([...urlBase64ToUint8Array("AQIDBA")], [1, 2, 3, 4]);
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
    {
      kind: "lesson",
      title: "Cancelled next lesson",
      start: "2026-09-01T10:15:00+08:00",
      end: "2026-09-01T11:15:00+08:00",
      cancelled: true,
    },
  ];

  const result = upcomingLessons(events, new Date("2026-09-01T10:00:00+08:00"));
  assert.deepEqual(result.map((event) => event.title), ["In progress", "Next lesson"]);
});
