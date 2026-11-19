import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { api } from './lib/api';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { JournalPage } from './pages/JournalPage';
import { ClassPage, LegacySpecRedirect } from './pages/ClassPage';
import { ClassesPage } from './pages/ClassesPage';

function Layout() {
  const { data } = useQuery({ queryKey: ['character'], queryFn: api.character });
  // l'onglet Classes reste actif sur la page d'une classe (/classe/...)
  const inClasses = useLocation().pathname.startsWith('/classe');
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          WoWG
        </NavLink>
        <nav className="topnav">
          <NavLink to="/" end>
            Personnage
          </NavLink>
          <NavLink to="/classes" className={inClasses ? 'active' : undefined}>
            Classes
          </NavLink>
          <NavLink to="/journal">Journal</NavLink>
          <NavLink to="/import">Import</NavLink>
        </nav>
        {data && <span className="topbar__level">Niv. {data.level}</span>}
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">
        Icônes : <a href="https://game-icons.net">game-icons.net</a> (CC BY 3.0)
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="panel empty">
      <h1>Page introuvable</h1>
      <p className="muted">
        <NavLink to="/">Retour au personnage</NavLink>
      </p>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="classe/:domainId/:specId?" element={<ClassPage />} />
        <Route path="specialisation/:id" element={<LegacySpecRedirect />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
