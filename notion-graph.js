/**
 * 3D Knowledge Graph - Obsidian Style
 * Minimal dots, thin lines, labels on hover
 */

const LS = {
  pages: "ultrase7en_notion_pages_v2",
  theme: "ultrase7en_notion_theme_v1",
};

const THEMES = ["dark", "notionLight", "graphite", "midnight"];
const $ = (id) => document.getElementById(id);

let graph = null;
let graphData = { nodes: [], links: [] };
let highlightNodes = new Set();
let highlightLinks = new Set();
let hoverNode = null;

// Obsidian-style colors
const COLORS = {
  bg: "#191919",
  node: "#d4d4d4",           // Cream/white dots
  nodeHover: "#ffffff",
  nodeDim: "#4a4a4a",
  category: "#7f6df2",       // Purple for tags
  categoryHover: "#a594f9",
  link: "rgba(255,255,255,0.08)",
  linkHover: "rgba(127,109,242,0.6)",
  text: "#e0e0e0"
};

/* --------------- Theme --------------- */

function loadTheme() {
  const t = localStorage.getItem(LS.theme) || "dark";
  document.body.setAttribute("data-theme", THEMES.includes(t) ? t : "dark");
}

function cycleTheme() {
  const cur = document.body.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  document.body.setAttribute("data-theme", next);
  localStorage.setItem(LS.theme, next);
}

/* --------------- Data --------------- */

function loadPages() {
  try {
    return JSON.parse(localStorage.getItem(LS.pages) || "[]") || [];
  } catch { return []; }
}

function buildGraphData() {
  const pages = loadPages().filter(p => p.inGraph);
  const nodes = [];
  const links = [];
  const categories = new Map();

  // Collect categories
  for (const page of pages) {
    for (const tag of (page.tags || [])) {
      if (!categories.has(tag)) categories.set(tag, []);
      categories.get(tag).push(page.id);
    }
  }

  // Category nodes
  for (const [name, pageIds] of categories) {
    nodes.push({
      id: `cat:${name}`,
      name: name,
      type: "category",
      connections: pageIds.length
    });
  }

  // Page nodes
  for (const page of pages) {
    const div = document.createElement("div");
    div.innerHTML = page.flowHTML || "";

    nodes.push({
      id: `page:${page.id}`,
      name: page.title || "Untitled",
      type: "page",
      pageId: page.id,
      tags: page.tags || [],
      preview: (div.textContent || "").slice(0, 150),
      connections: (page.tags || []).length
    });

    // Links to categories
    for (const tag of (page.tags || [])) {
      links.push({
        source: `cat:${tag}`,
        target: `page:${page.id}`
      });
    }
  }

  // Sibling links (pages sharing categories)
  for (const [, pageIds] of categories) {
    for (let i = 0; i < pageIds.length; i++) {
      for (let j = i + 1; j < pageIds.length; j++) {
        links.push({
          source: `page:${pageIds[i]}`,
          target: `page:${pageIds[j]}`,
          sibling: true
        });
      }
    }
  }

  return { nodes, links };
}

/* --------------- Graph --------------- */

