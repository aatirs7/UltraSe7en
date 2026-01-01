/* UltraSe7en v0 — Local-only
   - category: text required
   - NC: New Category Name adds category
   - Today entries saved per date
   - Add to Web promotes entries to Web nodes
   - Auto-promote happens when date changes and you open the dashboard next time
*/

const LS_CATEGORIES = "ultrase7en.v0.categories";
const LS_ENTRIES = "ultrase7en.v0.entries";     // array of entries across dates
const LS_NODES = "ultrase7en.v0.nodes";         // array of nodes across dates
const LS_LAST_DATE = "ultrase7en.v0.lastSeenDate";

const DEFAULT_CATEGORIES = [
  "note",
  "project update",
  "project",
  "to do",
  "goal",
  "random"
];

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function now12h(ts = Date.now()) {
  const d = new Date(ts);
  let h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${ampm}`;
}

function uid() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeCategoryName(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function escapeHTML(s="") {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

/* ---------- State ---------- */
let categories = [];
let entries = [];
let nodes = [];
let editingEntryId = null;

/* ---------- Elements ---------- */
const elTodayDate = document.getElementById("todayDate");
const elInput = document.getElementById("entryInput");
const elSubmit = document.getElementById("submitBtn");
const elCmdError = document.getElementById("cmdError");
const elToast = document.getElementById("toast");

const elTodayEmpty = document.getElementById("todayEmpty");
const elTodayList = document.getElementById("todayList");
const elAddAll = document.getElementById("addAllBtn");
const elClearToday = document.getElementById("clearTodayBtn");

const elKnowledgeEmpty = document.getElementById("knowledgeEmpty");
const elKnowledgeGroups = document.getElementById("knowledgeGroups");

const elDrawer = document.getElementById("drawer");
const elDrawerBackdrop = document.getElementById("drawerBackdrop");
const elDrawerClose = document.getElementById("drawerClose");
const elExpand = document.getElementById("expandBtn");
const elDrawerKnowledgeEmpty = document.getElementById("drawerKnowledgeEmpty");
const elDrawerKnowledgeGroups = document.getElementById("drawerKnowledgeGroups");

const elModal = document.getElementById("modal");
const elModalBackdrop = document.getElementById("modalBackdrop");
const elModalClose = document.getElementById("modalClose");
const elModalCancel = document.getElementById("modalCancel");
const elModalSave = document.getElementById("modalSave");
const elModalText = document.getElementById("modalText");
const elModalError = document.getElementById("modalError");

/* ---------- Autocomplete ---------- */
const elAcBox = document.getElementById("acBox");
const elAcList = document.getElementById("acList");
let acItems = [];
let acActive = 0;
let acVisible = false;

function showError(msg) {
  if (!msg) {
    elCmdError.style.display = "none";
    elCmdError.textContent = "";
    return;
  }
  elCmdError.style.display = "block";
  elCmdError.textContent = msg;
}

function showToast(msg) {
  elToast.textContent = msg;
  elToast.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    elToast.style.display = "none";
    elToast.textContent = "";
  }, 1800);
}

function ensureCategory(name) {
  const n = normalizeCategoryName(name);
  if (!n) return;
  const exists = categories.some(c => c.toLowerCase() === n.toLowerCase());
  if (!exists) {
    categories.push(n);
    categories.sort((a,b) => a.localeCompare(b));
    saveJSON(LS_CATEGORIES, categories);
  }
}

function getPrefixContext(text) {
  // We only autocomplete the prefix portion before ":" on the current line.
  const pos = elInput.selectionStart ?? text.length;
  const before = text.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);

  const colonIdx = line.indexOf(":");
  const hasColon = colonIdx !== -1;

  return {
    pos,
    lineStart,
    line,
    hasColon,
    prefix: hasColon ? line.slice(0, colonIdx) : line,
    afterColon: hasColon ? line.slice(colonIdx + 1) : ""
  };
}

function buildAutocomplete() {
  const text = elInput.value;
  const ctx = getPrefixContext(text);

  // If user already typed ":" on this line, stop autocomplete.
  if (ctx.hasColon) {
    hideAutocomplete();
    return;
  }

  const raw = normalizeCategoryName(ctx.prefix);
  if (!raw) {
    hideAutocomplete();
    return;
  }

  // Special: if they type "N" or "NC" we show NC command
  const q = raw.toLowerCase();

  // suggestions include categories AND NC command.
  const sugg = [];

  // NC command hint
  if ("nc".startsWith(q)) {
    sugg.push({ type: "cmd", value: "NC", display: "NC", right: "new category" });
  }

  // category suggestions
  for (const c of categories) {
    if (c.toLowerCase().startsWith(q)) {
      sugg.push({ type: "cat", value: c, display: c, right: "category" });
    }
  }

  // If no suggestions, hide.
  if (sugg.length === 0) {
    hideAutocomplete();
    return;
  }

  // Remove duplicates case-insensitively
  const seen = new Set();
  acItems = sugg.filter(s => {
    const k = `${s.type}:${s.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Keep active in bounds
  acActive = Math.max(0, Math.min(acActive, acItems.length - 1));

  renderAutocomplete();
  showAutocomplete();
}

function renderAutocomplete() {
  elAcList.innerHTML = acItems.map((it, idx) => {
    const active = idx === acActive ? "active" : "";
    const badge = it.type === "cmd" ? "CMD" : "CAT";
    return `
      <div class="ac-item ${active}" data-idx="${idx}">
        <div class="ac-left">
          <span class="ac-badge">${badge}</span>
          <span class="ac-text">${escapeHTML(it.display)}</span>
        </div>
        <div class="ac-right">${escapeHTML(it.right)}</div>
      </div>
    `;
  }).join("");
}

function showAutocomplete() {
  acVisible = true;
  elAcBox.style.display = "block";
}

function hideAutocomplete() {
  acVisible = false;
  elAcBox.style.display = "none";
  elAcList.innerHTML = "";
  acItems = [];
  acActive = 0;
}

function applyAutocompleteSelection() {
  if (!acVisible || acItems.length === 0) return false;

  const text = elInput.value;
  const ctx = getPrefixContext(text);
  const sel = acItems[acActive];

  // Replace current line prefix with selected value + ": "
  const replacement = sel.type === "cmd" ? "NC: " : `${sel.value}: `;

  // Replace from lineStart to cursor pos (only prefix part)
  const before = text.slice(0, ctx.lineStart);
  const after = text.slice(ctx.pos);

  const newText = before + replacement + after.replace(/^\s*/, ""); // trim leading spaces after completion
  elInput.value = newText;

  // Move cursor to end of replacement
  const newPos = (before + replacement).length;
  elInput.setSelectionRange(newPos, newPos);

  hideAutocomplete();
  return true;
}

/* Click to pick suggestion */
elAcList.addEventListener("click", (e) => {
  const item = e.target.closest(".ac-item");
  if (!item) return;
  const idx = Number(item.dataset.idx);
  if (Number.isFinite(idx)) {
    acActive = idx;
    applyAutocompleteSelection();
  }
});

/* ---------- Parsing Commands ---------- */
function parseLine(input) {
  const raw = String(input || "").trim();
  if (!raw) return { kind: "empty" };

  const idx = raw.indexOf(":");
  if (idx === -1) return { kind: "invalid", error: `Missing ":" — use "category: text" or "NC: Category Name".` };

  const left = normalizeCategoryName(raw.slice(0, idx));
  const right = raw.slice(idx + 1).trim();

  if (!left) return { kind: "invalid", error: "Category is empty." };

  // NC command
  if (left.toLowerCase() === "nc") {
    if (!right) return { kind: "invalid", error: 'NC requires a name. Example: "NC: Enrichment Projects"' };
    const name = normalizeCategoryName(right);
    return { kind: "newCategory", name };
  }

  // Regular entry
  if (!right) return { kind: "invalid", error: "Text is empty after ':'." };
  return { kind: "entry", category: left, text: right };
}

/* ---------- Entries & Nodes ---------- */
function getTodayEntries() {
  const today = isoTodayLocal();
  return entries.filter(e => e.date === today).sort((a,b) => b.createdAt - a.createdAt);
}

function addEntry(category, text) {
  const today = isoTodayLocal();
  const entry = {
    id: uid(),
    date: today,
    createdAt: Date.now(),
    category: normalizeCategoryName(category),
    text: String(text),
    inWeb: false,
    nodeIds: []
  };
  entries.push(entry);
  saveJSON(LS_ENTRIES, entries);
  return entry;
}

function updateEntry(id, category, text) {
  const i = entries.findIndex(e => e.id === id);
  if (i === -1) return false;
  entries[i].category = normalizeCategoryName(category);
  entries[i].text = String(text);
  saveJSON(LS_ENTRIES, entries);
  return true;
}

function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  saveJSON(LS_ENTRIES, entries);
}

