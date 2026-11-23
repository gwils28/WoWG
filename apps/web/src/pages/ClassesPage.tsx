import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, type DomainSummary } from '../lib/api';
import { matchesQuery, classPath, relativeDay, sortDomains, type ClassSort } from '../lib/classes';
import { GameIcon } from '../components/GameIcon';
import { PinButton } from '../components/PinButton';

const SORT_KEY = 'wowg.classes.sort';
const SORTS: { value: ClassSort; label: string }[] = [
  { value: 'activity', label: 'Activité récente' },
  { value: 'points', label: 'Points' },
  { value: 'name', label: 'Nom' },
];

function readSort(): ClassSort {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORTS.some((s) => s.value === v) ? (v as ClassSort) : 'activity';
  } catch {
    return 'activity';
  }
}

export function ClassesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['character'], queryFn: api.character });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ClassSort>(readSort);

  function changeSort(next: ClassSort) {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // préférence de confort : sans stockage, le tri revient au défaut
    }
  }

  if (isLoading || !data) return <p className="muted">Chargement...</p>;
  const shown = sortDomains(
    data.domains.filter((d) => matchesQuery(d, query)),
    sort,
  );

  return (
    <div className="classes">
      <header className="classes__header">
        <h1>Classes</h1>
        <span className="muted">
          {data.domains.length} classe{data.domains.length > 1 ? 's' : ''}, {data.pinned.length}{' '}
          épinglée{data.pinned.length > 1 ? 's' : ''}
          {data.archive.domains.length > 0 && (
            <>
              {' · '}
              <Link to="/archives">
                {data.archive.domains.length} archivée{data.archive.domains.length > 1 ? 's' : ''}
              </Link>
            </>
          )}
        </span>
        <div className="classes__tools">
          <input
            type="search"
            placeholder="Rechercher (classe ou spécialisation)"
            aria-label="Rechercher une classe"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Trier les classes"
            value={sort}
            onChange={(e) => changeSort(e.target.value as ClassSort)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {data.domains.length === 0 && (
        <section className="panel empty">
          <p>Aucune classe pour l'instant.</p>
          <p className="muted">
            Génère un arbre avec la skill <code>/generate-tree</code>, puis importe-le depuis la
            page <Link to="/outils">Outils</Link>.
          </p>
        </section>
      )}
      {data.domains.length > 0 && shown.length === 0 && (
        <p className="muted">Aucune classe ne correspond à « {query} ».</p>
      )}

      <ul className="class-grid">
        {shown.map((d) => (
          <ClassCard key={d.domain.id} summary={d}>
            <PinButton domainId={d.domain.id} name={d.domain.name} pinned={d.pinned} />
          </ClassCard>
        ))}
      </ul>
    </div>
  );
}

/** Carte d'une classe ; `children` : actions à droite (épingle, réactivation). */
export function ClassCard({
  summary: d,
  children,
}: {
  summary: DomainSummary;
  children?: React.ReactNode;
}) {
  return (
    <li className={`class-card panel${d.pinned ? ' class-card--pinned' : ''}`}>
      <Link to={classPath(d.domain.id)} className="class-card__link">
        <span className={`class-card__icon${d.portrait ? ' class-card__icon--portrait' : ''}`}>
          {d.portrait ? (
            <img src={d.portrait} alt="" loading="lazy" />
          ) : (
            <GameIcon icon={d.domain.icon} size={34} />
          )}
        </span>
        <span className="class-card__body">
          <span className="class-card__name">{d.domain.name}</span>
          <span className="class-card__meta muted">
            {d.specializations.length} spé{d.specializations.length > 1 ? 's' : ''} ·{' '}
            {relativeDay(d.lastActivityAt)}
          </span>
          <span className="bar">
            <span
              className="bar__fill"
              style={{ width: `${d.maxPoints ? (d.points / d.maxPoints) * 100 : 0}%` }}
            />
          </span>
        </span>
        <span className="class-card__points">
          {d.points}
          <small>/{d.maxPoints}</small>
        </span>
      </Link>
      {children}
    </li>
  );
}