function createGraph() {
  const container = $("graphContainer");
  graphData = buildGraphData();

  if (graphData.nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <div class="empty-title">No nodes yet</div>
        <div class="empty-hint">Add pages to graph and assign categories</div>
      </div>
    `;
    updateStats();
    return;
  }

  graph = ForceGraph3D({ controlType: 'orbit' })(container)
    .graphData(graphData)
    .backgroundColor(COLORS.bg)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .showNavInfo(false)

    // Nodes - tiny dots like Obsidian
    .nodeRelSize(4)
    .nodeVal(node => {
      // Slightly larger for more connections
      const base = node.type === "category" ? 2 : 1;
      return base + Math.min(node.connections * 0.3, 2);
    })
    .nodeResolution(16)
    .nodeOpacity(1)
    .nodeColor(node => {
      const isHover = hoverNode === node;
      const isHighlight = highlightNodes.has(node);
      const isDim = highlightNodes.size > 0 && !isHighlight;

      if (node.type === "category") {
        if (isHover) return COLORS.categoryHover;
        if (isDim) return COLORS.nodeDim;
        return COLORS.category;
      } else {
        if (isHover) return COLORS.nodeHover;
        if (isDim) return COLORS.nodeDim;
        return COLORS.node;
      }
    })

    // Links - very thin and subtle
    .linkWidth(link => {
      if (highlightLinks.has(link)) return 1.5;
      return link.sibling ? 0.2 : 0.4;
    })
    .linkOpacity(1)
    .linkColor(link => {
      if (highlightLinks.has(link)) return COLORS.linkHover;
      return COLORS.link;
    })

    // No particles by default - cleaner look
    .linkDirectionalParticles(0)

    // Events
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    .onBackgroundClick(clearSelection)

    // Camera
    .cameraPosition({ x: 0, y: 0, z: 350 });

  // Obsidian-like physics - spread out, organic
  graph.d3Force("charge").strength(-30);
  graph.d3Force("link").distance(50).strength(0.2);
  graph.d3Force("center").strength(0.02);

  // Custom rendering - just dots, no fancy 3D objects
  graph.nodeThreeObject(null);
  graph.nodeThreeObjectExtend(false);

  updateStats();
  setTimeout(() => graph.zoomToFit(500, 50), 300);
}

function updateStats() {
  $("nodeCount").textContent = graphData.nodes.length;
  $("linkCount").textContent = graphData.links.length;
}

/* --------------- Interactions --------------- */

function handleNodeClick(node) {
  if (!node) return;

  highlightNodes.clear();
  highlightLinks.clear();
  highlightNodes.add(node);

  // Find connected
  graphData.links.forEach(link => {
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;
    if (src === node.id || tgt === node.id) {
      highlightLinks.add(link);
      const other = graphData.nodes.find(n => n.id === (src === node.id ? tgt : src));
      if (other) highlightNodes.add(other);
    }
  });

  refresh();
  showDetails(node);
  focusNode(node);
}

function handleNodeHover(node) {
  hoverNode = node;
  document.body.style.cursor = node ? "pointer" : "default";

  // Update tooltip
  const tooltip = $("nodeTooltip");
  if (node) {
    tooltip.textContent = node.name;
    tooltip.classList.add("visible");
  } else {
    tooltip.classList.remove("visible");
  }

  // Refresh colors
  if (graph) graph.nodeColor(graph.nodeColor());
}

function clearSelection() {
  highlightNodes.clear();
  highlightLinks.clear();
  hoverNode = null;
  refresh();
  hideDetails();
}

function refresh() {
  if (!graph) return;
  graph.nodeColor(graph.nodeColor());
  graph.linkWidth(graph.linkWidth());
  graph.linkColor(graph.linkColor());
}

function focusNode(node) {
  if (!graph || !node) return;
  const d = 80;
  const r = 1 + d / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  graph.cameraPosition(
    { x: (node.x || 0) * r, y: (node.y || 0) * r, z: (node.z || 0) * r },
    node, 600
  );
}

function fitGraph() {
  if (graph) graph.zoomToFit(500, 50);
}

function resetView() {
  clearSelection();
  if (graph) graph.cameraPosition({ x: 0, y: 0, z: 350 }, null, 600);
}

/* --------------- Details --------------- */

function showDetails(node) {
  $("detailsTitle").textContent = node.type === "category"
    ? `# ${node.name}`
    : node.name;

  const tagsEl = $("detailsTags");
  tagsEl.innerHTML = "";
  if (node.type === "page" && node.tags?.length) {
    node.tags.forEach(tag => {
      const el = document.createElement("span");
      el.className = "details-tag";
      el.textContent = `#${tag}`;
      el.onclick = () => {
        const cat = graphData.nodes.find(n => n.id === `cat:${tag}`);
        if (cat) handleNodeClick(cat);
      };
      tagsEl.appendChild(el);
    });
  }

  const preview = $("detailsPreview");
  if (node.type === "category") {
    const pages = graphData.nodes.filter(n =>
      n.type === "page" && n.tags?.includes(node.name)
    );
    preview.innerHTML = pages.length
      ? pages.map(p => `<div class="preview-item">${p.name}</div>`).join("")
      : "<em>No pages</em>";
  } else {
    preview.textContent = node.preview || "No content";
  }

  const link = $("detailsLink");
  if (node.type === "page") {
    link.textContent = "Open →";
    link.onclick = e => {
      e.preventDefault();
      localStorage.setItem("ultrase7en_notion_active_v2", node.pageId);
      window.location.href = "/notion.html";
    };
  } else {
    link.textContent = "Reset";
    link.onclick = e => { e.preventDefault(); resetView(); };
  }

  $("detailsPanel").classList.remove("hidden");
}

function hideDetails() {
  $("detailsPanel").classList.add("hidden");
}

/* --------------- Search --------------- */

function handleSearch(q) {
  q = (q || "").trim().toLowerCase();
  if (!q) { clearSelection(); return; }

  highlightNodes.clear();
  highlightLinks.clear();

  graphData.nodes.forEach(n => {
    if ((n.name || "").toLowerCase().includes(q)) {
      highlightNodes.add(n);
    }
  });

  refresh();
}

/* --------------- Init --------------- */

function wire() {
  $("themeBtn")?.addEventListener("click", cycleTheme);
  $("resetBtn")?.addEventListener("click", resetView);
  $("fitBtn")?.addEventListener("click", fitGraph);
  $("detailsClose")?.addEventListener("click", clearSelection);
  $("graphSearch")?.addEventListener("input", e => handleSearch(e.target.value));

  window.addEventListener("resize", () => {
    if (graph) {
      graph.width($("graphContainer").clientWidth);
      graph.height($("graphContainer").clientHeight);
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") clearSelection();
  });

  // Track mouse for tooltip positioning
  document.addEventListener("mousemove", e => {
    const tooltip = $("nodeTooltip");
    if (tooltip.classList.contains("visible")) {
      tooltip.style.left = (e.clientX + 15) + "px";
      tooltip.style.top = (e.clientY + 10) + "px";
    }
  });
}

(function boot() {
  loadTheme();
  wire();
  createGraph();
})();
