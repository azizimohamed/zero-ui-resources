import { Controller } from "@hotwired/stimulus";

// Monitors index GET form: sort/direction auto-submit.
// Blank `q` omission + clear control live on search-clear-submit (same form).
export default class extends Controller {
  submit() {
    this.element.requestSubmit();
  }
}
