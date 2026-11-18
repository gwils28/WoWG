import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Character, DomainSummary } from '../lib/api';
import { matchesQuery, pinnedDomains, recentDomains, sortDomains, specPath } from '../lib/classes';
import { GameIcon } from './GameIcon';

const RECENT = 5;

/** Menu déroulant de la barre du haut : recherche, classes épinglées et récentes. */
export function ClassesMenu({ character }: { character: Character | undefined }) {
  const location = useLocation();
  // ouvert pour une adresse donnée : naviguer ailleurs referme le menu sans effet
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const setOpen = (next: boolean) => setOpenAt(next ? location.pathname : null);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const active = location.pathname.startsWith('/classe');

  // ferme au clic extérieur et sur Échap
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenAt(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const domains = character?.domains ?? [];
  const searching = query.trim() !== '';
  const results = searching
    ? sortDomains(
        domains.filter((d) => matchesQuery(d, query)),
        'name',
      )
    : [];
  const pinned = pinnedDomains(domains, character?.pinned ?? []);
  const recent = recentDomains(domains, RECENT);

  return (
    <div className="classes-menu" ref={ref}>
      <button
        type="button"
        className={`classes-menu__toggle${active || open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setQuery('');
          setOpen(!open);
        }}
      >
        Classes <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="classes-menu__panel panel">
          <input
            type="search"
            className="classes-menu__search"
            placeholder="Rechercher une classe"
            aria-label="Rechercher une classe"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {searching ? (
            <Section title="Résultats" items={results} empty="Aucune classe trouvée." />
          ) : (
            <>
              <Section
                title="Épinglées"
                items={pinned}
                empty="Épingle une classe avec ☆ sur la page Classes."
              />
              {recent.length > 0 && <Section title="Récentes" items={recent} />}
            </>
          )}
          <Link to="/classes" className="classes-menu__all">
            Toutes les classes ({domains.length}) →
          </Link>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  empty,
}: {
  title: string;
  items: DomainSummary[];
  empty?: string;
}) {
  return (
    <div className="classes-menu__section">
      <h3 className="classes-menu__title">{title}</h3>
      {items.length === 0 && empty && <p className="muted classes-menu__empty">{empty}</p>}
      <ul>
        {items.map((d) => (
          <li key={d.domain.id}>
            <Link
              to={specPath(d.domain.id, d.specializations[0]!.id)}
              className="classes-menu__item"
            >
              <GameIcon icon={d.domain.icon} size={22} />
              <span>{d.domain.name}</span>
              <small>{d.points} pts</small>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
