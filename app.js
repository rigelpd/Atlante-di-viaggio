"use strict";

const CONFIG = {
  accessPassword: "Atlante2026",
  adminPassword: "Kerrickleo",
  catalog: {
    giappone: { file: "data/giappone.json", label: "Giappone", subtitle: "Templi, metropoli e foliage d’autunno" },
    filippine: { file: "data/filippine.json", label: "Hong Kong & Filippine", subtitle: "Città verticali, isole e lagune tropicali" },
    "rajasthan-maldive": { file: "data/rajasthan-maldive.json", label: "Rajasthan & Maldive", subtitle: "Dalle spezie del deserto al turchese di Dhigurah" }
  },
  budgetCategories: {
    flights: "Voli", hotels: "Alloggi", tours: "Tour & attività", car_rental: "Trasporti", food: "Cibo", misc: "Varie"
  },
  tourTypes: { boat: "Barca e mare", trekking: "Trekking", cultural: "Cultura", food: "Food experience", wellness: "Relax", transfer: "Trasferimento" },
  timezones: [-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,5.5,6,7,8,9,9.5,10,11,12,13,14]
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
const nl2br = value => escapeHtml(value).replace(/\n/g, "<br>");
const currency = value => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const storageKey = slug => `atlante:${slug}`;
const safeImage = url => url && !url.endsWith("/") ? url : "";
const urlState = new URLSearchParams(window.location.search);

let activeTrip = window.__EMBEDDED_SLUG__ || urlState.get("trip") || localStorage.getItem("atlante:activeTrip") || "rajasthan-maldive";
let currentData = null;
let originalData = null;
let isAdmin = sessionStorage.getItem("atlante:admin") === "true";
let map = null;
let mapLayers = null;
let editorState = null;
let tempRoute = [];
let publishConfig = { trips: {} };
let sessionGithubToken = "";
let publishStateByTrip = {};
let atlasCatalogCache = {};
let mapFilter = "all";
let pendingSharedDay = Number(urlState.get("day"));

const DEFAULT_PUBLISH_TARGETS = {
  giappone: { repository: "rigelpd/Atlante-di-viaggio", branch: "main", path: "data/giappone.json", siteUrl: "https://rigelpd.github.io/Atlante-di-viaggio/" },
  filippine: { repository: "rigelpd/Atlante-di-viaggio", branch: "main", path: "data/filippine.json", siteUrl: "https://rigelpd.github.io/Atlante-di-viaggio/" },
  "rajasthan-maldive": { repository: "rigelpd/Atlante-di-viaggio", branch: "main", path: "data/rajasthan-maldive.json", siteUrl: "https://rigelpd.github.io/Atlante-di-viaggio/" }
};

function repairMojibake(value) {
  if (Array.isArray(value)) return value.map(repairMojibake);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, repairMojibake(v)]));
  if (typeof value !== "string" || !/[Ãâð]/.test(value)) return value;
  try { return decodeURIComponent(escape(value)); } catch { return value; }
}

function normalizeData(raw) {
  const data = repairMojibake(raw || {});
  data.main ||= { title: "Nuovo itinerario", image: "" };
  data.main.title ||= "Nuovo itinerario";
  data.main.image ||= "";
  data.flights = Array.isArray(data.flights) ? data.flights : [];
  data.itinerary = Array.isArray(data.itinerary) ? data.itinerary : [];
  data.tours = Array.isArray(data.tours) ? data.tours : [];
  data.budget ||= { total: 0, expenses: [] };
  data.budget.expenses = Array.isArray(data.budget.expenses) ? data.budget.expenses : [];
  data.usefulLinks = Array.isArray(data.usefulLinks) ? data.usefulLinks : [];
  data.route = Array.isArray(data.route) ? data.route : [];
  return data;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  document.body.classList.add("modal-open");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
  document.body.classList.remove("modal-open");
}

function setAdminMode(enabled) {
  isAdmin = enabled;
  document.body.classList.toggle("admin-mode", enabled);
  sessionStorage.setItem("atlante:admin", String(enabled));
  $("#admin-login-btn").hidden = enabled;
  renderAll();
}

function setAppView(view) {
  const isAtlas = view === "atlas";
  $("#atlas-home").classList.toggle("is-hidden", !isAtlas);
  $("#trip-view").classList.toggle("is-hidden", isAtlas);
  document.body.classList.toggle("atlas-view", isAtlas);
}

function updateUrlState({trip = null, day = null} = {}) {
  if (window.__PUBLIC_EXPORT__) return;
  const url = new URL(window.location.href);
  url.search = "";
  if (trip) url.searchParams.set("trip", trip);
  if (Number.isInteger(day) && day >= 0) url.searchParams.set("day", String(day + 1));
  history.replaceState({}, "", url);
}

async function getCatalogTrip(slug) {
  if (atlasCatalogCache[slug]) return atlasCatalogCache[slug];
  if (slug === activeTrip && currentData) return currentData;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(storageKey(slug))); } catch { data = null; }
  if (!data) {
    const response = await fetch(`${CONFIG.catalog[slug].file}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  }
  atlasCatalogCache[slug] = normalizeData(data);
  return atlasCatalogCache[slug];
}

function catalogRange(data) {
  const first = data.itinerary[0]?.date, last = data.itinerary.at(-1)?.date;
  return first && last ? `${formatDate(first,{month:"short",year:"numeric"})} · ${data.itinerary.length} giorni` : `${data.itinerary.length} giorni`;
}

function renderAtlasHome(trips) {
  $("#atlas-trip-count").textContent = `${trips.length} viaggi nell’atlante`;
  $("#atlas-grid").innerHTML = trips.map(({slug,data},index) => {
    const image = safeImage(data.main.image) || safeImage(data.itinerary.find(day => safeImage(day.image))?.image);
    const locations = new Set(data.itinerary.map(day => day.location?.trim()).filter(Boolean)).size;
    return `<article class="atlas-card ${slug === activeTrip ? "is-current" : ""}" style="--card-index:${index}">
      <div class="atlas-card-media" ${image ? `style="background-image:url('${escapeHtml(image).replace(/'/g,"%27")}')"` : ""}></div>
      <div class="atlas-card-shade"></div>
      <div class="atlas-card-content"><p>${escapeHtml(catalogRange(data))}</p><h3>${escapeHtml(data.main.title || CONFIG.catalog[slug].label)}</h3><span>${locations} tappe · ${escapeHtml(CONFIG.catalog[slug].subtitle)}</span><button class="atlas-card-open" type="button" data-open-trip="${slug}">Esplora <b>→</b></button></div>
    </article>`;
  }).join("");
}

async function showAtlasHome() {
  setAppView("atlas");
  updateUrlState();
  $("#atlas-grid").innerHTML = `<div class="atlas-loading">Sto preparando i tuoi viaggi…</div>`;
  try {
    const trips = await Promise.all(Object.keys(CONFIG.catalog).map(async slug => ({slug,data:await getCatalogTrip(slug)})));
    renderAtlasHome(trips);
  } catch (error) {
    console.error(error);
    $("#atlas-grid").innerHTML = `<div class="empty-state"><h3>Non riesco a caricare la raccolta</h3><p>Riprova tra poco.</p></div>`;
  }
}

async function loadTrip(slug, preferSaved = true) {
  activeTrip = slug in CONFIG.catalog ? slug : "rajasthan-maldive";
  localStorage.setItem("atlante:activeTrip", activeTrip);
  $("#trip-select").value = activeTrip;
  let data = null;

  if (window.__EMBEDDED_DATA__) {
    data = clone(window.__EMBEDDED_DATA__);
    $("#trip-select").disabled = true;
  } else if (preferSaved) {
    try { data = JSON.parse(localStorage.getItem(storageKey(activeTrip))); } catch { data = null; }
  }

  if (!data) {
    try {
      const response = await fetch(`${CONFIG.catalog[activeTrip].file}?v=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (error) {
      showToast("Impossibile caricare i JSON: avvia il sito con avvia-sito.bat.");
      console.error(error);
      data = { main: { title: CONFIG.catalog[activeTrip].label, image: "" }, itinerary: [], flights: [], tours: [], budget: { total: 0, expenses: [] }, usefulLinks: [], route: [] };
    }
  }
  originalData = normalizeData(clone(data));
  currentData = normalizeData(data);
  atlasCatalogCache[activeTrip] = clone(currentData);
  const publishedFingerprint = localStorage.getItem(`atlante:publishedFingerprint:${activeTrip}`);
  const hasUnpublishedLocalData = Boolean(localStorage.getItem(storageKey(activeTrip))) && publishedFingerprint !== fingerprintData(currentData);
  publishStateByTrip[activeTrip] = { ...(publishStateByTrip[activeTrip] || {}), dirty: hasUnpublishedLocalData };
  setPublishIndicator(hasUnpublishedLocalData ? "local" : "clean", hasUnpublishedLocalData ? "Modifiche locali" : "Nessuna modifica");
  setAppView("trip");
  updateUrlState({trip:activeTrip,day:Number.isInteger(pendingSharedDay) && pendingSharedDay > 0 ? pendingSharedDay - 1 : null});
  document.title = `${currentData.main.title || CONFIG.catalog[activeTrip].label} — Atlante`;
  renderAll();
  if (Number.isInteger(pendingSharedDay) && pendingSharedDay > 0) {
    const day = pendingSharedDay - 1;
    pendingSharedDay = NaN;
    setTimeout(() => scrollToDay(day), 120);
  }
}

