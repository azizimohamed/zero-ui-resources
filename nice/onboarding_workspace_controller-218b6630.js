import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "nameInput",
    "nicheField",
    "nicheCard",
    "avatar",
    "previewChip",
    "previewName",
    "previewCategory",
    "previewLanes",
  ];

  static values = {
    placeholderMap: { type: Object, default: {} },
    categoryTitles: { type: Object, default: {} },
  };

  connect() {
    this.#syncFromName();
    this.#syncNichePreview();
  }

  onNameInput() {
    this.#syncFromName();
  }

  selectNiche(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const niche = button.dataset.niche || "";
    const category = button.dataset.category || "";

    if (this.hasNicheFieldTarget) this.nicheFieldTarget.value = niche;

    this.nicheCardTargets.forEach((card) => {
      const on = card === button;
      card.classList.toggle("is-on", on);
      card.setAttribute("aria-selected", on ? "true" : "false");
    });

    this.#applyNamePlaceholder(niche);
    this.#syncNichePreview(category);
  }

  useDefaultName(event) {
    event.preventDefault();
    if (!this.hasNameInputTarget) return;

    const niche = this.hasNicheFieldTarget ? this.nicheFieldTarget.value : "";
    const placeholder =
      this.placeholderMapValue[niche] || this.nameInputTarget.placeholder || "My workspace";
    this.nameInputTarget.value = placeholder;
    this.#syncFromName();
    if (typeof this.element.requestSubmit === "function") {
      this.element.requestSubmit();
    } else {
      this.element.submit();
    }
  }

  #applyNamePlaceholder(niche) {
    if (!this.hasNameInputTarget) return;
    const fallback = "My workspace";
    this.nameInputTarget.placeholder = this.placeholderMapValue[niche] || fallback;
  }

  #syncFromName() {
    const name = this.hasNameInputTarget ? this.nameInputTarget.value.trim() : "";
    const initials = this.#initials(name);
    const label = name || this.nameInputTarget?.placeholder || "My workspace";

    if (this.hasAvatarTarget) this.avatarTarget.textContent = initials;
    if (this.hasPreviewChipTarget) {
      const mark = this.previewChipTarget.querySelector("[data-role='initials']");
      if (mark) mark.textContent = initials;
    }
    if (this.hasPreviewNameTarget) this.previewNameTarget.textContent = label;
  }

  #syncNichePreview(categoryOverride) {
    const category = categoryOverride !== undefined ? categoryOverride : this.#selectedCategory();

    if (!category) {
      if (this.hasPreviewCategoryTarget) {
        this.previewCategoryTarget.textContent = "Pick on the next step";
      }
      if (this.hasPreviewLanesTarget) {
        this.previewLanesTarget.textContent = "Lanes follow the category you choose next";
      }
      return;
    }

    const title = this.categoryTitlesValue[category] || category;
    if (this.hasPreviewCategoryTarget) {
      this.previewCategoryTarget.innerHTML = `<b>${this.#escape(title)}</b>, preselected on step 1`;
    }
    if (this.hasPreviewLanesTarget) {
      this.previewLanesTarget.textContent = "Blank start. Templates are optional on step 1";
    }
  }

  #escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  #selectedCategory() {
    const on = this.nicheCardTargets.find((card) => card.classList.contains("is-on"));
    return on?.dataset.category || "";
  }

  #initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "WS";
    return parts
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }
}
