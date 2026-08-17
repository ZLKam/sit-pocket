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
  const createMedihubShortcut = document.querySelector("#createMedihubShortcut");
  const runMedihubShortcut = document.querySelector("#runMedihubShortcut");
  const toast = document.querySelector("#toast");
  const greeting = document.querySelector("#greeting");
  const MEDIHUB_READY_KEY = "sit-pocket:medihub-shortcut-ready";
  let activeModal = null;
  let lastFocusedElement = null;
  let toastTimer = null;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isStandalone) {
    document.body.classList.add("is-standalone");
  }

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

  const keepFocusInModal = (event) => {
    if (event.key !== "Tab" || !activeModal || activeModal.hidden) return;
    const focusable = [
      ...activeModal.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
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

  installModal?.addEventListener("click", (event) => {
    if (event.target === installModal) closeModal(installModal);
  });

  medihubModal?.addEventListener("click", (event) => {
    if (event.target === medihubModal) closeModal(medihubModal);
  });

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
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The launcher remains fully usable online when service workers are unavailable.
      });
    });
  }

  setGreeting();
})();
