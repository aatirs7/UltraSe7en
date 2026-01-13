/**
 * Notion-style UI shell (separate from existing UltraSe7en dashboard)
 * Adds:
 * - Theme toggle (persisted)
 * - Slash commands in flow editor
 * - Canvas mode with draggable blocks (true "type anywhere")
 */

const LS = {
  pages: "ultrase7en_notion_pages_v2",
  activeId: "ultrase7en_notion_active_v2",
  theme: "ultrase7en_notion_theme_v1",
};

const THEMES = ["dark", "notionLight", "graphite", "midnight"];

const $ = (id) => document.getElementById(id);

let state = {
  pages: [],
  activeId: null,
  menuForPageId: null,
  mode: "flow",
};

function uid(){
  return (crypto?.randomUUID?.() || `p_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

function load(){
  // theme
  const t = localStorage.getItem(LS.theme) || "dark";
  setTheme(THEMES.includes(t) ? t : "dark");

  // pages
  try{
    const pages = JSON.parse(localStorage.getItem(LS.pages) || "[]");
    state.pages = Array.isArray(pages) ? pages : [];
  }catch{
    state.pages = [];
  }
  state.activeId = localStorage.getItem(LS.activeId) || null;

  if(!state.pages.length){
    const first = {
      id: uid(),
      title: "No Option.",
      // For v2 we store both editors:
      flowHTML: `<ul>
        <li>Lamborghini before I turn 30</li>
        <li>Clothing brand success</li>
        <li>Personal brand page</li>
        <li>3 streams of income generating 10k a month</li>
        <li>Fix teeth</li>
        <li>6 pack</li>
        <li>High Rise Apartment</li>
      </ul>`,
      updatedAt: Date.now(),
    };
    state.pages = [first];
    state.activeId = first.id;
    persist();
  }

  if(!state.pages.some(p => p.id === state.activeId)){
    state.activeId = state.pages[0]?.id || null;
    persist();
  }
}

function persist(){
  localStorage.setItem(LS.pages, JSON.stringify(state.pages));
  localStorage.setItem(LS.activeId, state.activeId || "");
}

function setTheme(theme){
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);
}

function cycleTheme(){
  const cur = document.body.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
}

function activePage(){
  return state.pages.find(p => p.id === state.activeId) || null;
}

function render(){
  renderSidebar();
  renderEditor();
  syncModeUI();
}

function renderSidebar(){
  const list = $("pagesList");
  const q = ($("pageSearch").value || "").trim().toLowerCase();
  list.innerHTML = "";

  const filtered = state.pages
    .slice()
    .sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter(p => !q || (p.title || "").toLowerCase().includes(q));

  for(const p of filtered){
    const row = document.createElement("div");
    row.className = "pageRow" + (p.id === state.activeId ? " active" : "");
    row.dataset.pageId = p.id;

    const left = document.createElement("div");
    left.className = "pageRow__left";

    const icon = document.createElement("div");
    icon.className = "pageRow__icon";
    icon.setAttribute("aria-hidden", "true");

    const title = document.createElement("div");
    title.className = "pageRow__title";
    title.textContent = p.title?.trim() ? p.title : "Untitled";

    left.appendChild(icon);
    left.appendChild(title);

    const meta = document.createElement("div");

    const kebab = document.createElement("button");
    kebab.className = "kebab";
    kebab.textContent = "…";
    kebab.title = "Page options";
    kebab.addEventListener("click", (e) => {
      e.stopPropagation();
      openMenuForPage(p.id, kebab);
    });

    meta.appendChild(kebab);

    row.appendChild(left);
    row.appendChild(meta);

    row.addEventListener("click", () => {
      state.activeId = p.id;
      persist();
      render();
      $("pageTitle").focus();
    });

    list.appendChild(row);
  }
}

function renderEditor(){
  const p = activePage();
  $("crumbPage").textContent = p?.title?.trim() ? p.title : "Untitled";

  $("pageTitle").value = p?.title || "";

  // flow
  $("flowEditor").innerHTML = p?.flowHTML || "";

  updateCounts();
  setSaved("Saved");
}

function syncModeUI(){
  state.mode = "flow";
  $("modeFlowBtn").classList.add("active");
  $("modeFlowBtn").setAttribute("aria-selected", "true");
  $("flowEditor").classList.remove("hidden");
}

function setSaved(text){
  $("saveStatus").textContent = text;
}

function updateCounts(){
  const p = activePage();
  if(!p) return;

  let text = "";
  text = ($("flowEditor").innerText || "").trim();

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  $("wordCount").textContent = `${words} word${words === 1 ? "" : "s"}`;
}

function createPage(){
  const p = {
    id: uid(),
    title: "Untitled",
    flowHTML: "",
    updatedAt: Date.now(),
  };
  state.pages.push(p);
  state.activeId = p.id;
  persist();
  render();
  $("pageTitle").focus();
  $("pageTitle").select();
}

function deletePage(pageId){
  const idx = state.pages.findIndex(p => p.id === pageId);
  if(idx === -1) return;

  const title = state.pages[idx]?.title || "Untitled";
  const ok = confirm(`Delete "${title}"? This cannot be undone.`);
  if(!ok) return;

  state.pages.splice(idx, 1);

  if(!state.pages.length){
    createPage();
    return;
  }

  if(state.activeId === pageId){
    state.activeId = state.pages[0].id;
  }

  persist();
  render();
}

function renamePage(pageId){
  const p = state.pages.find(x => x.id === pageId);
  if(!p) return;

  state.activeId = pageId;
  persist();
  render();

  $("pageTitle").focus();
  $("pageTitle").select();
}

/* ---------------- Saving ---------------- */

function saveActive(){
  const p = activePage();
  if(!p) return;

  p.title = $("pageTitle").value || "";
  p.flowHTML = $("flowEditor").innerHTML || "";
  p.updatedAt = Date.now();

  persist();
  renderSidebar();
  $("crumbPage").textContent = p.title?.trim() ? p.title : "Untitled";
  setSaved("Saved");
  updateCounts();
}

let saveTimer = null;
function scheduleSave(){
  setSaved("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveActive(), 350);
}

function exportActive(){
  const p = activePage();
  if(!p) return;

  const title = (p.title?.trim() ? p.title.trim() : "Untitled").replace(/[^\w\- ]+/g, "").slice(0, 64);

  let text = "";
  text = ($("flowEditor").innerText || "").trim();

  const blob = new Blob([`# ${p.title || "Untitled"}\n\n${text}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "Untitled"}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* --------------- Page menu --------------- */

function openMenuForPage(pageId, anchorBtn){
  state.menuForPageId = pageId;

  const menu = $("pageMenu");
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");

  const r = anchorBtn.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 180, r.left);
  const y = Math.min(window.innerHeight - 120, r.bottom + 6);

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function closeMenu(){
  state.menuForPageId = null;
  const menu = $("pageMenu");
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
}

/* --------------- Slash commands (Flow) --------------- */

const palette = {
  open: false,
  anchorRect: null,
};

function openPaletteAtCaret(){
  const pal = $("slashPalette");
  pal.classList.remove("hidden");
  pal.setAttribute("aria-hidden", "false");
  palette.open = true;

  // position near caret
  const r = caretRect();
  if(r){
    pal.style.left = `${Math.min(window.innerWidth - 280, r.left)}px`;
    pal.style.top = `${Math.min(window.innerHeight - 240, r.bottom + 8)}px`;
  }else{
    pal.style.left = "340px";
    pal.style.top = "90px";
  }
}

function closePalette(){
  const pal = $("slashPalette");
  pal.classList.add("hidden");
  pal.setAttribute("aria-hidden", "true");
  palette.open = false;
}

function caretRect(){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rects = range.getClientRects();
  return rects && rects[0] ? rects[0] : null;
}

function applyCommand(cmd){
  // Minimal transformations: operate on current block (wrap selection or insert structure)
  // For cleanliness, we mostly insert HTML snippets at caret.
  const ed = $("flowEditor");
  ed.focus();

  // Remove the "/" typed command token on the current line if present (best-effort)
  cleanupSlashToken();

  if(cmd === "h1") return insertHTML("<h1>Heading</h1><p></p>");
  if(cmd === "h2") return insertHTML("<h2>Heading</h2><p></p>");
  if(cmd === "bullet") return insertHTML("<ul><li>List item</li></ul><p></p>");
  if(cmd === "todo") return insertHTML('<ul><li>☐ To-do</li></ul><p></p>');
  if(cmd === "quote") return insertHTML("<blockquote>Quote</blockquote><p></p>");
  if(cmd === "divider") return insertHTML("<hr /><p></p>");
}

function cleanupSlashToken(){
  // If user typed "/" alone at start of line, delete it.
  // This is intentionally simple.
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if(node && node.nodeType === Node.TEXT_NODE){
    const text = node.textContent || "";
    const offset = range.startOffset;
    // if immediately after a "/" char, remove it
    if(offset > 0 && text[offset - 1] === "/"){
      node.textContent = text.slice(0, offset - 1) + text.slice(offset);
      // move caret back one
      const r = document.createRange();
      r.setStart(node, offset - 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
}

function insertHTML(html){
  document.execCommand("insertHTML", false, html);
  scheduleSave();
  updateCounts();
  closePalette();
}
\r\n/* --------------- Bullets + minimal typing helpers (Flow) --------------- */

function autoBulletOnSpace(){
  // If user types "- " at the start of a paragraph, convert to UL
  // Best-effort, minimal.
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;

  // only if in text node
  if(!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent || "";

  // caret at 2 with "- " present
  const offset = range.startOffset;
  if(offset !== 2) return;
  if(text.slice(0,2) !== "- " && text.slice(0,2) !== "* ") return;

  // Replace current paragraph with bullet list
  // delete the two chars then wrap
  node.textContent = text.slice(2);

  // Build UL with current line
  const line = node.textContent || "";
  node.textContent = ""; // clear

  insertHTML(`<ul><li>${escapeHTML(line)}</li></ul>`);
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

/* ---------------- Wiring ---------------- */

function wire(){
  $("newPageBtn").addEventListener("click", createPage);
  $("pageSearch").addEventListener("input", renderSidebar);
  $("themeBtn").addEventListener("click", cycleTheme);
  $("exportBtn").addEventListener("click", exportActive);

  // mode buttons
  $("modeFlowBtn").addEventListener("click", () => { state.mode = "flow"; syncModeUI(); updateCounts(); });

  // title save
  $("pageTitle").addEventListener("input", scheduleSave);

  // flow editor
  $("flowEditor").addEventListener("input", () => {
    updateCounts();
    scheduleSave();
  });

  $("flowEditor").addEventListener("keydown", (e) => {
    // Ctrl/Cmd+S
    const isSave = (e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey);
    if(isSave){
      e.preventDefault();
      saveActive();
      return;
    }

    // Slash commands
    if(e.key === "/"){
      // open palette after slash inserts
      setTimeout(() => openPaletteAtCaret(), 0);
      return;
    }

    // close palette
    if(e.key === "Escape"){
      closePalette();
      closeMenu();
      return;
    }

    // quick bullet conversion when user types "- " then space
    if(e.key === " "){
      setTimeout(() => autoBulletOnSpace(), 0);
    }
  });

  // palette click
  document.querySelectorAll(".palette__item").forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-cmd");
      applyCommand(cmd);
    });
  });

  // page menu
  $("renamePageBtn").addEventListener("click", () => {
    const id = state.menuForPageId;
    closeMenu();
    if(id) renamePage(id);
  });
  $("deletePageBtn").addEventListener("click", () => {
    const id = state.menuForPageId;
    closeMenu();
    if(id) deletePage(id);
  });

  // click outside closes menus
  window.addEventListener("click", (e) => {
    const menu = $("pageMenu");
    if(!menu.classList.contains("hidden") && !menu.contains(e.target) && !e.target.closest(".kebab")){
      closeMenu();
    }
    const pal = $("slashPalette");
    if(!pal.classList.contains("hidden") && !pal.contains(e.target) && e.target !== $("flowEditor")){
      // don’t force-close if user is still typing, only close on click-away
      closePalette();
    }
  });

  // Global Ctrl/Cmd+S fallback
  window.addEventListener("keydown", (e) => {
    const isSave = (e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey);
    if(isSave){
      e.preventDefault();
      saveActive();
    }
    if(e.key === "Escape"){
      closeMenu();
      closePalette();
    }
  });
}

function openMenuForPage(pageId, anchorBtn){
  state.menuForPageId = pageId;

  const menu = $("pageMenu");
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");

  const r = anchorBtn.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 180, r.left);
  const y = Math.min(window.innerHeight - 120, r.bottom + 6);

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

(function boot(){
  load();
  wire();
  render();
})();

