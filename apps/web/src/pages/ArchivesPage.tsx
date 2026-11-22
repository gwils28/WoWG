import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArchiveButton } from '../components/ArchiveButton';
import { api } from '../lib/api';
import { sortDomains } from '../lib/classes';
import { ClassCard } from './ClassesPage';

/** Classes archivées : consultables en lecture seule, hors niveau, réactivables (SPEC 11). */
export function ArchivesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['character'], queryFn: api.character });
  if (isLoading || !data) return <p className="muted">Chargement...</p>;
  const { archive } = data;

  return (
    <div className="classes">
      <header className="classes__header">
        <h1>Archives</h1>
        <span className="muted">
          {archive.domains.length} classe{archive.domains.length > 1 ? 's' : ''} · {archive.points}{' '}
          points · niveau {archive.level} atteint
        </span>
      </header>
      <p className="hint">
        Lecture seule : ces classes ne comptent plus pour le niveau et leurs quêtes ne sont plus
        proposées. Leur historique reste dans le <Link to="/journal">journal</Link>.
      </p>

      {archive.domains.length === 0 && (
        <section className="panel empty">
          <p>Aucune classe archivée.</p>
          <p className="muted">
            Archive une classe depuis sa page (<Link to="/classes">Classes</Link>).
          </p>
        </section>
      )}

      <ul className="class-grid">
        {sortDomains(archive.domains, 'name').map((d) => (
          <ClassCard key={d.domain.id} summary={d}>
            <ArchiveButton domainId={d.domain.id} name={d.domain.name} archived />
          </ClassCard>
        ))}
      </ul>
    </div>
  );
}
