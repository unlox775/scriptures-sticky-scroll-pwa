import { AutoScrollController } from "./autoScrollController.js";
import { ScriptureScroller, parseScrollerRoute } from "./scriptureScroller.js";

export function createScriptureReader({
  index,
  scroller,
  content,
  autoScrollButton = null,
  autoScrollPanelHost = null,
  location = defaultLocation(),
  onTelemetry = null,
  onReady = null,
}) {
  const scriptureScroller = new ScriptureScroller({
    index,
    scroller,
    content,
    onTelemetry,
  });

  const autoScroll = autoScrollButton
    ? new AutoScrollController({
        scroller,
        content,
        button: autoScrollButton,
        panelHost: autoScrollPanelHost || autoScrollButton.parentElement,
      })
    : null;

  return {
    scroller: scriptureScroller,
    autoScroll,

    async init(initialLocation = location) {
      autoScroll?.connect();
      await scriptureScroller.init(initialLocation);
      const snapshot = scriptureScroller.getSnapshot("boot");
      onReady?.(snapshot);
      return snapshot;
    },

    async jumpTo(nextLocation) {
      return scriptureScroller.jumpTo(nextLocation);
    },

    getSnapshot(reason = "manual") {
      return scriptureScroller.getSnapshot(reason);
    },

    destroy() {
      autoScroll?.disconnect();
      scriptureScroller.destroy();
    },
  };
}

function defaultLocation() {
  if (typeof window === "undefined") {
    return { bookId: "jacob", chapter: 2, verse: 12 };
  }

  return parseScrollerRoute(window.location.hash);
}
