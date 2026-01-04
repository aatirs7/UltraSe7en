/* UltraSe7en Dashboard (no AI) + Obsidian-style graph (D3) */

const LS_KEYS = {
  categories: "ultrase7en_categories_v1",
  today: "ultrase7en_today_v1",
  web: "ultrase7en_web_v1",
  lastDay: "ultrase7en_last_day_v1",
};

const DEFAULT_CATEGORIES = ["note","project update","to do","goal","project","random"];
const el = (id) => document.getElementById(id);

const state = {
  categories: [],
  today: [],
  web: [],
  autoSuggest: { active:false, list:[], idx:0 },
  graph: { drawerGraph:null, modalGraph:null },
};

function pad2(n){ return String(n).padStart(2,"0"); }
function formatTime(d){
  let h = d.getHours();
  const m = pad2(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
function todayKey(d = new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function loadJSON(key, fallback){
  try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch{ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function normalizeCategory(s){ return String(s||"").trim().toLowerCase(); }
function displayCategory(s){ return String(s||"").trim().toUpperCase(); }
function dedupe(arr){
  const out = [];
  const seen = new Set();
  for(const x of arr){
    const n = normalizeCategory(x);
    if(!seen.has(n)){ seen.add(n); out.push(n); }
  }
  return out;
}

function persist(){
  saveJSON(LS_KEYS.categories, state.categories);
  saveJSON(LS_KEYS.today, state.today);
  saveJSON(LS_KEYS.web, state.web);
}

function boot(){
  el("todayDate").textContent = todayKey(new Date());

  state.categories = loadJSON(LS_KEYS.categories, DEFAULT_CATEGORIES);
  state.today = loadJSON(LS_KEYS.today, []);
  state.web = loadJSON(LS_KEYS.web, []);

  const last = localStorage.getItem(LS_KEYS.lastDay);
  const nowDay = todayKey();
  if(last && last !== nowDay){
    if(state.today.length){
      for(const item of state.today){
        if(!item.inWeb){
          item.inWeb = true;
          state.web.push(makeWebItemFromToday(item));
        }
      }
      state.today = [];
      persist();
    }
  }
  localStorage.setItem(LS_KEYS.lastDay, nowDay);

  wireUI();
  initGraphs();
  renderAll();
}

function wireUI(){
  const input = el("commandInput");

  el("submitBtn").addEventListener("click", () => handleSubmit());
  input.addEventListener("keydown", (e) => handleInputKeydown(e));
  input.addEventListener("input", () => handleInputChange());

  el("addAllToWebBtn").addEventListener("click", () => addAllToWeb());
  el("clearTodayBtn").addEventListener("click", () => clearToday());

  // IMPORTANT: GRAPH + EXPAND -> fullscreen modal (what you asked)
  el("openGraphBtn").addEventListener("click", () => openModal());
  el("expandGraphBtn").addEventListener("click", () => openModal());

  // drawer buttons still exist (optional)
  el("drawerCloseBtn").addEventListener("click", () => closeDrawer());
  el("drawerExpandBtn").addEventListener("click", () => openModal());

  el("graphFitBtn").addEventListener("click", () => state.graph.drawerGraph?.fit());
  el("graphResetBtn").addEventListener("click", () => state.graph.drawerGraph?.reset());
  el("graphSearch").addEventListener("input", (e) => state.graph.drawerGraph?.search(e.target.value));

  el("modalCloseBtn").addEventListener("click", () => closeModal());
  el("modalFitBtn").addEventListener("click", () => state.graph.modalGraph?.fit());

  el("graphModal").addEventListener("click", (e) => {
    if(e.target === el("graphModal")) closeModal();
  });
}

/* -------- Input / Entries -------- */

function handleSubmit(){
  const raw = el("commandInput").value || "";
  const text = raw.trim();
  if(!text) return;

  // NC: New Category
  const ncMatch = text.match(/^nc\s*:\s*(.+)$/i);
  if(ncMatch){
    const catName = ncMatch[1].trim();
    if(catName){
      addCategory(catName);
      el("commandInput").value = "";
      hideAutocomplete();
      renderAll();
    }
    return;
  }

  // category: message
  const match = text.match(/^([^:]+)\s*:\s*([\s\S]+)$/);
  if(!match){
    addTodayItem("note", text);
  }else{
    const cat = match[1].trim();
    const msg = match[2].trim();
    if(!msg) return;
    addTodayItem(cat, msg);
  }

  el("commandInput").value = "";
  hideAutocomplete();
  renderAll();
}

function addCategory(name){
  const n = normalizeCategory(name);
  if(!n) return;
  if(!state.categories.map(normalizeCategory).includes(n)){
    state.categories.push(n);
    state.categories = dedupe(state.categories.map(normalizeCategory));
    persist();
  }
}

function addTodayItem(category, message){
  const catNorm = normalizeCategory(category);
  if(!catNorm) return;

  if(!state.categories.map(normalizeCategory).includes(catNorm)){
    state.categories.push(catNorm);
  }

  const item = {
    id: crypto.randomUUID(),
    category: catNorm,
    message,
    createdAt: Date.now(),
    inWeb: false,
  };

  state.today.unshift(item);
  persist();
}

function makeWebItemFromToday(todayItem){
  return {
    id: crypto.randomUUID(),
    category: todayItem.category,
    title: todayItem.message.split("\n")[0].slice(0, 80),
    body: todayItem.message,
    createdAt: todayItem.createdAt,
    sourceTodayId: todayItem.id,
  };
}

function addToWeb(todayId){
  const t = state.today.find(x => x.id === todayId);
  if(!t || t.inWeb) return;

  t.inWeb = true;
  state.web.unshift(makeWebItemFromToday(t));
  persist();
  renderAll();
}

function addAllToWeb(){
  let changed = false;
  for(const t of state.today){
    if(!t.inWeb){
      t.inWeb = true;
      state.web.unshift(makeWebItemFromToday(t));
      changed = true;
    }
  }
  if(changed){ persist(); renderAll(); }
}

function clearToday(){
  state.today = [];
  persist();
  renderAll();
}

function editToday(id){
  const t = state.today.find(x => x.id === id);
  if(!t) return;
  const next = prompt("Edit entry:", t.message);
  if(next === null) return;
  const v = String(next).trim();
  if(!v) return;
  t.message = v;
  persist();
  renderAll();
}

function deleteToday(id){
  state.today = state.today.filter(x => x.id !== id);
  persist();
  renderAll();
}

/* -------- Autocomplete (CLI-like) -------- */

function handleInputChange(){
  const input = el("commandInput");
  const val = input.value;

  const lines = val.split("\n");
  const current = lines[lines.length - 1];

  if(current.includes(":")){ hideAutocomplete(); return; }

  const typed = current.trim().toLowerCase();
  if(!typed){ hideAutocomplete(); return; }

  const candidates = state.categories
    .map(normalizeCategory)
    .filter(c => c.startsWith(typed))
    .slice(0, 8);

  if(!candidates.length){ hideAutocomplete(); return; }

  state.autoSuggest.active = true;
  state.autoSuggest.list = candidates;
  state.autoSuggest.idx = Math.min(state.autoSuggest.idx, candidates.length - 1);
  renderAutocomplete();
}

function handleInputKeydown(e){
  if(state.autoSuggest.active){
    if(e.key === "ArrowDown"){
      e.preventDefault();
      state.autoSuggest.idx = (state.autoSuggest.idx + 1) % state.autoSuggest.list.length;
      renderAutocomplete();
      return;
    }
    if(e.key === "ArrowUp"){
      e.preventDefault();
      state.autoSuggest.idx = (state.autoSuggest.idx - 1 + state.autoSuggest.list.length) % state.autoSuggest.list.length;
      renderAutocomplete();
      return;
    }
    if(e.key === "Tab"){
      e.preventDefault();
      applyAutocomplete();
      return;
    }
    if(e.key === "Escape"){
      hideAutocomplete();
      return;
    }
  }

  if((e.ctrlKey || e.metaKey) && e.key === "Enter"){
    e.preventDefault();
    handleSubmit();
  }
}

function applyAutocomplete(){
  const input = el("commandInput");
  const val = input.value;
  const lines = val.split("\n");

  const pick = state.autoSuggest.list[state.autoSuggest.idx];
  lines[lines.length - 1] = `${pick}: `;
  input.value = lines.join("\n");

  hideAutocomplete();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function renderAutocomplete(){
  const box = el("autocomplete");
  box.innerHTML = "";

  state.autoSuggest.list.forEach((s, i) => {
    const div = document.createElement("div");
    div.className = "suggest" + (i === state.autoSuggest.idx ? " active" : "");
    div.textContent = `${displayCategory(s)}:`;
    div.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      state.autoSuggest.idx = i;
      applyAutocomplete();
    });
    box.appendChild(div);
  });

  box.classList.remove("hidden");
}

function hideAutocomplete(){
  state.autoSuggest.active = false;
  state.autoSuggest.list = [];
  state.autoSuggest.idx = 0;
  el("autocomplete").classList.add("hidden");
}

/* -------- Rendering -------- */

function renderAll(){
  renderToday();
  renderWeb();
  rebuildGraphs();
}

function renderToday(){
  const list = el("todayList");
  const empty = el("todayEmpty");
  list.innerHTML = "";

  if(!state.today.length){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for(const item of state.today){
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";

    const pills = document.createElement("div");
    pills.className = "pills";

    const catPill = document.createElement("span");
    catPill.className = "pill purple";
    catPill.textContent = displayCategory(item.category);
    pills.appendChild(catPill);

    if(item.inWeb){
      const inWeb = document.createElement("span");
      inWeb.className = "pill green";
      inWeb.textContent = "IN WEB";
      pills.appendChild(inWeb);
    }

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = formatTime(new Date(item.createdAt));

    top.appendChild(pills);
    top.appendChild(time);

    const text = document.createElement("div");
    text.className = "card-text";
    text.textContent = item.message;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-ghost";
    addBtn.textContent = "ADD TO WEB";
    addBtn.disabled = !!item.inWeb;
    addBtn.addEventListener("click", () => addToWeb(item.id));

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-ghost";
    editBtn.textContent = "EDIT";
    editBtn.addEventListener("click", () => editToday(item.id));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-ghost";
    delBtn.textContent = "DELETE";
    delBtn.addEventListener("click", () => deleteToday(item.id));

    actions.appendChild(addBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(top);
    card.appendChild(text);
    card.appendChild(actions);

    list.appendChild(card);
  }
}

function renderWeb(){
  const groupsWrap = el("webGroups");
  groupsWrap.innerHTML = "";

  const categories = dedupe(state.categories);

  for(const cat of categories){
    const items = state.web.filter(w => normalizeCategory(w.category) === normalizeCategory(cat));

    const group = document.createElement("div");
    group.className = "group";

    const head = document.createElement("div");
    head.className = "group-head";

    const title = document.createElement("div");
    title.className = "group-title";

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = displayCategory(cat);

    const count = document.createElement("div");
    count.className = "group-count";
    count.textContent = `${items.length} NODE${items.length === 1 ? "" : "S"}`;

    title.appendChild(pill);
    head.appendChild(title);
    head.appendChild(count);

    const body = document.createElement("div");
    body.className = "group-body";

    for(const w of items.slice(0, 6)){
      const item = document.createElement("div");
      item.className = "web-item";
      item.dataset.webId = w.id;

      const itTitle = document.createElement("div");
      itTitle.className = "web-item-title";

      const b = document.createElement("b");
      b.textContent = w.title || "entry";

      const t = document.createElement("div");
      t.className = "time";
      t.textContent = formatTime(new Date(w.createdAt));

      itTitle.appendChild(b);
      itTitle.appendChild(t);

      const sub = document.createElement("div");
      sub.className = "web-item-sub";
      sub.textContent = (w.body || "").slice(0, 80);

      item.appendChild(itTitle);
      item.appendChild(sub);

      item.addEventListener("click", () => {
        highlightWebItem(w.id);
        openModal();                 // fullscreen
        state.graph.modalGraph?.focusNode(w.id);
      });

      body.appendChild(item);
    }

    group.appendChild(head);
    group.appendChild(body);
    groupsWrap.appendChild(group);
  }
}

function highlightWebItem(webId){
  document.querySelectorAll(".web-item").forEach(x => x.classList.remove("highlight"));
  const target = document.querySelector(`.web-item[data-web-id="${webId}"]`);
  if(target){
    target.classList.add("highlight");
    target.scrollIntoView({behavior:"smooth", block:"center"});
    setTimeout(() => target.classList.remove("highlight"), 1200);
  }
}

/* -------- Graph Modal/Drawer -------- */

function openDrawer(){
  const dr = el("graphDrawer");
  dr.classList.add("open");
  dr.setAttribute("aria-hidden", "false");
  setTimeout(() => state.graph.drawerGraph?.resize(), 240);
}
function closeDrawer(){
  const dr = el("graphDrawer");
  dr.classList.remove("open");
  dr.setAttribute("aria-hidden", "true");
}

function openModal(){
  const m = el("graphModal");
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
  setTimeout(() => state.graph.modalGraph?.resize(), 50);
  closeDrawer();
}
function closeModal(){
  const m = el("graphModal");
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
}

/* -------- Graph data: CONNECTED like Obsidian -------- */

function buildGraphData(){
  const nodes = [];
  const links = [];

  const cats = dedupe(state.categories).map(normalizeCategory);

  // Hub node (connects all topics)
  const HUB_ID = "hub:ultrase7en";
  nodes.push({ id: HUB_ID, type: "hub", label: "ULTRASE7EN" });

  // Category nodes + thick topic backbone links
  for(const c of cats){
    const catId = `cat:${c}`;
    nodes.push({ id: catId, type: "category", label: displayCategory(c), category: c });
    links.push({ source: HUB_ID, target: catId, kind: "topic" });
  }

  // Also connect categories in a ring for cohesion
  for(let i = 0; i < cats.length; i++){
    const a = `cat:${cats[i]}`;
    const b = `cat:${cats[(i + 1) % cats.length]}`;
    if(cats.length > 1) links.push({ source: a, target: b, kind: "topic" });
  }

  // Entry nodes + thin intra-topic links
  for(const w of state.web){
    const cat = normalizeCategory(w.category);
    const catId = `cat:${cat}`;

    nodes.push({
      id: w.id,
      type: "entry",
      label: (w.title || w.body || "entry").slice(0, 28),
      category: cat,
      body: w.body || "",
      createdAt: w.createdAt,
    });

    links.push({ source: catId, target: w.id, kind: "entry" });
  }

  return { nodes, links };
}

function initGraphs(){
  state.graph.drawerGraph = createGraphSystem({
    svgEl: el("graphSvg"),
    detailsEl: el("graphDetails"),
  });

  state.graph.modalGraph = createGraphSystem({
    svgEl: el("graphSvgModal"),
    detailsEl: el("graphDetailsModal"),
  });
}

function rebuildGraphs(){
  const data = buildGraphData();
  state.graph.drawerGraph?.setData(data);
  state.graph.modalGraph?.setData(data);
}

function createGraphSystem({ svgEl, detailsEl }){
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const rootG = svg.append("g");
  const linkG = rootG.append("g").attr("class", "links");
  const nodeG = rootG.append("g").attr("class", "nodes");

  const zoom = d3.zoom()
    .scaleExtent([0.2, 3.0])
    .on("zoom", (event) => rootG.attr("transform", event.transform));

  svg.call(zoom);

  let sim = null;
  let data = { nodes: [], links: [] };

  const palette = {
    topicStroke: "rgba(190,160,255,0.62)",
    entryStroke:  "rgba(255,255,255,0.60)",
    topicLink:    "rgba(190,160,255,0.55)",
    entryLink:    "rgba(255,255,255,0.26)",
    active:       "rgba(190,160,255,0.95)",
  };

  function resize(){
    const rect = svgEl.getBoundingClientRect();
    svg.attr("width", rect.width).attr("height", rect.height);
    sim?.alpha(0.35).restart();
  }

  function setDetails(title, body){
    const t = detailsEl.querySelector(".graph-details-title");
    const b = detailsEl.querySelector(".graph-details-body");
    if(t) t.textContent = title;
    if(b) b.textContent = body;
  }

  function setData(next){
    data = next;

    linkG.selectAll("*").remove();
    nodeG.selectAll("*").remove();
    sim?.stop();

    const rect = svgEl.getBoundingClientRect();
    svg.attr("width", rect.width).attr("height", rect.height);

    const links = linkG.selectAll("line")
      .data(data.links, d => `${d.source}->${d.target}:${d.kind || "entry"}`)
      .enter()
      .append("line")
      .attr("stroke", d => d.kind === "topic" ? palette.topicLink : palette.entryLink)
      .attr("stroke-width", d => d.kind === "topic" ? 2.6 : 1.1)
      .attr("opacity", d => d.kind === "topic" ? 0.9 : 0.8);

    const nodes = nodeG.selectAll("g")
      .data(data.nodes, d => d.id)
      .enter()
      .append("g")
      .attr("cursor", "pointer");

    nodes.append("circle")
      .attr("r", d => d.type === "hub" ? 26 : (d.type === "category" ? 20 : 12))
      .attr("fill", d => {
        if(d.type === "hub") return "rgba(190,160,255,0.18)";
        if(d.type === "category") return "rgba(167,139,250,0.35)";
        return "rgba(255,255,255,0.22)";
      })
      .attr("stroke", d => {
        if(d.type === "hub") return "rgba(190,160,255,0.85)";
        if(d.type === "category") return "rgba(200,175,255,0.95)";
        return palette.entryStroke;
      })
      .attr("stroke-width", d => d.type === "hub" ? 2.8 : (d.type === "category" ? 2.4 : 1.4));

    nodes.append("text")
      .text(d => (d.type === "category" || d.type === "hub") ? d.label : "")
      .attr("x", d => (d.type === "category" || d.type === "hub") ? 28 : 14)
      .attr("y", 4)
      .attr("fill", "rgba(233,233,238,0.82)")
      .attr("font-size", 11)
      .attr("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace")
      .attr("letter-spacing", ".12em");

    // hover glow
    nodes.on("mouseenter", function(event, d){
      d3.select(this).select("circle")
        .attr("stroke", palette.active)
        .attr("stroke-width", d.type === "entry" ? 2.2 : 3.0)
        .style("filter", "drop-shadow(0px 0px 10px rgba(190,160,255,0.35))");
    }).on("mouseleave", function(event, d){
      const circle = d3.select(this).select("circle");
      circle.style("filter", null);
      // don’t override active selection; reset lightly
      circle.attr("stroke", d.type === "hub"
        ? "rgba(190,160,255,0.85)"
        : (d.type === "category"
            ? "rgba(200,175,255,0.95)"
            : palette.entryStroke
          )
      );
      circle.attr("stroke-width", d.type === "hub" ? 2.8 : (d.type === "category" ? 2.4 : 1.4));
    });

    // drag
    nodes.call(
      d3.drag()
        .on("start", (event, d) => {
          if(!event.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event, d) => {
          if(!event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    // click
    nodes.on("click", (event, d) => {
      event.stopPropagation();

      nodeG.selectAll("circle")
        .attr("stroke", n => n.id === d.id ? palette.active : (
          n.type === "hub" ? "rgba(190,160,255,0.85)" :
          n.type === "category" ? "rgba(200,175,255,0.95)" :
          palette.entryStroke
        ))
        .attr("stroke-width", n => n.id === d.id ? 3.0 : (
          n.type === "hub" ? 2.8 :
          n.type === "category" ? 2.4 :
          1.4
        ));

      if(d.type === "hub"){
        setDetails("ULTRASE7EN", `${data.nodes.filter(x => x.type === "entry").length} total entries across ${data.nodes.filter(x => x.type === "category").length} categories.`);
        return;
      }

      if(d.type === "category"){
        const count = data.nodes.filter(x => x.type === "entry" && x.category === d.category).length;
        setDetails(`Category: ${displayCategory(d.category)}`, `${count} node(s) in this category.`);
      }else{
        setDetails(`${displayCategory(d.category)} • ${formatTime(new Date(d.createdAt))}`, d.body || "");
        highlightWebItem(d.id);
      }
    });

    svg.on("click", () => {
      nodeG.selectAll("circle")
        .attr("stroke", n => (
          n.type === "hub" ? "rgba(190,160,255,0.85)" :
          n.type === "category" ? "rgba(200,175,255,0.95)" :
          palette.entryStroke
        ))
        .attr("stroke-width", n => (
          n.type === "hub" ? 2.8 :
          n.type === "category" ? 2.4 :
          1.4
        ));

      setDetails("Select a node", "Click a category or an entry to view details.");
    });

    // force sim tuned for connected backbone
    sim = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id)
        .distance(l => l.kind === "topic" ? 150 : 70)
        .strength(l => l.kind === "topic" ? 0.35 : 0.72)
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(rect.width / 2, rect.height / 2))
      .force("collide", d3.forceCollide().radius(d => d.type === "hub" ? 34 : (d.type === "category" ? 26 : 16)))
      .on("tick", () => {
        links
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        nodes.attr("transform", d => `translate(${d.x},${d.y})`);
      });

    fit();
  }

  function fit(){
    const rect = svgEl.getBoundingClientRect();
    if(!data.nodes.length) return;

    const xs = data.nodes.map(n => n.x ?? 0);
    const ys = data.nodes.map(n => n.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const w = (maxX - minX) || 1;
    const h = (maxY - minY) || 1;

    const scale = Math.max(0.25, Math.min(1.6, 0.86 / Math.max(w / rect.width, h / rect.height)));
    const tx = (rect.width - scale * (minX + maxX)) / 2;
    const ty = (rect.height - scale * (minY + maxY)) / 2;

    svg.transition().duration(450).call(
      zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  function reset(){ sim?.alpha(0.8).restart(); fit(); }

  function search(q){
    const query = String(q||"").trim().toLowerCase();
    if(!query){
      nodeG.selectAll("circle").attr("opacity", 1);
      nodeG.selectAll("text").attr("opacity", 1);
      linkG.selectAll("line").attr("opacity", 1);
      return;
    }
    const match = (d) => {
      if(d.type === "hub") return "ultrase7en".includes(query);
      if(d.type === "category") return (d.category||"").includes(query) || (d.label||"").toLowerCase().includes(query);
      return (d.body||"").toLowerCase().includes(query) || (d.label||"").toLowerCase().includes(query);
    };

    nodeG.selectAll("circle").attr("opacity", d => match(d) ? 1 : 0.18);
    nodeG.selectAll("text").attr("opacity", d => match(d) ? 1 : 0.18);
    linkG.selectAll("line").attr("opacity", d => {
      const s = typeof d.source === "object" ? d.source : null;
      const t = typeof d.target === "object" ? d.target : null;
      if(!s || !t) return 0.12;
      return (match(s) || match(t)) ? 0.9 : 0.08;
    });
  }

  function focusNode(nodeId){
    const n = data.nodes.find(x => x.id === nodeId);
    if(!n) return;
    const rect = svgEl.getBoundingClientRect();
    const scale = 1.25;
    const tx = rect.width / 2 - (n.x * scale);
    const ty = rect.height / 2 - (n.y * scale);
    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  return { setData, resize, fit, reset, search, focusNode };
}

/* boot */
boot();
