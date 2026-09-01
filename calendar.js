const CONNECTION_KEY = "sit-pocket:calendar-connection:v1";
const FEED_KEY = "sit-pocket:calendar-feed:v1";
const SINGAPORE_TIMEZONE = "Asia/Singapore";

const isLocalAddress = (hostname) => ["localhost", "127.0.0.1"].includes(hostname);

export const normalizeConnection = (value) => {
  if (!value || typeof value !== "object") throw new Error("The calendar connection is incomplete.");

  let service;
  try {
    service = new URL(String(value.serviceUrl || "").trim());
  } catch {
    throw new Error("Enter a valid sync service address.");
  }
  const localHttp = service.protocol === "http:" && isLocalAddress(service.hostname);
  if (service.protocol !== "https:" && !localHttp) {
    throw new Error("The sync service must use HTTPS.");
  }

  const calendarId = String(value.calendarId || "").trim();
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(calendarId)) {
    throw new Error("The calendar ID is not valid.");
  }

  const readToken = String(value.readToken || "").trim();
  if (readToken.length < 8 || readToken.length > 512 || /\s/.test(readToken)) {
    throw new Error("The private read key is not valid.");
  }

  return {
    version: 1,
    serviceUrl: service.origin,
    calendarId,
    readToken,
  };
};

export const decodeSetupPayload = (encoded) => {
  const value = String(encoded || "").trim();
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("The private setup link is not valid.");
  }

  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.version !== 1) throw new Error("Unsupported setup link version.");
    return normalizeConnection(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported setup link version.") throw error;
    throw new Error("The private setup link could not be read.");
  }
};

export const buildFeedUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  const url = new URL(
    `/v1/timetables/${encodeURIComponent(normalized.calendarId)}.json`,
    normalized.serviceUrl,
  );
  url.searchParams.set("token", normalized.readToken);
  return url.href;
};

export const buildSubscriptionUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  const url = new URL(
    `/v1/timetables/${encodeURIComponent(normalized.calendarId)}.ics`,
    normalized.serviceUrl,
  );
  url.searchParams.set("token", normalized.readToken);
  return `webcal://${url.host}${url.pathname}${url.search}`;
};

export const upcomingLessons = (events, now = new Date(), limit = 3) => {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(currentTime)) throw new Error("The current date is not valid.");

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (!event || event.kind !== "lesson") return false;
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      return Number.isFinite(start) && Number.isFinite(end) && end > currentTime && end > start;
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    .slice(0, Math.max(0, limit));
};

const safeReadJson = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const safeWriteJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const safeRemove = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The UI can still reset for this session if private storage is unavailable.
  }
};

const dateParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
};

const singaporeDayDifference = (target, now) => {
  const targetParts = dateParts(target);
  const nowParts = dateParts(now);
  const targetDay = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const currentDay = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  return Math.round((targetDay - currentDay) / 86_400_000);
};

const dayLabel = (start, now, isHappening) => {
  if (isHappening) return "Now";
  const difference = singaporeDayDifference(start, now);
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  if (difference > 1 && difference < 7) {
    return new Intl.DateTimeFormat("en-SG", { timeZone: SINGAPORE_TIMEZONE, weekday: "long" }).format(start);
  }
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    day: "numeric",
    month: "short",
  }).format(start);
};

const timeLabel = (start, end) => {
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
};

const updatedLabel = (value, prefix = "Updated") => {
  const updated = new Date(value);
  if (!Number.isFinite(updated.getTime())) return `${prefix} recently`;
  const now = new Date();
  const difference = now.getTime() - updated.getTime();
  if (difference >= 0 && difference < 90_000) return `${prefix} just now`;
  if (singaporeDayDifference(updated, now) === 0) {
    const time = new Intl.DateTimeFormat("en-SG", {
      timeZone: SINGAPORE_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
    }).format(updated);
    return `${prefix} ${time}`;
  }
  const date = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    day: "numeric",
    month: "short",
  }).format(updated);
  return `${prefix} ${date}`;
};

const validateFeed = (value) => {
  if (!value || typeof value !== "object" || !Array.isArray(value.events)) {
    throw new Error("The calendar service returned an unreadable timetable.");
  }
  if (value.events.length > 10_000) throw new Error("The timetable contains too many events.");

  const events = value.events.filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (!["lesson", "exam"].includes(event.kind) || typeof event.title !== "string") return false;
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  });

  return {
    version: Number(value.version) || 1,
    revision: Number(value.revision) || 0,
    calendarName: String(value.calendarName || "SIT Timetable"),
    generatedAt: String(value.generatedAt || ""),
    updatedAt: String(value.updatedAt || value.generatedAt || new Date().toISOString()),
    eventCount: events.length,
    timezone: SINGAPORE_TIMEZONE,
    events,
  };
};

const connectionSource = (connection) => `${connection.serviceUrl}|${connection.calendarId}`;

const createElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const createLessonRow = (event, now) => {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const isHappening = start <= now && end > now;
  const item = createElement("li", `lesson-item${isHappening ? " is-now" : ""}`);

  const marker = createElement("span", "lesson-marker");
  marker.setAttribute("aria-hidden", "true");
  item.append(marker);

  const copy = createElement("div", "lesson-copy");
  const meta = createElement("div", "lesson-meta");
  meta.append(
    createElement("span", "lesson-day", dayLabel(start, now, isHappening)),
    createElement("time", "lesson-time", timeLabel(start, end)),
  );
  const title = createElement("strong", "lesson-title", event.title.trim() || "Lesson");
  copy.append(meta, title);

  const room = String(event.location || "").split(/\r?\n/)[0].trim();
  if (room) copy.append(createElement("span", "lesson-location", room));
  item.append(copy);
  return item;
};

const createEmptyState = (title, copy, tone = "neutral") => {
  const empty = createElement("div", `schedule-empty schedule-empty-${tone}`);
  const icon = createElement("span", "schedule-empty-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = tone === "error" ? "!" : "✓";
  const text = createElement("div");
  text.append(createElement("strong", "", title), createElement("p", "", copy));
  empty.append(icon, text);
  return empty;
};

export const initCalendar = () => {
  const elements = {
    panel: document.querySelector("#schedulePanel"),
    content: document.querySelector("#scheduleContent"),
    status: document.querySelector("#calendarStatus"),
    actions: document.querySelector("#scheduleActions"),
    setupButton: document.querySelector("#calendarSetupButton"),
    settingsButton: document.querySelector("#calendarSettingsButton"),
    refreshButton: document.querySelector("#calendarRefreshButton"),
    subscribeButton: document.querySelector("#calendarSubscribeButton"),
    modalSubscribeButton: document.querySelector("#calendarModalSubscribeButton"),
    modalRefreshButton: document.querySelector("#calendarModalRefreshButton"),
    disconnectButton: document.querySelector("#calendarDisconnectButton"),
    connectForm: document.querySelector("#calendarConnectionForm"),
    serviceUrlInput: document.querySelector("#calendarServiceUrl"),
    calendarIdInput: document.querySelector("#calendarId"),
    readTokenInput: document.querySelector("#calendarReadToken"),
    connectView: document.querySelector("#calendarConnectView"),
    connectedView: document.querySelector("#calendarConnectedView"),
    setupTitle: document.querySelector("#calendarSetupTitle"),
    setupIntro: document.querySelector("#calendarSetupIntro"),
    connectionLabel: document.querySelector("#calendarConnectionLabel"),
    modalStatus: document.querySelector("#calendarModalStatus"),
  };

  if (!elements.panel || !elements.content || !elements.status) return;

  let connection = null;
  let currentFeed = null;
  let refreshPromise = null;

  const setModalStatus = (message, tone = "neutral") => {
    if (!elements.modalStatus) return;
    elements.modalStatus.textContent = message;
    elements.modalStatus.className = `calendar-modal-status is-${tone}`;
  };

  const setScheduleStatus = (message, tone = "neutral") => {
    const label = elements.status.querySelector("span:last-child");
    if (label) label.textContent = message;
    elements.status.className = `schedule-status is-${tone}`;
  };

  const setBusy = (busy) => {
    elements.panel.setAttribute("aria-busy", String(busy));
    [elements.refreshButton, elements.modalRefreshButton].forEach((button) => {
      if (button) button.disabled = busy;
    });
  };

  const updateConnectionControls = () => {
    const connected = Boolean(connection);
    if (elements.setupButton) elements.setupButton.hidden = connected;
    if (elements.settingsButton) elements.settingsButton.hidden = !connected;
    if (elements.refreshButton) elements.refreshButton.hidden = !connected;
    if (elements.subscribeButton) elements.subscribeButton.hidden = !connected;
    if (elements.connectView) elements.connectView.hidden = connected;
    if (elements.connectedView) elements.connectedView.hidden = !connected;

    if (connected) {
      const subscriptionUrl = buildSubscriptionUrl(connection);
      [elements.subscribeButton, elements.modalSubscribeButton].forEach((link) => {
        if (link) link.href = subscriptionUrl;
      });
      if (elements.setupTitle) elements.setupTitle.textContent = "Timetable connected";
      if (elements.setupIntro) {
        elements.setupIntro.textContent = "Your private read-only feed is ready on this device.";
      }
      if (elements.connectionLabel) {
        elements.connectionLabel.textContent = `${connection.calendarId} is connected. Your next lessons appear on the home page.`;
      }
    } else {
      if (elements.setupTitle) elements.setupTitle.textContent = "Connect your timetable";
      if (elements.setupIntro) {
        elements.setupIntro.textContent = "Sync from in4SIT on your computer, then open the private iPhone setup link created by the extension.";
      }
    }
  };

  const renderDisconnected = () => {
    currentFeed = null;
    elements.content.replaceChildren(
      createEmptyState(
        "Bring your timetable here",
        "Connect once to see your next lessons and subscribe in Apple Calendar.",
      ),
    );
    setScheduleStatus("Timetable not connected");
    updateConnectionControls();
  };

  const renderFeed = (feed, { cached = false, refreshError = "" } = {}) => {
    currentFeed = feed;
    const now = new Date();
    const lessons = upcomingLessons(feed.events, now, 3);

    if (lessons.length) {
      const list = createElement("ol", "lesson-list");
      lessons.forEach((lesson) => list.append(createLessonRow(lesson, now)));
      elements.content.replaceChildren(list);
    } else {
      elements.content.replaceChildren(
        createEmptyState("No upcoming lessons", "You are clear for now. Sync again if your timetable has changed."),
      );
    }

    if (cached && refreshError) {
      setScheduleStatus(`${updatedLabel(feed.updatedAt, "Saved")} · refresh unavailable`, "cached");
    } else {
      setScheduleStatus(updatedLabel(feed.updatedAt), "connected");
    }
    updateConnectionControls();
  };

  const renderFeedError = (message) => {
    elements.content.replaceChildren(
      createEmptyState("Could not load lessons", message, "error"),
    );
    setScheduleStatus("Calendar needs attention", "error");
    updateConnectionControls();
  };

  const cachedFeedForConnection = () => {
    const cached = safeReadJson(FEED_KEY);
    if (!connection || !cached || cached.source !== connectionSource(connection)) return null;
    try {
      return validateFeed(cached.feed);
    } catch {
      return null;
    }
  };

  const refresh = async ({ announce = true } = {}) => {
    if (!connection) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      setBusy(true);
      if (announce) setScheduleStatus("Refreshing lessons…", "loading");
      try {
        const response = await fetch(buildFeedUrl(connection), {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Calendar service returned ${response.status}.`);
        const feed = validateFeed(result);
        safeWriteJson(FEED_KEY, { source: connectionSource(connection), savedAt: new Date().toISOString(), feed });
        renderFeed(feed);
        setModalStatus("Lessons refreshed.", "success");
        return feed;
      } catch (error) {
        const message = error instanceof Error ? error.message : "The timetable could not be refreshed.";
        const cached = currentFeed || cachedFeedForConnection();
        if (cached) renderFeed(cached, { cached: true, refreshError: message });
        else renderFeedError(message);
        setModalStatus(message, "error");
        return null;
      } finally {
        setBusy(false);
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  const saveConnection = async (value, { imported = false } = {}) => {
    const normalized = normalizeConnection(value);
    const previousSource = connection ? connectionSource(connection) : "";
    connection = normalized;
    if (previousSource && previousSource !== connectionSource(normalized)) safeRemove(FEED_KEY);
    if (!safeWriteJson(CONNECTION_KEY, normalized)) {
      throw new Error("Safari could not save the connection on this device.");
    }
    if (elements.readTokenInput) elements.readTokenInput.value = "";
    updateConnectionControls();

    const cached = cachedFeedForConnection();
    if (cached) renderFeed(cached, { cached: true });
    else {
      elements.content.replaceChildren(createEmptyState("Loading your lessons", "Checking the private calendar feed now."));
      setScheduleStatus("Connecting timetable…", "loading");
    }

    setModalStatus(imported ? "Private iPhone setup imported." : "Calendar connection saved.", "success");
    await refresh({ announce: false });
  };

  const clearHashSecret = () => {
    if (!window.location.hash) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  };

  const importSetupLink = async () => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const encoded = parameters.get("calendar");
    if (!encoded) return false;

    clearHashSecret();
    document.dispatchEvent(new CustomEvent("sit-pocket:open-calendar"));
    try {
      await saveConnection(decodeSetupPayload(encoded), { imported: true });
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "The setup link could not be imported.", "error");
    }
    return true;
  };

  elements.connectForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setModalStatus("Connecting…", "neutral");
    try {
      await saveConnection({
        serviceUrl: elements.serviceUrlInput?.value,
        calendarId: elements.calendarIdInput?.value,
        readToken: elements.readTokenInput?.value,
      });
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "The connection could not be saved.", "error");
    }
  });

  [elements.refreshButton, elements.modalRefreshButton].forEach((button) => {
    button?.addEventListener("click", () => refresh());
  });

  elements.disconnectButton?.addEventListener("click", () => {
    if (!window.confirm("Disconnect this timetable and remove its saved lessons from this device?")) return;
    safeRemove(CONNECTION_KEY);
    safeRemove(FEED_KEY);
    connection = null;
    currentFeed = null;
    setModalStatus("Timetable disconnected from this device.", "success");
    renderDisconnected();
  });

  window.addEventListener("online", () => {
    if (connection) refresh({ announce: false });
  });

  const initialize = async () => {
    const saved = safeReadJson(CONNECTION_KEY);
    if (saved) {
      try {
        connection = normalizeConnection(saved);
      } catch {
        safeRemove(CONNECTION_KEY);
      }
    }

    if (connection) {
      updateConnectionControls();
      const cached = cachedFeedForConnection();
      if (cached) renderFeed(cached, { cached: true });
      else {
        elements.content.replaceChildren(createEmptyState("Loading your lessons", "Checking the private calendar feed now."));
        setScheduleStatus("Loading timetable…", "loading");
      }
    } else {
      renderDisconnected();
    }

    const imported = await importSetupLink();
    if (!imported && connection) await refresh({ announce: false });
  };

  initialize();
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCalendar, { once: true });
  else initCalendar();
}
