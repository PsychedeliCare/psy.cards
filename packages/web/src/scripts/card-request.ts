/**
 * Headers for fetching a `/card/<slug>` fragment. `X-Psy-Card` tells the
 * Worker (src/worker.js) that this page handles a missing card itself; pages
 * kept by older service workers don't send it and get an "updating" card.
 */
export const CARD_REQUEST_HEADERS = { Accept: "text/html", "X-Psy-Card": "1" } as const;
