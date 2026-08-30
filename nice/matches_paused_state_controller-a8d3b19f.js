import { Controller } from "@hotwired/stimulus";

// Toggles matches paused chrome on #turbo-main-pane / #matches_paused_shell when
// pause/resume streams replace #matches_paused_state_sync (matches scope row).
export default class extends Controller {
  static values = { paused: Boolean };

  connect() {
    this.apply();
  }

  pausedValueChanged() {
    this.apply();
  }

  apply() {
    const pane = document.getElementById("turbo-main-pane");
    const shell = document.getElementById("matches_paused_shell");

    if (this.pausedValue) {
      if (shell) {
        shell.classList.add("matches-paused-shell");
        pane?.classList.remove("turbo-main-pane--matches-paused");
      } else {
        pane?.classList.add("turbo-main-pane--matches-paused");
      }
      return;
    }

    shell?.classList.remove("matches-paused-shell");
    pane?.classList.remove("turbo-main-pane--matches-paused");
  }
}
