/* ============================================================
   EMIWise — core finance math
   All amounts are in Indian Rupees (₹). Formatting uses the
   en-IN locale so numbers group as 10,00,000 instead of 1,000,000.
   ============================================================ */

function formatINR(amount) {
  if (!isFinite(amount) || isNaN(amount)) return "₹0";
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

// Clamp helper used throughout for input validation / sensible limits
function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// Standard reducing-balance EMI formula:
//   EMI = P * r * (1+r)^n / ((1+r)^n - 1)
// P = principal, r = monthly interest rate (decimal), n = number of months.
// A zero interest rate is handled as a straight-line split (P / n).
function calculateEMI(principal, annualRatePct, months) {
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

// Builds a full month-by-month amortization schedule.
// extraPayment (prepayment) is applied on top of the EMI every month,
// which shortens the loan and reduces total interest paid.
function buildAmortization(principal, annualRatePct, months, extraPayment = 0) {
  const r = annualRatePct / 12 / 100;
  const emi = calculateEMI(principal, annualRatePct, months);
  let balance = principal;
  const schedule = [];
  let period = 0;

  while (balance > 0.5 && period < 1200) { // 1200-month safety cap (100 years)
    period++;
    const interestPaid = balance * r;
    let principalPaid = emi - interestPaid + extraPayment;
    if (principalPaid > balance) principalPaid = balance;
    balance = balance - principalPaid;
    if (balance < 0) balance = 0;

    schedule.push({
      period,
      emi: interestPaid + principalPaid,
      principalPaid,
      interestPaid,
      balance,
    });
  }
  return schedule;
}

function totalsFromSchedule(schedule) {
  const totalInterest = schedule.reduce((s, r) => s + r.interestPaid, 0);
  const totalPaid = schedule.reduce((s, r) => s + r.emi, 0);
  return { totalInterest, totalPaid, months: schedule.length };
}

function tenureInMonths(value, unit) {
  return unit === "years" ? value * 12 : value;
}

/* ============================================================
   Navigation (mobile hamburger + active link on scroll)
   ============================================================ */

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => navLinks.classList.remove("open"))
);

/* ============================================================
   1. EMI Calculator
   ============================================================ */

const calcAmount = document.getElementById("calc-amount");
const calcRate = document.getElementById("calc-rate");
const calcTenure = document.getElementById("calc-tenure");
const calcTenureUnit = document.getElementById("calc-tenure-unit");
let calcChart = null;

function validatePositive(input, errorEl, label, max) {
  const val = Number(input.value);
  if (input.value === "" || isNaN(val) || val < 0) {
    errorEl.textContent = `${label} can't be negative or empty.`;
    return false;
  }
  if (max && val > max) {
    errorEl.textContent = `${label} seems unrealistically high.`;
    return false;
  }
  errorEl.textContent = "";
  return true;
}

function runCalculator() {
  const amountOk = validatePositive(calcAmount, document.getElementById("calc-amount-error"), "Loan amount", 1000000000);
  const rateOk = validatePositive(calcRate, document.getElementById("calc-rate-error"), "Interest rate", 50);
  const tenureOk = validatePositive(calcTenure, document.getElementById("calc-tenure-error"), "Tenure", 1200);

  const P = Math.max(Number(calcAmount.value) || 0, 0);
  const rate = Math.max(Number(calcRate.value) || 0, 0);
  const months = tenureInMonths(Math.max(Number(calcTenure.value) || 0, 0), calcTenureUnit.value);

  if (!amountOk || !rateOk || !tenureOk || P <= 0 || months <= 0) {
    document.getElementById("calc-emi").textContent = "—";
    document.getElementById("calc-principal").textContent = "—";
    document.getElementById("calc-interest").textContent = "—";
    document.getElementById("calc-total").textContent = "—";
    return;
  }

  const emi = calculateEMI(P, rate, months);
  const totalPaid = emi * months;
  const totalInterest = totalPaid - P;

  document.getElementById("calc-emi").textContent = formatINR(emi);
  document.getElementById("calc-principal").textContent = formatINR(P);
  document.getElementById("calc-interest").textContent = formatINR(totalInterest);
  document.getElementById("calc-total").textContent = formatINR(totalPaid);

  try {
    const ctx = document.getElementById("calc-chart");
    const data = {
      labels: ["Principal", "Total interest"],
      datasets: [{ data: [P, totalInterest], backgroundColor: ["#0B1E3D", "#D89A2B"], borderRadius: 6 }],
    };
    if (calcChart) { calcChart.data = data; calcChart.update(); }
    else calcChart = new Chart(ctx, {
      type: "bar",
      data,
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN") } } },
      },
    });
  } catch (e) {
    console.warn("Chart.js unavailable — skipping calculator chart.", e);
  }

  renderDashboard();
}

