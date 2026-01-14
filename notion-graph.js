/**
 * 3D Knowledge Graph for UltraSe7en Notion Pages
 * Uses 3d-force-graph library (built on Three.js)
 * Obsidian-style visualization
 */

const LS = {
  pages: "ultrase7en_notion_pages_v2",
  theme: "ultrase7en_notion_theme_v1",
};

const THEMES = ["dark", "notionLight", "graphite", "midnight"];

const $ = (id) => document.getElementById(id);

let graph = null;
let graphData = { nodes: [], links: [] };
let selectedNode = null;

/* --------------- Theme --------------- */

function loadTheme(){
  const t = localStorage.getItem(LS.theme) || "dark";
  setTheme(THEMES.includes(t) ? t : "dark");
}

function setTheme(theme){
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);

  // Update graph colors if exists
  if(graph){
    updateGraphColors();
  }
}

function cycleTheme(){
  const cur = document.body.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
}

function getThemeColors(){
  const style = getComputedStyle(document.body);
  return {
    bg: style.getPropertyValue("--graph-bg").trim() || "#050608",
    hub: style.getPropertyValue("--node-hub").trim() || "#7c5cff",
    tag: style.getPropertyValue("--node-tag").trim() || "#a78bfa",
    page: style.getPropertyValue("--node-page").trim() || "#e4e4e7",
    link: style.getPropertyValue("--link-color").trim() || "rgba(124, 92, 255, 0.35)",
  };
}

/* --------------- Data Loading --------------- */

function loadPages(){
  try{
    const pages = JSON.parse(localStorage.getItem(LS.pages) || "[]");
    return Array.isArray(pages) ? pages : [];
  }catch{
    return [];
  }
}

function buildGraphData(){
  const pages = loadPages();
  console.log("All pages:", pages);
  console.log("Pages with inGraph:", pages.map(p => ({ title: p.title, inGraph: p.inGraph })));

  const graphPages = pages.filter(p => p.inGraph === true);
  console.log("Filtered graph pages:", graphPages);

  const nodes = [];
  const links = [];
  const tagSet = new Set();

  // Hub node (center of the graph)
  nodes.push({
    id: "__HUB__",
    type: "hub",
    label: "NOTES",
    size: 12,
  });

  // Collect all unique tags
  for(const page of graphPages){
    const tags = page.tags || [];
    tags.forEach(t => tagSet.add(t));
  }

  // Create tag nodes
  for(const tag of tagSet){
    nodes.push({
      id: `tag:${tag}`,
      type: "tag",
      label: tag.toUpperCase(),
      size: 6,
    });

    // Link tag to hub
    links.push({
      source: "__HUB__",
      target: `tag:${tag}`,
      kind: "backbone",
    });
  }

  // Create page nodes
  for(const page of graphPages){
    // Extract preview text from flowHTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = page.flowHTML || "";
    const preview = (tempDiv.textContent || "").trim().slice(0, 200);

    nodes.push({
      id: `page:${page.id}`,
      type: "page",
      label: page.title || "Untitled",
      pageId: page.id,
      tags: page.tags || [],
      preview: preview,
      size: 4,
    });

    const tags = page.tags || [];

    if(tags.length > 0){
      // Link page to its tags
      for(const tag of tags){
        links.push({
          source: `tag:${tag}`,
          target: `page:${page.id}`,
          kind: "entry",
        });
      }
    }else{
      // Link directly to hub if no tags
      links.push({
        source: "__HUB__",
        target: `page:${page.id}`,
        kind: "entry",
      });
    }
  }

  // Add links between pages that share tags (for better clustering)
  const pagesByTag = {};
  for(const page of graphPages){
    for(const tag of (page.tags || [])){
      if(!pagesByTag[tag]) pagesByTag[tag] = [];
      pagesByTag[tag].push(page.id);
    }
  }

  // Connect pages within same tag (limit to prevent too many links)
  for(const tag in pagesByTag){
    const pageIds = pagesByTag[tag];
    for(let i = 0; i < pageIds.length && i < 5; i++){
      for(let j = i + 1; j < pageIds.length && j < i + 3; j++){
        links.push({
          source: `page:${pageIds[i]}`,
          target: `page:${pageIds[j]}`,
          kind: "sibling",
        });
      }
    }
  }

  return { nodes, links };
}

/* --------------- Graph Rendering --------------- */

