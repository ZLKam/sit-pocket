const CONNECTION_KEY = "sit-pocket:calendar-connection:v1";
const FEED_KEY = "sit-pocket:calendar-feed:v1";
const SINGAPORE_TIMEZONE = "Asia/Singapore";
const SINGAPORE_OFFSET = "+08:00";

const isLocalAddress = (hostname) => ["localhost", "127.0.0.1"].includes(hostname);

const cleanPrivateToken = (value, label, { optional = false } = {}) => {
  const token = String(value || "").trim();
  if (!token && optional) return "";
  if (token.length < 8 || token.length > 512 || /\s/.test(token)) {
    throw new Error(`The private ${label} key is not valid.`);
  }
  return token;
};

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

  const readToken = cleanPrivateToken(value.readToken, "read");
  const editToken = cleanPrivateToken(value.editToken, "edit", { optional: true });

  return {
    version: editToken ? 2 : 1,
    serviceUrl: service.origin,
    calendarId,
    readToken,
    editToken,
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
    if (![1, 2].includes(payload.version)) throw new Error("Unsupported setup link version.");
    const connection = normalizeConnection(payload);
    if (payload.version === 2 && !connection.editToken) {
      throw new Error("The setup link is missing its private edit key.");
    }
    return connection;
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unsupported setup link version.", "The setup link is missing its private edit key."].includes(error.message)
    ) {
      throw error;
    }
    throw new Error("The private setup link could not be read.");
  }
};

const buildTimetableBaseUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  return new URL(
    `/v1/timetables/${encodeURIComponent(normalized.calendarId)}`,
    normalized.serviceUrl,
  );
};

export const buildFeedUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  const url = buildTimetableBaseUrl(normalized);
  url.pathname += ".json";
  url.searchParams.set("token", normalized.readToken);
  return url.href;
};

export const buildSubscriptionUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  const url = buildTimetableBaseUrl(normalized);
  url.pathname += ".ics";
  url.searchParams.set("token", normalized.readToken);
  return `webcal://${url.host}${url.pathname}${url.search}`;
};

export const buildEventEditUrl = (connection, eventId) => {
  const id = String(eventId || "").trim();
  if (!/^[A-Za-z0-9._~-]{6,128}$/.test(id)) throw new Error("The event ID is not valid.");
  const url = buildTimetableBaseUrl(connection);
  url.pathname += `/events/${encodeURIComponent(id)}`;
  return url.href;
};

export const buildPushConfigUrl = (connection) => {
  const normalized = normalizeConnection(connection);
  const url = buildTimetableBaseUrl(normalized);
  url.pathname += "/push-config";
  url.searchParams.set("token", normalized.readToken);
  return url.href;
};

export const buildPushSubscriptionsUrl = (connection) => {
  const url = buildTimetableBaseUrl(connection);
  url.pathname += "/push-subscriptions";
  return url.href;
};

export const toSingaporeDateTimeInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("The event date is not valid.");
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
};

export const fromSingaporeDateTimeInput = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    throw new Error("Choose a valid Singapore date and time.");
  }
  const date = new Date(`${text}:00${SINGAPORE_OFFSET}`);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid Singapore date and time.");
  return date.toISOString();
};

