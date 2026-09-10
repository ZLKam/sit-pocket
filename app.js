(() => {
  "use strict";

  const installModal = document.querySelector("#installModal");
  const installTriggers = [
    document.querySelector("#installButton"),
    document.querySelector("#footerInstallButton"),
  ].filter(Boolean);
  const installClosers = [
    document.querySelector("#closeInstallButton"),
    document.querySelector("#doneInstallButton"),
  ].filter(Boolean);
  const medihubModal = document.querySelector("#medihubModal");
  const medihubCard = document.querySelector(".shortcut-launch");
  const medihubTriggers = [
    document.querySelector("#medihubHelpButton"),
  ].filter(Boolean);
  const medihubClosers = [
    document.querySelector("#closeMedihubButton"),
  ].filter(Boolean);
  const calendarModal = document.querySelector("#calendarModal");
  const calendarTriggers = [
    document.querySelector("#calendarSetupButton"),
    document.querySelector("#calendarSettingsButton"),
    document.querySelector("#calendarFooterButton"),
  ].filter(Boolean);
  const calendarClosers = [
    document.querySelector("#closeCalendarButton"),
    document.querySelector("#doneCalendarButton"),
  ].filter(Boolean);
  const createMedihubShortcut = document.querySelector("#createMedihubShortcut");
  const runMedihubShortcut = document.querySelector("#runMedihubShortcut");
  const toast = document.querySelector("#toast");
  const greeting = document.querySelector("#greeting");
  const MEDIHUB_READY_KEY = "sit-pocket:medihub-shortcut-ready";
  const SECTION_VISIBILITY_KEY = "sit-pocket:section-visibility:v1";
  const ATTENDANCE_URL = "https://student-attendance.sg.digipen.edu/login";
  const sectionVisibilityControls = [
    {
      key: "sit",
      label: "SIT",
      section: document.querySelector("#launchers"),
      grid: document.querySelector("#launcherGrid"),
      toggle: document.querySelector("#sitVisibilityToggle"),
    },
    {
      key: "digipen",
      label: "DigiPen",
      section: document.querySelector("#digipen"),
      grid: document.querySelector("#digipenGrid"),
      toggle: document.querySelector("#digipenVisibilityToggle"),
    },
  ];
  let activeModal = null;
  let lastFocusedElement = null;
  let toastTimer = null;
  let sectionVisibility = { sit: true, digipen: true };

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isStandalone) {
    document.body.classList.add("is-standalone");
  }

  const launchAttendanceFromNotification = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("action") !== "attendance") return;
    url.searchParams.delete("action");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.location.replace(ATTENDANCE_URL);
  };

  const setGreeting = () => {
    if (!greeting) return;
    const hour = new Date().getHours();
    const label = hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
    greeting.textContent = label;
  };

  const showToast = (message) => {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };

  const loadSectionVisibility = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SECTION_VISIBILITY_KEY) || "null");
      return {
        sit: saved?.sit !== false,
        digipen: saved?.digipen !== false,
      };
    } catch {
      return { sit: true, digipen: true };
    }
  };

  const saveSectionVisibility = () => {
    try {
      window.localStorage.setItem(SECTION_VISIBILITY_KEY, JSON.stringify(sectionVisibility));
    } catch {
      // The switches still work for this visit when private browsing blocks storage.
    }
  };

  const applySectionVisibility = ({ key, label, section, grid, toggle }) => {
    if (!section || !grid || !toggle) return;
    const isVisible = sectionVisibility[key];
    grid.hidden = !isVisible;
    section.classList.toggle("is-collapsed", !isVisible);
    toggle.setAttribute("aria-checked", String(isVisible));
    toggle.setAttribute("aria-label", `${isVisible ? "Hide" : "Show"} ${label} essentials`);
    const stateLabel = toggle.querySelector(".section-toggle-state");
    if (stateLabel) stateLabel.textContent = isVisible ? "On" : "Off";
  };

  const initializeSectionVisibility = () => {
    sectionVisibility = loadSectionVisibility();
    sectionVisibilityControls.forEach((control) => {
      applySectionVisibility(control);
      control.toggle?.addEventListener("click", () => {
        sectionVisibility[control.key] = !sectionVisibility[control.key];
        applySectionVisibility(control);
        saveSectionVisibility();
        showToast(`${control.label} essentials ${sectionVisibility[control.key] ? "shown" : "hidden"}.`);
      });
    });
  };

  const openModal = (modal) => {
    if (!modal) return;
    if (activeModal && activeModal !== modal) activeModal.hidden = true;
    lastFocusedElement = document.activeElement;
    activeModal = modal;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.querySelector(".install-sheet")?.focus());
  };

  const closeModal = (modal = activeModal) => {
    if (!modal) return;
    modal.hidden = true;
    if (activeModal === modal) activeModal = null;
    document.body.classList.toggle("modal-open", Boolean(activeModal));
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  };

  const openInstallModal = () => openModal(installModal);
  const openMedihubModal = () => openModal(medihubModal);
  const openCalendarModal = () => openModal(calendarModal);

  const keepFocusInModal = (event) => {
    if (event.key !== "Tab" || !activeModal || activeModal.hidden) return;
    const focusable = [
      ...activeModal.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.closest("[hidden]") && element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const launchIOSApp = (event) => {
    const card = event.currentTarget;
    const appUrl = card.dataset.appUrl;
    const fallbackUrl = card.href;
    const appName = card.dataset.appName || "app";

    if (!isIOS || !appUrl) return;

    event.preventDefault();
    showToast(`Opening ${appName}…`);

    let leftPage = false;
    const onVisibilityChange = () => {
      if (document.hidden) leftPage = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange, { once: true });

    window.setTimeout(() => {
      if (!leftPage && !document.hidden) window.location.assign(fallbackUrl);
    }, 1450);

    window.location.assign(appUrl);
  };

  const medihubShortcutIsReady = () => {
    try {
      return window.localStorage.getItem(MEDIHUB_READY_KEY) === "true";
    } catch {
      return false;
    }
  };

  const rememberMedihubShortcut = () => {
    try {
      window.localStorage.setItem(MEDIHUB_READY_KEY, "true");
    } catch {
      // Private browsing may block storage; the shortcut can still run this time.
    }
  };

  const launchMedihubShortcut = () => {
    const shortcutUrl = medihubCard?.dataset.shortcutUrl;
    if (!isIOS || !shortcutUrl) {
      showToast("Set up MediHub from SIT Pocket on your iPhone.");
      return;
    }
    showToast("Running Open MediHub…");
    window.location.assign(shortcutUrl);
  };

  const handleMedihubCard = (event) => {
    event.preventDefault();
    if (isIOS && medihubShortcutIsReady()) {
      launchMedihubShortcut();
    } else {
      openMedihubModal();
    }
  };

  installTriggers.forEach((trigger) => trigger.addEventListener("click", openInstallModal));
  installClosers.forEach((closer) => closer.addEventListener("click", () => closeModal(installModal)));
  medihubTriggers.forEach((trigger) => trigger.addEventListener("click", openMedihubModal));
  medihubClosers.forEach((closer) => closer.addEventListener("click", () => closeModal(medihubModal)));
  calendarTriggers.forEach((trigger) => trigger.addEventListener("click", openCalendarModal));
  calendarClosers.forEach((closer) => closer.addEventListener("click", () => closeModal(calendarModal)));

  installModal?.addEventListener("click", (event) => {
    if (event.target === installModal) closeModal(installModal);
  });

  medihubModal?.addEventListener("click", (event) => {
    if (event.target === medihubModal) closeModal(medihubModal);
  });

  calendarModal?.addEventListener("click", (event) => {
    if (event.target === calendarModal) closeModal(calendarModal);
  });

  document.addEventListener("sit-pocket:open-calendar", openCalendarModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeModal) closeModal(activeModal);
    keepFocusInModal(event);
  });

  document.querySelectorAll(".app-launch").forEach((card) => {
    card.addEventListener("click", launchIOSApp);
  });

  medihubCard?.addEventListener("click", handleMedihubCard);

  createMedihubShortcut?.addEventListener("click", (event) => {
    if (!isIOS) {
      event.preventDefault();
      showToast("Open SIT Pocket on your iPhone to create this shortcut.");
    }
  });

  runMedihubShortcut?.addEventListener("click", () => {
    rememberMedihubShortcut();
    closeModal(medihubModal);
    window.setTimeout(launchMedihubShortcut, 120);
  });

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./service-worker.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {
          // The launcher remains fully usable online when service workers are unavailable.
        });
    });
  }

  launchAttendanceFromNotification();
  initializeSectionVisibility();
  setGreeting();
})();
