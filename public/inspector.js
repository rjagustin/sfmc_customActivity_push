(() => {
  const $ = (id) => document.getElementById(id);
  const STEPS = ["Mensaje", "Imagen y enlace", "Destinatario", "Revisar"];
  const LIMITS = { title: 50, body: 150 };
  const MAX_FIELDS = 20;
  const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const HTTPS_RE = /^https:\/\/\S+$/i;
  const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
  const SOURCES = [["all", "Todos"], ["journey", "Journey Data"], ["contact", "Contact Builder"]];

  const insideJourneyBuilder = window.self !== window.top;
  const connection = insideJourneyBuilder ? new Postmonger.Session() : null;

  const GENERIC_CONTACTS = [
    { name: "Vista Android", platform: "Android", generic: true, data: {} },
    { name: "Vista iOS", platform: "iOS", generic: true, data: {} }
  ];

  let activity = null;
  let journeyFields = [];
  let contactGroups = [];
  let allFields = [];
  let picker = null;

  const state = {
    step: 0,
    contact: 0,
    contacts: insideJourneyBuilder ? GENERIC_CONTACTS : window.DEMO.contacts,
    title: "",
    body: "",
    imgmode: "none",
    image: "",
    action: "OPEN_APP",
    link: "",
    fallbacks: {},
    mapToken: "",
    mapPlatform: ""
  };

  /* Campos disponibles */
  const lastSegment = (path) => path.split(".").pop().replace(/"/g, "");

  function rebuildFields() {
    const journey = journeyFields
      .filter((f) => f.path !== state.mapToken && f.path !== state.mapPlatform)
      .map((f) => ({ ...f, group: "Journey Data", source: "journey" }));
    const contact = contactGroups.flatMap((g) => g.items.map((item) => ({ ...item, group: g.group, source: g.source })));
    allFields = [...journey, ...contact].map((f) => ({ ...f, key: lastSegment(f.path) }));
  }
  const labelOf = (path) => allFields.find((f) => f.path === path)?.label ?? lastSegment(path);

  function setSchema(schema) {
    journeyFields = (schema ?? [])
      .filter((f) => f && f.key)
      .map((f) => ({ path: f.key, label: f.name || lastSegment(f.key) }));
    fillMapping($("map-token"), "mapToken", /token/i);
    fillMapping($("map-platform"), "mapPlatform", /plataforma|platform|devicetype/i);
    rebuildFields();
    touch(false);
  }

  function fillMapping(select, key, guess) {
    select.replaceChildren(new Option(journeyFields.length ? "Elegí un campo" : "No hay campos de Journey Data", ""));
    journeyFields.forEach((f) => select.add(new Option(f.label, f.path)));
    // Si la configuración guardada apunta a un campo que ya no está, se muestra igual.
    if (state[key] && !journeyFields.some((f) => f.path === state[key])) {
      select.add(new Option(lastSegment(state[key]), state[key]));
    }
    if (!state[key]) state[key] = journeyFields.find((f) => guess.test(f.path))?.path ?? "";
    select.value = state[key];
  }

  /* Texto y validaciones */
  const linkOrEmpty = () => (state.action === "OPEN_APP" ? "" : state.link);

  function usedPaths() {
    const found = new Set();
    for (const text of [state.title, state.body, linkOrEmpty()]) {
      for (const match of text.matchAll(TOKEN_RE)) found.add(match[1]);
    }
    return [...found];
  }

  function resolve(text, contact, missing) {
    return text.replace(TOKEN_RE, (_, path) => {
      if (contact.generic) return state.fallbacks[path] || `[${labelOf(path)}]`;
      const value = contact.data[path];
      if (value) return value;
      missing?.add(path);
      return state.fallbacks[path] ?? "";
    });
  }

  // Sin los campos ya completos, un {{ que queda es un campo sin cerrar.
  const hasOpenToken = (text) => /\{\{|\}\}/.test(text.replace(TOKEN_RE, ""));

  function problems() {
    const out = [];
    if (!state.title.trim()) out.push({ text: "Falta el título", step: 0 });
    if (!state.body.trim()) out.push({ text: "Falta el texto", step: 0 });
    if (hasOpenToken(state.title) || hasOpenToken(state.body)) out.push({ text: "Hay un campo sin cerrar en el mensaje", step: 0 });
    if (usedPaths().length > MAX_FIELDS) out.push({ text: `Usá hasta ${MAX_FIELDS} campos personalizados`, step: 0 });
    if (state.imgmode === "url" && !HTTPS_RE.test(state.image)) out.push({ text: "La imagen necesita una URL con HTTPS", step: 1, field: "image" });
    const link = state.link.replace(TOKEN_RE, "x");
    if (state.action === "DEEP_LINK" && !SCHEME_RE.test(link)) out.push({ text: "El deep link necesita un esquema, como miapp://promo/123", step: 1, field: "link" });
    if (state.action === "URL" && !HTTPS_RE.test(link)) out.push({ text: "La web necesita una URL con HTTPS", step: 1, field: "link" });
    if (!state.mapToken) out.push({ text: "Elegí el campo del token", step: 2 });
    if (!state.mapPlatform) out.push({ text: "Elegí el campo de la plataforma", step: 2 });
    return out;
  }

  /* Guardar y restaurar. Los textos usan [[f0]]; cada campo viaja aparte como {{...}}. */
  function toInArguments() {
    const paths = usedPaths();
    const idOf = new Map(paths.map((path, i) => [path, `f${i}`]));
    const template = (text) => text.replace(TOKEN_RE, (_, path) => `[[${idOf.get(path)}]]`);
    return {
      contactKey: "{{Contact.Key}}",
      deviceToken: `{{${state.mapToken}}}`,
      platform: `{{${state.mapPlatform}}}`,
      title: template(state.title),
      body: template(state.body),
      imageUrl: state.imgmode === "url" ? state.image : "",
      action: state.action,
      url: template(linkOrEmpty()),
      fieldMap: JSON.stringify(paths.map((path) => ({ id: idOf.get(path), path, fallback: state.fallbacks[path] ?? "" }))),
      ...Object.fromEntries(paths.map((path) => [idOf.get(path), `{{${path}}}`]))
    };
  }

  function fromActivity(saved) {
    const args = Object.assign({}, ...(saved?.arguments?.execute?.inArguments ?? []));
    if (args.title === undefined) return false;
    let fields = [];
    try { fields = JSON.parse(args.fieldMap || "[]"); } catch { fields = []; }
    const pathOf = Object.fromEntries(fields.map((f) => [f.id, f.path]));
    const expand = (text) => String(text ?? "").replace(/\[\[(f\d+)\]\]/g, (raw, id) => (pathOf[id] ? `{{${pathOf[id]}}}` : raw));
    const strip = (value) => String(value ?? "").replace(/^\{\{|\}\}$/g, "");
    Object.assign(state, {
      title: expand(args.title),
      body: expand(args.body),
      imgmode: args.imageUrl ? "url" : "none",
      image: args.imageUrl ?? "",
      action: args.action || "OPEN_APP",
      link: expand(args.url),
      fallbacks: Object.fromEntries(fields.map((f) => [f.path, f.fallback ?? ""])),
      mapToken: strip(args.deviceToken),
      mapPlatform: strip(args.platform)
    });
    return true;
  }

  function save() {
    if (problems().length) return;
    const inArgs = toInArguments();
    if (!connection) {
      showTag("Guardado en esta vista: abrí la activity desde un journey para usarla");
      go(STEPS.length - 1);
      return;
    }
    activity.arguments = activity.arguments ?? {};
    activity.arguments.execute = activity.arguments.execute ?? {};
    activity.arguments.execute.inArguments = [inArgs];
    activity.metaData = { ...activity.metaData, isConfigured: true };
    connection.trigger("updateActivity", activity);
  }

  /* Vista previa */
  function renderPreview() {
    const contact = state.contacts[state.contact];
    const missing = new Set();
    const title = resolve(state.title, contact, missing);
    const body = resolve(state.body, contact, missing);
    const link = resolve(linkOrEmpty(), contact, missing);
    const ios = contact.platform === "iOS";
    const hasImage = state.imgmode === "url" && state.image.trim();

    const notif = $("notif");
    notif.className = `notif ${ios ? "ios" : "android"}`;
    notif.replaceChildren();
    const head = document.createElement("div");
    head.className = "notif-app";
    head.append(document.createElement("i"), "Tu app · ahora");
    const row = document.createElement("div");
    row.className = "notif-row";
    const main = document.createElement("div");
    main.className = "notif-main";
    const t = document.createElement("div"); t.className = "notif-title"; t.textContent = title || "Título";
    const b = document.createElement("div"); b.className = "notif-body"; b.textContent = body || "Texto de la notificación";
    main.append(t, b);
    row.append(main);
    if (hasImage && ios) {
      const thumb = document.createElement("div"); thumb.className = "notif-thumb"; thumb.append(imageEl(state.image)); row.append(thumb);
    }
    notif.append(head, row);
    if (hasImage && !ios) {
      const big = document.createElement("div"); big.className = "notif-big"; big.append(imageEl(state.image)); notif.append(big);
    }

    const info = $("pv-info");
    info.replaceChildren();
    const line = (labelText, value, cls) => {
      const p = document.createElement("p");
      if (cls) p.className = cls;
      if (labelText) { const s = document.createElement("b"); s.textContent = `${labelText} `; p.append(s); }
      p.append(value);
      info.append(p);
    };
    line("Dispositivo:", contact.platform);
    line("Al tocarla:", state.action === "OPEN_APP" ? "abre la app" : (link || "falta el enlace"));
    if (missing.size) line("", `Sin dato de ${[...missing].map(labelOf).join(" y ")}: usa el texto alternativo.`, "pv-warn");
    if (hasImage && ios) line("", "En iOS la imagen requiere una extensión en la app.");
  }

  function imageEl(url) {
    const img = document.createElement("img");
    img.alt = "Imagen de la notificación";
    img.addEventListener("error", () => {
      const box = document.createElement("div");
      box.className = "noimg";
      box.textContent = "No se pudo cargar la imagen";
      img.replaceWith(box);
    });
    img.src = url;
    return img;
  }

  /* Textos alternativos */
  function renderFallbacks() {
    const paths = usedPaths();
    const box = $("fallbacks");
    const signature = paths.join("|");
    if (box.dataset.sig === signature && box.childElementCount) return;
    box.dataset.sig = signature;
    box.replaceChildren();
    box.hidden = !paths.length;
    if (!paths.length) return;
    const head = document.createElement("div");
    const lab = document.createElement("div"); lab.className = "lab"; lab.textContent = "Si falta un dato";
    const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = "Texto que se usa cuando el contacto no tiene ese campo.";
    head.append(lab, hint);
    box.append(head);
    paths.forEach((path, i) => {
      const row = document.createElement("div"); row.className = "fb-row";
      const label = document.createElement("label"); label.htmlFor = `fb-${i}`; label.textContent = labelOf(path);
      const input = document.createElement("input"); input.type = "text"; input.id = `fb-${i}`;
      input.value = state.fallbacks[path] ?? "";
      input.placeholder = "Dejar vacío";
      input.addEventListener("input", () => { state.fallbacks[path] = input.value; touch(); });
      row.append(label, input);
      box.append(row);
    });
  }

  /* Pasos */
  function renderSteps() {
    $("steps").replaceChildren(...STEPS.map((name, i) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const n = document.createElement("i"); n.textContent = i + 1;
      button.append(n, name);
      if (i === state.step) button.setAttribute("aria-current", "step");
      button.addEventListener("click", () => go(i));
      li.append(button);
      return li;
    }));
    document.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = Number(p.dataset.pane) !== state.step; });
    $("back").disabled = state.step === 0;
    $("next").hidden = state.step === STEPS.length - 1;
    $("save").hidden = state.step !== STEPS.length - 1;
    $("save").disabled = problems().length > 0;
  }

  function go(step) {
    state.step = step;
    closePicker();
    renderSteps();
    renderReview();
    $("form").scrollTop = 0;
  }

  function renderReview() {
    const issues = problems();
    const checks = $("checks");
    checks.replaceChildren();
    if (!issues.length) {
      const li = document.createElement("li");
      const mark = document.createElement("span"); mark.className = "mark"; mark.textContent = "✓";
      const text = document.createElement("span"); text.textContent = "Lista para guardar.";
      li.append(mark, text);
      checks.append(li);
    }
    issues.forEach((issue) => {
      const li = document.createElement("li"); li.className = "no";
      const mark = document.createElement("span"); mark.className = "mark"; mark.textContent = "!";
      const button = document.createElement("button"); button.type = "button"; button.className = "link-btn"; button.textContent = issue.text;
      button.addEventListener("click", () => go(issue.step));
      li.append(mark, button);
      checks.append(li);
    });
    const actionText = { OPEN_APP: "Abrir la app", DEEP_LINK: "Ir a una pantalla", URL: "Abrir una web" }[state.action];
    const rows = [
      ["Título", state.title],
      ["Texto", state.body],
      ["Imagen", state.imgmode === "url" ? state.image : "Sin imagen"],
      ["Al tocarla", state.action === "OPEN_APP" ? actionText : `${actionText}: ${state.link}`],
      ["Token", state.mapToken ? lastSegment(state.mapToken) : "Sin elegir"],
      ["Plataforma", state.mapPlatform ? lastSegment(state.mapPlatform) : "Sin elegir"],
      ["Respuestas", "enviado, token_invalido, error"]
    ];
    $("summary").replaceChildren(...rows.map(([k, v]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      div.append(dt, dd);
      return div;
    }));
    $("json-in").textContent = JSON.stringify(toInArguments(), null, 2);
    $("save").disabled = issues.length > 0;
  }

  function renderForm() {
    for (const [id, limit] of Object.entries(LIMITS)) {
      const n = resolve(state[id], state.contacts[state.contact]).length;
      const el = $(`${id}-count`);
      el.textContent = `${n} caracteres en esta vista · recomendado hasta ${limit}`;
      el.classList.toggle("bad", n > limit);
    }
    $("img-fields").hidden = state.imgmode !== "url";
    $("link-field").hidden = state.action === "OPEN_APP";
    $("link-label").textContent = state.action === "URL" ? "Dirección web" : "Deep link";
    $("link").placeholder = state.action === "URL" ? "https://www.tumarca.com/promo" : "miapp://promo/123";

    const issues = problems();
    const linkIssue = issues.find((p) => p.field === "link");
    const linkHint = $("link-hint");
    const showLink = !!(linkIssue && state.link);
    linkHint.textContent = showLink ? linkIssue.text : (state.action === "URL" ? "Se abre en el navegador del celular." : "La app tiene que reconocer esta ruta para abrir la pantalla.");
    linkHint.classList.toggle("bad", showLink);

    const showImage = !!(issues.find((p) => p.field === "image") && state.image);
    $("image-hint").textContent = showImage ? "La URL tiene que empezar con https://" : "Tiene que ser una URL pública con HTTPS.";
    $("image-hint").classList.toggle("bad", showImage);
  }

  function touch(dirty = true) {
    renderFallbacks();
    renderForm();
    renderPreview();
    renderReview();
    if (dirty && connection) connection.trigger("setActivityDirtyState", true);
  }

  /* Buscador de campos */
  const norm = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function searchFields(query, source) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return allFields.filter((f) => {
      if (source !== "all" && f.source !== source) return false;
      const text = norm(`${f.label} ${f.key} ${f.group}`);
      return words.every((w) => text.includes(w));
    });
  }

  function closePicker() { picker?.el.remove(); picker = null; }

  function renderPicker() {
    const { el, query, source } = picker;
    const results = searchFields(query, source);
    picker.results = results;
    picker.active = Math.min(picker.active, Math.max(0, results.length - 1));

    el.querySelector(".chips").replaceChildren(...SOURCES.map(([value, name]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = `${name} ${searchFields(query, value).length}`;
      chip.setAttribute("aria-pressed", String(value === source));
      chip.addEventListener("mousedown", (e) => e.preventDefault());
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        picker.source = value;
        picker.active = 0;
        renderPicker();
      });
      return chip;
    }));

    const list = el.querySelector(".picker-list");
    list.replaceChildren();
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "picker-empty";
      empty.textContent = query.trim()
        ? `Ningún campo coincide con “${query.trim()}”. Probá con otra palabra.`
        : "No hay campos disponibles. Revisá que el journey tenga una entrada configurada.";
      list.append(empty);
      return;
    }
    const sample = state.contacts[state.contact];
    let lastGroup = null;
    results.forEach((field, i) => {
      if (field.group !== lastGroup) {
        const h = document.createElement("h4");
        h.textContent = field.group;
        list.append(h);
        lastGroup = field.group;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = `picker-item${i === picker.active ? " active" : ""}`;
      const name = document.createElement("span");
      const strong = document.createElement("b"); strong.textContent = field.label;
      const key = document.createElement("code"); key.textContent = field.key;
      name.append(strong, key);
      button.append(name);
      if (!sample.generic) {
        const ex = document.createElement("small");
        ex.textContent = sample.data[field.path] || "sin dato";
        button.append(ex);
      }
      button.addEventListener("mousedown", (e) => e.preventDefault());
      button.addEventListener("click", (e) => { e.stopPropagation(); chooseField(field); });
      list.append(button);
    });
    list.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }

  function chooseField(field) {
    const { target, inline, from, end } = picker;
    const to = inline ? target.selectionStart : end;
    target.setRangeText(`{{${field.path}}}`, from, to, "end");
    state[target.id] = target.value;
    closePicker();
    target.focus();
    touch();
  }

  function pickerKey(e) {
    if (!picker) return;
    const count = picker.results.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return;
      e.preventDefault();
      picker.active = (picker.active + (e.key === "ArrowDown" ? 1 : -1) + count) % count;
      renderPicker();
    } else if (e.key === "Enter" || (e.key === "Tab" && picker.inline)) {
      if (!count) { if (e.key === "Enter" && !picker.inline) e.preventDefault(); return; }
      e.preventDefault();
      chooseField(picker.results[picker.active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      const { target } = picker;
      closePicker();
      target.focus();
    }
  }

  function openPicker(target, { inline = false, query = "", from, end }) {
    closePicker();
    const el = document.createElement("div");
    el.className = `picker${inline ? " inline" : ""}`;
    if (inline) {
      const tip = document.createElement("p");
      tip.className = "picker-tip";
      tip.textContent = "Seguí escribiendo para filtrar. Enter para insertar.";
      el.append(tip);
    } else {
      const label = document.createElement("label");
      label.className = "sr-only";
      label.htmlFor = "picker-q";
      label.textContent = "Buscar campo";
      const search = document.createElement("input");
      search.type = "text";
      search.id = "picker-q";
      search.className = "picker-search";
      search.placeholder = "Buscar por nombre o campo";
      search.autocomplete = "off";
      search.addEventListener("input", () => {
        picker.query = search.value;
        picker.active = 0;
        renderPicker();
      });
      search.addEventListener("keydown", pickerKey);
      el.append(label, search);
    }
    const chips = document.createElement("div"); chips.className = "chips";
    const list = document.createElement("div"); list.className = "picker-list";
    el.append(chips, list);
    target.closest(".field").append(el);
    picker = { el, target, inline, query, from, end, source: "all", active: 0, results: [] };
    renderPicker();
    if (!inline) el.querySelector(".picker-search").focus();
    el.scrollIntoView({ block: "nearest" });
  }

  function togglePicker(button) {
    const target = $(button.dataset.target);
    if (picker && !picker.inline && picker.target === target) { closePicker(); return; }
    const from = target.selectionStart ?? target.value.length;
    openPicker(target, { from, end: target.selectionEnd ?? from });
  }

  function checkInline(target) {
    const before = target.value.slice(0, target.selectionStart);
    const from = before.lastIndexOf("{{");
    const query = from >= 0 ? before.slice(from + 2) : null;
    if (query === null || /[{}\n]/.test(query)) {
      if (picker?.inline) closePicker();
      return;
    }
    if (picker?.inline && picker.target === target) {
      picker.query = query;
      picker.from = from;
      picker.active = 0;
      renderPicker();
    } else {
      openPicker(target, { inline: true, query, from });
    }
  }

  /* Interacción */
  function syncInputs() {
    for (const id of ["title", "body", "image", "link"]) $(id).value = state[id];
    document.querySelectorAll('input[name="imgmode"]').forEach((r) => { r.checked = r.value === state.imgmode; });
    document.querySelectorAll('input[name="action"]').forEach((r) => { r.checked = r.value === state.action; });
  }

  function fillContacts() {
    $("pv-contact").replaceChildren(...state.contacts.map((c, i) => new Option(c.generic ? c.name : `${c.name} · ${c.platform}`, String(i))));
    $("pv-contact").value = String(state.contact);
  }

  function showTag(text) {
    $("mode-tag").textContent = text;
    $("mode-tag").hidden = false;
  }

  function bind() {
    for (const id of ["title", "body", "image", "link"]) {
      $(id).addEventListener("input", () => {
        state[id] = $(id).value;
        touch();
        if (id !== "image") checkInline($(id));
      });
      if (id !== "image") {
        $(id).addEventListener("keydown", (e) => { if (picker?.inline && picker.target === $(id)) pickerKey(e); });
      }
    }
    document.querySelectorAll('input[name="imgmode"]').forEach((r) => r.addEventListener("change", () => { state.imgmode = r.value; touch(); }));
    document.querySelectorAll('input[name="action"]').forEach((r) => r.addEventListener("change", () => { state.action = r.value; touch(); }));
    [["map-token", "mapToken"], ["map-platform", "mapPlatform"]].forEach(([id, key]) => {
      $(id).addEventListener("change", () => { state[key] = $(id).value; rebuildFields(); touch(); });
    });
    document.querySelectorAll(".ins").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); togglePicker(b); }));
    document.addEventListener("click", (e) => { if (picker && !picker.el.contains(e.target)) closePicker(); });
    $("pv-contact").addEventListener("change", () => { state.contact = Number($("pv-contact").value); closePicker(); touch(false); });
    $("form").addEventListener("submit", (e) => e.preventDefault());
    $("back").addEventListener("click", () => go(Math.max(0, state.step - 1)));
    $("next").addEventListener("click", () => go(Math.min(STEPS.length - 1, state.step + 1)));
    $("save").addEventListener("click", save);
    $("cancel").addEventListener("click", () => connection?.trigger("requestInspectorClose"));
  }

  async function loadContactGroups() {
    try {
      const res = await fetch("api/contact-attributes");
      if (res.ok) contactGroups = await res.json();
    } catch { /* El buscador sigue funcionando con Journey Data. */ }
    rebuildFields();
    touch(false);
  }

  async function loadInfo() {
    try {
      const res = await fetch("api/info");
      const { sendMode } = await res.json();
      if (sendMode === "simulado") showTag("Envío simulado: no sale ninguna notificación");
    } catch { /* La etiqueta es solo informativa. */ }
  }

  /* Inicio */
  bind();
  fillContacts();
  renderSteps();

  if (connection) {
    connection.on("initActivity", (payload) => {
      activity = payload ?? {};
      fromActivity(activity);
      syncInputs();
      fillMapping($("map-token"), "mapToken", /token/i);
      fillMapping($("map-platform"), "mapPlatform", /plataforma|platform|devicetype/i);
      touch(false);
    });
    connection.on("requestedSchema", (data) => setSchema(data?.schema));
    connection.trigger("ready");
    connection.trigger("requestSchema");
  } else {
    Object.assign(state, window.DEMO.start);
    syncInputs();
    setSchema(window.DEMO.schema);
  }

  touch(false);
  loadContactGroups();
  loadInfo();
})();
