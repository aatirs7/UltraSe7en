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
let selectedNode = null;
let highlightNodes = new Set();
let highlightLinks = new Set();
let hoverNode = null;

/* --------------- Theme --------------- */

function loadTheme(){
  const t = localStorage.getItem(LS.theme) || "dark";
  setTheme(THEMES.includes(t) ? t : "dark");
}

function setTheme(theme){
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem(LS.theme, theme);
  if(graph) updateGraphColors();
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
    category: style.getPropertyValue("--node-hub").trim() || "#7c5cff",
    categoryGlow: style.getPropertyValue("--node-tag").trim() || "#a78bfa",
    page: style.getPropertyValue("--node-page").trim() || "#e4e4e7",
    link: style.getPropertyValue("--link-color").trim() || "rgba(124, 92, 255, 0.35)",
    text: style.getPropertyValue("--text").trim() || "rgba(255,255,255,0.88)",
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

  // Debug: Show what we're loading
  console.log("All pages loaded:", pages);
  console.log("Pages inGraph status:", pages.map(p => ({ title: p.title, inGraph: p.inGraph, tags: p.tags })));

  // Filter pages that are in the graph (use truthy check, not strict ===)
  const graphPages = pages.filter(p => p.inGraph);
  console.log("Pages in graph:", graphPages.length);

  const nodes = [];
  const links = [];
  const categorySet = new Set();
  const categoryPages = {}; // track which pages belong to each category

  // Collect all unique categories (tags)
  for(const page of graphPages){
    const tags = page.tags || [];
    tags.forEach(t => {
      categorySet.add(t);
      if(!categoryPages[t]) categoryPages[t] = [];
      categoryPages[t].push(page.id);
    });
  }

  // Create CATEGORY nodes (large, prominent)
  for(const category of categorySet){
    const pageCount = categoryPages[category]?.length || 0;
    nodes.push({
      id: `cat:${category}`,
      type: "category",
      label: category.toUpperCase(),
      pageCount: pageCount,
      // Size based on number of connected pages
      val: 8 + (pageCount * 2),
    });
  }

  // Create PAGE nodes
  for(const page of graphPages){
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = page.flowHTML || "";
    const preview = (tempDiv.textContent || "").trim().slice(0, 200);

    const tags = page.tags || [];

    nodes.push({
      id: `page:${page.id}`,
      type: "page",
      label: page.title || "Untitled",
      pageId: page.id,
      tags: tags,
      preview: preview,
      val: 3,
    });

    // Link page to its categories
    if(tags.length > 0){
      for(const tag of tags){
        links.push({
          source: `cat:${tag}`,
          target: `page:${page.id}`,
          type: "category-page",
        });
      }
    }
  }

  // Connect pages that share categories (sibling links)
  for(const category in categoryPages){
    const pageIds = categoryPages[category];
    // Create connections between pages in same category
    for(let i = 0; i < pageIds.length; i++){
      for(let j = i + 1; j < pageIds.length; j++){
        // Check if this link already exists
        const existingLink = links.find(l =>
          (l.source === `page:${pageIds[i]}` && l.target === `page:${pageIds[j]}`) ||
          (l.source === `page:${pageIds[j]}` && l.target === `page:${pageIds[i]}`)
        );
        if(!existingLink){
          links.push({
            source: `page:${pageIds[i]}`,
            target: `page:${pageIds[j]}`,
            type: "sibling",
          });
        }
      }
    }
  }

  // Handle pages without categories - they float alone
  // (no hub needed, they just exist in space)

  return { nodes, links };
}

/* --------------- Graph Rendering --------------- */

