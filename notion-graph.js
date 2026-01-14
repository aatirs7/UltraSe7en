/**
 * 3D Knowledge Graph - Modern Obsidian-style
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

// Theme-aware colors
function getColors() {
  const theme = document.body.getAttribute("data-theme") || "dark";

  const palettes = {
    dark: {
      bg: "#08090c",
      category: "#8b5cf6",
      categoryGlow: "#a78bfa",
      page: "#ffffff",
      pageDim: "rgba(255,255,255,0.6)",
      link: "rgba(139, 92, 246, 0.5)",
      linkDim: "rgba(139, 92, 246, 0.15)",
      text: "#ffffff",
      labelBg: "rgba(0,0,0,0.85)",
      categoryLabelBg: "rgba(139, 92, 246, 0.95)"
    },
    notionLight: {
      bg: "#f8f8f8",
      category: "#7c3aed",
      categoryGlow: "#8b5cf6",
      page: "#1f1f1f",
      pageDim: "rgba(0,0,0,0.4)",
      link: "rgba(124, 58, 237, 0.5)",
      linkDim: "rgba(124, 58, 237, 0.2)",
      text: "#1f1f1f",
      labelBg: "rgba(255,255,255,0.95)",
      categoryLabelBg: "rgba(124, 58, 237, 0.95)"
    },
    graphite: {
      bg: "#0c0d10",
      category: "#6366f1",
      categoryGlow: "#818cf8",
      page: "#e2e2e2",
      pageDim: "rgba(255,255,255,0.5)",
      link: "rgba(99, 102, 241, 0.5)",
      linkDim: "rgba(99, 102, 241, 0.15)",
      text: "#ffffff",
      labelBg: "rgba(0,0,0,0.85)",
      categoryLabelBg: "rgba(99, 102, 241, 0.95)"
    },
    midnight: {
      bg: "#06080f",
      category: "#a78bfa",
      categoryGlow: "#c4b5fd",
      page: "#f4f4f5",
      pageDim: "rgba(255,255,255,0.5)",
      link: "rgba(167, 139, 250, 0.5)",
      linkDim: "rgba(167, 139, 250, 0.15)",
      text: "#ffffff",
      labelBg: "rgba(0,0,0,0.85)",
      categoryLabelBg: "rgba(167, 139, 250, 0.95)"
    }
  };

  return palettes[theme] || palettes.dark;
}

/* --------------- Theme --------------- */

function loadTheme() {
  const t = localStorage.getItem(LS.theme) || "dark";
  setTheme(THEMES.includes(t) ? t : "dark");
}

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);
  if (graph) updateGraphTheme();
}

function cycleTheme() {
  const cur = document.body.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
}

function updateGraphTheme() {
  if (!graph) return;
  const colors = getColors();
  graph.backgroundColor(colors.bg);
  graph.linkColor(l => highlightLinks.has(l) ? colors.link : colors.linkDim);
  graph.nodeThreeObject(node => createNodeObject(node));
}

/* --------------- Data --------------- */

function loadPages() {
  try {
    const pages = JSON.parse(localStorage.getItem(LS.pages) || "[]");
    return Array.isArray(pages) ? pages : [];
  } catch {
    return [];
  }
}

function buildGraphData() {
  const pages = loadPages();
  const graphPages = pages.filter(p => p.inGraph);

  const nodes = [];
  const links = [];
  const categories = new Map();

  // Collect categories
  for (const page of graphPages) {
    for (const tag of (page.tags || [])) {
      if (!categories.has(tag)) categories.set(tag, []);
      categories.get(tag).push(page.id);
    }
  }

  // Category nodes
  for (const [name, pageIds] of categories) {
    nodes.push({
      id: `cat:${name}`,
      name: name.toUpperCase(),
      type: "category",
      count: pageIds.length,
      val: 25 + pageIds.length * 8
    });
  }

  // Page nodes
  for (const page of graphPages) {
    nodes.push({
      id: `page:${page.id}`,
      name: page.title || "Untitled",
      type: "page",
      pageId: page.id,
      tags: page.tags || [],
      preview: extractText(page.flowHTML),
      val: 10
    });

    // Links to categories
    for (const tag of (page.tags || [])) {
      links.push({
        source: `cat:${tag}`,
        target: `page:${page.id}`,
        type: "main"
      });
    }
  }

  // Sibling links
  for (const [, pageIds] of categories) {
    for (let i = 0; i < pageIds.length; i++) {
      for (let j = i + 1; j < pageIds.length; j++) {
        links.push({
          source: `page:${pageIds[i]}`,
          target: `page:${pageIds[j]}`,
          type: "sibling"
        });
      }
    }
  }

  return { nodes, links };
}

