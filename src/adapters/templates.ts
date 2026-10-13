/**
 * Workspace templates (provided by Operations/Teachers).
 * Datasets are SYNTHETIC demo data generated deterministically in the browser,
 * modelled on the Cole Labs schema (gd_don_hang_all, dim_customers…). They are inputs only;
 * every analysis result shown in the platform comes from code actually executed in the runtime.
 */

export interface TemplateFile { path: string; content: string }
export interface LabDoc { id: string; title: string; author: string; kind: 'lab' | 'doc' | 'hint'; body: string }
export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  stack: string[];
  labs: LabDoc[];
  build: () => TemplateFile[];
}

// ---------- deterministic RNG ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const day = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const pad = (n: number, w: number) => String(n).padStart(w, '0');

function toCsv(header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}

function injectDuplicates(r: () => number, rows: (string | number | null)[][], n: number) {
  for (let i = 0; i < n; i++) {
    const src = rows[Math.floor(r() * rows.length)];
    rows.splice(Math.floor(r() * rows.length), 0, [...src]);
  }
}

// ---------- notebooks (nbformat 4) ----------
function nb(cells: { type: 'code' | 'markdown'; source: string }[]) {
  return JSON.stringify({
    nbformat: 4, nbformat_minor: 5,
    metadata: { kernelspec: { name: 'python3', display_name: 'Python 3 (AI Lab runtime)' }, language_info: { name: 'python' } },
    cells: cells.map((c, i) => ({
      id: `c${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
      cell_type: c.type, metadata: {}, source: c.source,
      ...(c.type === 'code' ? { outputs: [], execution_count: null } : {}),
    })),
  }, null, 1);
}

// ---------- E-commerce (Cole Labs) ----------
const PROVINCES = ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng', 'Bình Dương', 'Đồng Nai', 'Khánh Hòa'];
const GROUPS: [string, number][] = [['Áo thun', 249000], ['Quần jeans', 459000], ['Váy', 389000], ['Áo khoác', 599000], ['Phụ kiện', 129000]];
const CHANNELS = ['Website', 'Facebook', 'Shopee', 'Store'];

function buildOrders() {
  const r = rng(20260701);
  const start = Date.UTC(2024, 0, 1), end = Date.UTC(2026, 6, 1);
  const customers: (string | number | null)[][] = [];
  const orders: (string | number | null)[][] = [];
  let oid = 1;
  for (let c = 1; c <= 700; c++) {
    const cid = 'C' + pad(c, 4);
    const signup = start + Math.floor(r() * (Date.UTC(2025, 11, 31) - start));
    const lambda = Math.exp((r() - 0.6) * 2.2) * 0.9; // orders / month
    const churnP = Math.min(0.85, 0.25 + 0.35 / (lambda + 0.3));
    const churnAt = r() < churnP ? signup + 30 * day + r() * (end - signup) : end;
    const level = lambda > 1.6 ? 'VIP' : lambda > 0.9 ? 'Gold' : lambda > 0.45 ? 'Silver' : 'Member';
    const home = pick(r, PROVINCES);
    customers.push([cid, r() < 0.68 ? 'F' : 'M', 1975 + Math.floor(r() * 30), iso(signup), level, pick(r, CHANNELS)]);
    let t = signup + r() * 20 * day;
    while (t < Math.min(churnAt, end)) {
      const [group, base] = pick(r, GROUPS);
      const qty = 1 + Math.floor(r() * r() * 4);
      const price = Math.round((base * (0.85 + r() * 0.3)) / 1000) * 1000;
      const disc = pick(r, [0, 0, 0, 0.05, 0.1, 0.2]);
      const missPrice = r() < 0.015, missDisc = r() < 0.04, missProv = r() < 0.03;
      const total = missPrice ? null : Math.round(qty * price * (1 - disc));
      orders.push([
        'ORD-' + pad(oid++, 6), cid, iso(t), missProv ? null : r() < 0.85 ? home : pick(r, PROVINCES),
        pick(r, CHANNELS), group, qty, missPrice ? null : price, missDisc ? null : disc, total, r() < 0.06 ? 1 : 0,
      ]);
      t += (-Math.log(1 - r()) * 30 * day) / lambda;
    }
  }
  orders.sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  injectDuplicates(r, orders, 140);
  return {
    orders: toCsv(['order_id', 'customer_id', 'order_date', 'province', 'channel', 'product_group', 'quantity', 'unit_price', 'discount', 'total_amount', 'is_returned'], orders),
    customers: toCsv(['customer_id', 'gender', 'birth_year', 'signup_date', 'level', 'preferred_channel'], customers),
  };
}

const ECOM_FEATURES_PY = `"""Feature helpers for the churn project (importable from notebooks: \`from features import ...\`)."""
import pandas as pd


def build_rfm(orders: pd.DataFrame, cutoff: str) -> pd.DataFrame:
    """RFM-style features computed only from orders strictly before \`cutoff\`."""
    cut = pd.Timestamp(cutoff)
    hist = orders[orders["order_date"] < cut]
    kept = hist[hist["is_returned"] == 0]
    g = kept.groupby("customer_id")
    rfm = pd.DataFrame({
        "recency_days": (cut - g["order_date"].max()).dt.days,
        "frequency": g["order_id"].nunique(),
        "monetary": g["total_amount"].sum(),
        "avg_order_value": g["total_amount"].mean(),
        "return_rate": hist.groupby("customer_id")["is_returned"].mean(),
    })
    rfm.index.name = "customer_id"
    return rfm.reset_index().fillna(0)


def label_churn(rfm: pd.DataFrame, orders: pd.DataFrame, cutoff: str, horizon_end: str) -> pd.DataFrame:
    """churned = 1 if the customer has no order in [cutoff, horizon_end)."""
    window = orders[(orders["order_date"] >= pd.Timestamp(cutoff)) & (orders["order_date"] < pd.Timestamp(horizon_end))]
    active = set(window["customer_id"])
    out = rfm.copy()
    out["churned"] = (~out["customer_id"].isin(active)).astype(int)
    return out
`;

const ECOM_NB1 = nb([
  { type: 'markdown', source: '# 01 · Làm sạch dữ liệu đơn hàng\nNotebook mẫu từ template. Bạn được toàn quyền sửa, xoá hoặc viết lại.\n\n- Input: `data/raw/orders.csv` (dữ liệu **synthetic demo** theo schema `gd_don_hang_all`)\n- Gợi ý output: `artifacts/cleaned/orders_clean.csv`' },
  { type: 'code', source: 'import pandas as pd\n\nraw = pd.read_csv("data/raw/orders.csv", parse_dates=["order_date"])\nprint(raw.shape)\nraw.head()' },
  { type: 'code', source: 'print("Duplicate rows:", raw.duplicated().sum())\nraw.isna().sum()' },
  { type: 'code', source: 'df = raw.drop_duplicates()\ndf = df.dropna(subset=["unit_price"]).copy()\ndf["discount"] = df["discount"].fillna(0)\ndf["province"] = df["province"].fillna("Unknown")\ndf["total_amount"] = (df["quantity"] * df["unit_price"] * (1 - df["discount"])).round(0)\nprint(f"{len(raw)} -> {len(df)} rows ({len(raw) - len(df)} removed)")\ndf' },
  { type: 'code', source: 'import os\nos.makedirs("artifacts/cleaned", exist_ok=True)\ndf.to_csv("artifacts/cleaned/orders_clean.csv", index=False)\nprint("saved artifacts/cleaned/orders_clean.csv")' },
]);

const ECOM_NB2 = nb([
  { type: 'markdown', source: '# 02 · Feature engineering & churn model\nCần chạy `01_cleaning` trước để có `artifacts/cleaned/orders_clean.csv` (hoặc tự tạo theo cách của bạn).\n\n`lab.log_experiment(...)` ghi một bản ghi JSON vào `experiments/`. Nền tảng sẽ hiển thị bản ghi đó trong **Models & Experiments**.' },
  { type: 'code', source: 'import os\nimport pandas as pd\nfrom features import build_rfm, label_churn\n\norders = pd.read_csv("artifacts/cleaned/orders_clean.csv", parse_dates=["order_date"])\nrfm = build_rfm(orders, cutoff="2026-03-01")\nrfm = label_churn(rfm, orders, cutoff="2026-03-01", horizon_end="2026-07-01")\nos.makedirs("artifacts/features", exist_ok=True)\nrfm.to_csv("artifacts/features/rfm_features.csv", index=False)\nprint(rfm["churned"].value_counts().to_dict())\nrfm.head()' },
  { type: 'code', source: 'import time, lab\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier\nfrom sklearn.metrics import accuracy_score, f1_score, roc_auc_score, precision_score, recall_score, confusion_matrix\n\nFEATURES = ["recency_days", "frequency", "monetary", "avg_order_value", "return_rate"]\nX, y = rfm[FEATURES], rfm["churned"]\nX_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)\n\ncandidates = [\n    ("logreg", LogisticRegression(max_iter=1000), {"max_iter": 1000}),\n    ("random_forest", RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42), {"n_estimators": 150, "max_depth": 6}),\n    ("gboost", GradientBoostingClassifier(n_estimators=120, learning_rate=0.05, random_state=42), {"n_estimators": 120, "learning_rate": 0.05}),\n]\nfor name, model, params in candidates:\n    t0 = time.time()\n    model.fit(X_tr, y_tr)\n    proba = model.predict_proba(X_te)[:, 1]\n    pred = (proba >= 0.5).astype(int)\n    path = lab.save_model(model, f"models/churn_{name}.pkl")\n    lab.log_experiment(\n        name=f"churn-{name}", model_type=type(model).__name__, framework="scikit-learn",\n        dataset="artifacts/features/rfm_features.csv", params=params,\n        metrics={"accuracy": accuracy_score(y_te, pred), "precision": precision_score(y_te, pred),\n                 "recall": recall_score(y_te, pred), "f1": f1_score(y_te, pred), "roc_auc": roc_auc_score(y_te, proba)},\n        confusion_matrix=confusion_matrix(y_te, pred).tolist(), labels=["active", "churned"],\n        history={"train_loss": list(model.train_score_)} if hasattr(model, "train_score_") else None,\n        model_path=path, duration_s=time.time() - t0,\n    )' },
  { type: 'code', source: 'import matplotlib.pyplot as plt\n\nfig, ax = plt.subplots(figsize=(6, 3))\nrfm.boxplot(column="recency_days", by="churned", ax=ax)\nax.set_title("Recency by churn label"); plt.suptitle("")\nos.makedirs("artifacts/charts", exist_ok=True)\nfig.savefig("artifacts/charts/recency_by_churn.png", dpi=100, bbox_inches="tight")' },
]);

const ECOM_SQL = `-- SQL runs on a local SQLite engine inside your runtime.
-- Every CSV under data/ and artifacts/ is exposed as a table (file name = table name).
SELECT channel,
       COUNT(*)                    AS orders,
       ROUND(AVG(total_amount), 0) AS avg_amount,
       SUM(is_returned)            AS returns
FROM orders
GROUP BY channel
ORDER BY orders DESC;
`;

const ECOM_README = `# Customer churn & segmentation — Cole Labs

**Domain:** E-commerce (thời trang) · **Class:** AI Engineer Fullstack K12

## Mục tiêu (gợi ý)
Dự đoán khách hàng có nguy cơ rời bỏ và phân nhóm khách hàng để phục vụ CSKH/marketing.
Bạn tự chọn thứ tự và cách làm. Không có bước bắt buộc.

## Cấu trúc workspace
| Thư mục | Ý nghĩa |
|---|---|
| \`data/raw/\` | Dataset gốc từ template (synthetic demo theo schema Cole Labs) |
| \`notebooks/\` | Notebook mẫu, có thể sửa tự do |
| \`src/\` | Module Python import được từ notebook |
| \`sql/\` | Truy vấn SQL trên các file CSV |
| \`artifacts/\` | Thành phẩm do code của bạn tạo ra, được tự động đăng ký và theo dõi lineage |
| \`models/\`, \`experiments/\` | Model weights và bản ghi thí nghiệm (\`lab.log_experiment\`) |

## Lưu trữ
- File được lưu vào **workspace storage**, độc lập với runtime.
- Biến trong bộ nhớ runtime (DataFrame…) là **tạm thời**. Muốn giữ lại thì ghi ra file.
`;

const ECOM_DICT = `# Data dictionary — orders.csv (synthetic demo)

| Cột | Kiểu | Mô tả |
|---|---|---|
| order_id | string | Mã đơn |
| customer_id | string | Mã khách hàng (khớp customers.csv) |
| order_date | date | Ngày đặt |
| province | string | Tỉnh/thành giao hàng (có giá trị thiếu) |
| channel | string | Website / Facebook / Shopee / Store |
| product_group | string | Nhóm hàng |
| quantity | int | Số lượng |
| unit_price | int (VND) | Đơn giá (có giá trị thiếu) |
| discount | float | Tỷ lệ giảm giá 0–0.2 (có giá trị thiếu) |
| total_amount | int (VND) | quantity × unit_price × (1 − discount) |
| is_returned | 0/1 | Đơn bị hoàn |

> Dữ liệu chứa **bản ghi trùng lặp có chủ đích** để luyện làm sạch.
`;

// ---------- Banking ----------
function buildTransactions() {
  const r = rng(77001);
  const rows: (string | number | null)[][] = [];
  const cats = ['grocery', 'electronics', 'travel', 'fashion', 'utilities', 'gaming', 'restaurants'];
  const start = Date.UTC(2026, 0, 1);
  for (let i = 1; i <= 4200; i++) {
    const fraud = r() < 0.028;
    const t = start + Math.floor(r() * 180 * day) + (fraud && r() < 0.6 ? Math.floor(r() * 5) * 3600000 : Math.floor(8 + r() * 14) * 3600000);
    const amount = fraud ? Math.round((800 + r() * 9000) * 100) / 100 : Math.round(Math.exp(2 + r() * 4.5) * 100) / 100;
    rows.push([
      'TX' + pad(i, 6), 'AC' + pad(1 + Math.floor(r() * 900), 4), new Date(t).toISOString().slice(0, 19), amount,
      r() < 0.02 ? null : fraud ? pick(r, ['electronics', 'travel', 'gaming']) : pick(r, cats),
      fraud ? pick(r, ['ONLINE', 'ONLINE', 'TRANSFER']) : pick(r, ['POS', 'POS', 'ONLINE', 'ATM', 'TRANSFER']),
      fraud && r() < 0.5 ? pick(r, ['SG', 'US', 'NG', 'RU']) : 'VN',
      r() < 0.03 ? null : fraud ? Math.floor(r() * 5) : Math.floor(r() * 900), fraud ? 1 : 0,
    ]);
  }
  injectDuplicates(r, rows, 90);
  return toCsv(['txn_id', 'account_id', 'ts', 'amount', 'merchant_category', 'channel', 'country', 'device_age_days', 'is_fraud'], rows);
}

const BANK_NB = nb([
  { type: 'markdown', source: '# 01 · Khám phá & làm sạch giao dịch\nDataset: `data/raw/transactions.csv` (**synthetic demo**). Tỷ lệ gian lận rất thấp nên cần chú ý class imbalance.' },
  { type: 'code', source: 'import pandas as pd\ntx = pd.read_csv("data/raw/transactions.csv", parse_dates=["ts"])\nprint(tx.shape, "fraud rate:", round(tx.is_fraud.mean(), 4))\ntx.head()' },
  { type: 'code', source: 'clean = tx.drop_duplicates().copy()\nclean["merchant_category"] = clean["merchant_category"].fillna("unknown")\nclean["device_age_days"] = clean["device_age_days"].fillna(clean["device_age_days"].median())\nclean["hour"] = clean["ts"].dt.hour\nimport os; os.makedirs("artifacts/cleaned", exist_ok=True)\nclean.to_csv("artifacts/cleaned/transactions_clean.csv", index=False)\nclean.groupby("is_fraud")[["amount", "device_age_days", "hour"]].mean()' },
]);

// ---------- Healthcare ----------
function buildAdmissions() {
  const r = rng(4242);
  const rows: (string | number | null)[][] = [];
  const dx = ['cardiac', 'respiratory', 'diabetes', 'orthopedic', 'infection', 'neuro'];
  for (let i = 1; i <= 1600; i++) {
    const age = 18 + Math.floor(r() * 75);
    const prior = Math.floor(r() * r() * 6);
    const los = 1 + Math.floor(r() * 12);
    const p = 0.05 + prior * 0.06 + (age > 65 ? 0.08 : 0) + (los > 8 ? 0.05 : 0);
    rows.push(['AD' + pad(i, 5), 'PT' + pad(1 + Math.floor(r() * 1100), 5), age, r() < 0.5 ? 'F' : 'M', pick(r, dx), los, prior,
      r() < 0.03 ? null : pick(r, ['home', 'home', 'home', 'transfer', 'nursing']), r() < p ? 1 : 0]);
  }
  injectDuplicates(r, rows, 40);
  return toCsv(['admission_id', 'patient_id', 'age', 'sex', 'diagnosis_group', 'length_of_stay', 'num_prior_admissions', 'discharge_type', 'readmitted_30d'], rows);
}

const LAB_CLEAN: LabDoc = {
  id: 'lab-clean', title: 'Lab · Làm sạch dữ liệu bảng', author: 'ThS. Nguyễn Minh', kind: 'lab',
  body: `# Lab · Làm sạch dữ liệu bảng

> Tài liệu tham khảo. Bạn **không bắt buộc** làm theo thứ tự này.

## Câu hỏi gợi mở
1. Dataset có bao nhiêu bản ghi trùng lặp? Trùng toàn bộ hay chỉ trùng khoá?
2. Cột nào có giá trị thiếu? Thiếu ngẫu nhiên hay có quy luật?
3. Nên **xoá** hay **điền** giá trị thiếu? Giải thích cho từng cột.

## Kỹ thuật hay dùng
\`\`\`python
df.duplicated().sum()
df.isna().mean().sort_values(ascending=False)
df = df.drop_duplicates()
df["col"] = df["col"].fillna(value)
\`\`\`

## Kiểm tra kết quả
- Mở file output trong **Data Viewer**, chuyển sang tab **Compare** để so sánh với input.
- Ghi lại quyết định của bạn trong **Notes** để sau này giải thích lại.
`,
};

const LAB_CHURN: LabDoc = {
  id: 'lab-churn', title: 'Lab · Mô hình churn có kiểm soát leakage', author: 'ThS. Nguyễn Minh', kind: 'lab',
  body: `# Lab · Mô hình churn

## Ý tưởng chính
- Tính feature **trước** mốc cutoff, gán nhãn bằng hành vi **sau** cutoff. Tránh dùng tương lai để dự đoán quá khứ.
- So sánh ít nhất 2–3 mô hình. Dùng \`lab.log_experiment\` để lưu metrics/params.

## Gợi ý đánh giá
- ROC-AUC, F1, confusion matrix.
- Precision vs Recall: chiến dịch giữ chân khách tốn chi phí, vậy bạn ưu tiên metric nào?

## Mở rộng (tự chọn)
- Phân cụm K-Means trên RFM để gán segment (VIP, Loyal, At-risk…).
- Đóng gói model thành API dự đoán.
`,
};

const HINT_STORAGE: LabDoc = {
  id: 'doc-storage', title: 'Docs · Lưu trữ & runtime hoạt động thế nào', author: 'AI Lab Ops', kind: 'doc',
  body: `# Lưu trữ & runtime

| Thành phần | Nơi lưu | Mất khi dừng runtime? |
|---|---|---|
| File, notebook, source code | Workspace storage | Không |
| Artifacts + metadata + lineage | Workspace storage | Không |
| Notes, lịch sử chạy (runs) | Workspace storage | Không |
| Biến trong bộ nhớ (DataFrame, model chưa lưu) | RAM của runtime | **Có** |

- Mỗi lần chạy, file được code ghi ra sẽ được **đồng bộ về storage** và đăng ký thành artifact (trừ \`.py\`, \`.ipynb\`, \`.md\`).
- Lineage tự động chỉ ghi nhận việc **đọc/ghi file bằng \`open()\`/pandas** trong runtime. Quan hệ khác hãy tự thêm bằng *manual link*.
- Prototype: storage = IndexedDB trên trình duyệt; runtime = Python (Pyodide) trong Web Worker. Bản production sẽ thay bằng object storage và container riêng cho từng workspace.
`,
};

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'ecom-churn',
    name: 'E-commerce · Churn & Segmentation',
    description: 'Đơn hàng + khách hàng (synthetic, schema Cole Labs). Notebook làm sạch, feature RFM, train 3 mô hình.',
    stack: ['pandas', 'scikit-learn', 'matplotlib', 'SQL'],
    labs: [LAB_CLEAN, LAB_CHURN, HINT_STORAGE],
    build: () => {
      const { orders, customers } = buildOrders();
      return [
        { path: 'README.md', content: ECOM_README },
        { path: 'docs/data-dictionary.md', content: ECOM_DICT },
        { path: 'data/raw/orders.csv', content: orders },
        { path: 'data/raw/customers.csv', content: customers },
        { path: 'notebooks/01_cleaning.ipynb', content: ECOM_NB1 },
        { path: 'notebooks/02_features_train.ipynb', content: ECOM_NB2 },
        { path: 'src/features.py', content: ECOM_FEATURES_PY },
        { path: 'sql/explore.sql', content: ECOM_SQL },
      ];
    },
  },
  {
    id: 'bank-fraud',
    name: 'Banking · Fraud detection',
    description: 'Giao dịch thẻ (synthetic) với tỷ lệ gian lận ~2.8%, thiếu dữ liệu và trùng lặp.',
    stack: ['pandas', 'scikit-learn'],
    labs: [LAB_CLEAN, HINT_STORAGE],
    build: () => [
      { path: 'README.md', content: '# Fraud detection — Banking\n\nPhát hiện giao dịch gian lận. Dataset synthetic `data/raw/transactions.csv`.\n' },
      { path: 'data/raw/transactions.csv', content: buildTransactions() },
      { path: 'notebooks/01_explore_clean.ipynb', content: BANK_NB },
      { path: 'src/__init__.py', content: '' },
    ],
  },
  {
    id: 'health-readmit',
    name: 'Healthcare · Readmission risk',
    description: 'Dữ liệu nhập viện (synthetic) để dự đoán tái nhập viện 30 ngày.',
    stack: ['pandas'],
    labs: [LAB_CLEAN, HINT_STORAGE],
    build: () => [
      { path: 'README.md', content: '# Readmission risk — Healthcare\n\nDataset synthetic `data/raw/admissions.csv`. Không chứa dữ liệu bệnh nhân thật.\n' },
      { path: 'data/raw/admissions.csv', content: buildAdmissions() },
      { path: 'notebooks/01_explore.ipynb', content: nb([{ type: 'code', source: 'import pandas as pd\nadm = pd.read_csv("data/raw/admissions.csv")\nadm.describe()' }]) },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Python workspace',
    description: 'Workspace trống với một notebook. Dùng cho RAG/Agent/CV khi chưa có template.',
    stack: ['python'],
    labs: [HINT_STORAGE],
    build: () => [
      { path: 'README.md', content: '# New project\n' },
      { path: 'notebooks/scratch.ipynb', content: nb([{ type: 'code', source: 'print("hello from the AI Lab runtime")' }]) },
    ],
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