function saveData(silent = false) {
  if (!currentData || window.__EMBEDDED_DATA__) return;
  try {
    localStorage.setItem(storageKey(activeTrip), JSON.stringify(currentData));
  } catch (error) {
    console.error(error);
    showToast("Memoria del browser piena: le modifiche restano aperte. Pubblicale prima di ricaricare la pagina.");
    return false;
  }
  publishStateByTrip[activeTrip] = { ...(publishStateByTrip[activeTrip] || {}), dirty: true };
  setPublishIndicator("local", "Modifiche locali");
  if (!silent) showToast("Modifiche salvate nel browser.");
  return true;
}

function sortForStableJson(value) {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortForStableJson(value[key])]));
  return value;
}

function fingerprintData(value) {
  return JSON.stringify(sortForStableJson(value));
}

async function loadPublishConfig() {
  try {
    const response = await fetch(`publish-config.json?v=${Date.now()}`);
    if (!response.ok) throw new Error("Configurazione non disponibile");
    publishConfig = await response.json();
  } catch {
    publishConfig = { provider: "github-direct", trips: clone(DEFAULT_PUBLISH_TARGETS) };
  }
  publishConfig.trips = { ...clone(DEFAULT_PUBLISH_TARGETS), ...(publishConfig.trips || {}) };
}

function setPublishIndicator(state, label) {
  const indicator = $("#publish-indicator");
  if (!indicator) return;
  indicator.dataset.state = state;
  $("span", indicator).textContent = label;
}

function setPublishStatus(state, message, link = "", linkLabel = "Apri commit ↗") {
  const status = $("#publish-status");
  if (!status) return;
  status.dataset.state = state;
  $("span", status).innerHTML = link ? `${escapeHtml(message)} <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(linkLabel)}</a>` : escapeHtml(message);
}

function getPublishTarget() {
  const configured = publishConfig.trips?.[activeTrip] || DEFAULT_PUBLISH_TARGETS[activeTrip] || {};
  return { ...configured };
}

