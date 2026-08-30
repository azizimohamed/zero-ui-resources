import { Controller } from "@hotwired/stimulus";

const REMOVE_MS = 220;

/** Micro-interactions for the dashboard top-finds strip (card removal, section enter). */
export default class extends Controller {
  connect() {
    if (!window.__dashboardTopFindsEnterPlayed) {
      window.__dashboardTopFindsEnterPlayed = true;
      this.element.classList.add("dashboard-top-finds--enter");
    }
    this.boundBeforeStreamRender = this.beforeStreamRender.bind(this);
    document.addEventListener("turbo:before-stream-render", this.boundBeforeStreamRender);
  }

  disconnect() {
    document.removeEventListener("turbo:before-stream-render", this.boundBeforeStreamRender);
  }

  beforeStreamRender(event) {
    const stream = event.target;
    if (!stream?.getAttribute) return;

    const action = stream.getAttribute("action");
    const targetId = stream.getAttribute("target");
    if (action !== "remove" || !targetId?.startsWith("listing_")) return;

    const card = this.element.querySelector(`#${CSS.escape(targetId)}`);
    if (!card) return;

    const surface = card.querySelector(".m-card") || card;
    surface.classList.remove("unseen");

    const render = event.detail.render;
    event.detail.render = async (streamElement) => {
      surface.classList.add("m-card--removing");
      await new Promise((resolve) => window.setTimeout(resolve, REMOVE_MS));
      return render(streamElement);
    };
  }
}