function promoteEntryToWeb(entryId) {
  const i = entries.findIndex(e => e.id === entryId);
  if (i === -1) return false;
  const e = entries[i];
  if (e.inWeb) return true;

  ensureCategory(e.category);

  // Node shape: deterministic (no AI)
  const node = {
    id: uid(),
    createdAt: Date.now(),
    date: e.date,
    category: e.category,
    title: e.text.length > 80 ? e.text.slice(0, 80) + "…" : e.text,
    detail: e.text,
    sourceEntryId: e.id
  };

  nodes.push(node);
  e.inWeb = true;
  e.nodeIds = [node.id];

  saveJSON(LS_NODES, nodes);
  saveJSON(LS_ENTRIES, entries);
  return true;
}

function promoteAllTodayToWeb() {
  const todays = getTodayEntries();
  let count = 0;
  for (const e of todays) {
    if (!e.inWeb) {
      promoteEntryToWeb(e.id);
      count++;
    }
  }
  return count;
}

/* Auto-promote when date changes (practical “end of day”) */
function autoPromotePreviousDay(lastDate, today) {
  if (!lastDate || lastDate === today) return { promoted: 0 };

  // Promote unsynced entries from lastDate
  const target = entries.filter(e => e.date === lastDate && !e.inWeb);
  let promoted = 0;
  for (const e of target) {
    if (promoteEntryToWeb(e.id)) promoted++;
  }
  return { promoted };
}

