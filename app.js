(() => {
  "use strict";

  const searchInput = document.querySelector("#shortcutSearch");
  const cards = [...document.querySelectorAll(".launcher-card")];
  const resultCount = document.querySelector("#resultCount");
  const emptyState = document.querySelector("#emptyState");
  const clearSearchButton = document.querySelector("#clearSearch");
  const installModal = document.querySelector("#installModal");
  const installSheet = installModal?.querySelector(".install-sheet");
  const installTriggers = [
    document.querySelector("#installButton"),
    document.querySelector("#footerInstallButton"),
  ].filter(Boolean);
  const installClosers = [
    document.querySelector("#closeInstallButton"),
    document.querySelector("#doneInstallButton"),
  ].filter(Boolean);
  const toast = document.querySelector("#toast");
  const greeting = document.querySelector("#greeting");
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

  const normalise = (value) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ");

  const filterCards = () => {
    const query = normalise(searchInput?.value || "");
    let visibleCount = 0;

    cards.forEach((card) => {
      const searchable = normalise(card.dataset.search || card.textContent || "");
      const isMatch = !query || query.split(" ").every((term) => searchable.includes(term));
      card.hidden = !isMatch;
      if (isMatch) visibleCount += 1;
    });

    if (resultCount) {
      resultCount.textContent = `${visibleCount} ${visibleCount === 1 ? "service" : "services"}`;
    }
    if (emptyState) emptyState.hidden = visibleCount !== 0;
  };

  const clearSearch = () => {
    if (!searchInput) return;
    searchInput.value = "";
    filterCards();
    searchInput.focus();
  };

  const showToast = (message) => {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  };

  const openInstallModal = () => {
    if (!installModal || !installSheet) return;
    lastFocusedElement = document.activeElement;
    installModal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => installSheet.focus());
  };

  const closeInstallModal = () => {
    if (!installModal) return;
    installModal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  };

  const keepFocusInModal = (event) => {
    if (event.key !== "Tab" || installModal?.hidden) return;
    const focusable = [
      ...installModal.querySelectorAll(
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

  searchInput?.addEventListener("input", filterCards);
  clearSearchButton?.addEventListener("click", clearSearch);

  installTriggers.forEach((trigger) => trigger.addEventListener("click", openInstallModal));
  installClosers.forEach((closer) => closer.addEventListener("click", closeInstallModal));

  installModal?.addEventListener("click", (event) => {
    if (event.target === installModal) closeInstallModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && installModal && !installModal.hidden) closeInstallModal();
    keepFocusInModal(event);
  });

  document.querySelectorAll(".app-launch").forEach((card) => {
    card.addEventListener("click", launchIOSApp);
  });

  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // The launcher remains fully usable online when service workers are unavailable.
      });
    });
  }

  setGreeting();
  filterCards();
})();
