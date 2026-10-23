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
function getImageUrl(value) {
  const url = safeText(value);
  if (!url) return "";

  // Chuyển link chia sẻ Google Drive thành link ảnh
  const match = url.match(
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/
  );

  if (match) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }

  // Hỗ trợ link Google Drive dạng open?id=... và thumbnail?id=...
  const driveIdMatch = url.match(
    /drive\.google\.com\/(?:open|thumbnail)\?[^#]*\bid=([a-zA-Z0-9_-]+)/
  );

  if (driveIdMatch) {
    return `https://drive.google.com/thumbnail?id=${driveIdMatch[1]}&sz=w1000`;
  }

  return url;
}
function isPlaceholder(value) {
  return !value || value.startsWith("PASTE_") || value.includes("example.com");
}
function setContactLinks() {
  for (const id of ["headerZalo", "aboutZalo", "mobileZalo"]) {
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
function parsePrice(value) {
  // Chấp nhận các dạng 120000, 120.000, 120,000đ hoặc 120 000 đ.
  const priceText = String(value ?? "").trim().replace(/[^0-9-]/g, "");
  if (!priceText || priceText === "-") return NaN;
  return Number(priceText);
}
function normalizeStatus(value) {
  const status = normalize(value).replace(/[ _-]+/g, " ");
  if (["sold", "sold out", "đã bán", "het hang", "hết hàng", "out of stock"].includes(status)) return "sold";
  if (["hidden", "ẩn", "an", "hide", "draft", "nháp"].includes(status)) return "hidden";
  if (["coming soon", "sắp về", "sap ve", "coming"].includes(status)) return "coming";
  return "available";
}
function normalizeProduct(row, index) {
  const price = parsePrice(row.price);
  // original_price là cột tùy chọn; giá tham chiếu chỉ hiện khi cao hơn giá bán.
  const original = safeText(row.original_price) ? parsePrice(row.original_price) : NaN;
  const validPrice = Number.isFinite(price) && price >= 0 ? price : null;
  const validOriginal = Number.isFinite(original) && original >= 0 ? original : null;
  return {
    id: safeText(row.id) || `ROW-${index + 1}`,
    name: safeText(row.name),
    category: safeText(row.category) || "Khác",
    price: validPrice,
    originalPrice: validOriginal !== null && validPrice !== null && validOriginal > validPrice ? validOriginal : null,
    image: getImageUrl(row.image),
    shortDesc: safeText(row.short_desc),
    description: safeText(row.description) || safeText(row.short_desc),
    status: normalizeStatus(row.status),
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
  const rawRows = (parsed.data || []).filter(row => Object.values(row || {}).some(value => safeText(value)));
  state.all = rawRows
    .map((row, index) => normalizeProduct(row, index))
    .filter(p => p.name && p.status !== "hidden");
  const issues = [];
  const duplicateIds = state.all.map(p => p.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (duplicateIds.length) issues.push(`ID trùng: ${[...new Set(duplicateIds)].slice(0, 4).join(", ")}`);
  const missingPrices = state.all.filter(p => p.price === null);
  if (missingPrices.length) issues.push(`${missingPrices.length} sản phẩm thiếu giá hoặc giá không hợp lệ`);
  const missingImages = state.all.filter(p => !p.image);
  if (missingImages.length) issues.push(`${missingImages.length} sản phẩm chưa có ảnh`);
  if (issues.length) console.warn("[Ku-mi] Cần rà soát dữ liệu Google Sheets:", issues);
  if (parsed.errors?.length) {
    console.warn("Papa Parse báo lỗi CSV; kiểm tra dữ liệu trong Console.", parsed.errors);
  }
  fillCategories();
  renderFeatured();
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
  if (filter === "1000000+") return price !== null && price > 1000000;
  const [min, max] = filter.split("-").map(Number);
  return price !== null && price >= min && price <= max;
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
  if (sort === "price-asc") list.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
  else if (sort === "price-desc") list.sort((a,b)=>(b.price ?? -Infinity)-(a.price ?? -Infinity));
  else if (sort === "name") list.sort((a,b)=>a.name.localeCompare(b.name,"vi"));
  else list.sort((a,b)=>Number(b.featured)-Number(a.featured));
  state.filtered = list;
  renderProducts();
}
function createProductCard(p, compact = false) {
  const card = document.createElement("article");
  card.className = "product-card" + (compact ? " featured-card" : "");
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
  badge.className = "product-badge" + (p.status === "sold" ? " sold-badge" : p.status === "coming" ? " coming-badge" : "");
  badge.textContent = p.status === "sold" ? "Đã bán" : p.status === "coming" ? "Sắp về" : (p.featured ? "Ku-mi select" : p.category);
  imageWrap.appendChild(badge);
  const info = document.createElement("div"); info.className = "product-info";
  const cat = document.createElement("div"); cat.className = "product-category"; cat.textContent = p.category;
  const title = document.createElement("h3"); title.textContent = p.name;
  const desc = document.createElement("p"); desc.textContent = p.shortDesc || "Liên hệ Ku-mi để biết thêm thông tin.";
  const bottom = document.createElement("div"); bottom.className = "product-bottom";
  const pricing = document.createElement("div"); pricing.className = "price-stack";
  const amount = document.createElement("span"); amount.className = "product-price current-price"; amount.textContent = p.price === null ? "Liên hệ báo giá" : money(p.price);
  pricing.appendChild(amount);
  if (p.originalPrice !== null) {
    const oldPrice = document.createElement("span"); oldPrice.className = "original-price"; oldPrice.textContent = money(p.originalPrice);
    const discount = document.createElement("span"); discount.className = "discount-badge";
    discount.textContent = `-${Math.round((1 - p.price / p.originalPrice) * 100)}%`;
    pricing.append(oldPrice, discount);
  }
  const link = document.createElement("span"); link.className = "details-link"; link.textContent = "Chi tiết ↗";
  if (p.status === "sold" || p.status === "coming") card.classList.add("product-unavailable");
  bottom.append(pricing, link); info.append(cat,title,desc,bottom); card.append(imageWrap,info);
  const open = () => openDetails(p);
  card.addEventListener("click", open);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return card;
}
function renderFeatured() {
  const section = $("featuredSection");
  const grid = $("featuredGrid");
  if (!section || !grid) return;
  grid.replaceChildren();
  const featured = state.all.filter(p => p.featured && p.status !== "sold" && p.status !== "coming").slice(0, 4);
  section.hidden = featured.length === 0;
  featured.forEach(p => grid.appendChild(createProductCard(p, true)));
}
function renderProducts() {
  const grid = $("productGrid"); grid.replaceChildren();
  state.filtered.forEach(p => grid.appendChild(createProductCard(p)));
  $("resultCount").textContent = `Hiển thị ${state.filtered.length} / ${state.all.length} sản phẩm`;
  $("heroCount").textContent = String(state.filtered.length);
  $("emptyState").hidden = state.filtered.length > 0;
}
function openDetails(p) {
  const content = $("modalContent");
  content.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "detail-layout";
  const visual = document.createElement("div");

  if (p.image && /^https?:\/\//i.test(p.image)) {
    const img = document.createElement("img");
    img.className = "detail-image";
    img.src = p.image;
    img.alt = p.name;
    img.style.cursor = "zoom-in";
    img.title = "Bấm để xem ảnh toàn màn hình";
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      openImageViewer(p.image, p.name);
    });
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement("div");
      fallback.className = "detail-image-fallback";
      fallback.textContent = "Không tải được ảnh";
      visual.appendChild(fallback);
    };
    visual.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "detail-image-fallback";
    fallback.textContent = "Chưa có ảnh";
    visual.appendChild(fallback);
  }

  const copy = document.createElement("div");
  copy.className = "detail-copy";

  const category = document.createElement("div");
  category.className = "product-category";
  category.textContent = `${p.category} · ${p.id}`;

  const title = document.createElement("h2");
  title.id = "modalTitle";
  title.textContent = p.name;

  const pricing = document.createElement("div");
  pricing.className = "detail-pricing";
  const price = document.createElement("div");
  price.className = "detail-price current-price";
  price.textContent = p.price === null ? "Liên hệ báo giá" : money(p.price);
  pricing.appendChild(price);
  if (p.originalPrice !== null) {
    const priceMeta = document.createElement("div");
    priceMeta.className = "detail-price-meta";
    const oldPrice = document.createElement("span");
    oldPrice.className = "original-price";
    oldPrice.textContent = `Giá tham chiếu: ${money(p.originalPrice)}`;
    const discount = document.createElement("span");
    discount.className = "discount-badge";
    discount.textContent = `Tiết kiệm ${Math.round((1 - p.price / p.originalPrice) * 100)}%`;
    priceMeta.append(oldPrice, discount);
    pricing.appendChild(priceMeta);
  }

  const status = document.createElement("div");
  status.className = "product-badge" + (p.status === "sold" ? " sold-badge" : "");
  status.style.position = "static";
  status.style.display = "inline-block";
  status.textContent = p.status === "sold" ? "Đã bán" : p.status === "coming" ? "Sắp về hàng" : "Đang nhận tư vấn";

  const desc = document.createElement("p");
  desc.className = "detail-desc";
  desc.textContent = p.description || p.shortDesc || "Chưa có mô tả chi tiết.";

  const note = document.createElement("p");
  note.className = "detail-desc";
  note.textContent = p.contactNote
    ? "Ghi chú: " + p.contactNote
    : "Nhắn shop để xác nhận tình trạng, giá và cách nhận hàng.";

  const contact = document.createElement("a");
  contact.className = "detail-contact";
  contact.textContent = "Liên hệ Zalo ↗";
  contact.href = isPlaceholder(ZALO_URL) ? "#" : ZALO_URL;
  contact.target = "_blank";
  contact.rel = "noopener";
  if (isPlaceholder(ZALO_URL)) {
    contact.addEventListener("click", (event) => {
      event.preventDefault();
      alert("Hãy điền ZALO_URL trong app.js trước khi xuất bản.");
    });
  }

  copy.append(category, title, pricing, status, desc, note, contact);
  layout.append(visual, copy);
  content.appendChild(layout);

  $("productModal").hidden = false;
  document.body.style.overflow = "hidden";
  $("modalClose").focus();
}

function closeDetails() {
  $("productModal").hidden = true;
  document.body.style.overflow = "";
}

let imageViewerElement = null;

function ensureImageViewer() {
  // Tạo cửa sổ xem ảnh bằng JavaScript nên không cần sửa index.html.
  if (imageViewerElement) return imageViewerElement;

  const overlay = document.createElement("div");
  overlay.id = "imageViewer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Xem ảnh tài khoản");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "999999",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    boxSizing: "border-box",
    background: "rgba(0,0,0,.94)",
    cursor: "zoom-out"
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Đóng ảnh");
  Object.assign(close.style, {
    position: "absolute",
    top: "12px",
    right: "18px",
    width: "48px",
    height: "48px",
    border: "0",
    borderRadius: "50%",
    background: "rgba(255,255,255,.18)",
    color: "#fff",
    fontSize: "36px",
    lineHeight: "1",
    cursor: "pointer"
  });

  const image = document.createElement("img");
  image.id = "imageViewerImg";
  image.alt = "";
  Object.assign(image.style, {
    display: "block",
    maxWidth: "96vw",
    maxHeight: "92vh",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    cursor: "default"
  });

  close.addEventListener("click", closeImageViewer);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeImageViewer();
  });
  image.addEventListener("click", (event) => event.stopPropagation());

  overlay.append(close, image);
  document.body.appendChild(overlay);
  imageViewerElement = overlay;
  return overlay;
}

