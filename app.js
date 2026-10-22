/*
 * TẠP HÓA KU-MI
 * 1) Thay SHEET_CSV_URL bằng link CSV đã Publish to web từ Google Sheets.
 * 2) Thay ZALO_URL bằng đường dẫn liên hệ Zalo thật của shop.
 */
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSFisP998E2xL6HlbBouJJ6uipeBmapGlmbiWa0QmvuqJ7D7IwSOefUThQW6J4lOg/pub?gid=1637839878&single=true&output=csv";
const ZALO_URL = "https://zalo.me/g/gaeikv060";

const state = { all: [], filtered: [], loadError: null };
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(Number(value) || 0);

function setStatus(message, type = "") {
  const el = $("statusBox");
  el.textContent = message;
  el.className = "status-box" + (type ? " " + type : "");
  el.hidden = !message;
}
function normalize(s) {
  return String(s ?? "").trim().toLocaleLowerCase("vi");
}
function safeText(s) { return String(s ?? "").trim(); }
function isPlaceholder(value) {
  return !value || value.startsWith("PASTE_") || value.includes("example.com");
}
function setContactLinks() {
  for (const id of ["headerZalo", "aboutZalo"]) {
    const el = $(id);
    if (isPlaceholder(ZALO_URL)) {
      el.href = "#";
      el.addEventListener("click", (event) => {
        event.preventDefault();
        alert("Bạn cần điền ZALO_URL trong file app.js bằng link liên hệ Zalo của shop.");
      });
    } else {
      el.href = ZALO_URL;
    }
  }
}
function normalizeProduct(row, index) {
  const priceText = String(row.price ?? "").trim().replace(/[.\s₫đ,]/gi, "");
  const price = Number(priceText);
  return {
    id: safeText(row.id) || `ROW-${index + 1}`,
    name: safeText(row.name),
    category: safeText(row.category) || "Khác",
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    image: safeText(row.image),
    shortDesc: safeText(row.short_desc),
    description: safeText(row.description) || safeText(row.short_desc),
    status: normalize(row.status) || "available",
    featured: ["true", "yes", "1", "có"].includes(normalize(row.featured)),
    contactNote: safeText(row.contact_note)
  };
}
async function loadProducts() {
  if (typeof Papa === "undefined") {
    throw new Error("Không tải được thư viện đọc CSV. Kiểm tra Internet hoặc thư viện Papa Parse.");
  }
  if (isPlaceholder(SHEET_CSV_URL)) {
    setStatus("Chưa kết nối Google Sheets. Hãy làm theo README, lấy link CSV đã xuất bản rồi dán vào SHEET_CSV_URL trong app.js.", "error");
    $("resultCount").textContent = "Chưa có nguồn dữ liệu";
    $("heroCount").textContent = "0";
    return;
  }
  setStatus("Đang tải dữ liệu sản phẩm từ Google Sheets…");
  const parsed = await new Promise((resolve, reject) => {
    Papa.parse(SHEET_CSV_URL, {
      download: true, header: true, skipEmptyLines: "greedy",
      transformHeader: h => h.replace(/^\uFEFF/, "").trim(),
      complete: resolve,
      error: reject
    });
  });
  if (parsed.errors?.length) {
    const serious = parsed.errors.filter(e => e.code !== "UndetectableDelimiter");
    if (serious.length) console.warn("Lỗi phân tích CSV:", serious);
  }
  const headers = (parsed.meta?.fields || []).map(h => h.trim());
  const required = ["id", "name", "category", "price", "image", "short_desc", "description", "status"];
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    throw new Error("CSV thiếu cột: " + missing.join(", ") + ". Kiểm tra tên cột ở hàng đầu tiên của Google Sheets.");
  }
  state.all = (parsed.data || [])
    .map(normalizeProduct)
    .filter(p => p.name && p.status !== "hidden");
  if (parsed.errors?.length) {
    console.warn("Papa Parse báo lỗi CSV; kiểm tra dữ liệu trong Console.", parsed.errors);
  }
  fillCategories();
  applyFilters();
  if (!state.all.length) {
    setStatus("Đã kết nối CSV nhưng chưa có sản phẩm hiển thị. Kiểm tra dữ liệu, cột status và xem có dòng nào có tên sản phẩm hay không.", "error");
  } else {
    setStatus(`Đồng bộ thành công ${state.all.length} sản phẩm từ Google Sheets.`, "success");
  }
}
function fillCategories() {
  const select = $("categoryFilter");
  const previous = select.value;
  const categories = [...new Set(state.all.map(p => p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi"));
  select.innerHTML = '<option value="">Tất cả danh mục</option>';
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category; option.textContent = category; select.appendChild(option);
  });
  if (categories.includes(previous)) select.value = previous;
}
function priceMatches(price, filter) {
  if (!filter) return true;
  if (filter === "1000000+") return price > 1000000;
  const [min, max] = filter.split("-").map(Number);
  return price >= min && price <= max;
}
function applyFilters() {
  const query = normalize($("searchInput").value);
  const category = $("categoryFilter").value;
  const price = $("priceFilter").value;
  const sort = $("sortFilter").value;
  let list = state.all.filter(p => {
    const text = normalize([p.name, p.category, p.shortDesc, p.description, p.id].join(" "));
    return (!query || text.includes(query)) &&
      (!category || p.category === category) &&
      priceMatches(p.price, price);
  });
  if (sort === "price-asc") list.sort((a,b)=>a.price-b.price);
  else if (sort === "price-desc") list.sort((a,b)=>b.price-a.price);
  else if (sort === "name") list.sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  else list.sort((a,b)=>Number(b.featured)-Number(a.featured));
  state.filtered = list;
  renderProducts();
}
function createProductCard(p) {
  const card = document.createElement("article");
  card.className = "product-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Xem chi tiết ${p.name}`);
  const imageWrap = document.createElement("div");
  imageWrap.className = "product-image";
  if (p.image && /^https?:\/\//i.test(p.image)) {
    const img = document.createElement("img");
    img.loading = "lazy"; img.alt = p.name; img.src = p.image;
    img.onerror = () => { img.remove(); const fallback = document.createElement("div"); fallback.className="image-placeholder"; fallback.textContent="K+"; imageWrap.appendChild(fallback); };
    imageWrap.appendChild(img);
  } else {
    const fallback = document.createElement("div"); fallback.className="image-placeholder"; fallback.textContent="K+"; imageWrap.appendChild(fallback);
  }
  const badge = document.createElement("span");
  badge.className = "product-badge" + (p.status === "sold" ? " sold-badge" : "");
  badge.textContent = p.status === "sold" ? "Đã bán" : (p.featured ? "Ku-mi select" : p.category);
  imageWrap.appendChild(badge);
  const info = document.createElement("div"); info.className = "product-info";
  const cat = document.createElement("div"); cat.className = "product-category"; cat.textContent = p.category;
  const title = document.createElement("h3"); title.textContent = p.name;
  const desc = document.createElement("p"); desc.textContent = p.shortDesc || "Liên hệ Ku-mi để biết thêm thông tin.";
  const bottom = document.createElement("div"); bottom.className = "product-bottom";
  const amount = document.createElement("span"); amount.className = "product-price"; amount.textContent = money(p.price);
  const link = document.createElement("span"); link.className = "details-link"; link.textContent = "Chi tiết ↗";
  bottom.append(amount, link); info.append(cat,title,desc,bottom); card.append(imageWrap,info);
  const open = () => openDetails(p);
  card.addEventListener("click", open);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return card;
}
function renderProducts() {
  const grid = $("productGrid"); grid.replaceChildren();
  state.filtered.forEach(p => grid.appendChild(createProductCard(p)));
  $("resultCount").textContent = `Hiển thị ${state.filtered.length} / ${state.all.length} sản phẩm`;
  $("heroCount").textContent = String(state.filtered.length);
  $("emptyState").hidden = state.filtered.length > 0;
}
function openDetails(p) {
  const content = $("modalContent"); content.replaceChildren();
  const layout = document.createElement("div"); layout.className = "detail-layout";
  const visual = document.createElement("div");
  if (p.image && /^https?:\/\//i.test(p.image)) {
    const img = document.createElement("img"); img.className = "detail-image"; img.src = p.image; img.alt = p.name;
    img.onerror = () => { img.remove(); const fallback = document.createElement("div"); fallback.className="detail-image-fallback"; fallback.textContent="K+"; visual.appendChild(fallback); };
    visual.appendChild(img);
  } else { const fallback = document.createElement("div"); fallback.className="detail-image-fallback"; fallback.textContent="K+"; visual.appendChild(fallback); }
  const copy = document.createElement("div"); copy.className = "detail-copy";
  const category = document.createElement("div"); category.className = "product-category"; category.textContent = `${p.category} · ${p.id}`;
  const title = document.createElement("h2"); title.id = "modalTitle"; title.textContent = p.name;
  const price = document.createElement("div"); price.className = "detail-price"; price.textContent = money(p.price);
  const status = document.createElement("div"); status.className = "product-badge" + (p.status === "sold" ? " sold-badge" : ""); status.style.position="static"; status.style.display="inline-block"; status.textContent = p.status === "sold" ? "Đã bán" : "Đang nhận tư vấn";
  const desc = document.createElement("p"); desc.className = "detail-desc"; desc.textContent = p.description || p.shortDesc || "Chưa có mô tả chi tiết.";
  const note = document.createElement("p"); note.className = "detail-desc"; note.textContent = p.contactNote ? "Ghi chú: " + p.contactNote : "Nhắn shop để xác nhận tình trạng, giá và cách nhận hàng.";
  const contact = document.createElement("a"); contact.className = "detail-contact"; contact.textContent = "Liên hệ Zalo ↗"; contact.href = isPlaceholder(ZALO_URL) ? "#" : ZALO_URL; contact.target = "_blank"; contact.rel = "noopener";
  if (isPlaceholder(ZALO_URL)) contact.addEventListener("click", e => {e.preventDefault(); alert("Hãy điền ZALO_URL trong app.js trước khi xuất bản.");});
  copy.append(category,title,price,status,desc,note,contact); layout.append(visual,copy); content.appendChild(layout);
  $("productModal").hidden = false; document.body.style.overflow = "hidden"; $("modalClose").focus();
}
function closeDetails() { $("productModal").hidden = true; document.body.style.overflow = ""; }
function bindEvents() {
  ["searchInput","categoryFilter","priceFilter","sortFilter"].forEach(id => $(id).addEventListener(id === "searchInput" ? "input" : "change", applyFilters));
  $("resetFilters").addEventListener("click", () => { $("searchInput").value=""; $("categoryFilter").value=""; $("priceFilter").value=""; $("sortFilter").value="featured"; applyFilters(); });
  $("modalClose").addEventListener("click", closeDetails);
  $("modalBackdrop").addEventListener("click", closeDetails);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetails(); if (e.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); $("searchInput").focus(); } });
  $("year").textContent = String(new Date().getFullYear());
}
document.addEventListener("DOMContentLoaded", async () => {
  bindEvents(); setContactLinks();
  try { await loadProducts(); }
  catch (error) {
    console.error("[Ku-mi] Không tải được Google Sheets CSV:", error);
    setStatus("Lỗi tải dữ liệu: " + (error.message || "Không rõ nguyên nhân") + " Mở F12 → Console/Network để kiểm tra link CSV.", "error");
    $("resultCount").textContent = "Không tải được dữ liệu";
    $("heroCount").textContent = "!";
  }
});