function createGraph(){
  const container = $("graphContainer");
  const colors = getThemeColors();

  graphData = buildGraphData();
  console.log("Graph:", graphData.nodes.length, "nodes,", graphData.links.length, "links");

  // Check if no nodes
  if(graphData.nodes.length === 0){
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:16px;text-align:center;padding:40px;">
        <div>
          <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">&#x2B21;</div>
          <div>No pages in the graph yet.</div>
          <div style="margin-top:8px;opacity:0.7;font-size:14px;">Go to Notes and click "Add to Graph" on a page.</div>
        </div>
      </div>
    `;
    updateStats();
    return;
  }

  graph = ForceGraph3D()(container)
    .graphData(graphData)
    .backgroundColor(colors.bg)
    .width(container.clientWidth)
    .height(container.clientHeight)
    .showNavInfo(false)

    // === NODE STYLING ===
    .nodeLabel("")  // We'll use custom labels
    .nodeVal(node => node.val)
    .nodeResolution(24)
    .nodeOpacity(1)

    // Custom 3D objects for nodes
    .nodeThreeObject(node => createNodeObject(node))
    .nodeThreeObjectExtend(false)

    // === LINK STYLING ===
    .linkWidth(link => {
      if(highlightLinks.has(link)) return 2;
      return link.type === "category-page" ? 1.5 : 0.5;
    })
    .linkOpacity(link => {
      if(highlightLinks.has(link)) return 0.8;
      return link.type === "category-page" ? 0.4 : 0.15;
    })
    .linkColor(link => {
      if(highlightLinks.has(link)) return colors.category;
      return link.type === "category-page" ? colors.link : "rgba(255,255,255,0.1)";
    })
    // Animated particles on links
    .linkDirectionalParticles(link => highlightLinks.has(link) ? 4 : 0)
    .linkDirectionalParticleWidth(2)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(() => colors.categoryGlow)

    // === INTERACTIONS ===
    .onNodeClick(handleNodeClick)
    .onNodeHover(handleNodeHover)
    .onBackgroundClick(() => {
      clearHighlight();
      hideDetails();
    })

    // === CAMERA ===
    .cameraPosition({ x: 0, y: 0, z: 250 });

  // Configure physics
  graph.d3Force("charge").strength(-100);
  graph.d3Force("link")
    .distance(link => link.type === "category-page" ? 70 : 50)
    .strength(link => link.type === "category-page" ? 0.6 : 0.2);
  graph.d3Force("center").strength(0.05);

  updateStats();
}

function createNodeObject(node){
  const THREE = window.THREE;
  const colors = getThemeColors();
  const isHighlighted = highlightNodes.has(node) || hoverNode === node;

  if(node.type === "category"){
    // === CATEGORY NODE: Large glowing orb with label ===
    const group = new THREE.Group();

    // Main sphere
    const size = Math.sqrt(node.val) * 2;
    const geometry = new THREE.SphereGeometry(size, 32, 32);
    const material = new THREE.MeshPhongMaterial({
      color: colors.category,
      emissive: colors.category,
      emissiveIntensity: isHighlighted ? 0.6 : 0.3,
      transparent: true,
      opacity: isHighlighted ? 1 : 0.9,
      shininess: 100,
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Outer glow ring
    const ringGeometry = new THREE.RingGeometry(size * 1.3, size * 1.6, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: colors.categoryGlow,
      transparent: true,
      opacity: isHighlighted ? 0.4 : 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // Glow sphere
    const glowGeometry = new THREE.SphereGeometry(size * 1.4, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: colors.categoryGlow,
      transparent: true,
      opacity: isHighlighted ? 0.25 : 0.1,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);

    // Text label using sprite
    const label = createTextSprite(node.label, {
      fontSize: 48,
      fontWeight: "700",
      color: "#ffffff",
      backgroundColor: colors.category,
      padding: 12,
      borderRadius: 8,
    });
    label.position.y = size + 8;
    label.scale.set(24, 12, 1);
    group.add(label);

    // Page count badge
    if(node.pageCount > 0){
      const countLabel = createTextSprite(`${node.pageCount}`, {
        fontSize: 36,
        fontWeight: "600",
        color: colors.category,
        backgroundColor: "rgba(255,255,255,0.95)",
        padding: 8,
        borderRadius: 20,
      });
      countLabel.position.y = -(size + 6);
      countLabel.scale.set(10, 6, 1);
      group.add(countLabel);
    }

    return group;

  } else {
    // === PAGE NODE: Small dot with label on hover ===
    const group = new THREE.Group();

    const size = Math.sqrt(node.val) * 1.5;
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      color: isHighlighted ? colors.categoryGlow : colors.page,
      emissive: isHighlighted ? colors.categoryGlow : 0x000000,
      emissiveIntensity: isHighlighted ? 0.5 : 0,
      transparent: true,
      opacity: isHighlighted ? 1 : 0.85,
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Show label when highlighted or always for better UX
    if(isHighlighted || highlightNodes.size === 0){
      const label = createTextSprite(truncate(node.label, 20), {
        fontSize: 32,
        fontWeight: "500",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.75)",
        padding: 8,
        borderRadius: 6,
      });
      label.position.y = size + 5;
      label.scale.set(20, 8, 1);
      group.add(label);
    }

    // Glow on highlight
    if(isHighlighted){
      const glowGeometry = new THREE.SphereGeometry(size * 2, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: colors.categoryGlow,
        transparent: true,
        opacity: 0.2,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      group.add(glow);
    }

    return group;
  }
}

function createTextSprite(text, options = {}){
  const {
    fontSize = 32,
    fontWeight = "500",
    color = "#ffffff",
    backgroundColor = "rgba(0,0,0,0.7)",
    padding = 8,
    borderRadius = 6,
  } = options;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Measure text
  ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const textWidth = ctx.measureText(text).width;

  // Set canvas size
  const width = textWidth + padding * 2;
  const height = fontSize + padding * 2;
  canvas.width = width * 2; // Higher res
  canvas.height = height * 2;

  // Scale for higher res
  ctx.scale(2, 2);

  // Draw background
  ctx.fillStyle = backgroundColor;
  roundRect(ctx, 0, 0, width, height, borderRadius);
  ctx.fill();

  // Draw text
  ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);

  // Create sprite
  const THREE = window.THREE;
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);

  return sprite;
}

function roundRect(ctx, x, y, w, h, r){
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

function truncate(str, len){
  if(!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function updateGraphColors(){
  if(!graph) return;
  const colors = getThemeColors();
  graph.backgroundColor(colors.bg);
  // Re-render nodes to update colors
  graph.nodeThreeObject(node => createNodeObject(node));
}

function updateStats(){
  $("nodeCount").textContent = graphData.nodes.length;
  $("linkCount").textContent = graphData.links.length;
}

/* --------------- Highlight System --------------- */

function clearHighlight(){
  highlightNodes.clear();
  highlightLinks.clear();
  hoverNode = null;
  updateHighlight();
}

function updateHighlight(){
  if(!graph) return;

  // Update node visuals
  graph.nodeThreeObject(node => createNodeObject(node));

  // Update link visuals
  graph.linkWidth(graph.linkWidth());
  graph.linkOpacity(graph.linkOpacity());
  graph.linkColor(graph.linkColor());
  graph.linkDirectionalParticles(graph.linkDirectionalParticles());
}

/* --------------- Interactions --------------- */

function handleNodeClick(node){
  if(!node) return;

  // Highlight this node and connected nodes
  highlightNodes.clear();
  highlightLinks.clear();

  highlightNodes.add(node);

  // Find connected nodes and links
  graphData.links.forEach(link => {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;

    if(sourceId === node.id || targetId === node.id){
      highlightLinks.add(link);
      // Add connected node
      const connectedNode = graphData.nodes.find(n =>
        n.id === (sourceId === node.id ? targetId : sourceId)
      );
      if(connectedNode) highlightNodes.add(connectedNode);
    }
  });

  updateHighlight();

  if(node.type === "page"){
    showDetails(node);
  } else {
    showCategoryDetails(node);
  }

  focusNode(node);
}

function handleNodeHover(node){
  document.body.style.cursor = node ? "pointer" : "default";

  if(node !== hoverNode){
    hoverNode = node;
    // Only update if not in click-highlight mode
    if(highlightNodes.size === 0){
      updateHighlight();
    }
  }
}

function focusNode(node){
  if(!graph || !node) return;

  const distance = 100;
  const distRatio = 1 + distance / Math.hypot(node.x || 0, node.y || 0, node.z || 0);

  graph.cameraPosition(
    {
      x: (node.x || 0) * distRatio,
      y: (node.y || 0) * distRatio,
      z: (node.z || 0) * distRatio,
    },
    node,
    1000
  );
}

function resetView(){
  if(!graph) return;
  clearHighlight();
  graph.cameraPosition({ x: 0, y: 0, z: 250 }, null, 1000);
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
      el.onclick = () => {
        // Find and click the category node
        const catNode = graphData.nodes.find(n => n.id === `cat:${tag}`);
        if(catNode) handleNodeClick(catNode);
      };
      el.style.cursor = "pointer";
      tags.appendChild(el);
    });
  }

  preview.textContent = node.preview || "No content preview available.";

  link.href = "#";
  link.onclick = (e) => {
    e.preventDefault();
    navigateToPage(node.pageId);
  };
  link.textContent = "Open Page";

  panel.classList.remove("hidden");
}

function showCategoryDetails(node){
  const panel = $("detailsPanel");
  const title = $("detailsTitle");
  const tags = $("detailsTags");
  const preview = $("detailsPreview");
  const link = $("detailsLink");

  title.textContent = `Category: ${node.label}`;
  tags.innerHTML = "";

  // Find all pages in this category
  const categoryPages = graphData.nodes.filter(n =>
    n.type === "page" && n.tags && n.tags.includes(node.label.toLowerCase())
  );

  if(categoryPages.length > 0){
    preview.innerHTML = `<strong>${categoryPages.length} page${categoryPages.length > 1 ? "s" : ""}:</strong><br><br>` +
      categoryPages.map(p => `• ${p.label}`).join("<br>");
  } else {
    preview.textContent = "No pages in this category.";
  }

  link.href = "#";
  link.onclick = (e) => {
    e.preventDefault();
    resetView();
  };
  link.textContent = "Reset View";

  panel.classList.remove("hidden");
}

function hideDetails(){
  $("detailsPanel").classList.add("hidden");
  selectedNode = null;
}

function navigateToPage(pageId){
  localStorage.setItem("ultrase7en_notion_active_v2", pageId);
  window.location.href = "/notion.html";
}

/* --------------- Search --------------- */

function handleSearch(query){
  const q = query.trim().toLowerCase();

  if(!q){
    clearHighlight();
    return;
  }

  highlightNodes.clear();
  highlightLinks.clear();

  graphData.nodes.forEach(node => {
    const label = (node.label || "").toLowerCase();
    const tags = (node.tags || []).join(" ").toLowerCase();
    if(label.includes(q) || tags.includes(q)){
      highlightNodes.add(node);
    }
  });

  updateHighlight();
}

/* --------------- Wiring --------------- */

function wire(){
  $("themeBtn").addEventListener("click", cycleTheme);
  $("resetBtn").addEventListener("click", resetView);
  $("detailsClose").addEventListener("click", () => {
    hideDetails();
    clearHighlight();
  });

  $("graphSearch").addEventListener("input", (e) => {
    handleSearch(e.target.value);
  });

  window.addEventListener("resize", () => {
    if(!graph) return;
    const container = $("graphContainer");
    graph.width(container.clientWidth);
    graph.height(container.clientHeight);
  });

  window.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      hideDetails();
      clearHighlight();
    }
  });
}

/* --------------- Init --------------- */

(function boot(){
  loadTheme();
  wire();
  createGraph();
})();