function openPublishDialog() {
  const target = getPublishTarget();
  $("#publish-repository").value = target.repository || "";
  $("#publish-branch").value = target.branch || "main";
  $("#publish-path").value = target.path || "itinerary.json";
  $("#publish-token").value = "";
  $("#publish-token").placeholder = sessionGithubToken ? "Token disponibile per questa sessione" : "github_pat_…";
  $("#publish-submit-btn").disabled = false;
  setPublishStatus(target.unconfigured ? "warning" : "idle", target.unconfigured ? "La destinazione proposta non esiste ancora: creala prima di pubblicare." : "Pronto per pubblicare.");
  openDialog($("#publish-dialog"));
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToUtf8(encoded) {
  const binary = atob(String(encoded).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${sessionGithubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { response, payload };
}

function githubErrorMessage(status, payload) {
  if (status === 401) return "Token non valido o scaduto.";
  if (status === 403) return "Il token non ha il permesso Contents: write oppure GitHub ha limitato temporaneamente le richieste.";
  if (status === 404) return "Repository o file non trovato. Controlla destinazione e accesso del token.";
  if (status === 409) return "Conflitto di versione: ricarica la pagina e riprova.";
  if (status === 422) return "GitHub ha rifiutato i dati. Controlla branch e percorso.";
  return payload?.message ? `GitHub: ${payload.message}` : `Pubblicazione non riuscita (${status}).`;
}

async function readPackagedTrip() {
  try {
    const response = await fetch(`${CONFIG.catalog[activeTrip].file}?baseline=${Date.now()}`);
    return response.ok ? normalizeData(await response.json()) : null;
  } catch { return null; }
}

function embeddedImageTargets() {
  const targets = [];
  if (/^data:image\//i.test(currentData?.main?.image || "")) targets.push(currentData.main);
  currentData?.itinerary?.forEach(day => { if (/^data:image\//i.test(day.image || "")) targets.push(day); });
  return targets;
}

function mediaFileDetails(dataUrl,index) {
  const match = String(dataUrl || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([\s\S]+)$/i);
  if (!match) throw new Error("Una delle immagini caricate non è in un formato supportato.");
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return { content:match[2], path:`media/${activeTrip}/${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2,7)}.${extension}` };
}

async function publishEmbeddedImages(repository,branch) {
  const targets = embeddedImageTargets();
  if (!targets.length) return 0;
  for (let index=0;index<targets.length;index++) {
    setPublishStatus("working", `Carico e ottimizzo l’immagine ${index + 1} di ${targets.length}…`);
    const file = mediaFileDetails(targets[index].image,index);
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    const upload = await githubRequest(`https://api.github.com/repos/${repository}/contents/${encodedPath}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message:`Aggiunge immagine per ${currentData.main.title}`, content:file.content.replace(/\s/g,""), branch })
    });
    if (!upload.response.ok) throw new Error(githubErrorMessage(upload.response.status,upload.payload));
    targets[index].image = file.path;
  }
  saveData(true);
  atlasCatalogCache[activeTrip] = clone(currentData);
  return targets.length;
}

async function handlePublish(event) {
  event.preventDefault();
  if (!isAdmin || !currentData) return;
  const repository = $("#publish-repository").value.trim();
  const branch = $("#publish-branch").value.trim() || "main";
  const path = $("#publish-path").value.trim().replace(/^\/+/, "");
  const suppliedToken = $("#publish-token").value.trim();
  if (suppliedToken) sessionGithubToken = suppliedToken;
  $("#publish-token").value = "";

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) { setPublishStatus("error", "Usa il formato utente/repository."); return; }
  if (!branch || !path || path.includes("..")) { setPublishStatus("error", "Branch o percorso JSON non valido."); return; }
  if (!sessionGithubToken) { setPublishStatus("error", "Inserisci il fine-grained token GitHub."); $("#publish-token").focus(); return; }

  const target = { repository, branch, path, siteUrl: getPublishTarget().siteUrl || "", unconfigured: false };
  const button = $("#publish-submit-btn");
  button.disabled = true;
  setPublishIndicator("publishing", "Pubblicazione…");
  setPublishStatus("working", "Controllo la versione presente su GitHub…");

  try {
    const optimizedImages = await optimizeEmbeddedImages();
    if (optimizedImages.count) {
      saveData(true);
      setPublishStatus("working", `${optimizedImages.count} immagini ottimizzate automaticamente. Creo il commit…`);
    }
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const apiUrl = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const currentRemote = await githubRequest(apiUrl);
    let remoteSha = null;
    let remoteData = null;

    if (currentRemote.response.ok) {
      remoteSha = currentRemote.payload.sha;
      try { remoteData = normalizeData(JSON.parse(base64ToUtf8(currentRemote.payload.content))); } catch { remoteData = null; }
    } else if (currentRemote.response.status === 404) {
      const repositoryCheck = await githubRequest(`https://api.github.com/repos/${repository}`);
      if (!repositoryCheck.response.ok) throw new Error(githubErrorMessage(repositoryCheck.response.status, repositoryCheck.payload));
    } else {
      throw new Error(githubErrorMessage(currentRemote.response.status, currentRemote.payload));
    }

    const knownSha = localStorage.getItem(`atlante:remoteSha:${activeTrip}`);
    const packagedData = await readPackagedTrip();
    const remoteChanged = remoteSha && ((knownSha && knownSha !== remoteSha) || (!knownSha && packagedData && remoteData && fingerprintData(packagedData) !== fingerprintData(remoteData)));
    if (remoteChanged && !confirm("La versione online è cambiata rispetto a quella caricata in questo browser. Vuoi sovrascriverla con le modifiche attuali?")) {
      setPublishStatus("warning", "Pubblicazione annullata: la versione online non è stata modificata.");
      setPublishIndicator("local", "Modifiche locali");
      return;
    }

    const uploadedImages = await publishEmbeddedImages(repository,branch);
    if (uploadedImages) setPublishStatus("working", `${uploadedImages} immagini salvate nella libreria del viaggio. Creo il commit…`);
    setPublishStatus("working", "Creo il commit con il nuovo itinerario…");
    const body = {
      message: `Aggiorna ${currentData.main.title} dal sito`,
      content: utf8ToBase64(JSON.stringify(currentData, null, 2)),
      branch
    };
    if (remoteSha) body.sha = remoteSha;
    const update = await githubRequest(`https://api.github.com/repos/${repository}/contents/${encodedPath}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!update.response.ok) throw new Error(githubErrorMessage(update.response.status, update.payload));

    const newContentSha = update.payload.content?.sha || "";
    const commitUrl = update.payload.commit?.html_url || `https://github.com/${repository}/commits/${branch}`;
    try {
      localStorage.setItem(`atlante:remoteSha:${activeTrip}`, newContentSha);
      localStorage.setItem(`atlante:publishedFingerprint:${activeTrip}`, fingerprintData(currentData));
    } catch (storageError) {
      // Il commit GitHub e' gia' riuscito: rimuoviamo soltanto la copia locale, ormai superflua.
      console.warn("Memoria locale piena dopo la pubblicazione", storageError);
      localStorage.removeItem(storageKey(activeTrip));
      try {
        localStorage.setItem(`atlante:remoteSha:${activeTrip}`, newContentSha);
        localStorage.setItem(`atlante:publishedFingerprint:${activeTrip}`, fingerprintData(currentData));
      } catch (retryError) { console.warn("Impossibile salvare lo stato locale della pubblicazione", retryError); }
    }
    publishStateByTrip[activeTrip] = { dirty: false, sha: newContentSha };
    originalData = clone(currentData);
    setPublishIndicator("published", "Pubblicato");
    setPublishStatus("success", "Commit creato. GitHub Pages sta aggiornando il sito.", commitUrl);
    showToast("Pubblicazione completata su GitHub.");
    if (target.siteUrl) monitorPublishedJson(target.siteUrl, target.path, clone(currentData));
  } catch (error) {
    setPublishIndicator("local", "Modifiche locali");
    setPublishStatus("error", error.message || "Pubblicazione non riuscita.");
  } finally {
    button.disabled = false;
  }
}

function monitorPublishedJson(siteUrl, publishedPath, expectedData, attempt = 0) {
  const normalizedBase = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  setTimeout(async () => {
    try {
      const normalizedPath = String(publishedPath || "itinerary.json").replace(/^\/+/, "");
      const response = await fetch(`${normalizedBase}${normalizedPath}?published=${Date.now()}`, { cache: "no-store" });
      const onlineData = response.ok ? normalizeData(await response.json()) : null;
      if (onlineData && fingerprintData(onlineData) === fingerprintData(expectedData)) {
        setPublishIndicator("online", "Online");
        if ($("#publish-dialog")?.open) setPublishStatus("success", "La nuova versione è online.", normalizedBase, "Apri sito ↗");
        return;
      }
    } catch { /* GitHub Pages può essere ancora in propagazione. */ }
    if (attempt < 11) monitorPublishedJson(siteUrl, publishedPath, expectedData, attempt + 1);
  }, 5000);
}

function dateObject(value) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function formatDate(value, options = { weekday: "long", day: "numeric", month: "long" }) {
  const date = dateObject(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("it-IT", options).format(date) : "Data da definire";
}

function tripStats(data = currentData) {
  const days = data.itinerary.length;
  const locations = new Set(data.itinerary.map(item => item.location?.trim()).filter(Boolean)).size;
  const first = data.itinerary[0]?.date;
  const last = data.itinerary.at(-1)?.date;
  return { days, locations, range: first && last ? `${formatDate(first,{day:"numeric",month:"short"})} — ${formatDate(last,{day:"numeric",month:"short",year:"numeric"})}` : "Date aperte" };
}

function renderAll() {
  if (!currentData) return;
  renderHero();
  renderCalendar();
  renderItinerary();
  renderFlights();
  renderTours();
  renderBudget();
  renderLinks();
  renderMapStops();
  if ($('[data-panel="map"]').classList.contains("is-active")) setTimeout(initializeMap, 80);
}

function renderHero() {
  const stats = tripStats();
  $("#trip-title").textContent = currentData.main.title;
  $("#hero-subtitle").textContent = currentData.main.subtitle || CONFIG.catalog[activeTrip]?.subtitle || "Un viaggio costruito giorno dopo giorno.";
  const image = safeImage(currentData.main.image) || currentData.itinerary.find(day => safeImage(day.image))?.image;
  $("#hero-media").style.backgroundImage = image ? `url("${image.replace(/"/g,"%22")}")` : "linear-gradient(135deg,#182a35,#3d7778)";
  $("#hero-stats").innerHTML = `
    <div class="hero-stat"><strong>${stats.days}</strong><span>giorni</span></div>
    <div class="hero-stat"><strong>${stats.locations}</strong><span>tappe</span></div>
    <div class="hero-stat"><strong>${escapeHtml(stats.range)}</strong><span>periodo</span></div>`;
}

function renderCalendar() {
  $("#calendar-summary").innerHTML = currentData.itinerary.map((day,index) => {
    const date = dateObject(day.date);
    const number = date ? date.getDate() : index + 1;
    const month = date ? new Intl.DateTimeFormat("it-IT",{month:"short"}).format(date) : "—";
    return `<button class="calendar-day" type="button" data-jump-day="${index}" aria-label="Vai al giorno ${index+1}, ${escapeHtml(day.location || "")}"><strong>${number}</strong><span>${escapeHtml(month)}</span>${day.isFlight || day.isCruise ? "<i></i>" : ""}</button>`;
  }).join("") || `<p class="empty-state">Aggiungi le date per vedere il calendario.</p>`;
}

function renderItinerary() {
  const container = $("#itinerary-list");
  if (!currentData.itinerary.length) {
    container.innerHTML = `<div class="empty-state"><h3>Nessuna giornata ancora</h3><p>Entra come amministratore e crea il primo giorno.</p></div>`;
    return;
  }
  container.innerHTML = currentData.itinerary.map((day,index) => {
    const image = safeImage(day.image);
    const tags = `${day.isFlight ? '<span class="tag">✈ Volo</span>' : ""}${day.isCruise ? '<span class="tag blue">≈ Barca</span>' : ""}`;
    const mapButton = day.location_coords?.lat && day.location_coords?.lng ? `<button class="day-focus no-print" type="button" data-focus-day="${index}">◎ Mostra sulla mappa</button>` : "";
    return `<article id="day-${index}" class="day-card" style="--i:${Math.min(index,12)}">
      <div class="day-marker"><span class="number">${String(index+1).padStart(2,"0")}</span><time datetime="${escapeHtml(day.date)}">${escapeHtml(formatDate(day.date,{day:"numeric",month:"short"}))}</time></div>
      <div class="day-body">
        <div class="day-copy">
          <p class="day-kicker">Giorno ${String(index+1).padStart(2,"0")} · ${escapeHtml(formatDate(day.date,{weekday:"long",day:"numeric",month:"long"}))}</p>
          <div class="day-location"><h3>${escapeHtml(day.location || "Tappa da definire")}</h3>${tags}</div>
          <p class="day-accommodation">⌂ ${escapeHtml(day.accommodation || "Alloggio da definire")}</p>
          <p class="day-activities">${nl2br(day.activities || "Attività da definire.")}</p>
          <div class="day-story-actions no-print"><button class="text-action" type="button" data-share-day="${index}">Condividi questo giorno <span>↗</span></button></div>
        </div>
        <div class="day-image">
          ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(day.location || "Immagine del viaggio")}" loading="lazy">` : `<div class="day-placeholder"><span>Immagine da aggiungere<br><small>${escapeHtml(day.location || "")}</small></span></div>`}
          <div class="day-actions admin-only no-print"><button class="mini-action" type="button" data-edit-day="${index}">Modifica</button><button class="mini-action" type="button" data-delete-day="${index}">Elimina</button></div>
          ${mapButton}
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderMapStops() {
  const route = (currentData.route || []).map(name => currentData.itinerary.findIndex(day => day.location?.trim() === String(name).trim())).filter(index => index >= 0);
  const stops = route.length ? route : currentData.itinerary.map((_,index) => index).filter((index,value) => !value || currentData.itinerary[index].location !== currentData.itinerary[index-1].location);
  $("#map-stops").innerHTML = stops.map(index => `<button class="map-stop" type="button" data-map-stop="${index}"><span>${String(index+1).padStart(2,"0")}</span>${escapeHtml(currentData.itinerary[index].location || "Tappa")}</button>`).join("");
}

function timezoneLabel(value) {
  const n = Number(value) || 0;
  const sign = n >= 0 ? "+" : "−";
  const absolute = Math.abs(n);
  const hour = String(Math.floor(absolute)).padStart(2,"0");
  const minutes = String(Math.round((absolute % 1) * 60)).padStart(2,"0");
  return `UTC${sign}${hour}:${minutes}`;
}

function formatDateTime(value) {
  if (!value) return "Da confermare";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Da confermare" : new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date);
}

function flightDuration(flight) {
  if (!flight.depTime || !flight.arrTime) return "Orari da confermare";
  const offset = n => {
    const sign = n >= 0 ? "+" : "-", abs = Math.abs(Number(n)||0);
    return `${sign}${String(Math.floor(abs)).padStart(2,"0")}:${String(Math.round(abs%1*60)).padStart(2,"0")}`;
  };
  const dep = new Date(`${flight.depTime}:00${offset(flight.depTz)}`);
  const arr = new Date(`${flight.arrTime}:00${offset(flight.arrTz)}`);
  const minutes = Math.round((arr - dep) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "Durata da verificare";
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  return `${days ? `${days}g ` : ""}${hours}h ${mins}m`;
}

function renderFlights() {
  const list = $("#flights-list");
  if (!currentData.flights.length) { list.innerHTML = `<div class="empty-state"><h3>Nessun volo inserito</h3><p>Gli spostamenti aerei compariranno qui.</p></div>`; return; }
  list.innerHTML = currentData.flights.map((flight,index) => `<article class="data-card">
    <div class="data-card-head"><div><p class="eyebrow">Volo ${String(index+1).padStart(2,"0")}</p><h3>${escapeHtml(flight.title || "Volo da definire")}</h3></div><div class="admin-only"><button class="delete-button" type="button" data-edit-flight="${index}">Modifica</button><button class="delete-button" type="button" data-delete-flight="${index}">Elimina</button></div></div>
    <div class="route-airports"><div class="airport"><strong>${escapeHtml(flight.depAirport || "Partenza")}</strong><span>${timezoneLabel(flight.depTz)}</span></div><div class="flight-line"></div><div class="airport"><strong>${escapeHtml(flight.arrAirport || "Arrivo")}</strong><span>${timezoneLabel(flight.arrTz)}</span></div></div>
    <div class="flight-times"><span>${escapeHtml(formatDateTime(flight.depTime))}</span><span>${escapeHtml(formatDateTime(flight.arrTime))}</span></div>
    <span class="duration-pill">${escapeHtml(flightDuration(flight))}</span>
  </article>`).join("");
}

function renderTours() {
  const list = $("#tours-list");
  if (!currentData.tours.length) { list.innerHTML = `<div class="empty-state"><h3>Nessuna esperienza separata</h3><p>Le attività giornaliere restano visibili nell’itinerario.</p></div>`; return; }
  list.innerHTML = currentData.tours.map((tour,index) => `<article class="data-card">
    <div class="data-card-head"><div><p class="eyebrow">${escapeHtml(CONFIG.tourTypes[tour.type] || "Esperienza")}</p><h3>${escapeHtml(tour.title || "Esperienza")}</h3></div><div class="admin-only"><button class="delete-button" type="button" data-edit-tour="${index}">Modifica</button><button class="delete-button" type="button" data-delete-tour="${index}">Elimina</button></div></div>
    <div class="tour-meta"><span class="tag blue">${escapeHtml(formatDateTime(tour.depTime))}</span>${tour.arrTime ? `<span class="tag">fine ${escapeHtml(formatDateTime(tour.arrTime))}</span>` : ""}</div>
    <p class="tour-description">${nl2br(tour.description || "Dettagli da aggiungere.")}</p>
  </article>`).join("");
}

function budgetTotals() {
  const expenses = currentData.budget.expenses;
  const paid = expenses.filter(e => e.status === "paid").reduce((sum,e) => sum + Number(e.amount || 0),0);
  const booked = expenses.filter(e => e.status !== "paid").reduce((sum,e) => sum + Number(e.amount || 0),0);
  const total = Number(currentData.budget.total || 0);
  return { paid, booked, spent: paid + booked, total, remaining: total - paid - booked };
}

function renderBudget() {
  const totals = budgetTotals();
  const paidPct = totals.total ? Math.min(100, totals.paid / totals.total * 100) : 0;
  const bookedPct = totals.total ? Math.min(100-paidPct, totals.booked / totals.total * 100) : 0;
  const expenses = currentData.budget.expenses.map((expense,index) => `<div class="expense-row">
    <div class="expense-row-main"><strong>${escapeHtml(expense.description || "Spesa")}</strong><span>${escapeHtml(CONFIG.budgetCategories[expense.category] || expense.category || "Varie")} · ${escapeHtml(expense.person || "—")}${expense.onSplid ? " · Splid" : ""}</span></div>
    <div class="expense-amount"><strong>${currency(expense.amount)}</strong><button class="status ${expense.status === "paid" ? "" : "booked"} admin-only" type="button" data-toggle-expense="${index}">${expense.status === "paid" ? "Pagata" : "Prenotata"}</button><span class="status ${expense.status === "paid" ? "" : "booked"} user-only">${expense.status === "paid" ? "Pagata" : "Prenotata"}</span><label class="splid-control admin-only"><input type="checkbox" data-toggle-splid="${index}" ${expense.onSplid ? "checked" : ""}> Splid</label><button class="delete-button admin-only" type="button" data-delete-expense="${index}">Elimina</button></div>
  </div>`).join("");
  $("#budget-content").innerHTML = `
    <div class="budget-hero">
      <div class="budget-total"><span>Budget complessivo</span><strong>${currency(totals.total)}</strong><span>${currency(totals.spent)} impegnati</span><div class="budget-progress"><div class="paid" style="width:${paidPct}%"></div><div class="booked" style="width:${bookedPct}%"></div></div></div>
      <div class="budget-stats"><div class="budget-stat"><span>Pagato</span><strong>${currency(totals.paid)}</strong></div><div class="budget-stat"><span>Rimanente</span><strong>${currency(totals.remaining)}</strong></div></div>
    </div>
    <div class="expense-layout">
      <form id="expense-form" class="expense-form admin-only"><h3>Aggiungi una spesa</h3><div class="form-grid">
        <div class="field full"><label for="expense-description">Descrizione</label><input id="expense-description" required></div>
        <div class="field"><label for="expense-amount">Importo (€)</label><input id="expense-amount" type="number" min="0" step=".01" required></div>
        <div class="field"><label for="expense-category">Categoria</label><select id="expense-category">${Object.entries(CONFIG.budgetCategories).map(([k,v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div class="field"><label for="expense-person">Pagato da</label><input id="expense-person" required></div>
        <div class="field"><label for="expense-status">Stato</label><select id="expense-status"><option value="paid">Pagata</option><option value="booked">Prenotata</option></select></div>
        <label class="check-field full"><input id="expense-splid" type="checkbox"> Inserita su Splid</label>
        <div class="field full"><label for="budget-total-input">Budget totale</label><input id="budget-total-input" type="number" min="0" step="1" value="${totals.total}"></div>
        <button class="button button-primary full" type="submit">Aggiungi spesa</button>
      </div></form>
      <div class="expense-list">${expenses || '<div class="empty-state">Nessuna spesa registrata.</div>'}</div>
    </div>`;
}

function renderLinks() {
  const links = currentData.usefulLinks.map((link,index) => `<div class="link-row"><div class="link-row-main"><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(link.title || "Link")}</strong></a><span>${escapeHtml(link.url)}</span></div><button class="delete-button admin-only" type="button" data-delete-link="${index}">Elimina</button></div>`).join("");
  const checklist = (currentData.checklist || []).map(item => `<label class="checklist-row"><input type="checkbox" data-checklist-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span></label>`).join("");
  const practical = (currentData.practicalInfo || []).map(item => `<article class="practical-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></article>`).join("");
  $("#links-content").innerHTML = `<div class="links-layout">
    <form id="link-form" class="links-form admin-only"><h3>Aggiungi un link</h3><div class="form-grid"><div class="field full"><label for="link-title">Titolo</label><input id="link-title" required></div><div class="field full"><label for="link-url">Indirizzo web</label><input id="link-url" type="url" required></div><button class="button button-primary full">Aggiungi link</button></div></form>
    <div class="links-list">${links || '<div class="empty-state">Nessun link aggiunto.</div>'}</div>
  </div>${checklist ? `<div class="resource-heading"><p class="eyebrow">Checklist</p><h3>Prima di chiudere la valigia.</h3></div><div class="checklist-grid">${checklist}</div>` : ""}${practical ? `<div class="resource-heading"><p class="eyebrow">Da sapere</p><h3>Piccole informazioni, grandi differenze.</h3></div><div class="practical-grid">${practical}</div>` : ""}`;
  $$('[data-checklist-id]').forEach(input => {
    const key = `atlante:check:${activeTrip}:${input.dataset.checklistId}`;
    input.checked = localStorage.getItem(key) === "true";
    input.addEventListener("change", () => localStorage.setItem(key,String(input.checked)));
  });
}

function switchPanel(name) {
  $$(".section-tab").forEach(button => button.classList.toggle("is-active", button.dataset.tab === name));
  $$(".content-panel").forEach(panel => panel.classList.toggle("is-active", panel.dataset.panel === name));
  if (name === "map") setTimeout(initializeMap, 80);
  $("#section-nav").scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToDay(index) {
  if (!currentData.itinerary[index]) return;
  switchPanel("itinerary");
  updateUrlState({trip:activeTrip,day:index});
  setTimeout(() => $("#day-" + index)?.scrollIntoView({behavior:"smooth",block:"center"}), 100);
}

function updateMapFilter() {
  if (!map || !mapLayers) return;
  const visibility = {
    all: ["places","hotels","travel","routeLayer"],
    stops: ["places","routeLayer"],
    stays: ["hotels"],
    travel: ["travel","routeLayer"]
  }[mapFilter] || ["places","hotels","travel","routeLayer"];
  Object.entries(mapLayers).forEach(([name,layer]) => {
    if (!layer || name === "markers") return;
    if (visibility.includes(name) && !map.hasLayer(layer)) layer.addTo(map);
    if (!visibility.includes(name) && map.hasLayer(layer)) map.removeLayer(layer);
  });
  $$("[data-map-filter]").forEach(button => button.classList.toggle("is-active",button.dataset.mapFilter === mapFilter));
}

function initializeMap() {
  if (!window.L || !$("#map") || !currentData) return;
  if (map) map.remove();
  const street = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "© OpenStreetMap © CARTO" });
  const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap, SRTM" });
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Tiles © Esri" });
  map = L.map("map", { center: [25,70], zoom: 4, layers: [street], zoomControl: true });
  const places = L.layerGroup().addTo(map), hotels = L.layerGroup().addTo(map), travel = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
  const bounds = [];
  const byLocation = new Map();
  currentData.itinerary.forEach((day,index) => {
    if (!day.location_coords?.lat || !day.location_coords?.lng) return;
    const key = `${day.location_coords.lat},${day.location_coords.lng}`;
    if (!byLocation.has(key)) byLocation.set(key,{...day,index,dates:[]});
    byLocation.get(key).dates.push(day.date);
    bounds.push([day.location_coords.lat,day.location_coords.lng]);
    if (day.accommodation_coords?.lat && day.accommodation_coords?.lng) {
      L.circleMarker([day.accommodation_coords.lat,day.accommodation_coords.lng],{radius:7,color:"#fff",weight:2,fillColor:"#368f9d",fillOpacity:1}).bindPopup(`<strong>${escapeHtml(day.accommodation)}</strong>`).addTo(hotels);
    }
    if (day.isFlight || day.isCruise) {
      const label = day.isFlight ? "Spostamento aereo" : "Spostamento in barca";
      L.circleMarker([day.location_coords.lat,day.location_coords.lng],{radius:6,color:"#fff",weight:2,fillColor:"#d7a34b",fillOpacity:1}).bindPopup(`<strong>${label}</strong><br><small>${escapeHtml(day.location)}</small>`).on("click", () => scrollToDay(index)).addTo(travel);
    }
  });
  byLocation.forEach(place => {
    L.circleMarker([place.location_coords.lat,place.location_coords.lng],{radius:9,color:"#fff",weight:3,fillColor:"#f06d54",fillOpacity:1}).bindPopup(`<strong>${escapeHtml(place.location)}</strong><br><small>${place.dates.map(d => escapeHtml(formatDate(d,{day:"numeric",month:"short"}))).join(" · ")}</small>`).on("click", () => scrollToDay(place.index)).addTo(places);
  });
  const routePoints = (currentData.route || []).map(name => currentData.itinerary.find(day => day.location?.trim() === String(name).trim())?.location_coords).filter(coords => coords?.lat && coords?.lng).map(coords => [coords.lat,coords.lng]);
  if (routePoints.length > 1) L.polyline(routePoints,{color:"#f06d54",weight:3,opacity:.86,dashArray:"7 9",className:"route-pulse"}).addTo(routeLayer);
  L.control.layers({"Stradale":street,"Satellite":satellite,"Topografica":topo},{"Tappe":places,"Percorso":routeLayer,"Alloggi":hotels,"Spostamenti":travel},{collapsed:true}).addTo(map);
  if (bounds.length) map.fitBounds(bounds,{padding:[35,35],maxZoom:8});
  mapLayers = { places, hotels, travel, routeLayer };
  updateMapFilter();
  setTimeout(() => map.invalidateSize(), 100);
}

function focusDayOnMap(index) {
  const day = currentData.itinerary[index];
  if (!day?.location_coords?.lat) return;
  switchPanel("map");
  setTimeout(() => map?.flyTo([day.location_coords.lat,day.location_coords.lng],12,{duration:1.1}),200);
}

function shareLink(day = null) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("trip",activeTrip);
  if (Number.isInteger(day) && day >= 0) url.searchParams.set("day",String(day + 1));
  return url.toString();
}

function openShareDialog(day = null) {
  const url = shareLink(day);
  $("#share-url").value = url;
  $("#share-qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=svg&data=${encodeURIComponent(url)}`;
  $("#share-qr").alt = `QR code per ${currentData.main.title || "questo itinerario"}`;
  openDialog($("#share-dialog"));
}

async function shareTrip(day = null) {
  const url = shareLink(day);
  const title = day === null ? currentData.main.title : `${currentData.main.title} — Giorno ${day + 1}`;
  if (navigator.share) {
    try { await navigator.share({title,text:"Apri questo itinerario su Atlante.",url}); return; } catch (error) { if (error?.name === "AbortError") return; }
  }
  openShareDialog(day);
}

async function copyShareLink() {
  const input = $("#share-url");
  try { await navigator.clipboard.writeText(input.value); showToast("Link copiato negli appunti."); }
  catch { input.select(); document.execCommand("copy"); showToast("Link copiato negli appunti."); }
}

function fieldMarkup({id,label,type="text",value="",full=false,options=null,step=null,placeholder=""}) {
  const cls = full ? "field full" : "field";
  if (type === "textarea") return `<div class="${cls}"><label for="${id}">${escapeHtml(label)}</label><textarea id="${id}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></div>`;
  if (type === "select") return `<div class="${cls}"><label for="${id}">${escapeHtml(label)}</label><select id="${id}">${options.map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value)===String(value)?"selected":""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>`;
  return `<div class="${cls}"><label for="${id}">${escapeHtml(label)}</label><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${step ? `step="${step}"` : ""} placeholder="${escapeHtml(placeholder)}"></div>`;
}

function openEditor(type,index = null) {
  editorState = { type,index };
  const fields = $("#editor-fields");
  const title = $("#editor-title");
  let html = "";
  if (type === "day") {
    const day = index === null ? {} : currentData.itinerary[index];
    title.textContent = index === null ? "Nuovo giorno" : `Giorno ${index+1}`;
    html = fieldMarkup({id:"ed-date",label:"Data",type:"date",value:day.date}) + fieldMarkup({id:"ed-location",label:"Località",value:day.location}) +
      fieldMarkup({id:"ed-accommodation",label:"Alloggio",value:day.accommodation,full:true}) + fieldMarkup({id:"ed-activities",label:"Attività",type:"textarea",value:day.activities,full:true}) +
      fieldMarkup({id:"ed-image",label:"URL immagine",type:"url",value:day.image,full:true}) + fieldMarkup({id:"ed-lat",label:"Latitudine tappa",type:"number",step:"any",value:day.location_coords?.lat}) + fieldMarkup({id:"ed-lng",label:"Longitudine tappa",type:"number",step:"any",value:day.location_coords?.lng}) +
      fieldMarkup({id:"ed-hotel-lat",label:"Latitudine alloggio",type:"number",step:"any",value:day.accommodation_coords?.lat}) + fieldMarkup({id:"ed-hotel-lng",label:"Longitudine alloggio",type:"number",step:"any",value:day.accommodation_coords?.lng}) +
      `<div class="editor-checks full"><label><input id="ed-flight" type="checkbox" ${day.isFlight?"checked":""}> Giorno di volo</label><label><input id="ed-cruise" type="checkbox" ${day.isCruise?"checked":""}> Barca/crociera</label><label class="button button-soft" for="ed-image-file">Carica immagine</label><button id="ed-github-open" class="button button-soft" type="button">Scegli da GitHub</button><input id="ed-image-file" type="file" accept="image/*" hidden></div>`;
  } else if (type === "flight") {
    const flight = index === null ? {} : currentData.flights[index];
    title.textContent = index === null ? "Nuovo volo" : "Modifica volo";
    const tzOptions = CONFIG.timezones.map(v => ({value:v,label:timezoneLabel(v)}));
    html = fieldMarkup({id:"ed-title",label:"Titolo",value:flight.title,full:true}) + fieldMarkup({id:"ed-dep-airport",label:"Aeroporto di partenza",value:flight.depAirport}) + fieldMarkup({id:"ed-arr-airport",label:"Aeroporto di arrivo",value:flight.arrAirport}) + fieldMarkup({id:"ed-dep-time",label:"Partenza",type:"datetime-local",value:flight.depTime}) + fieldMarkup({id:"ed-arr-time",label:"Arrivo",type:"datetime-local",value:flight.arrTime}) + fieldMarkup({id:"ed-dep-tz",label:"Fuso partenza",type:"select",value:flight.depTz ?? 1,options:tzOptions}) + fieldMarkup({id:"ed-arr-tz",label:"Fuso arrivo",type:"select",value:flight.arrTz ?? 1,options:tzOptions});
  } else if (type === "tour") {
    const tour = index === null ? {} : currentData.tours[index];
    title.textContent = index === null ? "Nuova esperienza" : "Modifica esperienza";
    html = fieldMarkup({id:"ed-title",label:"Titolo",value:tour.title,full:true}) + fieldMarkup({id:"ed-dep-time",label:"Inizio",type:"datetime-local",value:tour.depTime}) + fieldMarkup({id:"ed-arr-time",label:"Fine",type:"datetime-local",value:tour.arrTime}) + fieldMarkup({id:"ed-tour-type",label:"Tipologia",type:"select",value:tour.type || "cultural",options:Object.entries(CONFIG.tourTypes).map(([value,label])=>({value,label})),full:true}) + fieldMarkup({id:"ed-description",label:"Descrizione",type:"textarea",value:tour.description,full:true});
  } else if (type === "cover") {
    title.textContent = "Copertina del viaggio";
    html = fieldMarkup({id:"ed-title",label:"Titolo",value:currentData.main.title,full:true}) + fieldMarkup({id:"ed-subtitle",label:"Sottotitolo",value:currentData.main.subtitle || CONFIG.catalog[activeTrip].subtitle,full:true}) + fieldMarkup({id:"ed-image",label:"URL immagine di copertina",type:"url",value:currentData.main.image,full:true}) + `<div class="editor-checks full"><label class="button button-soft" for="ed-image-file">Carica immagine</label><button id="ed-github-open" class="button button-soft" type="button">Scegli da GitHub</button><input id="ed-image-file" type="file" accept="image/*" hidden></div>`;
  } else if (type === "dates") {
    title.textContent = "Date del viaggio";
    html = fieldMarkup({id:"ed-start",label:"Nuova data di inizio",type:"date",value:currentData.itinerary[0]?.date}) + fieldMarkup({id:"ed-end",label:"Nuova data di fine",type:"date",value:currentData.itinerary.at(-1)?.date}) + `<p class="modal-copy full">Le giornate intermedie verranno ricreate in sequenza. Se la durata cambia, saranno aggiunti o rimossi giorni alla fine.</p>`;
  }
  fields.innerHTML = html;
  const file = $("#ed-image-file");
  if (file) file.addEventListener("change", async event => {
    const dataUrl = await compressImage(event.target.files[0]);
    let urlInput = $("#ed-image");
    if (!urlInput) { urlInput = document.createElement("input"); urlInput.id = "ed-image"; urlInput.hidden = true; fields.append(urlInput); }
    urlInput.value = dataUrl;
    showToast("Immagine pronta: salva per applicarla.");
  });
  $("#ed-github-open")?.addEventListener("click", () => { $("#github-grid").innerHTML = ""; $("#github-feedback").textContent = ""; openDialog($("#github-dialog")); });
  openDialog($("#editor-dialog"));
}

async function fetchGithubImages(event) {
  event.preventDefault();
  const user = $("#github-user").value.trim(), repo = $("#github-repo").value.trim();
  const feedback = $("#github-feedback"), grid = $("#github-grid");
  feedback.textContent = "Caricamento…"; grid.innerHTML = "";
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contents`);
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const files = (await response.json()).filter(file => file.type === "file" && /\.(jpe?g|png|webp|gif)$/i.test(file.name));
    if (!files.length) { feedback.textContent = "Nessuna immagine nella cartella principale."; return; }
    feedback.textContent = `${files.length} immagini trovate. Selezionane una.`;
    grid.innerHTML = files.map(file => `<button type="button" data-github-image="${escapeHtml(file.download_url)}"><img src="${escapeHtml(file.download_url)}" alt="${escapeHtml(file.name)}" loading="lazy"><span>${escapeHtml(file.name)}</span></button>`).join("");
  } catch (error) { console.error(error); feedback.textContent = "Repository non trovato o limite GitHub raggiunto."; }
}

function numberOrUndefined(value) { const n = Number(value); return value !== "" && Number.isFinite(n) ? n : undefined; }

function saveEditor() {
  if (!editorState) return;
  const {type,index} = editorState;
  if (type === "day") {
    const previous = index === null ? {} : currentData.itinerary[index];
    const item = { date:$("#ed-date").value, location:$("#ed-location").value.trim(), isFlight:$("#ed-flight").checked, isCruise:$("#ed-cruise").checked, accommodation:$("#ed-accommodation").value.trim(), activities:$("#ed-activities").value.trim(), image:$("#ed-image").value.trim(), location_coords:{lat:numberOrUndefined($("#ed-lat").value),lng:numberOrUndefined($("#ed-lng").value)}, accommodation_coords:{lat:numberOrUndefined($("#ed-hotel-lat").value),lng:numberOrUndefined($("#ed-hotel-lng").value)} };
    if (!item.location_coords.lat) delete item.location_coords;
    if (!item.accommodation_coords.lat) delete item.accommodation_coords;
    Object.keys(previous).filter(k => !(k in item)).forEach(k => item[k] = previous[k]);
    if (index === null) currentData.itinerary.push(item); else currentData.itinerary[index] = item;
    currentData.itinerary.sort((a,b) => String(a.date).localeCompare(String(b.date)));
  } else if (type === "flight") {
    const flight = { idPrefix: index === null ? makeId("flight") : currentData.flights[index].idPrefix, title:$("#ed-title").value.trim(), depAirport:$("#ed-dep-airport").value.trim(), arrAirport:$("#ed-arr-airport").value.trim(), depTime:$("#ed-dep-time").value, arrTime:$("#ed-arr-time").value, depTz:Number($("#ed-dep-tz").value), arrTz:Number($("#ed-arr-tz").value) };
    if (index === null) currentData.flights.push(flight); else currentData.flights[index] = flight;
  } else if (type === "tour") {
    const tour = { id:index === null ? Date.now() : currentData.tours[index].id, title:$("#ed-title").value.trim(), depTime:$("#ed-dep-time").value, arrTime:$("#ed-arr-time").value, type:$("#ed-tour-type").value, description:$("#ed-description").value.trim() };
    if (index === null) currentData.tours.push(tour); else currentData.tours[index] = tour;
  } else if (type === "cover") {
    currentData.main.title = $("#ed-title").value.trim(); currentData.main.subtitle = $("#ed-subtitle").value.trim(); currentData.main.image = $("#ed-image").value.trim();
  } else if (type === "dates") {
    applyDateRange($("#ed-start").value,$("#ed-end").value);
  }
  closeDialog($("#editor-dialog"));
  saveData(true); renderAll(); showToast("Modifica applicata.");
}

function applyDateRange(startValue,endValue) {
  const start = dateObject(startValue), end = dateObject(endValue);
  if (!start || !end || end < start) { showToast("Controlla l’intervallo di date."); return; }
  const count = Math.round((end-start)/86400000)+1;
  const days = [];
  for (let i=0;i<count;i++) {
    const date = new Date(start); date.setDate(start.getDate()+i);
    const previous = currentData.itinerary[i] || { location:"",accommodation:"",activities:"",image:"",isFlight:false,isCruise:false };
    days.push({...previous,date:date.toISOString().slice(0,10)});
  }
  currentData.itinerary = days;
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.ceil(base64.length * 3 / 4);
}

function canvasToCompressedDataUrl(image,maxSize=1200,targetBytes=120*1024) {
  const sourceMax = Math.max(image.width,image.height) || 1;
  let scale = Math.min(1,maxSize/sourceMax);
  let result = "";
  for (let attempt=0;attempt<6;attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(image.width*scale));
    canvas.height = Math.max(1,Math.round(image.height*scale));
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.78,.68,.58,.5]) {
      result = canvas.toDataURL("image/jpeg",quality);
      if (dataUrlBytes(result) <= targetBytes) return result;
    }
    scale *= .82;
  }
  return result;
}

function compressImage(file,maxSize=1200,targetBytes=120*1024) {
  if (!file) return Promise.resolve("");
  return new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onerror=reject; reader.onload=() => {
      const image = new Image(); image.onerror=reject; image.onload=() => {
        resolve(canvasToCompressedDataUrl(image,maxSize,targetBytes));
      }; image.src=reader.result;
    }; reader.readAsDataURL(file);
  });
}

function compressDataUrl(dataUrl,maxSize=1200,targetBytes=120*1024) {
  return new Promise((resolve,reject) => {
    const image = new Image(); image.onerror=reject; image.onload=() => resolve(canvasToCompressedDataUrl(image,maxSize,targetBytes)); image.src=dataUrl;
  });
}

async function optimizeEmbeddedImages() {
  if (!currentData) return {count:0,before:0,after:0};
  const images = [];
  if (/^data:image\//i.test(currentData.main.image || "") && dataUrlBytes(currentData.main.image) > 120*1024) images.push(currentData.main);
  currentData.itinerary.forEach(day => { if (/^data:image\//i.test(day.image || "") && dataUrlBytes(day.image) > 120*1024) images.push(day); });
  if (!images.length) return {count:0,before:0,after:0};
  const before = images.reduce((total,item) => total + dataUrlBytes(item.image),0);
  for (const item of images) item.image = await compressDataUrl(item.image);
  return {count:images.length,before,after:images.reduce((total,item) => total + dataUrlBytes(item.image),0)};
}

function deleteItem(collection,index,label) {
  if (!confirm(`Eliminare ${label}?`)) return;
  currentData[collection].splice(index,1); saveData(true); renderAll(); showToast("Elemento eliminato.");
}

function openRouteEditor() {
  tempRoute = [...(currentData.route || [])];
  const unique = [...new Set(currentData.itinerary.map(day => day.location?.trim()).filter(Boolean))];
  $("#route-location-select").innerHTML = unique.map(location => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join("");
  renderRouteList(); openDialog($("#route-dialog"));
}

function renderRouteList() {
  $("#route-list").innerHTML = tempRoute.map((name,index) => `<li><span>${escapeHtml(name)}</span><button class="delete-button" type="button" data-remove-route="${index}">Rimuovi</button></li>`).join("") || `<li><span>Nessuna tappa nel percorso.</span></li>`;
}

function exportJSON() {
  saveData(true); downloadBlob(JSON.stringify(currentData,null,2),`${activeTrip}.json`,"application/json"); showToast("JSON esportato.");
}

function downloadBlob(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type})); const link=document.createElement("a"); link.href=url; link.download=name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
}

async function importJSON(file) {
  if (!file) return;
  try {
    const parsed=normalizeData(JSON.parse(await file.text()));
    if (!parsed.main || !parsed.itinerary) throw new Error("Schema non valido");
    currentData=parsed; saveData(true); renderAll(); showToast("JSON importato correttamente.");
  } catch(error) { console.error(error); showToast("Il file JSON non è valido."); }
}

function dataForStandaloneExport() {
  const data = clone(currentData);
  const makeAbsolute = image => image && !/^(https?:|data:)/i.test(image) ? new URL(image,window.location.href).toString() : image;
  data.main.image = makeAbsolute(data.main.image);
  data.itinerary.forEach(day => { day.image = makeAbsolute(day.image); });
  return data;
}

async function exportPublicHTML() {
  try {
    const [css,js,html] = await Promise.all([fetch("styles.css").then(r=>r.text()),fetch("app.js").then(r=>r.text()),fetch("index.html").then(r=>r.text())]);
    const parser = new DOMParser(); const doc=parser.parseFromString(html,"text/html");
    doc.querySelector('link[href="styles.css"]')?.replaceWith(Object.assign(doc.createElement("style"),{textContent:css}));
    doc.querySelector('script[src="app.js"]')?.remove();
    const embedded=doc.createElement("script"); embedded.textContent=`window.__EMBEDDED_SLUG__=${JSON.stringify(activeTrip)};window.__EMBEDDED_DATA__=${JSON.stringify(dataForStandaloneExport()).replace(/<\//g,"<\\/")};window.__PUBLIC_EXPORT__=true;`; doc.body.append(embedded);
    const script=doc.createElement("script"); script.textContent=js; doc.body.append(script);
    doc.querySelector("#access-screen")?.classList.add("is-hidden");
    doc.querySelector("#app-shell")?.classList.remove("is-hidden");
    downloadBlob(`<!doctype html>\n${doc.documentElement.outerHTML}`,`${activeTrip}-pubblico.html`,"text/html"); showToast("HTML pubblico esportato.");
  } catch(error) { console.error(error); showToast("Esportazione non riuscita. Avvia il sito dal server locale."); }
}

async function savePDF(scale=2) {
  closeDialog($("#pdf-dialog"));
  if (!window.html2canvas || !window.jspdf) { window.print(); return; }
  showToast("Sto preparando il PDF…");
  const activeName = $$(".section-tab").find(b=>b.classList.contains("is-active"))?.dataset.tab || "itinerary";
  $$(".content-panel").forEach(panel => panel.classList.toggle("is-active",panel.dataset.panel !== "map"));
  try {
    const target=$("#main-content"); const canvas=await html2canvas(target,{scale,useCORS:true,backgroundColor:"#f7f3eb",logging:false,windowWidth:1200});
    const {jsPDF}=window.jspdf; const pdf=new jsPDF("p","mm","a4"); const pageW=210,pageH=297,margin=8,imgW=pageW-margin*2,imgH=canvas.height*imgW/canvas.width;
    const image=canvas.toDataURL("image/jpeg",.84); let offset=0,remaining=imgH;
    pdf.addImage(image,"JPEG",margin,margin,imgW,imgH); remaining-=pageH-margin*2;
    while(remaining>0){ offset-=pageH-margin*2; pdf.addPage(); pdf.addImage(image,"JPEG",margin,offset+margin,imgW,imgH); remaining-=pageH-margin*2; }
    pdf.save(`itinerario-${activeTrip}.pdf`); showToast("PDF creato.");
  } catch(error) { console.error(error); window.print(); }
  switchPanel(activeName);
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  currentData.budget.total=Number($("#budget-total-input").value)||0;
  currentData.budget.expenses.push({id:Date.now(),description:$("#expense-description").value.trim(),amount:Number($("#expense-amount").value)||0,category:$("#expense-category").value,person:$("#expense-person").value.trim(),status:$("#expense-status").value,onSplid:$("#expense-splid").checked});
  saveData(true); renderBudget(); showToast("Spesa aggiunta.");
}

function handleLinkSubmit(event) {
  event.preventDefault(); currentData.usefulLinks.push({id:Date.now(),title:$("#link-title").value.trim(),url:$("#link-url").value.trim()}); saveData(true); renderLinks(); showToast("Link aggiunto.");
}

function setupEvents() {
  $("#access-form").addEventListener("submit",event=>{event.preventDefault();if($("#access-password").value===CONFIG.accessPassword){sessionStorage.setItem("atlante:access","true");$("#access-screen").classList.add("is-hidden");$("#app-shell").classList.remove("is-hidden");urlState.has("trip") ? loadTrip(activeTrip) : showAtlasHome();}else{$("#access-error").hidden=false;$("#access-password").select();}});
  $$('[data-toggle-password]').forEach(button=>button.addEventListener("click",()=>{const input=$(`#${button.dataset.togglePassword}`);input.type=input.type==="password"?"text":"password";}));
  $("#trip-select").addEventListener("change",event=>loadTrip(event.target.value));
  $("#atlas-home-btn").addEventListener("click",showAtlasHome);
  $("#atlas-open-current").addEventListener("click",()=>loadTrip(activeTrip));
  $("#admin-login-btn").addEventListener("click",()=>openDialog($("#admin-dialog")));
  $("#admin-form").addEventListener("submit",event=>{event.preventDefault();if($("#admin-password").value===CONFIG.adminPassword){closeDialog($("#admin-dialog"));setAdminMode(true);showToast("Modalità editor attiva.");}else{$("#admin-error").hidden=false;}});
  $("#admin-logout-btn").addEventListener("click",()=>setAdminMode(false));
  $("#quick-save-btn").addEventListener("click",()=>saveData());
  $("#publish-btn").addEventListener("click",openPublishDialog);
  $("#publish-form").addEventListener("submit",handlePublish);
  $("#share-trip-btn").addEventListener("click",()=>shareTrip());
  $("#utility-share-btn").addEventListener("click",()=>shareTrip());
  $("#share-copy-btn").addEventListener("click",copyShareLink);
  $$("dialog").forEach(dialog=>dialog.addEventListener("close",()=>document.body.classList.remove("modal-open")));
  $$(".modal-close,[data-close-dialog]").forEach(button=>button.addEventListener("click",()=>closeDialog(button.closest("dialog"))));
  $$(".section-tab").forEach(button=>button.addEventListener("click",()=>switchPanel(button.dataset.tab)));
  $$("[data-map-filter]").forEach(button=>button.addEventListener("click",()=>{mapFilter=button.dataset.mapFilter;updateMapFilter();}));
  $("#edit-cover-btn").addEventListener("click",()=>openEditor("cover"));
  $("#edit-dates-btn").addEventListener("click",()=>openEditor("dates"));
  $("#add-day-btn").addEventListener("click",()=>openEditor("day"));
  $("#add-flight-btn").addEventListener("click",()=>openEditor("flight"));
  $("#add-tour-btn").addEventListener("click",()=>openEditor("tour"));
  $("#editor-form").addEventListener("submit",event=>{event.preventDefault();saveEditor();});
  $("#github-form").addEventListener("submit",fetchGithubImages);
  $("#define-route-btn").addEventListener("click",openRouteEditor);
  $("#route-add-btn").addEventListener("click",()=>{const value=$("#route-location-select").value;if(value){tempRoute.push(value);renderRouteList();}});
  $("#route-form").addEventListener("submit",event=>{event.preventDefault();currentData.route=[...tempRoute];saveData(true);closeDialog($("#route-dialog"));initializeMap();showToast("Percorso aggiornato.");});
  $("#pdf-btn").addEventListener("click",()=>openDialog($("#pdf-dialog")));
  $$(".quality-card").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();savePDF(Number(button.dataset.quality));}));
  $("#export-json-btn").addEventListener("click",exportJSON);
  $("#import-json-btn").addEventListener("click",()=>$("#import-json-input").click());
  $("#import-json-input").addEventListener("change",event=>{importJSON(event.target.files[0]);event.target.value="";});
  $("#export-html-btn").addEventListener("click",exportPublicHTML);
  $("#reset-btn").addEventListener("click",()=>{if(confirm("Ripristinare il JSON originale di questo viaggio?")){localStorage.removeItem(storageKey(activeTrip));currentData=clone(originalData);renderAll();showToast("Itinerario ripristinato.");}});

  document.addEventListener("click",event=>{
    const target=event.target.closest("button"); if(!target)return;
    if(target.dataset.openTrip) loadTrip(target.dataset.openTrip);
    if(target.dataset.jumpDay!==undefined) scrollToDay(Number(target.dataset.jumpDay));
    if(target.dataset.focusDay!==undefined) focusDayOnMap(Number(target.dataset.focusDay));
    if(target.dataset.mapStop!==undefined) focusDayOnMap(Number(target.dataset.mapStop));
    if(target.dataset.shareDay!==undefined) shareTrip(Number(target.dataset.shareDay));
    if(target.dataset.editDay!==undefined) openEditor("day",Number(target.dataset.editDay));
    if(target.dataset.deleteDay!==undefined && confirm("Eliminare questa giornata?")){currentData.itinerary.splice(Number(target.dataset.deleteDay),1);saveData(true);renderAll();}
    if(target.dataset.editFlight!==undefined) openEditor("flight",Number(target.dataset.editFlight));
    if(target.dataset.deleteFlight!==undefined) deleteItem("flights",Number(target.dataset.deleteFlight),"questo volo");
    if(target.dataset.editTour!==undefined) openEditor("tour",Number(target.dataset.editTour));
    if(target.dataset.deleteTour!==undefined) deleteItem("tours",Number(target.dataset.deleteTour),"questa esperienza");
    if(target.dataset.deleteExpense!==undefined){currentData.budget.expenses.splice(Number(target.dataset.deleteExpense),1);saveData(true);renderBudget();}
    if(target.dataset.toggleExpense!==undefined){const expense=currentData.budget.expenses[Number(target.dataset.toggleExpense)];expense.status=expense.status==="paid"?"booked":"paid";saveData(true);renderBudget();}
    if(target.dataset.deleteLink!==undefined){currentData.usefulLinks.splice(Number(target.dataset.deleteLink),1);saveData(true);renderLinks();}
    if(target.dataset.removeRoute!==undefined){tempRoute.splice(Number(target.dataset.removeRoute),1);renderRouteList();}
    if(target.dataset.githubImage){$("#ed-image").value=target.dataset.githubImage;closeDialog($("#github-dialog"));showToast("Immagine selezionata: salva la modifica.");}
  });
  document.addEventListener("change",event=>{if(event.target.dataset.toggleSplid!==undefined){currentData.budget.expenses[Number(event.target.dataset.toggleSplid)].onSplid=event.target.checked;saveData(true);renderBudget();}});
  document.addEventListener("submit",event=>{if(event.target.id==="expense-form")handleExpenseSubmit(event);if(event.target.id==="link-form")handleLinkSubmit(event);});
}

document.addEventListener("DOMContentLoaded",async()=>{
  setupEvents();
  await loadPublishConfig();
  document.body.classList.toggle("admin-mode",isAdmin);
  $("#admin-login-btn").hidden=isAdmin;
  if (window.__PUBLIC_EXPORT__) {
    sessionStorage.setItem("atlante:access","true"); isAdmin=false; $("#app-shell").classList.remove("is-hidden"); loadTrip(activeTrip,false); return;
  }
  if(sessionStorage.getItem("atlante:access")==="true"){$("#access-screen").classList.add("is-hidden");$("#app-shell").classList.remove("is-hidden");urlState.has("trip") ? loadTrip(activeTrip) : showAtlasHome();}else{$("#access-password").focus();}
});
