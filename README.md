# LAB_COLE — AI Lab Platform

Nền tảng thực hành AI trực tuyến toàn diện dành cho sinh viên và giảng viên, tích hợp IDE web, runtime mô phỏng cô lập, quản lý bài thực hành, dataset, lineage graph và theo dõi experiment.

---

## 🌟 Tính năng chính

- **Môi trường thực hành trực quan (Web IDE)**:
  - **Notebook Editor**: Chạy các cell Python / Markdown tương tác.
  - **Code Editor**: Hỗ trợ cú pháp Python, SQL, JSON, Markdown với CodeMirror.
  - **SQL Query Editor & API Tester**: Hỗ trợ kiểm thử truy vấn và endpoint API.
  - **Data Viewer**: Khám phá và lọc dữ liệu trực tiếp trên bảng.
- **Theo dõi thực nghiệm & Artifact (MLOps / Experiment Tracking)**:
  - Quản lý metadata, metrics, tham số huấn luyện và model lineage.
  - Trực quan hóa Lineage Graph tương tác.
- **Không gian người dùng phân quyền**:
  - **Student Workspace**: Giao diện thực hành lab bài bản theo từng module.
  - **Teacher Console**: Quản lý bài tập, theo dõi tiến độ và chấm bài học viên.
  - **Ops Console**: Giám sát tài nguyên, log hệ thống và trạng thái worker runtime.

---

## 🛠️ Công nghệ sử dụng

- **Frontend**: React 19, TypeScript, Vite
- **State Management**: Zustand
- **Editor & UI Components**: `@uiw/react-codemirror`, `react-resizable-panels`, `lucide-react`
- **Markdown & Render**: `marked`, `dompurify`
- **Linting & Tooling**: Oxlint, TypeScript

---

## 🚀 Hướng dẫn cài đặt & khởi chạy

### Yêu cầu hệ thống
- **Node.js**: >= 18.x
- **npm** hoặc **yarn** / **pnpm**

### Cài đặt dependencies
```bash
npm install
```

### Chạy chế độ phát triển (Development)
```bash
npm run dev
```
Truy cập ứng dụng tại `http://localhost:5173`.

### Build dự án (Production)
```bash
npm run build
```

---

## 📁 Cấu trúc thư mục

```text
ai-lab-platform/
├── public/                 # Static assets & runtime worker
├── src/
│   ├── adapters/           # Catalog, storage & runtime adapters
│   ├── components/         # Shared UI components & dialogs
│   ├── lib/                # Types and formatting utilities
│   ├── pages/              # Trang Student, Teacher, Ops, Catalog
│   ├── state/              # Zustand global state stores
│   ├── styles/             # Global & workspace stylesheets
│   └── workspace/          # Core IDE workspace (Editors, Panels, Chrome)
├── package.json
└── vite.config.ts
```

---

## 📄 License
Dự án được xây dựng và phát triển cho chương trình AI Lab.