[calcAmount, calcRate, calcTenure, calcTenureUnit].forEach((el) => el.addEventListener("input", runCalculator));

document.getElementById("calc-reset").addEventListener("click", () => {
  calcAmount.value = 1000000;
  calcRate.value = 9;
  calcTenure.value = 5;
  calcTenureUnit.value = "years";
  runCalculator();
});

/* ============================================================
   2. Loan Comparison
   ============================================================ */

const compareGrid = document.getElementById("compare-grid");
const compareTableBody = document.querySelector("#compare-table tbody");
let compareChart = null;
let offerCount = 0;

const defaultOffers = [
  { name: "Bank A", amount: 1000000, rate: 9, tenure: 5 },
  { name: "Bank B", amount: 1000000, rate: 10, tenure: 5 },
];

function addOfferCard(preset) {
  offerCount++;
  const label = preset ? preset.name : "Offer " + offerCount;
  const card = document.createElement("div");
  card.className = "offer-card";
  card.innerHTML = `
    <button class="remove-offer" title="Remove this offer">✕</button>
    <h4>${label}</h4>
    <div class="field">
      <label>Loan amount (₹)</label>
      <input type="number" class="offer-amount" value="${preset ? preset.amount : 1000000}" min="0" step="1000">
    </div>
    <div class="field">
      <label>Interest rate (% per year)</label>
      <input type="number" class="offer-rate" value="${preset ? preset.rate : 9}" min="0" max="50" step="0.05">
    </div>
    <div class="field">
      <label>Tenure (years)</label>
      <input type="number" class="offer-tenure" value="${preset ? preset.tenure : 5}" min="1" step="1">
    </div>
  `;
  compareGrid.appendChild(card);
  card.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", runComparison));
  card.querySelector(".remove-offer").addEventListener("click", () => {
    card.remove();
    runComparison();
  });
}

document.getElementById("add-loan-btn").addEventListener("click", () => addOfferCard(null));

