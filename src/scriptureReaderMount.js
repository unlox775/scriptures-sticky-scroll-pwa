import { AutoScrollController } from "./autoScrollController.js";
import { ScriptureScroller, parseScrollerRoute } from "./scriptureScroller.js";

export function createScriptureReader({
  index,
  scroller,
  content,
  workId,
  bookCache = null,
  autoScrollButton = null,
  autoScrollPanelHost = null,
  initialAutoScrollSpeed = 20,
  onAutoScrollStateChange = null,
  onAutoScrollFrame = null,
  location = defaultLocation(),
  onTelemetry = null,
  onReady = null,
}) {
  const scriptureScroller = new ScriptureScroller({
    index,
    scroller,
    content,
    ...(workId ? { workId } : {}),
    ...(bookCache ? { bookCache } : {}),
    onTelemetry,
  });

  const autoScroll = autoScrollButton
    ? new AutoScrollController({
        scroller,
        content,
        button: autoScrollButton,
        panelHost: autoScrollPanelHost || autoScrollButton.parentElement,
        initialSpeed: initialAutoScrollSpeed,
        onAutoScroll: (details) => {
          scriptureScroller.handleAutoScrollTick(details);
          onAutoScrollFrame?.(details);
        },
        onStateChange: onAutoScrollStateChange,
        canContinue: () => scriptureScroller.canScrollForward(),
        onStop: (details) => scriptureScroller.emitAutoScrollStop(details),
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