/* ---------- Rendering ---------- */
function renderToday() {
  const todays = getTodayEntries();
  elTodayDate.textContent = isoTodayLocal();

  if (todays.length === 0) {
    elTodayEmpty.style.display = "block";
    elTodayList.innerHTML = "";
    return;
  }

  elTodayEmpty.style.display = "none";
  elTodayList.innerHTML = todays.map(e => {
    const disabled = e.inWeb ? "disabled" : "";
    const status = e.inWeb ? `<span class="pill" style="border-color: rgba(120,255,200,0.20); background: rgba(120,255,200,0.06); color: var(--ok);">IN WEB</span>` : "";
    return `
      <div class="card">
        <div class="card-top">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="pill">${escapeHTML(e.category)}</span>
            ${status}
          </div>
          <div class="card-meta">${escapeHTML(now12h(e.createdAt))}</div>
        </div>

        <div class="card-text">${escapeHTML(e.text)}</div>

        <div class="card-actions">
          <button class="mini" data-action="web" data-id="${e.id}" ${disabled}>ADD TO WEB</button>
          <button class="mini" data-action="edit" data-id="${e.id}">EDIT</button>
          <button class="mini" data-action="del" data-id="${e.id}">DELETE</button>
        </div>
      </div>
    `;
  }).join("");
}

function groupNodesByCategory(nodesArr) {
  const map = new Map();
  for (const c of categories) map.set(c, []); // show empty groups too
  for (const n of nodesArr) {
    const cat = normalizeCategoryName(n.category);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(n);
  }

  // Sort nodes newest first within category
  for (const [k, arr] of map.entries()) {
    arr.sort((a,b) => b.createdAt - a.createdAt);
    map.set(k, arr);
  }

  // Sort categories alpha, but keep ones with content near top
  const sorted = Array.from(map.entries()).sort((a,b) => {
    const aCount = a[1].length, bCount = b[1].length;
    if (aCount !== bCount) return bCount - aCount;
    return a[0].localeCompare(b[0]);
  });

  return sorted;
}