function runComparison() {
  const cards = Array.from(compareGrid.querySelectorAll(".offer-card"));
  cards.forEach((c) => c.classList.remove("cheaper"));

  const rows = cards.map((card, i) => {
    const name = card.querySelector("h4").textContent;
    const amount = Math.max(Number(card.querySelector(".offer-amount").value) || 0, 0);
    const rate = Math.max(Number(card.querySelector(".offer-rate").value) || 0, 0);
    const years = Math.max(Number(card.querySelector(".offer-tenure").value) || 0, 0);
    const months = years * 12;
    const emi = months > 0 && amount > 0 ? calculateEMI(amount, rate, months) : 0;
    const totalPaid = emi * months;
    const totalInterest = totalPaid - amount;
    return { card, name, amount, rate, years, emi, totalInterest, totalPaid };
  });

  const valid = rows.filter((r) => r.totalPaid > 0);
  let cheapestIndex = -1;
  if (valid.length >= 2) {
    let minInterest = Infinity;
    rows.forEach((r, i) => {
      if (r.totalPaid > 0 && r.totalInterest < minInterest) {
        minInterest = r.totalInterest;
        cheapestIndex = i;
      }
    });
  }

  compareTableBody.innerHTML = rows
    .map((r, i) => `
      <tr class="${i === cheapestIndex ? "cheaper-row" : ""}">
        <td>${r.name}${i === cheapestIndex ? " 🏆" : ""}</td>
        <td>${formatINR(r.amount)}</td>
        <td>${r.rate}%</td>
        <td>${r.years} yrs</td>
        <td>${formatINR(r.emi)}</td>
        <td>${formatINR(r.totalInterest)}</td>
        <td>${formatINR(r.totalPaid)}</td>
      </tr>`)
    .join("");

  const verdictCard = document.getElementById("compare-verdict-card");
  const verdictEl = document.getElementById("compare-verdict");
  if (rows.length === 2 && rows[0].totalPaid > 0 && rows[1].totalPaid > 0) {
    const [a, b] = rows;
    const cheaperName = a.totalInterest <= b.totalInterest ? a.name : b.name;
    const interestDiff = Math.abs(a.totalInterest - b.totalInterest);
    const emiDiff = Math.abs(a.emi - b.emi);
    verdictCard.style.display = "block";
    verdictEl.innerHTML = `<strong>${cheaperName}</strong> is the financially cheaper option — interest difference of <strong>${formatINR(interestDiff)}</strong>, EMI difference of <strong>${formatINR(emiDiff)}</strong> per month.`;
    rows.forEach((r, i) => { if (i === cheapestIndex) r.card.classList.add("cheaper"); });
  } else {
    verdictCard.style.display = "none";
  }

  try {
    const ctx = document.getElementById("compare-chart");
    const data = {
      labels: rows.map((r) => r.name),
      datasets: [
        { label: "EMI", data: rows.map((r) => r.emi), backgroundColor: "#0B1E3D", borderRadius: 6 },
        { label: "Total interest", data: rows.map((r) => r.totalInterest), backgroundColor: "#D89A2B", borderRadius: 6 },
      ],
    };
    if (compareChart) { compareChart.data = data; compareChart.update(); }
    else compareChart = new Chart(ctx, {
      type: "bar",
      data,
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: { y: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN") } } },
      },
    });
  } catch (e) {
    console.warn("Chart.js unavailable — skipping comparison chart.", e);
  }
}

document.getElementById("compare-type") && document.getElementById("compare-type").addEventListener("change", runComparison);
defaultOffers.forEach(addOfferCard);
runComparison();

/* ============================================================
   3. Amortization Schedule
   ============================================================ */

const amortAmount = document.getElementById("amort-amount");
const amortRate = document.getElementById("amort-rate");
const amortTenure = document.getElementById("amort-tenure");
const amortTableBody = document.querySelector("#amort-table tbody");
const amortSearch = document.getElementById("amort-search");
const amortPaginationEl = document.getElementById("amort-pagination");
let amortView = "monthly";
let amortRows = []; // currently computed rows (monthly or yearly), pre-filter
let amortPage = 1;
const AMORT_PAGE_SIZE = 12;

function computeAmortRows() {
  const P = Math.max(Number(amortAmount.value) || 0, 0);
  const rate = Math.max(Number(amortRate.value) || 0, 0);
  const months = Math.max(Number(amortTenure.value) || 0, 0) * 12;
  if (P <= 0 || months <= 0) return [];

  const schedule = buildAmortization(P, rate, months);
  const totals = totalsFromSchedule(schedule);
  document.getElementById("amort-total-principal").textContent = formatINR(P);
  document.getElementById("amort-total-interest").textContent = formatINR(totals.totalInterest);
  document.getElementById("amort-total-payment").textContent = formatINR(totals.totalPaid);

  if (amortView === "monthly") {
    return schedule.map((r) => ({
      label: "Month " + r.period,
      searchKey: String(r.period),
      emi: r.emi,
      principal: r.principalPaid,
      interest: r.interestPaid,
      balance: r.balance,
    }));
  }
  const years = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    years.push({
      label: "Year " + (Math.floor(i / 12) + 1),
      searchKey: String(Math.floor(i / 12) + 1),
      emi: chunk.reduce((s, r) => s + r.emi, 0),
      principal: chunk.reduce((s, r) => s + r.principalPaid, 0),
      interest: chunk.reduce((s, r) => s + r.interestPaid, 0),
      balance: chunk[chunk.length - 1].balance,
    });
  }
  return years;
}

