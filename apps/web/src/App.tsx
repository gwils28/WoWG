import { useQuery } from '@tanstack/react-query';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';
import { api } from './lib/api';
import { HomePage } from './pages/HomePage';
import { GameIcon } from './components/GameIcon';
import { JournalPage } from './pages/JournalPage';
import { ClassPage, LegacySpecRedirect } from './pages/ClassPage';
import { ClassesPage } from './pages/ClassesPage';
import { ToolsPage } from './pages/ToolsPage';
import { QuestsPage } from './pages/QuestsPage';
import { GoldAmount } from './components/quests/QuestParts';

function Layout() {
  const { data } = useQuery({ queryKey: ['character'], queryFn: api.character });
  const quests = useQuery({ queryKey: ['quests'], queryFn: api.quests });
  const activeCount = quests.data?.active.length ?? 0;
  const readyCount = quests.data?.active.filter((r) => r.progress.ready).length ?? 0;
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
          <NavLink to="/quetes">
            Quêtes
            {activeCount > 0 && (
              <span
                className={`topnav__badge${readyCount > 0 ? ' topnav__badge--ready' : ''}`}
                title={`${activeCount} en cours${readyCount ? `, ${readyCount} à rendre` : ''}`}
              >
                {activeCount}
              </span>
            )}
          </NavLink>
        </nav>
        {data && <span className="topbar__level">Niv. {data.level}</span>}
        {data && (
          <span className="topbar__gold">
            <GoldAmount amount={data.gold} />
          </span>
        )}
        {/* navigation secondaire : historique et maintenance, volontairement discrète */}
        <nav className="subnav" aria-label="Secondaire">
          <NavLink to="/journal" title="Journal de progression">
            <GameIcon icon="game-icons:scroll-unfurled" size={16} />
            <span>Journal</span>
          </NavLink>
          <NavLink to="/outils" title="Outils : import et sauvegarde" aria-label="Outils">
            <GameIcon icon="game-icons:cog" size={16} />
          </NavLink>
        </nav>
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
        <Route path="quetes" element={<QuestsPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="outils" element={<ToolsPage />} />
        <Route path="import" element={<Navigate to="/outils" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
