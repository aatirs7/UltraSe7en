/**
 * Notion-style UI shell (separate from existing UltraSe7en dashboard)
 * - Pages in sidebar
 * - Type-anywhere editor
 * - LocalStorage persistence
 * - No categories/graph logic yet (intentionally)
 */

const LS = {
  pages: "ultrase7en_notion_pages_v1",
  activeId: "ultrase7en_notion_active_v1",
};

const $ = (id) => document.getElementById(id);

let state = {
  pages: [],
  activeId: null,
  menuForPageId: null,
};

function uid(){
  return (crypto?.randomUUID?.() || `p_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

function load(){
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
      contentHTML: `<ul>
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

  // Ensure activeId is valid
  if(!state.pages.some(p => p.id === state.activeId)){
    state.activeId = state.pages[0]?.id || null;
    persist();
  }
}

function persist(){
  localStorage.setItem(LS.pages, JSON.stringify(state.pages));
  localStorage.setItem(LS.activeId, state.activeId || "");
}

function activePage(){
  return state.pages.find(p => p.id === state.activeId) || null;
}

function render(){
  renderSidebar();
  renderEditor();
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
    meta.className = "pageRow__meta";

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
  $("pageEditor").innerHTML = p?.contentHTML || "";

  updateCounts();
  setSaved("Saved");
}

function setSaved(text){
  $("saveStatus").textContent = text;
}

function updateCounts(){
  const text = ($("pageEditor").innerText || "").trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  $("wordCount").textContent = `${words} word${words === 1 ? "" : "s"}`;
}

function createPage(){
  const p = {
    id: uid(),
    title: "Untitled",
    contentHTML: "",
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

function saveActive(){
  const p = activePage();
  if(!p) return;

  p.title = $("pageTitle").value || "";
  p.contentHTML = $("pageEditor").innerHTML || "";
  p.updatedAt = Date.now();

  persist();
  renderSidebar();
  $("crumbPage").textContent = p.title?.trim() ? p.title : "Untitled";
  setSaved("Saved");
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
  const text = ($("pageEditor").innerText || "").trim();

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

function openMenuForPage(pageId, anchorBtn){
  state.menuForPageId = pageId;

  const menu = $("pageMenu");
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");

  const r = anchorBtn.getBoundingClientRect();
  // position near button
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

function wire(){
  $("newPageBtn").addEventListener("click", createPage);
  $("pageSearch").addEventListener("input", renderSidebar);

  $("pageTitle").addEventListener("input", scheduleSave);
  $("pageEditor").addEventListener("input", () => {
    updateCounts();
    scheduleSave();
  });

  $("exportBtn").addEventListener("click", exportActive);

  // Keyboard: Ctrl/Cmd+S save
  window.addEventListener("keydown", (e) => {
    const isSave = (e.key.toLowerCase() === "s") && (e.ctrlKey || e.metaKey);
    if(isSave){
      e.preventDefault();
      saveActive();
    }
    // Escape closes menu
    if(e.key === "Escape") closeMenu();
  });

  // Menu actions
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

  // click outside closes menu
  window.addEventListener("click", (e) => {
    const menu = $("pageMenu");
    if(menu.classList.contains("hidden")) return;
    if(menu.contains(e.target)) return;
    closeMenu();
  });
}

(function boot(){
  load();
  wire();
  render();
})();