function renderAmortTable() {
  const query = amortSearch.value.trim().toLowerCase();
  const filtered = query ? amortRows.filter((r) => r.searchKey.includes(query) || r.label.toLowerCase().includes(query)) : amortRows;

  const totalPages = Math.max(Math.ceil(filtered.length / AMORT_PAGE_SIZE), 1);
  if (amortPage > totalPages) amortPage = totalPages;
  const start = (amortPage - 1) * AMORT_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + AMORT_PAGE_SIZE);

  amortTableBody.innerHTML = pageRows
    .map((r) => `
      <tr>
        <td>${r.label}</td>
        <td>${formatINR(r.emi)}</td>
        <td>${formatINR(r.principal)}</td>
        <td>${formatINR(r.interest)}</td>
        <td>${formatINR(r.balance)}</td>
      </tr>`)
    .join("") || `<tr><td colspan="5" style="text-align:center;color:#5B6478;">No matching rows.</td></tr>`;

  // Pagination controls
  let pagHtml = `<button ${amortPage === 1 ? "disabled" : ""} id="amort-prev">‹ Prev</button>`;
  pagHtml += `<span style="font-size:0.82rem;color:#5B6478;">Page ${amortPage} of ${totalPages}</span>`;
  pagHtml += `<button ${amortPage === totalPages ? "disabled" : ""} id="amort-next">Next ›</button>`;
  amortPaginationEl.innerHTML = pagHtml;

  const prevBtn = document.getElementById("amort-prev");
  const nextBtn = document.getElementById("amort-next");
  if (prevBtn) prevBtn.addEventListener("click", () => { amortPage--; renderAmortTable(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { amortPage++; renderAmortTable(); });
}

function renderAmortization() {
  amortRows = computeAmortRows();
  amortPage = 1;
  renderAmortTable();
}

document.querySelectorAll(".view-toggle .toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle .toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    amortView = btn.dataset.view;
    renderAmortization();
  });
});

[amortAmount, amortRate, amortTenure].forEach((el) => el.addEventListener("input", renderAmortization));
amortSearch.addEventListener("input", () => { amortPage = 1; renderAmortTable(); });

