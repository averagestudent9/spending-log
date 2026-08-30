// Spending Log — a static, private expense tracker.
// All data lives in localStorage under this one key. No network, no accounts.

const STORAGE_KEY = "spending-log:v1";
const CURRENCY = "$"; // change this to "£", "€", etc.

/** @typedef {{id:string,date:string,desc:string,category:string,amount:number,ref?:string,source?:string}} Expense */

const CATEGORIES = ["Food", "Transport", "Housing", "Utilities", "Shopping", "Health", "Entertainment", "Other"];

/** @type {Expense[]} */
let expenses = load();
let viewMonth = startOfMonth(new Date());

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

// --- rendering -----------------------------------------------------------
const $ = (id) => document.getElementById(id);

function render() {
  const rows = expenses.filter(inViewMonth).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  $("monthLabel").textContent = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const total = rows.reduce((s, e) => s + e.amount, 0);
  $("monthTotal").textContent = money(total);

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
        <span class="e-desc">${escapeHtml(e.desc)}</span>
        <span class="e-cat">${e.category}</span>
        <span class="e-amt">${money(e.amount)}</span>
        <button class="e-del" title="Delete" aria-label="Delete">×</button>
      </li>`
    )
    .join("");
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
  });
  save();
  // jump the view to the month of the entry we just added
  viewMonth = startOfMonth(new Date($("date").value + "T00:00"));
  ev.target.reset();
  $("date").value = todayISO();
  render();
  $("desc").focus();
});

$("entries").addEventListener("click", (ev) => {
  const btn = ev.target.closest(".e-del");
  if (!btn) return;
  const id = btn.closest("li").dataset.id;
  expenses = expenses.filter((e) => e.id !== id);
  save();
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
    "date,description,category,amount",
    ...all.map((e) => `${e.date},${csvCell(e.desc)},${e.category},${e.amount.toFixed(2)}`),
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
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importCsv(String(reader.result));
    } catch (err) {
      alert("Could not read that file.\n\n" + err.message);
    }
    ev.target.value = ""; // allow re-importing the same filename
  };
  reader.readAsText(file);
});

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
  const v = raw.trim().split(" ")[0];
  let m;
  if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = v.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})$/))) {
    let [, a, b, y] = m; // Amex US = MM/DD/YYYY; flip if first part can't be a month
    if (+a > 12) [a, b] = [b, a];
    return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
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
    [/restaurant|dining|grocer|food|coffee|cafe|bar & |bakery|doordash|ubereats|deli/, "Food"],
    [/transport|fuel|gas station| gas|rideshare|uber|lyft|taxi|parking|airline|flight|transit|train|toll|auto|car rental/, "Transport"],
    [/rent|mortgage|hoa|landlord|property/, "Housing"],
    [/communications|cable|internet|wireless|phone|mobile|utility|utilities|electric|water|energy|gas company/, "Utilities"],
    [/health|pharmac|medical|doctor|dental|hospital|clinic|fitness|gym|cvs|walgreens/, "Health"],
    [/entertain|attraction|movie|cinema|theat|netflix|spotify|hulu|disney|game|concert|streaming|subscription/, "Entertainment"],
    [/merchandise|department store|retail|amazon|shopping|apparel|electronics|supplies|online/, "Shopping"],
  ];
  for (const [re, cat] of rules) if (re.test(t)) return cat;
  return "Other";
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("File is empty.");

  // find a column by header name: exact match wins, else substring match
  const findCol = (hdr, ...names) => {
    const norm = hdr.map((h) => h.trim().toLowerCase());
    for (const n of names) {
      const exact = norm.indexOf(n);
      if (exact !== -1) return exact;
    }
    for (const n of names) {
      const partial = norm.findIndex((h) => h.includes(n));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  let headerIdx = -1, col = {};
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const di = findCol(rows[i], "date"), ai = findCol(rows[i], "amount");
    if (di !== -1 && ai !== -1) {
      headerIdx = i;
      col = {
        date: di, amount: ai,
        desc: findCol(rows[i], "description", "extended details", "merchant"),
        category: findCol(rows[i], "category"),
        ref: findCol(rows[i], "reference"),
      };
      break;
    }
  }

  let dataRows;
  if (headerIdx === -1) {
    // headerless Amex: Date, Description, Amount
    if (!normDate(rows[0][0]) || rows[0].length < 3) throw new Error("Unrecognised CSV layout.");
    col = { date: 0, desc: 1, amount: rows[0].length - 1, category: -1, ref: -1 };
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
    });
  }
  if (!parsed.length) throw new Error("No transactions found in the file.");

  // Normalise sign: a card statement is mostly charges. If negatives dominate,
  // the export uses the opposite convention — flip everything.
  const pos = parsed.filter((p) => p.amount > 0).length;
  if (parsed.length - pos > pos) parsed.forEach((p) => (p.amount = -p.amount));

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
  const ok = confirm(
    `Found ${parsed.length} rows.\n\n` +
      `• ${fresh.length} new transactions to add\n` +
      `• ${dupes} already logged (skipped)\n` +
      `• ${credits} payments/credits (skipped)\n\n` +
      `Add ${fresh.length} transactions?`
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
