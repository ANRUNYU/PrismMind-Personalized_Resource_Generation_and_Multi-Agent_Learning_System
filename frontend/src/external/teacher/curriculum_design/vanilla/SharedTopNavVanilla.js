function prismMindLogoMarkup() {
  return `
    <span class="teacher-brand-icon" aria-hidden="true">
      <span class="prism-logo-glow"></span>
      <span class="prism-logo-core">
        <span class="prism-logo-facet prism-logo-facet-a"></span>
        <span class="prism-logo-facet prism-logo-facet-b"></span>
        <span class="prism-logo-facet prism-logo-facet-c"></span>
        <span class="prism-logo-facet prism-logo-facet-d"></span>
        <span class="prism-logo-facet prism-logo-facet-e"></span>
        <span class="prism-logo-ray prism-logo-ray-a"></span>
        <span class="prism-logo-ray prism-logo-ray-b"></span>
        <span class="prism-logo-nucleus"></span>
      </span>
    </span>
  `;
}

function buildTopNavMarkup(contextLabel) {
  return `
    <header class="top-nav" data-shared-top-nav>
      <button class="top-brand" type="button" aria-label="棱镜智教-PrismMind 首页" data-nav-home>
        ${prismMindLogoMarkup()}
        <span class="top-brand-name">
          <strong>棱镜智教</strong>
          <em>PrismMind</em>
        </span>
      </button>

      <div class="top-nav-left">
        <button class="top-nav-button is-active" type="button" data-nav-home>首页</button>
        <button class="top-nav-button" type="button" data-nav-back>返回</button>
      </div>

      <div class="top-nav-mark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div class="top-nav-right">
        <button class="top-nav-button" type="button" data-nav-user>用户</button>
        <button class="top-nav-button" type="button" data-nav-logout>退出</button>
        <div class="top-user-popover" data-nav-popover hidden>
          <span>PrismMind</span>
          <small>${contextLabel}</small>
        </div>
      </div>
    </header>
  `;
}

function mountSharedTopNav() {
  const mount = document.querySelector("#sharedTopNavMount");

  if (!mount || mount.dataset.mounted === "true") {
    return;
  }

  const homeHref = mount.dataset.homeHref || "/teacher/dashboard";
  const contextLabel = mount.dataset.context || "Teacher workspace";
  mount.innerHTML = buildTopNavMarkup(contextLabel);
  mount.dataset.mounted = "true";

  const nav = mount.querySelector("[data-shared-top-nav]");
  const userButton = mount.querySelector("[data-nav-user]");
  const popover = mount.querySelector("[data-nav-popover]");

  mount.querySelectorAll("[data-nav-home]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.assign(homeHref);
    });
  });

  mount.querySelector("[data-nav-back]")?.addEventListener("click", () => {
    window.history.back();
  });

  userButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    popover.hidden = !popover.hidden;
  });

  mount.querySelector("[data-nav-logout]")?.addEventListener("click", () => {
    clearAuthStorage();
    window.location.assign("/auth/login");
  });

  const closePopover = (event) => {
    if (nav && !nav.contains(event.target)) {
      popover.hidden = true;
    }
  };
  document.addEventListener("click", closePopover);
  window.addEventListener("__prismmind_curriculum_design_dispose", () => {
    document.removeEventListener("click", closePopover);
  }, { once: true });
}

function clearAuthStorage() {
  const exactKeys = [
    "access_token",
    "refresh_token",
    "prismmind_access_token",
    "prismmind_refresh_token",
    "edugenie_access_token",
    "edugenie_refresh_token",
    "edugenie_user_info"
  ];
  [localStorage, sessionStorage].forEach((storage) => {
    exactKeys.forEach((key) => storage.removeItem(key));
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith("prismmind_") || key?.startsWith("edugenie_")) {
        storage.removeItem(key);
      }
    }
  });
}

mountSharedTopNav();