document.getElementById("amort-export").addEventListener("click", () => {
  if (!amortRows.length) return;
  const header = "Period,EMI,Principal,Interest,Balance\n";
  const rows = amortRows.map((r) => `${r.label},${Math.round(r.emi)},${Math.round(r.principal)},${Math.round(r.interest)},${Math.round(r.balance)}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "emiwise-amortization-schedule.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================================================
   4. Prepayment Simulator
   ============================================================ */

const preAmount = document.getElementById("pre-amount");
const preRate = document.getElementById("pre-rate");
const preTenure = document.getElementById("pre-tenure");
const preExtra = document.getElementById("pre-extra");
let preChart = null;

function runPrepayment() {
  const P = Math.max(Number(preAmount.value) || 0, 0);
  const rate = Math.max(Number(preRate.value) || 0, 0);
  const months = Math.max(Number(preTenure.value) || 0, 0) * 12;
  const extra = Math.max(Number(preExtra.value) || 0, 0);
  if (P <= 0 || months <= 0) return;

  const baseSchedule = buildAmortization(P, rate, months, 0);
  const newSchedule = buildAmortization(P, rate, months, extra);
  const baseTotals = totalsFromSchedule(baseSchedule);
  const newTotals = totalsFromSchedule(newSchedule);

  document.getElementById("pre-base-tenure").textContent = baseTotals.months;
  document.getElementById("pre-base-interest").textContent = formatINR(baseTotals.totalInterest);
  document.getElementById("pre-new-tenure").textContent = newTotals.months;
  document.getElementById("pre-new-interest").textContent = formatINR(newTotals.totalInterest);
  document.getElementById("pre-months-saved").textContent = Math.max(baseTotals.months - newTotals.months, 0) + " months";
  document.getElementById("pre-interest-saved").textContent = formatINR(Math.max(baseTotals.totalInterest - newTotals.totalInterest, 0));

  try {
    const ctx = document.getElementById("pre-chart");
    const labels = Array.from({ length: baseSchedule.length }, (_, i) => i + 1);
    const data = {
      labels,
      datasets: [
        { label: "Balance without prepayment", data: baseSchedule.map((r) => r.balance), borderColor: "#0B1E3D", backgroundColor: "transparent", pointRadius: 0, tension: 0.1 },
        { label: "Balance with prepayment", data: newSchedule.map((r) => r.balance), borderColor: "#1E9E5A", backgroundColor: "transparent", pointRadius: 0, tension: 0.1 },
      ],
    };
    if (preChart) { preChart.data = data; preChart.update(); }
    else preChart = new Chart(ctx, {
      type: "line",
      data,
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: { x: { title: { display: true, text: "Month" } }, y: { ticks: { callback: (v) => "₹" + v.toLocaleString("en-IN") } } },
      },
    });
  } catch (e) {
    console.warn("Chart.js unavailable — skipping prepayment chart.", e);
  }
}

[preAmount, preRate, preTenure, preExtra].forEach((el) => el.addEventListener("input", runPrepayment));

/* ============================================================
   5. Affordability Calculator
   Thresholds are defined here so they're easy to tweak.
   ============================================================ */

const AFFORDABILITY_THRESHOLDS = {
  affordableMax: 0.30,   // below 30% of income = affordable
  moderateMax: 0.50,     // 30%-50% = moderate burden, above = high burden
};

const affSalary = document.getElementById("afford-salary");
const affExisting = document.getElementById("afford-existing-emi");
const affExpenses = document.getElementById("afford-expenses");
const affNewEmi = document.getElementById("afford-new-emi");
let affChart = null;

function runAffordability() {
  const salary = Math.max(Number(affSalary.value) || 0, 0);
  const existingEmi = Math.max(Number(affExisting.value) || 0, 0);
  const expenses = Math.max(Number(affExpenses.value) || 0, 0);
  const newEmi = Math.max(Number(affNewEmi.value) || 0, 0);

  const totalEmi = existingEmi + newEmi;
  const totalCommitments = totalEmi + expenses;
  const leftover = salary - totalCommitments;
  const ratio = salary > 0 ? totalEmi / salary : 1;

  const verdictCard = document.getElementById("afford-verdict");
  const badge = document.getElementById("afford-badge");
  const detail = document.getElementById("afford-detail");
  const statsList = document.getElementById("afford-stats");

  verdictCard.classList.remove("good", "moderate", "bad");
  let tier;
  if (salary <= 0) {
    tier = "bad"; badge.textContent = "Enter your salary";
  } else if (leftover < 0 || ratio > AFFORDABILITY_THRESHOLDS.moderateMax) {
    tier = "bad"; badge.textContent = "High financial burden";
  } else if (ratio > AFFORDABILITY_THRESHOLDS.affordableMax) {
    tier = "moderate"; badge.textContent = "Moderate burden";
  } else {
    tier = "good"; badge.textContent = "Affordable";
  }
  verdictCard.classList.add(tier);

  detail.textContent = salary > 0
    ? `Your EMIs would use ${(ratio * 100).toFixed(1)}% of your monthly income.`
    : "Enter a monthly salary to see your affordability assessment.";

  statsList.innerHTML = `
    <li>Total monthly commitments: <strong>${formatINR(totalCommitments)}</strong></li>
    <li>EMI-to-income ratio: <strong>${(ratio * 100).toFixed(1)}%</strong></li>
    <li>Disposable income after EMIs & expenses: <strong>${formatINR(leftover)}</strong></li>
  `;

  try {
    const ctx = document.getElementById("afford-chart");
    const data = {
      labels: ["Living expenses", "Existing EMIs", "New EMI", "Leftover"],
      datasets: [{ data: [expenses, existingEmi, newEmi, Math.max(leftover, 0)], backgroundColor: ["#5B6478", "#D89A2B", "#0B1E3D", "#1E9E5A"] }],
    };
    if (affChart) { affChart.data = data; affChart.update(); }
    else affChart = new Chart(ctx, { type: "doughnut", data, options: { plugins: { legend: { position: "bottom" } } } });
  } catch (e) {
    console.warn("Chart.js unavailable — skipping affordability chart.", e);
  }
}

[affSalary, affExisting, affExpenses, affNewEmi].forEach((el) => el.addEventListener("input", runAffordability));

/* ============================================================
   6. Dashboard (mirrors the EMI Calculator's loan)
   ============================================================ */

let dashPie = null;
let dashBalance = null;
let dashBreakdown = null;

function renderDashboard() {
  const P = Math.max(Number(calcAmount.value) || 0, 0);
  const rate = Math.max(Number(calcRate.value) || 0, 0);
  const months = tenureInMonths(Math.max(Number(calcTenure.value) || 0, 0), calcTenureUnit.value);
  if (P <= 0 || months <= 0) return;

  const schedule = buildAmortization(P, rate, months);
  const totals = totalsFromSchedule(schedule);
  const emi = calculateEMI(P, rate, months);

  document.getElementById("dash-emi").textContent = formatINR(emi);
  document.getElementById("dash-interest").textContent = formatINR(totals.totalInterest);
  document.getElementById("dash-total").textContent = formatINR(totals.totalPaid);
  document.getElementById("dash-tenure").textContent = months + " months";

  try {
  const pieData = {
    labels: ["Principal", "Total interest"],
    datasets: [{ data: [P, totals.totalInterest], backgroundColor: ["#0B1E3D", "#D89A2B"] }],
  };
  if (dashPie) { dashPie.data = pieData; dashPie.update(); }
  else dashPie = new Chart(document.getElementById("dash-pie"), { type: "pie", data: pieData, options: { plugins: { legend: { position: "bottom" } } } });

  const balData = {
    labels: schedule.map((r) => r.period),
    datasets: [{ label: "Remaining balance", data: schedule.map((r) => r.balance), borderColor: "#1E9E5A", backgroundColor: "transparent", pointRadius: 0 }],
  };
  if (dashBalance) { dashBalance.data = balData; dashBalance.update(); }
  else dashBalance = new Chart(document.getElementById("dash-balance"), {
    type: "line", data: balData,
    options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "Month" } } } },
  });

  const first24 = schedule.slice(0, 24);
  const breakdownData = {
    labels: first24.map((r) => "M" + r.period),
    datasets: [
      { label: "Principal", data: first24.map((r) => r.principalPaid), backgroundColor: "#0B1E3D" },
      { label: "Interest", data: first24.map((r) => r.interestPaid), backgroundColor: "#D89A2B" },
    ],
  };
  if (dashBreakdown) { dashBreakdown.data = breakdownData; dashBreakdown.update(); }
  else dashBreakdown = new Chart(document.getElementById("dash-breakdown"), {
    type: "bar", data: breakdownData,
    options: { plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true } } },
  });
  } catch (e) {
    console.warn("Chart.js unavailable — skipping dashboard charts.", e);
  }
}

/* ============================================================
   7. Loan Types — detail modal
   ============================================================ */

const LOAN_DETAILS = {
  home: {
    icon: "🏠",
    title: "Home Loan",
    tagline: "Buying, constructing, or renovating a house or flat.",
    stats: [
      { label: "Illustrative rate", value: "8% – 10.5% p.a." },
      { label: "Typical tenure", value: "10 – 30 years" },
      { label: "Typical LTV", value: "Up to 75–90% of property value" },
    ],
    eligibility: [
      "Stable income (salaried or self-employed) with 2+ years of history",
      "Age typically 21–65 at loan maturity",
      "Credit score generally 700+ for the best rates",
      "Clear title on the property being purchased",
    ],
    documents: [
      "Identity & address proof",
      "Income proof (salary slips / ITRs for 2–3 years)",
      "Bank statements (6 months)",
      "Property documents & sale agreement",
    ],
    pros: [
      "Lowest interest rates of any common loan type",
      "Long tenure keeps EMIs manageable",
      "Tax benefits on principal & interest in many jurisdictions",
    ],
    cons: [
      "Property is collateral — default risks losing it",
      "Longest total interest paid due to long tenure",
      "Processing, valuation & legal fees add to upfront cost",
    ],
    tip: "A slightly shorter tenure or occasional prepayment can cut total interest substantially — try the Prepayment Simulator above with this loan's numbers.",
  },
  car: {
    icon: "🚗",
    title: "Car Loan",
    tagline: "Buying a new or used vehicle.",
    stats: [
      { label: "Illustrative rate", value: "8.5% – 12% p.a." },
      { label: "Typical tenure", value: "3 – 7 years" },
      { label: "Typical LTV", value: "Up to 80–100% of on-road price" },
    ],
    eligibility: [
      "Stable income source (salaried or self-employed)",
      "Age typically 21–65 at loan maturity",
      "Reasonable credit score; new cars get easier approval than used",
      "Down payment usually expected for used vehicles",
    ],
    documents: [
      "Identity & address proof",
      "Income proof (salary slips or ITRs)",
      "Bank statements (3–6 months)",
      "Vehicle quotation / proforma invoice",
    ],
    pros: [
      "Quick approval and disbursal, often within days",
      "Competitive rates since the vehicle secures the loan",
      "Flexible tenure options to match budget",
    ],
    cons: [
      "Vehicle value depreciates faster than the loan balance early on",
      "Used-car loans carry meaningfully higher rates",
      "Vehicle can be repossessed on default",
    ],
    tip: "A larger down payment shrinks both the EMI and the total interest — model a few down-payment scenarios in the Compare Loans section.",
  },
  personal: {
    icon: "👤",
    title: "Personal Loan",
    tagline: "Unsecured funds for any personal need — medical, travel, wedding, debt consolidation.",
    stats: [
      { label: "Illustrative rate", value: "10.5% – 18% p.a." },
      { label: "Typical tenure", value: "1 – 5 years" },
      { label: "Collateral", value: "None (unsecured)" },
    ],
    eligibility: [
      "Regular income, salaried or self-employed",
      "Credit score is the biggest factor — 750+ gets the best rates",
      "Existing debt obligations are weighed heavily",
      "Minimum income thresholds vary by lender",
    ],
    documents: [
      "Identity & address proof",
      "Income proof (salary slips / ITRs)",
      "Bank statements (3–6 months)",
      "Existing loan statements, if any",
    ],
    pros: [
      "No collateral required",
      "Fast disbursal, sometimes within hours",
      "Can be used for literally any purpose",
    ],
    cons: [
      "Highest interest rates among common consumer loans",
      "Shorter tenure means higher EMIs relative to loan size",
      "Rates are very sensitive to credit score",
    ],
    tip: "Because rates are high, run this through the Affordability Calculator above before committing — personal loan EMIs eat into your ratio fastest.",
  },
  education: {
    icon: "🎓",
    title: "Education Loan",
    tagline: "Tuition and living costs for higher studies, in-country or abroad.",
    stats: [
      { label: "Illustrative rate", value: "8% – 13% p.a." },
      { label: "Typical tenure", value: "5 – 15 years" },
      { label: "Moratorium", value: "Course period + 6–12 months" },
    ],
    eligibility: [
      "Admission confirmation from a recognized institution",
      "Co-applicant (parent/guardian) usually required",
      "Academic record and course/institution reputation matter",
      "Collateral may be required above certain loan amounts",
    ],
    documents: [
      "Admission letter & fee structure",
      "Academic records / mark sheets",
      "Co-applicant's income proof",
      "Collateral documents, if applicable",
    ],
    pros: [
      "Repayment starts only after course completion (moratorium)",
      "Often the only way to fund higher studies without depleting savings",
      "Interest-only payments possible during moratorium in some cases",
    ],
    cons: [
      "Interest usually accrues during the moratorium, growing the balance",
      "Larger loans may require collateral or a strong co-applicant",
      "Tenure can stretch well into early career years",
    ],
    tip: "Even small interest-only payments during the moratorium period can meaningfully reduce the total interest paid over the life of the loan.",
  },
};

const loanModalOverlay = document.getElementById("loan-modal-overlay");
const loanModalBox = document.getElementById("loan-modal-box");
let loanModalLastFocused = null;

function openLoanModal(key) {
  const d = LOAN_DETAILS[key];
  if (!d) return;

  document.getElementById("loan-modal-icon").textContent = d.icon;
  document.getElementById("loan-modal-title").textContent = d.title;
  document.getElementById("loan-modal-tagline").textContent = d.tagline;

  document.getElementById("loan-modal-stats").innerHTML = d.stats
    .map((s) => `<div>${s.label}<strong>${s.value}</strong></div>`)
    .join("");

  document.getElementById("loan-modal-eligibility").innerHTML = d.eligibility.map((li) => `<li>${li}</li>`).join("");
  document.getElementById("loan-modal-documents").innerHTML = d.documents.map((li) => `<li>${li}</li>`).join("");
  document.getElementById("loan-modal-pros").innerHTML = d.pros.map((li) => `<li>${li}</li>`).join("");
  document.getElementById("loan-modal-cons").innerHTML = d.cons.map((li) => `<li>${li}</li>`).join("");
  document.getElementById("loan-modal-tip").textContent = d.tip;

  loanModalLastFocused = document.activeElement;
  loanModalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";
  document.getElementById("loan-modal-close").focus();
}

function closeLoanModal() {
  loanModalOverlay.classList.remove("open");
  document.body.style.overflow = "";
  if (loanModalLastFocused) loanModalLastFocused.focus();
}

document.querySelectorAll(".loan-type-card").forEach((card) => {
  card.addEventListener("click", () => openLoanModal(card.dataset.loan));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openLoanModal(card.dataset.loan);
    }
  });
});

document.getElementById("loan-modal-close").addEventListener("click", closeLoanModal);
loanModalOverlay.addEventListener("click", (e) => {
  if (e.target === loanModalOverlay) closeLoanModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && loanModalOverlay.classList.contains("open")) closeLoanModal();
});

/* ============================================================
   Initial render
   Each section is wrapped so that an error in one (e.g. Chart.js
   failing to load from the CDN) can never stop the others from
   running — every calculator/table works independently.
   ============================================================ */

function safeRun(label, fn) {
  try { fn(); }
  catch (e) { console.error("EMIWise: " + label + " failed to initialize.", e); }
}

safeRun("EMI calculator", runCalculator);
safeRun("Amortization schedule", renderAmortization);
safeRun("Prepayment simulator", runPrepayment);
safeRun("Affordability calculator", runAffordability);
safeRun("Dashboard", renderDashboard);
