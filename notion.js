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

const EMPTY_HINT_HTML = `<div id="emptyHint" class="empty-hint" contenteditable="false">
  <h1 class="empty-title">Untitled</h1>
  <p class="empty-sub">Type anywhere. Use <span class="kbd">/</span> for commands.</p>
  <p class="empty-sub">Examples:</p>
  <ul class="empty-list">
    <li><span class="hint-tag">note:</span> fixed DNS issues in containers</li>
    <li><span class="hint-tag">project update:</span> built node visualizer</li>
    <li><span class="hint-tag">to do:</span> refactor dashboard layout</li>
    <li><span class="hint-tag">NC:</span> Enrichment Projects</li>
  </ul>
</div><p><br></p>`;

let state = {
  pages: [],
  activeId: null,
  menuForPageId: null,
  mode: "flow", // "flow" | "canvas"
  canvasArmed: false, // when true, next click places a block
  drag: null, // active drag state
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

  if(state.pages.length){
    state.pages = state.pages.map((p) => {
      if(typeof p?.flowHTML === "string" && p.flowHTML.includes("Lamborghini before I turn 30")){
        return { ...p, flowHTML: EMPTY_HINT_HTML };
      }
      return p;
    });
  }

  if(!state.pages.length){
    const first = {
      id: uid(),
      title: "No Option.",
      // For v2 we store both editors:
      flowHTML: EMPTY_HINT_HTML,
      canvasBlocks: [],
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
  const flowHTML = (p?.flowHTML || "").trim();
  $("flowEditor").innerHTML = flowHTML ? flowHTML : EMPTY_HINT_HTML;
  toggleEmptyHint();

  // canvas
  renderCanvasBlocks(p?.canvasBlocks || []);

  updateCounts();
  setSaved("Saved");
}

function syncModeUI(){
  const isFlow = state.mode === "flow";
  $("modeFlowBtn").classList.toggle("active", isFlow);
  $("modeCanvasBtn").classList.toggle("active", !isFlow);
  $("modeFlowBtn").setAttribute("aria-selected", String(isFlow));
  $("modeCanvasBtn").setAttribute("aria-selected", String(!isFlow));

  $("flowEditor").classList.toggle("hidden", !isFlow);
  $("canvasEditor").classList.toggle("hidden", isFlow);

  $("addBlockBtn").style.display = isFlow ? "none" : "inline-flex";
  state.canvasArmed = false;
  $("addBlockBtn").textContent = "+ Block";
}

function setSaved(text){
  $("saveStatus").textContent = text;
}

function updateCounts(){
  const p = activePage();
  if(!p) return;

  let text = "";
  if(state.mode === "flow"){
    text = getFlowText().trim();
  }else{
    // count canvas blocks text
    const blocks = p.canvasBlocks || [];
    text = blocks.map(b => (b.text || "")).join("\n").trim();
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  $("wordCount").textContent = `${words} word${words === 1 ? "" : "s"}`;
}

function createPage(){
  const p = {
    id: uid(),
    title: "Untitled",
    flowHTML: "",
    canvasBlocks: [],
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
  p.flowHTML = getFlowHTMLForSave();
  // canvasBlocks are updated as you type/drag
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
  if(state.mode === "flow"){
    text = ($("flowEditor").innerText || "").trim();
  }else{
    text = (p.canvasBlocks || []).map(b => b.text || "").join("\n\n").trim();
  }

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

/* --------------- Canvas blocks (true type-anywhere) --------------- */

function renderCanvasBlocks(blocks){
  const canvas = $("canvasEditor");
  // Remove existing blocks
  canvas.querySelectorAll(".block").forEach(b => b.remove());

  for(const b of blocks){
    const el = makeBlockElement(b);
    canvas.appendChild(el);
  }

  $("canvasHint").style.display = blocks.length ? "none" : "inline-flex";
}

function makeBlockElement(block){
  const wrap = document.createElement("div");
  wrap.className = "block";
  wrap.dataset.blockId = block.id;
  wrap.style.left = `${block.x}px`;
  wrap.style.top = `${block.y}px`;

  const bar = document.createElement("div");
  bar.className = "block__bar";
  bar.innerHTML = `<div class="block__handle">⋮⋮</div>`;

  const tools = document.createElement("div");
  tools.className = "block__tools";

  const del = document.createElement("button");
  del.className = "block__tool";
  del.title = "Delete block";
  del.textContent = "×";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteBlock(block.id);
  });

  tools.appendChild(del);
  bar.appendChild(tools);

  const body = document.createElement("div");
  body.className = "block__body";
  body.contentEditable = "true";
  body.spellcheck = true;
  body.innerText = block.text || "";
  body.addEventListener("input", () => {
    const p = activePage();
    const b = p?.canvasBlocks?.find(x => x.id === block.id);
    if(!b) return;
    b.text = body.innerText;
    scheduleSave();
    updateCounts();
  });

  // Dragging only by the bar
  bar.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startDrag(e, wrap, block.id);
  });

  wrap.appendChild(bar);
  wrap.appendChild(body);
  return wrap;
}

function startDrag(e, node, blockId){
  const rect = node.getBoundingClientRect();
  state.drag = {
    blockId,
    node,
    startX: e.clientX,
    startY: e.clientY,
    origLeft: rect.left,
    origTop: rect.top,
  };
}

function onDragMove(e){
  if(!state.drag) return;

  const canvas = $("canvasEditor");
  const cRect = canvas.getBoundingClientRect();

  const dx = e.clientX - state.drag.startX;
  const dy = e.clientY - state.drag.startY;

  // position relative to canvas
  const newLeft = (state.drag.origLeft - cRect.left) + dx;
  const newTop = (state.drag.origTop - cRect.top) + dy;

  state.drag.node.style.left = `${Math.max(0, newLeft)}px`;
  state.drag.node.style.top = `${Math.max(0, newTop)}px`;
}

function onDragEnd(){
  if(!state.drag) return;

  const p = activePage();
  if(!p) { state.drag = null; return; }

  const id = state.drag.blockId;
  const b = p.canvasBlocks.find(x => x.id === id);
  if(b){
    b.x = parseFloat(state.drag.node.style.left) || 0;
    b.y = parseFloat(state.drag.node.style.top) || 0;
    scheduleSave();
  }
  state.drag = null;
}

function armPlaceBlock(){
  state.canvasArmed = true;
  $("addBlockBtn").textContent = "Click to place…";
}

function placeBlockAt(x, y){
  const p = activePage();
  if(!p) return;

  const b = { id: uid(), x, y, text: "" };
  p.canvasBlocks.push(b);
  p.updatedAt = Date.now();

  persist();
  renderCanvasBlocks(p.canvasBlocks);
  scheduleSave();

  // focus the new block
  const node = $("canvasEditor").querySelector(`.block[data-block-id="${b.id}"] .block__body`);
  if(node){
    node.focus();
  }
}

function deleteBlock(blockId){
  const p = activePage();
  if(!p) return;

  p.canvasBlocks = (p.canvasBlocks || []).filter(b => b.id !== blockId);
  p.updatedAt = Date.now();
  persist();
  renderCanvasBlocks(p.canvasBlocks);
  scheduleSave();
  updateCounts();
}

/* --------------- Bullets + minimal typing helpers (Flow) --------------- */

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

function getFlowText(){
  const editor = $("flowEditor");
  if(!editor) return "";
  const emptyHint = $("emptyHint");
  if(!emptyHint) return editor.innerText || "";

  const prevDisplay = emptyHint.style.display;
  emptyHint.style.display = "none";
  const text = editor.innerText || "";
  emptyHint.style.display = prevDisplay;
  return text;
}

function getFlowHTMLForSave(){
  const editor = $("flowEditor");
  if(!editor) return "";
  const clone = editor.cloneNode(true);
  const hint = clone.querySelector("#emptyHint");
  if(hint) hint.remove();
  return clone.innerHTML || "";
}

function toggleEmptyHint(){
  const editor = $("flowEditor");
  const emptyHint = $("emptyHint");
  if(!editor || !emptyHint) return;
  const hasText = getFlowText().trim().length > 0;
  emptyHint.style.display = hasText ? "none" : "block";
}

/* ---------------- Wiring ---------------- */

function wire(){
  $("newPageBtn").addEventListener("click", createPage);
  $("pageSearch").addEventListener("input", renderSidebar);
  $("themeBtn").addEventListener("click", cycleTheme);
  $("exportBtn").addEventListener("click", exportActive);

  // mode buttons
  $("modeFlowBtn").addEventListener("click", () => { state.mode = "flow"; syncModeUI(); updateCounts(); });
  $("modeCanvasBtn").addEventListener("click", () => { state.mode = "canvas"; syncModeUI(); updateCounts(); });

  $("addBlockBtn").addEventListener("click", () => {
    if(state.mode !== "canvas") return;
    armPlaceBlock();
  });

  // title save
  $("pageTitle").addEventListener("input", scheduleSave);

  // flow editor
  $("flowEditor").addEventListener("input", () => {
    toggleEmptyHint();
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

  // canvas click to place block
  $("canvasEditor").addEventListener("click", (e) => {
    if(state.mode !== "canvas") return;
    if(!state.canvasArmed) return;

    // don't place when clicking on an existing block
    if(e.target.closest(".block")) return;

    const canvas = $("canvasEditor");
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left);
    const y = (e.clientY - r.top);

    // place slightly offset so it doesn't sit under cursor
    placeBlockAt(Math.max(0, x - 40), Math.max(0, y - 12));

    state.canvasArmed = false;
    $("addBlockBtn").textContent = "+ Block";
  });

  // dragging blocks (global mouse listeners)
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);

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
