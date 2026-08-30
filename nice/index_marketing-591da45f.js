// Register only controllers present in the marketing importmap, and only
// when a data-controller appears. Authenticated desks keep eager loading.
import { application } from "controllers/application";
import { lazyLoadControllersFrom } from "@hotwired/stimulus-loading";
lazyLoadControllersFrom("controllers", application);
