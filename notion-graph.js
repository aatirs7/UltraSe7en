/**
 * 3D Knowledge Graph for UltraSe7en Notion Pages
 * Obsidian-inspired visualization
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

// Colors
const COLORS = {
  category: "#8b5cf6",      // Purple for categories
  categoryGlow: "#a78bfa",
  page: "#f4f4f5",          // White for pages
  pageHighlight: "#c4b5fd",
  link: "#7c5cff",
  linkDim: "rgba(139, 92, 246, 0.2)",
  bg: "#030305"
};

/* --------------- Theme --------------- */

function loadTheme() {
  const t = localStorage.getItem(LS.theme) || "dark";
  setTheme(THEMES.includes(t) ? t : "dark");
}

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);
}

function cycleTheme() {
  const cur = document.body.getAttribute("data-theme") || "dark";
  const idx = THEMES.indexOf(cur);
  const next = THEMES[(idx + 1) % THEMES.length];
  setTheme(next);
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

  console.log("Building graph from", graphPages.length, "pages");

  const nodes = [];
  const links = [];
  const categories = new Map(); // category name -> page IDs

  // First pass: collect all categories and their pages
  for (const page of graphPages) {
    const tags = page.tags || [];
    for (const tag of tags) {
      if (!categories.has(tag)) {
        categories.set(tag, []);
      }
      categories.get(tag).push(page.id);
    }
  }

  console.log("Found categories:", Array.from(categories.keys()));

  // Create CATEGORY nodes
  for (const [catName, pageIds] of categories) {
    nodes.push({
      id: `cat:${catName}`,
      name: catName.toUpperCase(),
      type: "category",
      pageCount: pageIds.length,
      val: 20 + (pageIds.length * 5), // Larger based on pages
      color: COLORS.category
    });
  }

  // Create PAGE nodes
  for (const page of graphPages) {
    const preview = extractPreview(page.flowHTML);

    nodes.push({
      id: `page:${page.id}`,
      name: page.title || "Untitled",
      type: "page",
      pageId: page.id,
      tags: page.tags || [],
      preview: preview,
      val: 8,
      color: COLORS.page
    });

    // Create links from page to its categories
    const tags = page.tags || [];
    for (const tag of tags) {
      links.push({
        source: `cat:${tag}`,
        target: `page:${page.id}`,
        type: "category-page"
      });
    }
  }

  // Create sibling links between pages sharing categories
  for (const [catName, pageIds] of categories) {
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

  console.log("Graph built:", nodes.length, "nodes,", links.length, "links");
  return { nodes, links };
}

function extractPreview(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim().slice(0, 200);
}

/* --------------- Graph Creation --------------- */

function createGraph() {
  const container = $("graphContainer");
  graphData = buildGraphData();

  // Empty state
  if (graphData.nodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◇</div>
        <div class="empty-title">No pages in graph</div>
        <div class="empty-hint">Go to Notes and click "Add to Graph" on a page, then add categories.</div>
      </div>
    `;
    updateStats();
    return;
  }

  graph = ForceGraph3D()(container)
    .graphData(graphData)
    .backgroundColor(COLORS.bg)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .showNavInfo(false)

    // Node styling
    .nodeVal(n => n.val)
    .nodeColor(n => {
      if (highlightNodes.size > 0) {
        return highlightNodes.has(n) ? n.color : "rgba(100,100,100,0.3)";
      }
      return n.color;
    })
    .nodeOpacity(1)
    .nodeResolution(20)

    // Labels - use built-in labels
    .nodeLabel(n => `<div class="node-tooltip ${n.type}">${n.name}</div>`)

    // Link styling
    .linkWidth(l => {
      if (highlightLinks.has(l)) return 3;
      return l.type === "category-page" ? 1.5 : 0.5;
    })
    .linkColor(l => {
      if (highlightLinks.has(l)) return COLORS.link;
      return l.type === "category-page" ? COLORS.linkDim : "rgba(255,255,255,0.05)";
    })
    .linkOpacity(1)

    // Particles on highlighted links
    .linkDirectionalParticles(l => highlightLinks.has(l) ? 3 : 0)
    .linkDirectionalParticleWidth(2)
    .linkDirectionalParticleSpeed(0.008)
    .linkDirectionalParticleColor(() => COLORS.categoryGlow)

    // Interactions
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    .onBackgroundClick(clearHighlight)

    // Camera
    .cameraPosition({ x: 0, y: 0, z: 300 });

  // Physics
  graph.d3Force("charge").strength(-150);
  graph.d3Force("link").distance(l => l.type === "category-page" ? 80 : 50);
  graph.d3Force("center").strength(0.05);

  // Custom node objects with THREE.js
  graph.nodeThreeObject(node => {
    const group = new THREE.Group();

    if (node.type === "category") {
      // === CATEGORY: Large glowing sphere ===
      const size = Math.cbrt(node.val) * 1.5;

      // Core sphere
      const geo = new THREE.SphereGeometry(size, 32, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.category,
        transparent: true,
        opacity: 0.9
      });
      const sphere = new THREE.Mesh(geo, mat);
      group.add(sphere);

      // Outer glow
      const glowGeo = new THREE.SphereGeometry(size * 1.4, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: COLORS.categoryGlow,
        transparent: true,
        opacity: 0.2
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));

      // Ring
      const ringGeo = new THREE.RingGeometry(size * 1.6, size * 1.8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: COLORS.categoryGlow,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      group.add(ring);

      // Text sprite
      const sprite = makeTextSprite(node.name, {
        fontsize: 28,
        fontface: "Arial Black",
        borderColor: COLORS.category,
        backgroundColor: "rgba(139, 92, 246, 0.9)",
        textColor: "white"
      });
      sprite.position.set(0, size + 10, 0);
      group.add(sprite);

      // Count badge
      if (node.pageCount > 0) {
        const badge = makeTextSprite(String(node.pageCount), {
          fontsize: 22,
          fontface: "Arial",
          borderColor: "white",
          backgroundColor: "rgba(255,255,255,0.95)",
          textColor: COLORS.category
        });
        badge.position.set(0, -(size + 8), 0);
        group.add(badge);
      }

    } else {
      // === PAGE: Small white sphere ===
      const size = Math.cbrt(node.val) * 1.2;
      const isHighlighted = highlightNodes.has(node);

      const geo = new THREE.SphereGeometry(size, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: isHighlighted ? COLORS.pageHighlight : COLORS.page,
        transparent: true,
        opacity: isHighlighted ? 1 : 0.85
      });
      group.add(new THREE.Mesh(geo, mat));

      // Always show label for pages
      const sprite = makeTextSprite(truncate(node.name, 18), {
        fontsize: 20,
        fontface: "Arial",
        borderColor: "transparent",
        backgroundColor: "rgba(0,0,0,0.7)",
        textColor: "white"
      });
      sprite.position.set(0, size + 6, 0);
      group.add(sprite);

      // Glow when highlighted
      if (isHighlighted) {
        const glowGeo = new THREE.SphereGeometry(size * 2, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: COLORS.categoryGlow,
          transparent: true,
          opacity: 0.25
        });
        group.add(new THREE.Mesh(glowGeo, glowMat));
      }
    }

    return group;
  });

  updateStats();
}

function makeTextSprite(text, opts = {}) {
  const fontface = opts.fontface || "Arial";
  const fontsize = opts.fontsize || 24;
  const borderColor = opts.borderColor || "white";
  const backgroundColor = opts.backgroundColor || "rgba(0,0,0,0.8)";
  const textColor = opts.textColor || "white";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  ctx.font = `bold ${fontsize}px ${fontface}`;
  const textWidth = ctx.measureText(text).width;

  const padding = fontsize * 0.5;
  canvas.width = textWidth + padding * 2;
  canvas.height = fontsize + padding * 2;

  // Background
  ctx.fillStyle = backgroundColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 8);
  ctx.fill();

  // Border
  if (borderColor !== "transparent") {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, 7);
    ctx.stroke();
  }

  // Text
  ctx.font = `bold ${fontsize}px ${fontface}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 8, canvas.height / 8, 1);

  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(s, len) {
  if (!s) return "";
  return s.length > len ? s.slice(0, len) + "…" : s;
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

  // Find connected nodes
  graphData.links.forEach(link => {
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;

    if (src === node.id || tgt === node.id) {
      highlightLinks.add(link);
      const other = graphData.nodes.find(n => n.id === (src === node.id ? tgt : src));
      if (other) highlightNodes.add(other);
    }
  });

  refreshGraph();

  if (node.type === "page") {
    showPageDetails(node);
  } else {
    showCategoryDetails(node);
  }

  focusNode(node);
}

function handleNodeHover(node) {
  document.body.style.cursor = node ? "pointer" : "default";
}

function clearHighlight() {
  highlightNodes.clear();
  highlightLinks.clear();
  refreshGraph();
  hideDetails();
}

function refreshGraph() {
  if (!graph) return;
  graph.nodeColor(graph.nodeColor());
  graph.linkWidth(graph.linkWidth());
  graph.linkColor(graph.linkColor());
  graph.linkDirectionalParticles(graph.linkDirectionalParticles());
  graph.nodeThreeObject(graph.nodeThreeObject());
}

function focusNode(node) {
  if (!graph || !node) return;
  const dist = 120;
  const ratio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  graph.cameraPosition(
    { x: (node.x || 0) * ratio, y: (node.y || 0) * ratio, z: (node.z || 0) * ratio },
    node,
    1000
  );
}

function resetView() {
  clearHighlight();
  if (graph) graph.cameraPosition({ x: 0, y: 0, z: 300 }, null, 1000);
}

/* --------------- Details Panel --------------- */

function showPageDetails(node) {
  $("detailsTitle").textContent = node.name;

  const tagsEl = $("detailsTags");
  tagsEl.innerHTML = "";
  (node.tags || []).forEach(tag => {
    const el = document.createElement("span");
    el.className = "details-tag";
    el.textContent = tag;
    el.style.cursor = "pointer";
    el.onclick = () => {
      const catNode = graphData.nodes.find(n => n.id === `cat:${tag}`);
      if (catNode) handleNodeClick(catNode);
    };
    tagsEl.appendChild(el);
  });

  $("detailsPreview").textContent = node.preview || "No preview available.";

  const link = $("detailsLink");
  link.textContent = "Open Page";
  link.onclick = (e) => {
    e.preventDefault();
    localStorage.setItem("ultrase7en_notion_active_v2", node.pageId);
    window.location.href = "/notion.html";
  };

  $("detailsPanel").classList.remove("hidden");
}

function showCategoryDetails(node) {
  $("detailsTitle").textContent = `📁 ${node.name}`;
  $("detailsTags").innerHTML = "";

  const pages = graphData.nodes.filter(n =>
    n.type === "page" && n.tags?.includes(node.name.toLowerCase())
  );

  $("detailsPreview").innerHTML = pages.length > 0
    ? `<strong>${pages.length} page${pages.length > 1 ? "s" : ""}:</strong><br><br>` +
      pages.map(p => `• ${p.name}`).join("<br>")
    : "No pages in this category.";

  const link = $("detailsLink");
  link.textContent = "Reset View";
  link.onclick = (e) => {
    e.preventDefault();
    resetView();
  };

  $("detailsPanel").classList.remove("hidden");
}

function hideDetails() {
  $("detailsPanel").classList.add("hidden");
}

/* --------------- Search --------------- */

function handleSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) {
    clearHighlight();
    return;
  }

  highlightNodes.clear();
  highlightLinks.clear();

  graphData.nodes.forEach(node => {
    const name = (node.name || "").toLowerCase();
    const tags = (node.tags || []).join(" ").toLowerCase();
    if (name.includes(q) || tags.includes(q)) {
      highlightNodes.add(node);
    }
  });

  refreshGraph();
}

/* --------------- Init --------------- */

function wire() {
  $("themeBtn").addEventListener("click", cycleTheme);
  $("resetBtn").addEventListener("click", resetView);
  $("detailsClose").addEventListener("click", () => { hideDetails(); clearHighlight(); });
  $("graphSearch").addEventListener("input", e => handleSearch(e.target.value));

  window.addEventListener("resize", () => {
    if (graph) {
      graph.width($("graphContainer").clientWidth);
      graph.height($("graphContainer").clientHeight);
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") { hideDetails(); clearHighlight(); }
  });
}

(function boot() {
  loadTheme();
  wire();
  createGraph();
})();