export const urlBase64ToUint8Array = (value) => {
  const text = String(value || "").trim();
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("The notification key is invalid.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const upcomingLessons = (events, now = new Date(), limit = 3) => {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(currentTime)) throw new Error("The current date is not valid.");

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (!event || event.kind !== "lesson" || event.cancelled) return false;
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

const eventOptionLabel = (event) => {
  const start = new Date(event.start);
  const date = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  return `${event.cancelled ? "Cancelled · " : ""}${date}, ${time} — ${event.title}`;
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
    if (!/^[A-Za-z0-9._~-]{6,128}$/.test(String(event.id || ""))) return false;
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
    eventCount: Number(value.eventCount) || events.filter((event) => !event.cancelled).length,
    totalEventCount: Number(value.totalEventCount) || events.length,
    manualEditCount: Number(value.manualEditCount) || events.filter((event) => event.manuallyEdited).length,
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

const createLessonRow = (event, now, onEdit) => {
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
  if (event.manuallyEdited) copy.append(createElement("span", "lesson-edited", "Manually changed"));
  item.append(copy);

  if (onEdit) {
    const editButton = createElement("button", "lesson-edit-button", "Edit");
    editButton.type = "button";
    editButton.setAttribute("aria-label", `Edit ${event.title}`);
    editButton.addEventListener("click", () => onEdit(event.id));
    item.append(editButton);
  }
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
    editTokenInput: document.querySelector("#calendarEditToken"),
    connectView: document.querySelector("#calendarConnectView"),
    connectedView: document.querySelector("#calendarConnectedView"),
    editorView: document.querySelector("#calendarEditorView"),
    setupTitle: document.querySelector("#calendarSetupTitle"),
    setupIntro: document.querySelector("#calendarSetupIntro"),
    connectionLabel: document.querySelector("#calendarConnectionLabel"),
    capabilityNote: document.querySelector("#calendarCapabilityNote"),
    modalStatus: document.querySelector("#calendarModalStatus"),
    editEventsButton: document.querySelector("#calendarEditEventsButton"),
    editorBackButton: document.querySelector("#calendarEditorBackButton"),
    eventEditForm: document.querySelector("#calendarEventEditForm"),
    eventSelect: document.querySelector("#calendarEventSelect"),
    eventTitleInput: document.querySelector("#calendarEventTitle"),
    eventStartInput: document.querySelector("#calendarEventStart"),
    eventEndInput: document.querySelector("#calendarEventEnd"),
    eventLocationInput: document.querySelector("#calendarEventLocation"),
    eventCancelledInput: document.querySelector("#calendarEventCancelled"),
    editorRestoreButton: document.querySelector("#calendarEventRestoreButton"),
    editorStatus: document.querySelector("#calendarEditorStatus"),
    notificationButton: document.querySelector("#calendarNotificationButton"),
    notificationHelp: document.querySelector("#calendarNotificationHelp"),
  };

  if (!elements.panel || !elements.content || !elements.status) return;

  let connection = null;
  let currentFeed = null;
  let refreshPromise = null;
  let editorOpen = false;
  let selectedEventId = "";
  let notificationBusy = false;
  let notificationRegistration = null;
  let notificationPublicKey = "";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const setModalStatus = (message, tone = "neutral") => {
    if (!elements.modalStatus) return;
    elements.modalStatus.textContent = message;
    elements.modalStatus.className = `calendar-modal-status is-${tone}`;
  };

  const setEditorStatus = (message, tone = "neutral") => {
    if (!elements.editorStatus) return;
    elements.editorStatus.textContent = message;
    elements.editorStatus.className = `calendar-editor-status is-${tone}`;
  };

  const setScheduleStatus = (message, tone = "neutral") => {
    const label = elements.status.querySelector("span:last-child");
    if (label) label.textContent = message;
    elements.status.className = `schedule-status is-${tone}`;
  };

  const setBusy = (busy) => {
    elements.panel.setAttribute("aria-busy", String(busy));
    [
      elements.refreshButton,
      elements.modalRefreshButton,
      elements.eventEditForm?.querySelector('button[type="submit"]'),
      elements.editorRestoreButton,
    ].forEach((button) => {
      if (button) button.disabled = busy;
    });
  };

  const hasEditingAccess = () => Boolean(connection?.editToken);

  const updateConnectionControls = () => {
    const connected = Boolean(connection);
    if (elements.setupButton) elements.setupButton.hidden = connected;
    if (elements.settingsButton) elements.settingsButton.hidden = !connected;
    if (elements.refreshButton) elements.refreshButton.hidden = !connected;
    if (elements.subscribeButton) elements.subscribeButton.hidden = !connected;
    if (elements.connectView) elements.connectView.hidden = connected;
    if (elements.connectedView) elements.connectedView.hidden = !connected || editorOpen;
    if (elements.editorView) elements.editorView.hidden = !connected || !editorOpen;

    if (connected) {
      const subscriptionUrl = buildSubscriptionUrl(connection);
      [elements.subscribeButton, elements.modalSubscribeButton].forEach((link) => {
        if (link) link.href = subscriptionUrl;
      });
      if (elements.setupTitle) elements.setupTitle.textContent = editorOpen ? "Edit timetable event" : "Timetable connected";
      if (elements.setupIntro) {
        elements.setupIntro.textContent = editorOpen
          ? "A manual change updates SIT Pocket and the same subscribed Apple Calendar feed."
          : hasEditingAccess()
            ? "Your private feed can be refreshed, edited, and used for check-in notifications on this device."
            : "Your read-only feed is connected. Open a new setup link to unlock editing and notifications.";
      }
      if (elements.connectionLabel) {
        elements.connectionLabel.textContent = hasEditingAccess()
          ? `${connection.calendarId} is connected with private editing access.`
          : `${connection.calendarId} is connected in read-only mode.`;
      }
      if (elements.editEventsButton) elements.editEventsButton.hidden = !hasEditingAccess();
      if (elements.capabilityNote) {
        elements.capabilityNote.hidden = hasEditingAccess();
        elements.capabilityNote.textContent = hasEditingAccess()
          ? ""
          : "Reload the desktop extension, add the edit key, and open its new iPhone setup link to enable event edits and notifications.";
      }
    } else {
      editorOpen = false;
      if (elements.setupTitle) elements.setupTitle.textContent = "Connect your timetable";
      if (elements.setupIntro) {
        elements.setupIntro.textContent = "Sync from in4SIT on your computer, then open the private iPhone setup link created by the extension.";
      }
    }
  };

  const editorEvent = () => currentFeed?.events.find((event) => event.id === selectedEventId) || null;

  const populateEditor = (event) => {
    if (!event) return;
    selectedEventId = event.id;
    if (elements.eventSelect) elements.eventSelect.value = event.id;
    if (elements.eventTitleInput) elements.eventTitleInput.value = event.title;
    if (elements.eventStartInput) elements.eventStartInput.value = toSingaporeDateTimeInput(event.start);
    if (elements.eventEndInput) elements.eventEndInput.value = toSingaporeDateTimeInput(event.end);
    if (elements.eventLocationInput) elements.eventLocationInput.value = String(event.location || "");
    if (elements.eventCancelledInput) elements.eventCancelledInput.checked = event.cancelled === true;
    if (elements.editorRestoreButton) elements.editorRestoreButton.hidden = !event.manuallyEdited;
    setEditorStatus(
      event.manuallyEdited
        ? "This event has a manual override. You can update it or restore the latest synced details."
        : "Changes remain in place across ordinary in4SIT syncs until restored.",
      event.manuallyEdited ? "changed" : "neutral",
    );
  };

  const renderEditorOptions = (preferredId = selectedEventId) => {
    if (!elements.eventSelect || !currentFeed) return;
    const events = [...currentFeed.events].sort(
      (left, right) => Date.parse(left.start) - Date.parse(right.start),
    );
    elements.eventSelect.replaceChildren();
    if (!events.length) {
      const option = createElement("option", "", "No timetable events available");
      option.value = "";
      elements.eventSelect.append(option);
      elements.eventSelect.disabled = true;
      return;
    }

    elements.eventSelect.disabled = false;
    for (const event of events) {
      const option = createElement("option", "", eventOptionLabel(event));
      option.value = event.id;
      elements.eventSelect.append(option);
    }
    const now = Date.now();
    const selected = events.find((event) => event.id === preferredId)
      || events.find((event) => Date.parse(event.end) > now && !event.cancelled)
      || events[0];
    populateEditor(selected);
  };

  const openEditor = (eventId = "") => {
    document.dispatchEvent(new CustomEvent("sit-pocket:open-calendar"));
    if (!hasEditingAccess()) {
      setModalStatus("Open the latest private setup link before editing events.", "error");
      return;
    }
    if (!currentFeed) {
      setModalStatus("Refresh the timetable before editing an event.", "error");
      return;
    }
    editorOpen = true;
    selectedEventId = eventId;
    updateConnectionControls();
    renderEditorOptions(eventId);
    elements.eventSelect?.focus();
  };

  const closeEditor = () => {
    editorOpen = false;
    updateConnectionControls();
    setEditorStatus("");
    elements.editEventsButton?.focus();
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
      lessons.forEach((lesson) => list.append(createLessonRow(lesson, now, hasEditingAccess() ? openEditor : null)));
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
    if (editorOpen) renderEditorOptions(selectedEventId);
  };

  const renderFeedError = (message) => {
    elements.content.replaceChildren(createEmptyState("Could not load lessons", message, "error"));
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

  const refresh = async ({ announce = true, reportInModal = true } = {}) => {
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
        if (reportInModal) setModalStatus("Lessons refreshed.", "success");
        return feed;
      } catch (error) {
        const message = error instanceof Error ? error.message : "The timetable could not be refreshed.";
        const cached = currentFeed || cachedFeedForConnection();
        if (cached) renderFeed(cached, { cached: true, refreshError: message });
        else renderFeedError(message);
        if (reportInModal) setModalStatus(message, "error");
        return null;
      } finally {
        setBusy(false);
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  };

  const postSubscription = async (targetConnection, subscription) => {
    const response = await fetch(buildPushSubscriptionsUrl(targetConnection), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetConnection.editToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Notification service returned ${response.status}.`);
  };

  const detachPushSubscription = async (targetConnection, { unsubscribe = true } = {}) => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return false;

    if (targetConnection?.editToken) {
      try {
        await fetch(buildPushSubscriptionsUrl(targetConnection), {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${targetConnection.editToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch {
        // Local unsubscribe still stops this endpoint; the server removes it after a 404/410 response.
      }
    }
    if (unsubscribe) await subscription.unsubscribe();
    return true;
  };

  const setNotificationUi = (state, message) => {
    if (!elements.notificationButton || !elements.notificationHelp) return;
    elements.notificationButton.disabled = state === "unavailable" || state === "busy";
    elements.notificationButton.setAttribute("aria-pressed", String(state === "enabled"));
    elements.notificationButton.textContent = state === "enabled"
      ? "Check-in notifications on"
      : state === "busy"
        ? "Updating notifications…"
        : "Enable check-in notifications";
    elements.notificationHelp.textContent = message;
    elements.notificationHelp.className = `calendar-notification-help is-${state}`;
  };

  const refreshNotificationState = async () => {
    if (!connection || !elements.notificationButton || notificationBusy) return;
    if (!hasEditingAccess()) {
      setNotificationUi("unavailable", "Open the extension’s latest iPhone setup link to add the private edit key first.");
      return;
    }
    if (isIOS && !isStandalone) {
      setNotificationUi("unavailable", "Open SIT Pocket from its iPhone Home Screen icon to enable device notifications.");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotificationUi("unavailable", "Push notifications are not supported in this browser.");
      return;
    }
    if (Notification.permission === "denied") {
      setNotificationUi("unavailable", "Notifications are blocked. Allow SIT Pocket in the device’s Notifications settings.");
      return;
    }

    setNotificationUi("busy", "Preparing secure device notifications…");
    try {
      const [registration, configResponse] = await Promise.all([
        navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }),
        fetch(buildPushConfigUrl(connection), {
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        }),
      ]);
      const config = await configResponse.json().catch(() => ({}));
      if (!configResponse.ok) throw new Error(config.error || `Notification service returned ${configResponse.status}.`);
      urlBase64ToUint8Array(config.publicKey);
      notificationRegistration = registration;
      notificationPublicKey = config.publicKey;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        setNotificationUi("enabled", "A device notification will appear when a lesson starts. Tap it to open DigiPen Attendance.");
      } else {
        setNotificationUi("available", "Opt in once; lesson reminders can arrive even when SIT Pocket is closed.");
      }
    } catch (error) {
      notificationRegistration = null;
      notificationPublicKey = "";
      setNotificationUi(
        "unavailable",
        error instanceof Error ? error.message : "The notification service is unavailable.",
      );
    }
  };

  const toggleNotifications = async () => {
    if (!connection || !hasEditingAccess() || notificationBusy) return;
    notificationBusy = true;
    setNotificationUi("busy", "Contacting the private notification service…");
    try {
      if (!notificationRegistration || !notificationPublicKey) {
        throw new Error("Notification setup is still loading. Close Manage, reopen it, and try again.");
      }
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== "granted") throw new Error("Notification permission was not granted.");

      const existingSubscription = await notificationRegistration.pushManager.getSubscription();
      if (existingSubscription) {
        await detachPushSubscription(connection);
        setNotificationUi("available", "Check-in notifications are off on this device.");
        setModalStatus("Check-in notifications disabled on this device.", "success");
        return;
      }

      const subscription = await notificationRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(notificationPublicKey),
      });
      try {
        await postSubscription(connection, subscription);
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }

      await notificationRegistration.update().catch(() => {});
      setNotificationUi("enabled", "A device notification will appear when a lesson starts. Tap it to open DigiPen Attendance.");
      setModalStatus("Check-in notifications enabled on this device.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notifications could not be enabled.";
      setNotificationUi("available", message);
      setModalStatus(message, "error");
    } finally {
      notificationBusy = false;
      await refreshNotificationState();
    }
  };

  const saveConnection = async (value, { imported = false } = {}) => {
    const normalized = normalizeConnection(value);
    const previousConnection = connection;
    const previousSource = previousConnection ? connectionSource(previousConnection) : "";
    const nextSource = connectionSource(normalized);
    if (previousConnection && previousSource !== nextSource) {
      await detachPushSubscription(previousConnection).catch(() => {});
    }
    connection = normalized;
    editorOpen = false;
    if (previousSource && previousSource !== nextSource) safeRemove(FEED_KEY);
    if (!safeWriteJson(CONNECTION_KEY, normalized)) {
      throw new Error("Safari could not save the connection on this device.");
    }
    if (elements.readTokenInput) elements.readTokenInput.value = "";
    if (elements.editTokenInput) elements.editTokenInput.value = "";
    updateConnectionControls();

    const cached = cachedFeedForConnection();
    if (cached) renderFeed(cached, { cached: true });
    else {
      elements.content.replaceChildren(createEmptyState("Loading your lessons", "Checking the private calendar feed now."));
      setScheduleStatus("Connecting timetable…", "loading");
    }

    setModalStatus(imported ? "Private iPhone setup imported." : "Calendar connection saved.", "success");
    await refresh({ announce: false, reportInModal: false });
    await refreshNotificationState();
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

  const saveEventEdit = async (event) => {
    event.preventDefault();
    const selected = editorEvent();
    if (!connection || !selected || !hasEditingAccess()) return;
    setBusy(true);
    setEditorStatus("Saving manual change…");
    try {
      const start = fromSingaporeDateTimeInput(elements.eventStartInput?.value);
      const end = fromSingaporeDateTimeInput(elements.eventEndInput?.value);
      if (Date.parse(end) <= Date.parse(start)) throw new Error("The event must end after it starts.");
      const response = await fetch(buildEventEditUrl(connection, selected.id), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${connection.editToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: elements.eventTitleInput?.value,
          start,
          end,
          location: elements.eventLocationInput?.value,
          cancelled: elements.eventCancelledInput?.checked === true,
        }),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Calendar service returned ${response.status}.`);
      selectedEventId = selected.id;
      await refresh({ announce: false, reportInModal: false });
      setEditorStatus("Saved. SIT Pocket is current; Apple Calendar will update on its refresh schedule.", "success");
      setModalStatus("Manual calendar change saved.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The event could not be saved.";
      setEditorStatus(message, "error");
      setModalStatus(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const restoreEvent = async () => {
    const selected = editorEvent();
    if (!connection || !selected || !hasEditingAccess()) return;
    setBusy(true);
    setEditorStatus("Restoring synced details…");
    try {
      const response = await fetch(buildEventEditUrl(connection, selected.id), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${connection.editToken}` },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Calendar service returned ${response.status}.`);
      selectedEventId = selected.id;
      await refresh({ announce: false, reportInModal: false });
      setEditorStatus("Restored the latest details from the desktop timetable sync.", "success");
      setModalStatus("Synced calendar details restored.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The event could not be restored.";
      setEditorStatus(message, "error");
      setModalStatus(message, "error");
    } finally {
      setBusy(false);
    }
  };

  elements.connectForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setModalStatus("Connecting…", "neutral");
    try {
      await saveConnection({
        serviceUrl: elements.serviceUrlInput?.value,
        calendarId: elements.calendarIdInput?.value,
        readToken: elements.readTokenInput?.value,
        editToken: elements.editTokenInput?.value,
      });
    } catch (error) {
      setModalStatus(error instanceof Error ? error.message : "The connection could not be saved.", "error");
    }
  });

  [elements.refreshButton, elements.modalRefreshButton].forEach((button) => {
    button?.addEventListener("click", () => refresh());
  });

  elements.editEventsButton?.addEventListener("click", () => openEditor());
  elements.editorBackButton?.addEventListener("click", closeEditor);
  elements.eventSelect?.addEventListener("change", () => {
    const selected = currentFeed?.events.find((event) => event.id === elements.eventSelect.value);
    if (selected) populateEditor(selected);
  });
  elements.eventEditForm?.addEventListener("submit", saveEventEdit);
  elements.editorRestoreButton?.addEventListener("click", restoreEvent);
  elements.notificationButton?.addEventListener("click", toggleNotifications);

  elements.disconnectButton?.addEventListener("click", async () => {
    if (!window.confirm("Disconnect this timetable, turn off its notifications, and remove saved lessons from this device?")) return;
    const previousConnection = connection;
    setBusy(true);
    await detachPushSubscription(previousConnection).catch(() => {});
    safeRemove(CONNECTION_KEY);
    safeRemove(FEED_KEY);
    connection = null;
    currentFeed = null;
    editorOpen = false;
    setModalStatus("Timetable disconnected from this device.", "success");
    renderDisconnected();
    setBusy(false);
  });

  window.addEventListener("online", () => {
    if (connection) refresh({ announce: false });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && connection) refreshNotificationState().catch(() => {});
  });

  document.addEventListener("sit-pocket:open-calendar", () => {
    if (connection) refreshNotificationState().catch(() => {});
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
    if (connection) await refreshNotificationState().catch(() => {});
  };

  initialize();
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCalendar, { once: true });
  else initCalendar();
}
