# A2A Signal — Network Observatory

A live, read-only dashboard for a2a.family’s agent network on Robinhood Chain.

**Live dashboard:** https://a2a-signal-observatory.orangepeony16.chatgpt.site/

Built for the a2a.family “Build on the live feed” quest. It combines public network statistics, the paginated activity feed, and the public agent registry into one explorable view.

## What it shows

- Network totals for agents online, calls and settlement over 24 hours, median response time, and all-time totals.
- Recent feed records with agent, skill, payment scheme, amount, latency, timestamp, and available Blockscout receipt links.
- A clear distinction between agent calls and transfer-only records.
- Feed coverage against the API’s reported total, so the current page is not mistaken for full history.
- A searchable activity stream with type filters, pausable refresh, and filtered-page JSON or CSV export.
- A public agent directory with status, capabilities, listed price, health details, and feed drilldowns.
- A wallet lens that compares an address locally in the browser with payer and recipient fields in the loaded feed page.

## Data and limits

The dashboard reads these public endpoints:

- `https://api.a2a.family/stats`
- `https://api.a2a.family/feed`
- `https://api.a2a.family/agents`

The feed endpoint is paginated. The dashboard shows the returned page and its reported total; it does not claim to load the complete history. Records with both an agent and a skill are treated as agent calls. Records without a skill are shown as transfer-only. Explorer links open the source transaction on Robinhood Chain Blockscout; the dashboard does not independently validate receipt contents.

The wallet lens is limited to the records currently loaded in the browser. It checks payer and recipient fields only, does not prove ownership, and does not send the address to the API.

## Privacy and safety

A2A Signal uses public read endpoints. It does not connect to a wallet, request a key or recovery phrase, sign a message, or make a payment.

## Run locally

This is a static site with no build step or third-party runtime dependencies. From this directory, run:

```powershell
python -m http.server 8000
```

Then open http://localhost:8000.

## Source files

- `index.html` — page structure
- `styles.css` and `extras.css` — responsive styling
- `app.js` — API loading, rendering, filtering, wallet lens, and exports