function extractText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim().slice(0, 180);
}

/* --------------- Graph --------------- */

function createGraph() {
  const container = $("graphContainer");
  const colors = getColors();
  graphData = buildGraphData();

  if (graphData.nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◈</div>
        <div class="empty-title">Your graph is empty</div>
        <div class="empty-hint">Add pages to the graph and assign categories to see connections.</div>
      </div>
    `;
    updateStats();
    return;
  }

  graph = ForceGraph3D({ controlType: 'orbit' })(container)
    .graphData(graphData)
    .backgroundColor(colors.bg)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .showNavInfo(false)

    // Nodes
    .nodeVal(n => n.val)
    .nodeResolution(24)
    .nodeOpacity(1)
    .nodeThreeObject(node => createNodeObject(node))
    .nodeThreeObjectExtend(false)

    // Links
    .linkWidth(l => highlightLinks.has(l) ? 2.5 : (l.type === "main" ? 1 : 0.3))
    .linkOpacity(1)
    .linkColor(l => {
      const c = getColors();
      if (highlightLinks.has(l)) return c.category;
      return l.type === "main" ? c.linkDim : "rgba(128,128,128,0.08)";
    })
    .linkCurvature(0.1)

    // Particles
    .linkDirectionalParticles(l => highlightLinks.has(l) ? 4 : 0)
    .linkDirectionalParticleWidth(2.5)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(() => getColors().categoryGlow)

    // Events
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    .onBackgroundClick(clearSelection)

    // Camera
    .cameraPosition({ x: 0, y: 0, z: 280 });

  // Physics
  graph.d3Force("charge").strength(-120);
  graph.d3Force("link").distance(l => l.type === "main" ? 70 : 45);
  graph.d3Force("center").strength(0.08);

  updateStats();

  // Auto-fit after initial render
  setTimeout(() => fitGraph(), 500);
}

function createNodeObject(node) {
  const THREE = window.THREE;
  const colors = getColors();
  const isHl = highlightNodes.has(node);
  const group = new THREE.Group();

  if (node.type === "category") {
    const radius = Math.cbrt(node.val) * 1.2;

    // Core - gradient-like effect with layers
    const coreMat = new THREE.MeshBasicMaterial({
      color: colors.category,
      transparent: true,
      opacity: 0.95
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 32), coreMat));

    // Inner glow
    const innerGlow = new THREE.MeshBasicMaterial({
      color: colors.categoryGlow,
      transparent: true,
      opacity: 0.3
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.25, 24, 24), innerGlow));

    // Outer glow
    const outerGlow = new THREE.MeshBasicMaterial({
      color: colors.categoryGlow,
      transparent: true,
      opacity: 0.12
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.6, 16, 16), outerGlow));

    // Orbital ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: colors.categoryGlow,
      transparent: true,
      opacity: isHl ? 0.6 : 0.25,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.7, radius * 1.9, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Modern label
    const label = createLabel(node.name, {
      fontSize: 14,
      fontWeight: "600",
      color: "#ffffff",
      background: colors.categoryLabelBg,
      paddingX: 14,
      paddingY: 8,
      borderRadius: 6
    });
    label.position.y = radius + 12;
    group.add(label);

    // Count badge
    if (node.count > 0) {
      const badge = createLabel(String(node.count), {
        fontSize: 11,
        fontWeight: "700",
        color: colors.category,
        background: "#ffffff",
        paddingX: 8,
        paddingY: 5,
        borderRadius: 10
      });
      badge.position.y = -(radius + 10);
      group.add(badge);
    }

  } else {
    // Page node
    const radius = Math.cbrt(node.val) * 0.9;
    const color = isHl ? colors.categoryGlow : colors.page;
    const opacity = isHl ? 1 : (highlightNodes.size > 0 ? 0.3 : 0.85);

    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), mat));

    // Glow on highlight
    if (isHl) {
      const glow = new THREE.MeshBasicMaterial({
        color: colors.categoryGlow,
        transparent: true,
        opacity: 0.25
      });
      group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 2, 16, 16), glow));
    }

    // Label - always show but dim when not highlighted
    const labelOpacity = isHl ? 1 : (highlightNodes.size > 0 ? 0.3 : 0.9);
    const label = createLabel(truncate(node.name, 20), {
      fontSize: 11,
      fontWeight: "500",
      color: "#ffffff",
      background: `rgba(0,0,0,${labelOpacity * 0.8})`,
      paddingX: 10,
      paddingY: 6,
      borderRadius: 4
    });
    label.position.y = radius + 8;
    label.material.opacity = labelOpacity;
    group.add(label);
  }

  return group;
}

function createLabel(text, opts = {}) {
  const {
    fontSize = 12,
    fontWeight = "500",
    color = "#fff",
    background = "rgba(0,0,0,0.8)",
    paddingX = 10,
    paddingY = 6,
    borderRadius = 4
  } = opts;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const scale = 2; // Retina

  // Measure
  ctx.font = `${fontWeight} ${fontSize * scale}px Inter, -apple-system, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;

  const width = textWidth + paddingX * 2 * scale;
  const height = fontSize * scale + paddingY * 2 * scale;

  canvas.width = width;
  canvas.height = height;

  // Background
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, borderRadius * scale);
  ctx.fill();

  // Text
  ctx.font = `${fontWeight} ${fontSize * scale}px Inter, -apple-system, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / scale / 6, height / scale / 6, 1);

  return sprite;
}

function truncate(s, n) {
  return s && s.length > n ? s.slice(0, n) + "…" : s || "";
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
  document.body.style.cursor = node ? "pointer" : "default";
}

function clearSelection() {
  highlightNodes.clear();
  highlightLinks.clear();
  refresh();
  hideDetails();
}

function refresh() {
  if (!graph) return;
  graph.nodeThreeObject(node => createNodeObject(node));
  graph.linkWidth(graph.linkWidth());
  graph.linkColor(graph.linkColor());
  graph.linkDirectionalParticles(graph.linkDirectionalParticles());
}

function focusNode(node) {
  if (!graph || !node) return;
  const d = 100;
  const r = 1 + d / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  graph.cameraPosition(
    { x: (node.x || 0) * r, y: (node.y || 0) * r, z: (node.z || 0) * r },
    node, 800
  );
}

function fitGraph() {
  if (!graph || graphData.nodes.length === 0) return;
  graph.zoomToFit(600, 60);
}

function resetView() {
  clearSelection();
  if (graph) graph.cameraPosition({ x: 0, y: 0, z: 280 }, null, 800);
}

/* --------------- Details --------------- */

function showDetails(node) {
  const panel = $("detailsPanel");
  $("detailsTitle").textContent = node.type === "category" ? `📁 ${node.name}` : node.name;

  const tagsEl = $("detailsTags");
  tagsEl.innerHTML = "";

  if (node.type === "page" && node.tags?.length) {
    node.tags.forEach(tag => {
      const el = document.createElement("span");
      el.className = "details-tag";
      el.textContent = tag;
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
      n.type === "page" && n.tags?.includes(node.name.toLowerCase())
    );
    preview.innerHTML = pages.length
      ? `<strong>${pages.length} page${pages.length > 1 ? "s" : ""}</strong><br><br>` + pages.map(p => `• ${p.name}`).join("<br>")
      : "No pages yet.";
  } else {
    preview.textContent = node.preview || "No preview.";
  }

  const link = $("detailsLink");
  if (node.type === "page") {
    link.textContent = "Open Page →";
    link.onclick = e => {
      e.preventDefault();
      localStorage.setItem("ultrase7en_notion_active_v2", node.pageId);
      window.location.href = "/notion.html";
    };
  } else {
    link.textContent = "Reset View";
    link.onclick = e => { e.preventDefault(); resetView(); };
  }

  panel.classList.remove("hidden");
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
    if ((n.name || "").toLowerCase().includes(q) || (n.tags || []).some(t => t.includes(q))) {
      highlightNodes.add(n);
    }
  });

  refresh();
}

/* --------------- Init --------------- */

function wire() {
  $("themeBtn").addEventListener("click", cycleTheme);
  $("resetBtn").addEventListener("click", resetView);
  $("fitBtn").addEventListener("click", fitGraph);
  $("detailsClose").addEventListener("click", () => { hideDetails(); clearSelection(); });
  $("graphSearch").addEventListener("input", e => handleSearch(e.target.value));

  window.addEventListener("resize", () => {
    if (graph) {
      graph.width($("graphContainer").clientWidth);
      graph.height($("graphContainer").clientHeight);
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") { hideDetails(); clearSelection(); }
    if (e.key === "f" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fitGraph(); }
  });
}

(function boot() {
  loadTheme();
  wire();
  createGraph();
})();
