import { Controller } from "@hotwired/stimulus";
import { openSupportChat } from "lib/open_support_chat";
import { openWorkspaceSearch } from "lib/open_workspace_search";

// Topbar Support menu actions (dropdown chrome lives in dropdown_controller).
export default class extends Controller {
  openChat(event) {
    event.preventDefault();
    this.#hideDropdown();
    openSupportChat(this.application);
  }

  openSearch(event) {
    event.preventDefault();
    this.#hideDropdown();
    openWorkspaceSearch();
  }

  #hideDropdown() {
    const ctrl = this.application.getControllerForElementAndIdentifier(this.element, "dropdown");
    ctrl?.hide();
  }
}