function renderKnowledgeInto(containerEmpty, containerGroups, inDrawer=false) {
  if (nodes.length === 0) {
    containerEmpty.style.display = "block";
    containerGroups.innerHTML = "";
    return;
  }

  containerEmpty.style.display = "none";

  const groups = groupNodesByCategory(nodes);

  containerGroups.innerHTML = groups.map(([cat, arr]) => {
    const count = arr.length;
    const nodesHtml = arr.slice(0, inDrawer ? 9999 : 6).map(n => `
      <div class="node">
        <div class="node-top">
          <div class="node-title">${escapeHTML(n.title)}</div>
          <div class="card-meta">${escapeHTML(now12h(n.createdAt))}</div>
        </div>
        <div class="node-sub">${escapeHTML(n.detail)}</div>
      </div>
    `).join("");

    const truncated = (!inDrawer && count > 6)
      ? `<div class="node-sub" style="padding: 2px 2px 0; color: rgba(255,255,255,0.42);">+${count - 6} more</div>`
      : "";

    return `
      <div class="group">
        <div class="group-head">
          <div class="group-title">
            <span class="pill" style="border-color: rgba(255,255,255,0.10); background: rgba(0,0,0,0.10); color: rgba(255,255,255,0.70); letter-spacing: 0.20em;">
              ${escapeHTML(cat)}
            </span>
          </div>
          <div class="group-count">${count} NODE${count === 1 ? "" : "S"}</div>
        </div>
        <div class="node-list">
          ${nodesHtml}
          ${truncated}
        </div>
      </div>
    `;
  }).join("");
}

function renderKnowledge() {
  renderKnowledgeInto(elKnowledgeEmpty, elKnowledgeGroups, false);
  renderKnowledgeInto(elDrawerKnowledgeEmpty, elDrawerKnowledgeGroups, true);
}

/* ---------- Modal (Edit) ---------- */
function openModalForEntry(entryId) {
  const e = entries.find(x => x.id === entryId);
  if (!e) return;

  editingEntryId = entryId;
  elModalText.value = `${e.category}: ${e.text}`;

  elModalError.style.display = "none";
  elModalError.textContent = "";

  elModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  editingEntryId = null;
  elModal.setAttribute("aria-hidden", "true");
}

function modalError(msg) {
  if (!msg) {
    elModalError.style.display = "none";
    elModalError.textContent = "";
    return;
  }
  elModalError.style.display = "block";
  elModalError.textContent = msg;
}

/* ---------- Drawer ---------- */
function openDrawer() { elDrawer.setAttribute("aria-hidden", "false"); }
function closeDrawer() { elDrawer.setAttribute("aria-hidden", "true"); }

/* ---------- Event Handlers ---------- */
elSubmit.addEventListener("click", () => {
  showError("");
  const raw = elInput.value.trim();
  if (!raw) return;

  const parsed = parseLine(raw);
  if (parsed.kind === "invalid") {
    showError(parsed.error);
    return;
  }

  if (parsed.kind === "newCategory") {
    ensureCategory(parsed.name);
    elInput.value = "";
    hideAutocomplete();
    renderKnowledge(); // shows empty group if needed
    showToast(`Category added: ${parsed.name}`);
    return;
  }

  if (parsed.kind === "entry") {
    ensureCategory(parsed.category); // auto-add if new
    addEntry(parsed.category, parsed.text);
    elInput.value = "";
    hideAutocomplete();
    renderToday();
    showToast("Saved to Today");
    return;
  }
});

elInput.addEventListener("input", () => {
  showError("");
  buildAutocomplete();
});

