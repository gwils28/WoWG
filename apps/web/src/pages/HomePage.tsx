import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { GameIcon } from '../components/GameIcon';

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['character'], queryFn: api.character });
  if (isLoading) return <p className="muted">Chargement...</p>;
  if (error || !data)
    return <p className="error">Impossible de charger la fiche : {String(error)}</p>;

  const pct = data.toNext ? Math.round((data.intoLevel / data.toNext) * 100) : 0;

  return (
    <div className="home">
      <section className="panel character">
        <div className="character__emblem" aria-label={`Niveau ${data.level}`}>
          <span className="character__level">{data.level}</span>
          <span className="character__level-label">Niveau</span>
        </div>
        <div className="character__body">
          <h1 className="character__title">Fiche de personnage</h1>
          <div className="xp" title={`${data.intoLevel} / ${data.toNext} points`}>
            <div className="xp__fill" style={{ width: `${pct}%` }} />
            <span className="xp__label">
              {data.intoLevel} / {data.toNext} vers le niveau {data.level + 1}
            </span>
          </div>
          <p className="muted">
            {data.points} rang{data.points > 1 ? 's' : ''} acquis au total, dans{' '}
            {data.domains.length} domaine{data.domains.length > 1 ? 's' : ''}.
          </p>
        </div>
      </section>

      {data.domains.length === 0 && (
        <section className="panel empty">
          <p>Aucun arbre importé pour l'instant.</p>
          <p className="muted">
            Génère un arbre avec la skill <code>/generate-tree</code>, puis importe-le depuis la
            page <Link to="/import">Import</Link>.
          </p>
        </section>
      )}

      <div className="domains">
        {data.domains.map((d) => (
          <section key={d.domain.id} className="panel domain">
            <header className="domain__header">
              <GameIcon icon={d.domain.icon} size={32} className="domain__icon" />
              <h2>{d.domain.name}</h2>
              <span className="domain__points">{d.points} pts</span>
            </header>
            <ul className="specs">
              {d.specializations.map((s) => (
                <li key={s.id}>
                  <Link to={`/specialisation/${s.id}`} className="spec-row">
                    <span className="spec-row__icon">
                      <GameIcon icon={s.specialization.icon} size={28} />
                    </span>
                    <span className="spec-row__name">{s.specialization.name}</span>
                    <span className="bar">
                      <span
                        className="bar__fill"
                        style={{ width: `${(s.points / s.maxPoints) * 100}%` }}
                      />
                    </span>
                    <span className="spec-row__points">
                      {s.points}/{s.maxPoints}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