function openImageViewer(src, alt = "") {
  if (!src) return;

  const overlay = ensureImageViewer();
  const image = $("imageViewerImg");

  let message = document.getElementById("imageViewerMessage");
  if (!message) {
    message = document.createElement("div");
    message.id = "imageViewerMessage";
    Object.assign(message.style, {
      display: "none",
      position: "absolute",
      left: "20px",
      right: "20px",
      bottom: "24px",
      color: "#fff",
      textAlign: "center",
      font: "14px/1.5 system-ui, sans-serif",
      zIndex: "2"
    });
    overlay.appendChild(message);
  }

  const originalSrc = String(src).trim();
  const idMatch =
    originalSrc.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    originalSrc.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

  const urls = [originalSrc];
  if (idMatch) {
    const id = idMatch[1];
    urls.push(
      `https://drive.google.com/thumbnail?id=${id}&sz=w2000`,
      `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      `https://drive.google.com/uc?export=view&id=${id}`
    );
  }

  const uniqueUrls = [...new Set(urls)];
  let attempt = 0;
  let timeoutId;

  const showFailure = () => {
    clearTimeout(timeoutId);
    image.onload = null;
    image.onerror = null;
    image.style.display = "none";
    message.replaceChildren();

    const text = document.createElement("div");
    text.textContent =
      "Ảnh không phản hồi hoặc bị Google Drive chặn tải. Hãy mở ảnh gốc để kiểm tra quyền chia sẻ.";
    const link = document.createElement("a");
    link.href = originalSrc;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Mở ảnh gốc trong tab mới ↗";
    Object.assign(link.style, {
      display: "inline-block",
      marginTop: "12px",
      color: "#fff",
      textDecoration: "underline"
    });
    message.append(text, link);
    message.style.display = "block";
    console.error("[Ku-mi] Không tải được ảnh zoom:", uniqueUrls);
  };

  const tryNext = () => {
    clearTimeout(timeoutId);
    if (attempt >= uniqueUrls.length) {
      showFailure();
      return;
    }

    const url = uniqueUrls[attempt++];
    image.onload = () => {
      clearTimeout(timeoutId);
      image.style.display = "block";
      message.style.display = "none";
    };
    image.onerror = tryNext;
    image.src = url;

    // Một số link Drive không báo lỗi ngay mà bị treo; giới hạn mỗi lần thử.
    timeoutId = setTimeout(tryNext, 9000);
  };

  message.style.display = "none";
  message.replaceChildren();
  image.style.display = "block";
  image.alt = alt || "Ảnh sản phẩm";
  overlay.style.display = "flex";
  image.removeAttribute("src");
  tryNext();
}