function createGraph(){
  const container = $("graphContainer");
  const colors = getThemeColors();

  graphData = buildGraphData();

  // Debug: log what we're rendering
  console.log("Graph data:", graphData);
  console.log("Nodes:", graphData.nodes.length, "Links:", graphData.links.length);

  graph = ForceGraph3D()(container)
    .graphData(graphData)
    .backgroundColor(colors.bg)
    .width(container.clientWidth)
    .height(container.clientHeight)
    // Node appearance - use simple built-in rendering first
    .nodeLabel(node => node.label)
    .nodeVal(node => node.size * 2)
    .nodeColor(node => {
      const c = getThemeColors();
      if(node.type === "hub") return c.hub;
      if(node.type === "tag") return c.tag;
      return c.page;
    })
    .nodeOpacity(0.95)
    .nodeResolution(16)
    // Link appearance
    .linkWidth(link => link.kind === "backbone" ? 2 : link.kind === "sibling" ? 0.5 : 1)
    .linkOpacity(0.5)
    .linkColor(() => getThemeColors().link)
    // Interactions
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    // Camera - start closer
    .cameraPosition({ x: 0, y: 0, z: 300 });

  // Configure forces separately (can't chain after d3Force)
  graph.d3Force("charge").strength(-120);
  graph.d3Force("link").distance(60);

  // Keep slow rotation for ambience
  let angle = 0;
  function rotate(){
    if(!graph) return;
    angle += 0.001;
    const dist = 400;
    graph.cameraPosition({
      x: dist * Math.sin(angle),
      z: dist * Math.cos(angle),
    });
    requestAnimationFrame(rotate);
  }
  // Uncomment to enable auto-rotation:
  // rotate();

  updateStats();
}

function updateGraphColors(){
  if(!graph) return;
  const colors = getThemeColors();
  graph.backgroundColor(colors.bg);
  graph.nodeColor(node => {
    if(node.type === "hub") return colors.hub;
    if(node.type === "tag") return colors.tag;
    return colors.page;
  });
  graph.linkColor(() => colors.link);
}

function updateStats(){
  $("nodeCount").textContent = graphData.nodes.length;
  $("linkCount").textContent = graphData.links.length;
}

/* --------------- Interactions --------------- */

function handleNodeClick(node){
  if(!node) return;

  selectedNode = node;

  if(node.type === "page"){
    showDetails(node);
    focusNode(node);
  }else if(node.type === "tag"){
    // Focus on tag and highlight connected pages
    focusNode(node);
    hideDetails();
  }else{
    // Hub - reset view
    resetView();
    hideDetails();
  }
}

function handleNodeHover(node){
  document.body.style.cursor = node ? "pointer" : "default";
}

function focusNode(node){
  if(!graph || !node) return;

  const distance = 120;
  const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);

  graph.cameraPosition(
    {
      x: (node.x || 0) * distRatio,
      y: (node.y || 0) * distRatio,
      z: (node.z || 0) * distRatio,
    },
    node,
    1500
  );
}

function resetView(){
  if(!graph) return;
  graph.cameraPosition({ x: 0, y: 0, z: 400 }, null, 1000);
}

/* --------------- Details Panel --------------- */

function showDetails(node){
  const panel = $("detailsPanel");
  const title = $("detailsTitle");
  const tags = $("detailsTags");
  const preview = $("detailsPreview");
  const link = $("detailsLink");

  title.textContent = node.label || "Untitled";

  // Render tags
  tags.innerHTML = "";
  if(node.tags && node.tags.length > 0){
    node.tags.forEach(tag => {
      const el = document.createElement("span");
      el.className = "details-tag";
      el.textContent = tag;
      tags.appendChild(el);
    });
  }

  // Preview
  preview.textContent = node.preview || "No content preview available.";

  // Link to page
  link.href = `/notion.html?page=${node.pageId}`;
  link.onclick = (e) => {
    e.preventDefault();
    navigateToPage(node.pageId);
  };

  panel.classList.remove("hidden");
}

function hideDetails(){
  $("detailsPanel").classList.add("hidden");
  selectedNode = null;
}

function navigateToPage(pageId){
  // Set active page in localStorage and navigate
  localStorage.setItem("ultrase7en_notion_active_v2", pageId);
  window.location.href = "/notion.html";
}

/* --------------- Search --------------- */

function handleSearch(query){
  const q = query.trim().toLowerCase();

  if(!q){
    // Reset all nodes to visible
    graph.nodeOpacity(0.92);
    graph.linkOpacity(0.4);
    return;
  }

  graph.nodeOpacity(node => {
    const label = (node.label || "").toLowerCase();
    const tags = (node.tags || []).join(" ").toLowerCase();
    const matches = label.includes(q) || tags.includes(q);
    return matches ? 1 : 0.1;
  });

  graph.linkOpacity(0.15);
}

/* --------------- Wiring --------------- */

function wire(){
  $("themeBtn").addEventListener("click", cycleTheme);
  $("resetBtn").addEventListener("click", () => {
    resetView();
    hideDetails();
  });
  $("detailsClose").addEventListener("click", hideDetails);

  $("graphSearch").addEventListener("input", (e) => {
    handleSearch(e.target.value);
  });

  // Handle resize
  window.addEventListener("resize", () => {
    if(!graph) return;
    const container = $("graphContainer");
    graph.width(container.clientWidth);
    graph.height(container.clientHeight);
  });

  // ESC to close details
  window.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      hideDetails();
    }
  });
}

/* --------------- Init --------------- */

(function boot(){
  loadTheme();
  wire();
  createGraph();
})();
