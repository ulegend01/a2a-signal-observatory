(() => {
  "use strict";
  const API = "https://api.a2a.family";
  const POLL_MS = 60_000;
  const state = { stats: null, feed: null, agents: null, filter: "all", query: "", agentFilter: "all", refreshing: false, paused: false };
  const $ = (id) => document.getElementById(id);

  function number(value, digits = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(parsed) : "—";
  }
  function dollars(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "—";
    return parsed < 1 ? parsed.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : number(parsed, 2);
  }
  function eventType(row) {
    if (!row || !row.skill) return "transfer";
    if (Number(row.amount) > 0 || Number(row.usd) > 0) return "paid";
    return "free";
  }
  function isCall(row) { return Boolean(row && row.agent && row.skill); }
  function safeExplorer(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "robinhoodchain.blockscout.com" ? parsed.href : null;
    } catch { return null; }
  }
  function safeAgentUrl(url) {
    try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "api.a2a.family" && parsed.pathname.startsWith("/a/") ? parsed.href : null; }
    catch { return null; }
  }
  function relativeTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function renderStats(data) {
    state.stats = data;
    $("liveAgents").textContent = number(data.live);
    $("agentTotal").textContent = `of ${number(data.agents)} discovered agents`;
    $("calls24h").textContent = number(data.calls24h);
    $("settled24h").textContent = dollars(data.settled24h);
    $("latency").textContent = number(data.p50ms);
    $("callsAll").textContent = number(data.callsAll);
    $("settledAll").textContent = dollars(data.settledAll);
    $("networkState").textContent = Number(data.live) > 0 ? "OPERATIONAL" : "QUIET";
    $("networkSub").textContent = `${number(data.live)} of ${number(data.agents)} agents reporting live`;
  }
  function renderFeed(data) {
    state.feed = data;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const calls = rows.filter(isCall).length;
    const transfers = rows.length - calls;
    $("feedCount").textContent = `${number(rows.length)} LOADED · ${data.more ? "MORE AVAILABLE" : "LATEST PAGE"}`;
    $("countAll").textContent = number(rows.length);
    $("countCalls").textContent = number(calls);
    $("countTransfers").textContent = number(transfers);
    $("coverageLoaded").textContent = number(rows.length);
    $("coverageTotal").textContent = number(data.total ?? rows.length);
    $("coverageCalls").textContent = number(calls);
    $("coverageTransfers").textContent = number(transfers);
    const coverage = Number(data.total) > 0 ? Math.min(100, rows.length / Number(data.total) * 100) : 0;
    $("coverageBar").style.width = `${coverage}%`;
    $("pageNote").textContent = data.more
      ? `Showing ${number(rows.length)} of ${number(data.total)} feed records. This is a paginated page, not the full history.`
      : `Showing ${number(rows.length)} of ${number(data.total ?? rows.length)} feed records from the latest API response.`;
    paintRows();
  }
  function renderAgents(data) {
    const agents = Array.isArray(data.agents) ? data.agents : [];
    state.agents = agents;
    const live = agents.filter((agent) => agent.status === "live").length;
    $("directoryCount").textContent = `${number(live)} live · ${number(agents.length - live)} down · ${number(agents.length)} total`;
    paintAgents();
  }
  function paintAgents() {
    const root = $("directoryGrid");
    root.replaceChildren();
    const agents = (state.agents || []).filter((agent) => state.agentFilter === "all" || agent.status === state.agentFilter)
      .sort((a, b) => (a.status === b.status ? (Number(b.calls) || 0) - (Number(a.calls) || 0) : a.status === "live" ? -1 : 1));
    if (!agents.length) { root.append(el("div", "directory-empty", state.agents ? "No agents match this status filter." : "Registry data is unavailable. Retry to reconnect.")); return; }
    for (const agent of agents) {
      const details = el("details", "agent-card"); details.dataset.agentId = agent.id || "";
      const summary = el("summary", "agent-summary");
      const nameBlock = el("span", "agent-summary-name");
      const status = el("i", `agent-status ${agent.status === "live" ? "is-live" : "is-down"}`);
      nameBlock.append(status, el("strong", "", agent.name || agent.id || "Unknown agent"), el("small", "agent-id", agent.id || "—"));
      const calls = el("span", "agent-summary-metric"); calls.append(el("b", "", number(agent.calls)), el("small", "", "calls"));
      const arrow = el("span", "details-arrow", "＋");
      summary.append(nameBlock, calls, arrow); details.append(summary);

      const detail = el("div", "agent-detail");
      detail.append(el("p", "agent-description", agent.description || "No registry description supplied."));
      const fields = el("div", "agent-fields");
      const pay = Array.isArray(agent.pay) ? agent.pay.join(", ") : (agent.pay || (Number(agent.price) === 0 ? "free" : "not reported"));
      const accepts = Array.isArray(agent.accepts) ? agent.accepts.join(", ") : "not reported";
      const price = Number(agent.price) > 0 ? `$${dollars(agent.price)} USD eq.` : (Number(agent.price) === 0 ? "Free" : "Not reported");
      const lastOk = agent.lastOk ? new Date(agent.lastOk).toLocaleString() : "No successful check recorded";
      for (const [label, value] of [["Listed price", price], ["Payment modes", pay], ["Accepted assets", accepts], ["Latest check", lastOk], ["Last latency", agent.lastMs == null ? "—" : `${number(agent.lastMs)} ms`], ["API calls", number(agent.calls)], ["API earned figure", agent.earned == null ? "—" : String(agent.earned)]]) {
        const field = el("div", "agent-field"); field.append(el("span", "", label), el("strong", "", value)); fields.append(field);
      }
      detail.append(fields);
      if (Array.isArray(agent.skills) && agent.skills.length) {
        const skills = el("div", "skill-list"); skills.append(el("span", "skill-label", "SKILLS"));
        for (const skill of agent.skills) skills.append(el("span", "skill-chip", skill)); detail.append(skills);
      }
      const actions = el("div", "agent-actions");
      const viewFeed = el("button", "quiet-button agent-view-feed", "View feed activity"); viewFeed.dataset.agentId = agent.id || ""; actions.append(viewFeed);
      const agentUrl = safeAgentUrl(agent.url); if (agentUrl) { const link = el("a", "agent-endpoint", "Agent endpoint ↗"); link.href = agentUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link); }
      detail.append(actions); details.append(detail); root.append(details);
    }
  }
  function walletLens(address = $("walletAddress").value.trim()) {
    const result = $("walletResult");
    if (!address) { result.textContent = "Runs locally in this browser. The address is not sent to the API."; return; }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) { result.textContent = "Enter a 0x-prefixed EVM address with 40 hexadecimal characters."; return; }
    const key = address.toLowerCase(); const rows = state.feed?.rows || [];
    const paidBy = rows.filter((row) => String(row.payer || "").toLowerCase() === key).length;
    const received = rows.filter((row) => String(row.payTo || "").toLowerCase() === key).length;
    const unrelated = rows.length - rows.filter((row) => String(row.payer || "").toLowerCase() === key || String(row.payTo || "").toLowerCase() === key).length;
    result.replaceChildren();
    const counts = el("span", "lens-counts");
    counts.append(el("b", "", number(paidBy)), document.createTextNode(" as payer  ·  "), el("b", "", number(received)), document.createTextNode(" as recipient  ·  "), el("b", "", number(unrelated)), document.createTextNode(" neither"));
    result.append(counts, el("span", "lens-scope", `Across ${number(rows.length)} loaded feed records only. The API does not expose caller identity on every record.`));
  }
  function exportRows(format) {
    const rows = (state.feed?.rows || []).filter((row) => {
      const call = isCall(row); const matchesFilter = state.filter === "all" || (state.filter === "calls" && call) || (state.filter === "transfers" && !call);
      const haystack = `${row.agentName || ""} ${row.agent || ""} ${row.skill || ""} ${row.scheme || ""} ${row.payer || ""} ${row.payTo || ""}`.toLowerCase();
      return matchesFilter && haystack.includes(state.query);
    });
    const payload = format === "json" ? JSON.stringify({ exportedAt: new Date().toISOString(), source: `${API}/feed`, feedTotal: state.feed?.total ?? null, moreAvailable: Boolean(state.feed?.more), displayedRecords: rows.length, records: rows }, null, 2) : toCsv(rows);
    const blob = new Blob([payload], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob); const anchor = el("a"); anchor.href = href; anchor.download = `a2a-signal-${new Date().toISOString().replace(/[:.]/g, "-")}.${format}`; anchor.click(); URL.revokeObjectURL(href);
    $("exportMenuItems").hidden = true; $("exportMenu").setAttribute("aria-expanded", "false");
  }
  function toCsv(rows) {
    const keys = ["tx", "at", "agent", "agentName", "skill", "scheme", "amount", "asset", "usd", "ms", "block", "payer", "payTo", "explorer"];
    const cell = (value) => { let text = value == null ? "" : String(value); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
    return [keys.map(cell).join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
  }
  function paintRows() {
    const tbody = $("feedRows");
    tbody.replaceChildren();
    const rows = Array.isArray(state.feed?.rows) ? state.feed.rows : [];
    const filtered = rows.filter((row) => {
      const call = isCall(row);
      const matchesFilter = state.filter === "all" || (state.filter === "calls" && call) || (state.filter === "transfers" && !call);
      const haystack = `${row.agentName || ""} ${row.agent || ""} ${row.skill || ""} ${row.scheme || ""}`.toLowerCase();
      return matchesFilter && haystack.includes(state.query);
    });
    if (!filtered.length) {
      const tr = el("tr"); const td = el("td", "empty", rows.length ? "No records match this filter." : "No records returned by the public feed.");
      td.colSpan = 6; tr.append(td); tbody.append(tr); return;
    }
    for (const row of filtered) {
      const tr = el("tr");
      const agent = el("td"); const agentWrap = el("div", "agent-cell");
      const name = row.agentName || row.agent || "Unattributed transfer";
      const avatar = el("span", "agent-avatar", name.slice(0, 2));
      const agentText = el("span", "agent-main");
      agentText.append(el("span", "agent-name", name), el("span", "agent-skill", row.skill || "no skill attached"));
      agentWrap.append(avatar, agentText); agent.append(agentWrap);

      const kind = eventType(row);
      const type = el("td", "type-cell");
      const label = kind === "transfer" ? "Transfer only" : kind === "free" ? "Free call" : "Paid call";
      const badge = el("span", `scheme ${kind}`, label);
      const schemeName = row.scheme ? String(row.scheme) : "unknown scheme";
      badge.title = `Payment scheme: ${schemeName}`;
      type.append(badge, el("span", "agent-skill", schemeName));

      const value = el("td", "value-cell");
      if (row.amount !== null && row.amount !== undefined && row.amount !== "") {
        value.append(document.createTextNode(`${number(row.amount, 6)} `));
        value.append(el("span", "value-asset", row.asset || "units"));
      } else if (row.usd !== null && row.usd !== undefined && Number.isFinite(Number(row.usd))) {
        value.textContent = `$${dollars(row.usd)}`;
      } else value.textContent = "—";

      const latency = el("td", "latency", row.ms !== null && row.ms !== undefined && Number.isFinite(Number(row.ms)) ? `${number(row.ms)} ms` : "—");
      const time = el("td", "time", relativeTime(row.at));
      if (row.at) time.title = new Date(row.at).toLocaleString();
      const receipt = el("td"); const linkUrl = safeExplorer(row.explorer);
      if (linkUrl) { const link = el("a", "explorer-link", "↗"); link.href = linkUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.setAttribute("aria-label", `Open transaction for ${name} on Blockscout`); link.title = "Verify on Robinhood Chain Blockscout"; receipt.append(link); }
      tr.append(agent, type, value, latency, time, receipt); tbody.append(tr);
    }
  }
  async function fetchJson(path) {
    const response = await fetch(`${API}${path}`, { headers: { Accept: "application/json" }, cache: "no-store", mode: "cors" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return response.json();
  }
  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    const button = $("refresh"); button.disabled = true; button.textContent = "…";
    const [statsResult, feedResult, agentsResult] = await Promise.allSettled([fetchJson("/stats"), fetchJson("/feed"), fetchJson("/agents")]);
    if (statsResult.status === "fulfilled") renderStats(statsResult.value);
    if (feedResult.status === "fulfilled") renderFeed(feedResult.value);
    if (agentsResult.status === "fulfilled") renderAgents(agentsResult.value);
    const failures = [statsResult, feedResult, agentsResult].filter((result) => result.status === "rejected");
    const now = new Date();
    $("updatedAt").textContent = failures.length === 0 ? `Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Partial data · retrying";
    if (failures.length === 0) {
      state.lastUpdated = now;
      if (state.stats && state.feed && state.agents) $("networkState").textContent = Number(state.stats.live) > 0 ? "OPERATIONAL" : "QUIET";
    } else {
      if (statsResult.status === "rejected") { $("networkState").textContent = "STATS OFFLINE"; $("networkSub").textContent = "Could not reach /stats"; }
      else if (feedResult.status === "rejected") $("networkSub").textContent = "Activity feed is temporarily unavailable";
      else if (agentsResult.status === "rejected") { $("directoryCount").textContent = "Registry unavailable · retry"; paintAgents(); }
      if (!state.feed && feedResult.status === "rejected") {
        const td = $("feedRows").querySelector("td"); if (td) td.textContent = "Could not load the public feed. Check your connection and retry.";
        $("pageNote").textContent = "The live endpoint did not respond.";
      }
      if (!state.stats && statsResult.status === "rejected") $("updatedAt").textContent = "Connection error · retry";
    }
    button.disabled = false; button.textContent = "↻"; state.refreshing = false;
  }
  document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    state.filter = button.dataset.filter; paintRows();
  }));
  $("search").addEventListener("input", (event) => { state.query = event.target.value.trim().toLowerCase(); paintRows(); });
  $("refresh").addEventListener("click", refresh);
  $("walletAddress").addEventListener("input", () => walletLens());
  $("analyzeWallet").addEventListener("click", () => walletLens());
  $("clearWallet").addEventListener("click", () => { $("walletAddress").value = ""; walletLens(""); });
  $("pauseFeed").addEventListener("click", () => { state.paused = !state.paused; $("pauseFeed").textContent = state.paused ? "Resume updates" : "Pause updates"; $("pauseFeed").setAttribute("aria-pressed", String(state.paused)); $("feedCount").textContent = state.paused ? `${number(state.feed?.rows?.length || 0)} LOADED · UPDATES PAUSED` : `${number(state.feed?.rows?.length || 0)} LOADED · RESUMING`; if (!state.paused) refresh(); });
  $("exportMenu").addEventListener("click", () => { const menu = $("exportMenuItems"); menu.hidden = !menu.hidden; $("exportMenu").setAttribute("aria-expanded", String(!menu.hidden)); });
  $("exportMenuItems").addEventListener("click", (event) => { const button = event.target.closest("[data-export]"); if (button) exportRows(button.dataset.export); });
  document.addEventListener("click", (event) => { if (!event.target.closest(".export-wrap")) { $("exportMenuItems").hidden = true; $("exportMenu").setAttribute("aria-expanded", "false"); } });
  document.querySelectorAll(".agent-filter").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".agent-filter").forEach((item) => item.classList.toggle("active", item === button)); state.agentFilter = button.dataset.agentFilter; paintAgents(); }));
  $("directoryGrid").addEventListener("click", (event) => { const button = event.target.closest(".agent-view-feed"); if (!button) return; $("search").value = button.dataset.agentId || ""; state.query = $("search").value.toLowerCase(); document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all")); state.filter = "all"; paintRows(); location.hash = "activity"; });
  refresh();
  window.setInterval(() => { if (!state.paused) refresh(); }, POLL_MS);
})();

