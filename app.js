// Spending Log — a static, private expense tracker.
// All data lives in localStorage under this one key. No network, no accounts.

const STORAGE_KEY = "spending-log:v1";
const CURRENCY = "£";        // change to "$", "€", etc.
const DATE_ORDER = "DMY";    // "DMY" for UK/EU CSVs, "MDY" for US

/** @typedef {{id:string,date:string,desc:string,category:string,amount:number,member?:string,ref?:string,source?:string}} Expense */

const CATEGORIES = ["Food", "Transport", "Housing", "Utilities", "Shopping", "Health", "Entertainment", "Other"];

/** @type {Expense[]} */
let expenses = load();
let viewMonth = startOfMonth(new Date());
let memberFilter = "all"; // "all" | "__none" | a card-member name

// --- persistence -----------------------------------------------------------
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Array.isArray(raw.expenses) ? raw.expenses : [];
  } catch {
    return [];
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, expenses }));
}

// --- helpers --------------------------------------------------------------
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function money(n) {
  return CURRENCY + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inViewMonth(e) {
  return e.date.slice(0, 7) === monthKey(viewMonth);
}
function matchesMember(e) {
  if (memberFilter === "all") return true;
  if (memberFilter === "__none") return !e.member;
  return e.member === memberFilter;
}

// --- rendering -----------------------------------------------------------
const $ = (id) => document.getElementById(id);

function render() {
  renderMemberFilter();
  const rows = expenses
    .filter((e) => inViewMonth(e) && matchesMember(e))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  $("monthLabel").textContent = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("monthTotal").textContent = money(rows.reduce((s, e) => s + e.amount, 0));

  // category breakdown
  const byCat = {};
  for (const e of rows) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 0;
  $("breakdown").hidden = cats.length === 0;
  $("bars").innerHTML = cats
    .map(
      ([name, amt]) => `
      <li>
        <span>${name}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${max ? (amt / max) * 100 : 0}%"></span></span>
        <span>${money(amt)}</span>
      </li>`
    )
    .join("");

  // transaction list
  $("empty").hidden = rows.length > 0;
  $("entries").innerHTML = rows
    .map(
      (e) => `
      <li data-id="${e.id}">
        <span class="e-date">${new Date(e.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span class="e-main">
          <span class="e-desc">${escapeHtml(e.desc)}</span>
          <span class="e-who ${e.member ? "" : "muted"}" data-id="${e.id}" title="Set card member">
            ${e.member ? escapeHtml(e.member) : "+ card member"}
          </span>
        </span>
        <span class="e-cat">${e.category}</span>
        <span class="e-amt">${money(e.amount)}</span>
        <button class="e-del" title="Delete" aria-label="Delete">×</button>
      </li>`
    )
    .join("");
}

function renderMemberFilter() {
  const members = [...new Set(expenses.map((e) => e.member).filter(Boolean))].sort();
  const hasUnassigned = expenses.some((e) => !e.member) && expenses.length > 0;
  const wrap = $("memberFilterWrap");
  wrap.hidden = members.length === 0;

  const want = memberFilter;
  $("memberFilter").innerHTML = [
    `<option value="all">All card members</option>`,
    ...members.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`),
    hasUnassigned ? `<option value="__none">Unassigned</option>` : "",
  ].join("");

  const valid = want === "all" || want === "__none" || members.includes(want);
  memberFilter = valid ? want : "all";
  $("memberFilter").value = memberFilter;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// --- actions ------------------------------------------------------------
$("addForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const amount = parseFloat($("amount").value);
  if (!(amount >= 0)) return;
  expenses.push({
    id: crypto.randomUUID(),
    date: $("date").value || todayISO(),
    desc: $("desc").value.trim(),
    category: $("category").value,
    amount: Math.round(amount * 100) / 100,
    member: "",
  });
  save();
  viewMonth = startOfMonth(new Date($("date").value + "T00:00"));
  ev.target.reset();
  $("date").value = todayISO();
  render();
  $("desc").focus();
});

$("entries").addEventListener("click", (ev) => {
  const del = ev.target.closest(".e-del");
  const who = ev.target.closest(".e-who");
  if (del) {
    const id = del.closest("li").dataset.id;
    expenses = expenses.filter((e) => e.id !== id);
    save();
    render();
  } else if (who) {
    const e = expenses.find((x) => x.id === who.dataset.id);
    const v = prompt("Card member for this transaction:", e.member || "");
    if (v !== null) {
      e.member = v.trim();
      save();
      render();
    }
  }
});

$("memberFilter").addEventListener("change", (ev) => {
  memberFilter = ev.target.value;
  render();
});

$("prevMonth").addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  render();
});
$("nextMonth").addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  render();
});

$("exportBtn").addEventListener("click", () => {
  const all = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  const csv = [
    "date,description,category,amount,member",
    ...all.map((e) => `${e.date},${csvCell(e.desc)},${e.category},${e.amount.toFixed(2)},${csvCell(e.member || "")}`),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "spending-log.csv";
  a.click();
  URL.revokeObjectURL(url);
});
function csvCell(s) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

$("clearBtn").addEventListener("click", () => {
  if (confirm("Delete every logged expense? This cannot be undone.")) {
    expenses = [];
    save();
    render();
  }
});

// --- CSV import (Amex "Download → CSV", or this app's own export) ----------
$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", (ev) => {
  handleFile(ev.target.files[0]);
  ev.target.value = ""; // allow re-importing the same filename
});

const dz = $("dropzone");
["dragenter", "dragover"].forEach((e) =>
  dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add("drag"); })
);
["dragleave", "drop"].forEach((e) =>
  dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove("drag"); })
);
dz.addEventListener("drop", (ev) => handleFile(ev.dataTransfer.files[0]));
document.addEventListener("dragover", (ev) => ev.preventDefault());
document.addEventListener("drop", (ev) => ev.preventDefault());

function handleFile(file) {
  if (!file) return;
  if (file.size > 15_000_000) { alert("That file is unexpectedly large — is it a CSV?"); return; }
  const reader = new FileReader();
  reader.onerror = () => alert("Could not read that file.");
  reader.onload = () => {
    try {
      importCsv(String(reader.result));
    } catch (err) {
      alert("Could not import that file.\n\n" + err.message);
    }
  };
  reader.readAsText(file);
}

/** RFC-4180-ish CSV parser: handles quotes, escaped quotes, embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normDate(raw) {
  const v = raw.trim().split(/[ T]/)[0];
  let m;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
    let [, p1, p2, y] = m;
    if (y.length === 2) y = "20" + y;
    let day = DATE_ORDER === "MDY" ? +p2 : +p1;
    let mon = DATE_ORDER === "MDY" ? +p1 : +p2;
    if (mon > 12 && day <= 12) [day, mon] = [mon, day]; // obvious mismatch → swap
    if (mon > 12 || day > 31) return null;
    return `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(v);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return null;
}

function parseMoney(raw) {
  let v = raw.trim().replace(/[$£€\s,]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
  const n = parseFloat(v);
  return isNaN(n) ? null : (neg ? -n : n);
}

function mapCategory(amexCat, desc) {
  const t = `${amexCat} ${desc}`.toLowerCase();
  const rules = [
    [/restaurant|dining|grocer|food|coffee|cafe|bar & |bakery|deliveroo|just ?eat|greggs|tesco|sainsbury|asda|aldi|lidl|waitrose|morrison|co-?op|pub/, "Food"],
    [/transport|fuel|petrol|gas station|rideshare|uber|bolt|taxi|parking|airline|flight|rail|train|tfl|oyster|trainline|bus|toll|car park/, "Transport"],
    [/rent|mortgage|landlord|letting|property|council tax/, "Housing"],
    [/communications|broadband|cable|internet|wireless|phone|mobile|utilit|electric|water|energy|british gas|octopus|bt |sky |virgin media|vodafone|ee /, "Utilities"],
    [/health|pharmac|medical|doctor|dental|hospital|clinic|fitness|gym|boots|superdrug|nhs/, "Health"],
    [/entertain|attraction|cinema|movie|theat|netflix|spotify|disney|prime video|now tv|game|concert|streaming|subscription/, "Entertainment"],
    [/merchandise|department store|retail|amazon|argos|john lewis|shopping|apparel|clothing|electronics|supplies|online/, "Shopping"],
  ];
  for (const [re, cat] of rules) if (re.test(t)) return cat;
  return "Other";
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("File is empty.");

  const findCol = (hdr, ...names) => {
    const norm = hdr.map((h) => h.trim().toLowerCase());
    for (const n of names) { const i = norm.indexOf(n); if (i !== -1) return i; }
    for (const n of names) { const i = norm.findIndex((h) => h.includes(n)); if (i !== -1) return i; }
    return -1;
  };

  let headerIdx = -1, col = {};
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const di = findCol(rows[i], "date"), ai = findCol(rows[i], "amount");
    if (di !== -1 && ai !== -1) {
      headerIdx = i;
      col = {
        date: di,
        amount: ai,
        desc: findCol(rows[i], "description", "extended details", "merchant"),
        category: findCol(rows[i], "category"),
        ref: findCol(rows[i], "reference"),
        member: findCol(rows[i], "card member", "cardmember", "cardholder", "member"),
      };
      break;
    }
  }

  let dataRows;
  if (headerIdx === -1) {
    if (!normDate(rows[0][0]) || rows[0].length < 3) throw new Error("Unrecognised CSV layout.");
    col = { date: 0, desc: 1, amount: rows[0].length - 1, category: -1, ref: -1, member: -1 };
    dataRows = rows;
  } else {
    dataRows = rows.slice(headerIdx + 1);
  }

  const parsed = [];
  for (const r of dataRows) {
    const date = normDate(r[col.date] || "");
    const amount = parseMoney(r[col.amount] || "");
    if (!date || amount === null) continue;
    parsed.push({
      date,
      amount,
      desc: (col.desc >= 0 ? r[col.desc] : "").trim() || "(no description)",
      amexCat: col.category >= 0 ? (r[col.category] || "").trim() : "",
      ref: col.ref >= 0 ? (r[col.ref] || "").trim() : "",
      member: col.member >= 0 ? (r[col.member] || "").trim() : "",
    });
  }
  if (!parsed.length) throw new Error("No transactions found in the file.");

  // sign: a statement is mostly charges — if negatives dominate, flip everything
  const pos = parsed.filter((p) => p.amount > 0).length;
  if (parsed.length - pos > pos) parsed.forEach((p) => (p.amount = -p.amount));

  // card member: fill blanks (or all rows) from a name you supply
  const named = parsed.filter((p) => p.member).length;
  if (named < parsed.length) {
    const msg = named === 0
      ? "No card member column found. Assign every transaction in this file to (leave blank to skip):"
      : `${parsed.length - named} rows have no card member. Assign those to (leave blank to skip):`;
    const knownGuess = [...new Set(parsed.map((p) => p.member).filter(Boolean))][0] || "";
    const override = (prompt(msg, knownGuess) || "").trim();
    if (override) parsed.forEach((p) => { if (!p.member) p.member = override; });
  }

  const haveKeys = new Set(expenses.map(dedupeKey));
  const haveRefs = new Set(expenses.map((e) => e.ref).filter(Boolean));

  let credits = 0, dupes = 0;
  const fresh = [];
  for (const p of parsed) {
    if (p.amount <= 0) { credits++; continue; }
    const rec = {
      id: crypto.randomUUID(),
      date: p.date,
      desc: p.desc.slice(0, 80),
      category: CATEGORIES.includes(p.amexCat) ? p.amexCat : mapCategory(p.amexCat, p.desc),
      amount: Math.round(p.amount * 100) / 100,
      member: p.member || "",
      source: "amex",
    };
    if (p.ref) rec.ref = p.ref;
    if ((p.ref && haveRefs.has(p.ref)) || haveKeys.has(dedupeKey(rec))) { dupes++; continue; }
    haveKeys.add(dedupeKey(rec));
    if (p.ref) haveRefs.add(p.ref);
    fresh.push(rec);
  }

  if (!fresh.length) {
    alert(`Nothing new to import.\n\n${dupes} already logged, ${credits} payments/credits skipped.`);
    return;
  }
  const members = [...new Set(fresh.map((e) => e.member).filter(Boolean))];
  const ok = confirm(
    `Found ${parsed.length} rows.\n\n` +
      `• ${fresh.length} new transactions to add\n` +
      `• ${dupes} already logged (skipped)\n` +
      `• ${credits} payments/credits (skipped)\n` +
      (members.length ? `• card members: ${members.join(", ")}\n` : "") +
      `\nAdd ${fresh.length} transactions?`
  );
  if (!ok) return;

  expenses.push(...fresh);
  save();
  const latest = fresh.map((e) => e.date).sort().pop();
  viewMonth = startOfMonth(new Date(latest + "T00:00"));
  render();
}

function dedupeKey(e) {
  return `${e.date}|${e.amount.toFixed(2)}|${e.desc.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40)}`;
}

// --- init --------------------------------------------------------------
$("date").value = todayISO();
render();
