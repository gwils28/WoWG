import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, Route, Routes } from 'react-router';
import { api } from './lib/api';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { SpecializationPage } from './pages/SpecializationPage';

function Layout() {
  const { data } = useQuery({ queryKey: ['character'], queryFn: api.character });
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
          {data?.domains.map((d) => (
            <NavLink
              key={d.domain.id}
              to={`/specialisation/${d.specializations[0]?.id}`}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {d.domain.name}
            </NavLink>
          ))}
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

function Soon({ title, phase }: { title: string; phase: number }) {
  return (
    <section className="panel empty">
      <h1>{title}</h1>
      <p className="muted">Arrive en phase {phase} du plan.</p>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="specialisation/:id" element={<SpecializationPage />} />
        <Route path="journal" element={<Soon title="Journal" phase={6} />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="*" element={<Soon title="Page introuvable" phase={0} />} />
      </Route>
    </Routes>
  );
}
