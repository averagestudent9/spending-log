// Spending Log — a static, private expense tracker.
// All data lives in localStorage under this one key. No network, no accounts.

const STORAGE_KEY = "spending-log:v1";
const CURRENCY = "$"; // change this to "£", "€", etc.

/** @typedef {{id:string,date:string,desc:string,category:string,amount:number}} Expense */

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

// --- init --------------------------------------------------------------
$("date").value = todayISO();
render();