elInput.addEventListener("keydown", (e) => {
  // Only handle autocomplete keys when box visible
  if (acVisible) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      acActive = (acActive + 1) % acItems.length;
      renderAutocomplete();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      acActive = (acActive - 1 + acItems.length) % acItems.length;
      renderAutocomplete();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      applyAutocompleteSelection();
      return;
    }
    if (e.key === "Escape") {
      hideAutocomplete();
      return;
    }
  } else {
    // If user hits Tab and they are typing prefix, try to open suggestions
    if (e.key === "Tab") {
      const ctx = getPrefixContext(elInput.value);
      if (!ctx.hasColon) {
        buildAutocomplete();
        if (acVisible) {
          e.preventDefault();
          applyAutocompleteSelection();
        }
      }
    }
  }
});

document.addEventListener("click", (e) => {
  // click outside autocomplete hides it
  const isInside = e.target.closest(".autocomplete-wrap");
  if (!isInside) hideAutocomplete();
});

elTodayList.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;

  if (action === "web") {
    promoteEntryToWeb(id);
    renderToday();
    renderKnowledge();
    showToast("Added to Web");
    return;
  }

  if (action === "edit") {
    openModalForEntry(id);
    return;
  }

  if (action === "del") {
    deleteEntry(id);
    renderToday();
    showToast("Deleted");
    return;
  }
});

elAddAll.addEventListener("click", () => {
  const count = promoteAllTodayToWeb();
  renderToday();
  renderKnowledge();
  showToast(count === 0 ? "Nothing to add" : `Added ${count} to Web`);
});

elClearToday.addEventListener("click", () => {
  const today = isoTodayLocal();
  entries = entries.filter(e => e.date !== today);
  saveJSON(LS_ENTRIES, entries);
  renderToday();
  showToast("Today cleared");
});

elExpand.addEventListener("click", () => {
  openDrawer();
});

elDrawerBackdrop.addEventListener("click", closeDrawer);
elDrawerClose.addEventListener("click", closeDrawer);

/* Modal events */
elModalBackdrop.addEventListener("click", closeModal);
elModalClose.addEventListener("click", closeModal);
elModalCancel.addEventListener("click", closeModal);

elModalSave.addEventListener("click", () => {
  modalError("");
  if (!editingEntryId) return;

  const raw = elModalText.value.trim();
  const parsed = parseLine(raw);

  if (parsed.kind !== "entry") {
    modalError(parsed.kind === "invalid" ? parsed.error : "Editing requires an entry: category: text");
    return;
  }

  // If entry already in web, keep it in web but do not auto-create new node.
  // (Simple v0 rule: editing changes the entry, but the web node remains as-is.)
  // Later we can add "Update Web Node" button if you want.
  ensureCategory(parsed.category);
  updateEntry(editingEntryId, parsed.category, parsed.text);

  closeModal();
  renderToday();
  renderKnowledge();
  showToast("Saved");
});

/* ---------- Boot ---------- */
function boot() {
  const today = isoTodayLocal();
  elTodayDate.textContent = today;

  categories = loadJSON(LS_CATEGORIES, null);
  if (!Array.isArray(categories) || categories.length === 0) {
    categories = [...DEFAULT_CATEGORIES];
    saveJSON(LS_CATEGORIES, categories);
  } else {
    // Normalize + sort
    categories = categories.map(normalizeCategoryName).filter(Boolean);
    categories = Array.from(new Set(categories.map(c => c))).sort((a,b) => a.localeCompare(b));
    saveJSON(LS_CATEGORIES, categories);
  }

  entries = loadJSON(LS_ENTRIES, []);
  if (!Array.isArray(entries)) entries = [];

  nodes = loadJSON(LS_NODES, []);
  if (!Array.isArray(nodes)) nodes = [];

  // Auto-promote previous day entries if date changed since last open
  const lastSeen = localStorage.getItem(LS_LAST_DATE);
  const result = autoPromotePreviousDay(lastSeen, today);
  localStorage.setItem(LS_LAST_DATE, today);

  if (result.promoted > 0) {
    showToast(`Auto-added ${result.promoted} from ${lastSeen} to Web`);
  }

  renderToday();
  renderKnowledge();
}

boot();