function closeImageViewer() {
  if (!imageViewerElement) return;
  imageViewerElement.style.display = "none";
  const image = $("imageViewerImg");
  if (image) image.src = "";
}

function bindEvents() {
  ["searchInput", "categoryFilter", "priceFilter", "sortFilter"].forEach((id) => {
    $(id).addEventListener(id === "searchInput" ? "input" : "change", applyFilters);
  });

  $("resetFilters").addEventListener("click", () => {
    $("searchInput").value = "";
    $("categoryFilter").value = "";
    $("priceFilter").value = "";
    $("sortFilter").value = "featured";
    applyFilters();
  });

  $("modalClose").addEventListener("click", closeDetails);
  $("modalBackdrop").addEventListener("click", closeDetails);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeImageViewer();
      closeDetails();
    }
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      $("searchInput").focus();
    }
  });

  $("year").textContent = String(new Date().getFullYear());
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  setContactLinks();

  try {
    await loadProducts();
  } catch (error) {
    console.error("[Ku-mi] Không tải được Google Sheets CSV:", error);
    setStatus(
      "Lỗi tải dữ liệu: " +
        (error.message || "Không rõ nguyên nhân") +
        " Mở F12 → Console/Network để kiểm tra link CSV.",
      "error"
    );
    $("resultCount").textContent = "Không tải được dữ liệu";
    $("heroCount").textContent = "!";
  }
});
