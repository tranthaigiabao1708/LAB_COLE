import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { FolderKanban, GraduationCap, Home, Loader2, ServerCog } from 'lucide-react';
import { DialogHost, ToastHost } from './components/dialogs';
import { currentUser } from './adapters/catalog';
import StudentHome from './pages/StudentHome';
import Catalog from './pages/Catalog';

// Heavy modules (CodeMirror, IDE panels) are split out of the dashboard bundle.
const WorkspacePage = lazy(() => import('./workspace/WorkspacePage'));
const TeacherConsole = lazy(() => import('./pages/TeacherConsole'));
const OpsConsole = lazy(() => import('./pages/OpsConsole'));
const Fallback = () => <div className="center fill"><div className="row muted"><Loader2 size={16} className="spin" />Loading…</div></div>;

function AppShell() {
  const loc = useLocation();
  const role = loc.pathname.startsWith('/teacher') ? 'Teacher' : loc.pathname.startsWith('/ops') ? 'Operations' : 'Student';
  return (
    <div className="app">
      <header className="app-nav">
        <div className="brand brand-wide">
          <div className="brand-logo">AI</div>
          <span className="brand-name">AI Lab</span>
        </div>
        <nav aria-label="Primary">
          <NavLink to="/" end id="nav-home"><Home size={15} />Tổng quan</NavLink>
          <NavLink to="/projects" id="nav-projects"><FolderKanban size={15} />Lớp &amp; Dự án</NavLink>
          <NavLink to="/teacher" id="nav-teacher"><GraduationCap size={15} />Giáo viên</NavLink>
          <NavLink to="/ops" id="nav-ops"><ServerCog size={15} />Vận hành</NavLink>
        </nav>
        <div className="grow" />
        <span className="badge outline" title="Prototype: đổi vai trò bằng menu điều hướng. Bản thật dùng RBAC phía backend.">View as: {role}</span>
        <div className="row gap-4">
          <div className="avatar" title={currentUser.email}>{currentUser.initials}</div>
        </div>
      </header>
      <main className="page"><Suspense fallback={<Fallback />}><Outlet /></Suspense></main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<StudentHome />} />
          <Route path="/projects" element={<Catalog />} />
          <Route path="/teacher" element={<TeacherConsole />} />
          <Route path="/ops" element={<OpsConsole />} />
        </Route>
        <Route path="/w/:wsId" element={<Suspense fallback={<Fallback />}><WorkspacePage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DialogHost />
      <ToastHost />
    </BrowserRouter>
  );
}
