import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, type JournalEntry, type JournalFilters } from '../lib/api';
import { specPath } from '../lib/classes';
import { formatDay, groupByDay, rankLabel } from '../lib/journal';
import { GameIcon } from '../components/GameIcon';

const KEYS = ['domain', 'spec', 'from', 'to'] as const;

export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const filters: JournalFilters = Object.fromEntries(
    KEYS.map((k) => [k, params.get(k) ?? undefined]),
  );
  const character = useQuery({ queryKey: ['character'], queryFn: api.character });
  const journal = useQuery({
    queryKey: ['journal', filters],
    queryFn: () => api.journal(filters),
  });

  const domains = character.data?.domains ?? [];
  const specs = domains
    .filter((d) => !filters.domain || d.domain.id === filters.domain)
    .flatMap((d) => d.specializations);

  function update(patch: JournalFilters) {
    const next = { ...filters, ...patch };
    // une spécialisation hors du domaine choisi n'a plus de sens
    if (patch.domain !== undefined && next.spec) {
      const d = domains.find((x) => x.domain.id === next.domain);
      if (d && !d.specializations.some((s) => s.id === next.spec)) next.spec = undefined;
    }
    setParams(
      Object.fromEntries(Object.entries(next).filter((kv): kv is [string, string] => !!kv[1])),
      { replace: true },
    );
  }

  const active = KEYS.some((k) => filters[k]);
  const days = groupByDay(journal.data ?? []);

  return (
    <div className="journal">
      <aside className="journal__side">
        <section className="panel journal__filters">
          <h1>Journal</h1>
          <label className="field">
            <span>Domaine</span>
            <select
              value={filters.domain ?? ''}
              onChange={(e) => update({ domain: e.target.value || undefined })}
            >
              <option value="">Tous</option>
              {domains.map((d) => (
                <option key={d.domain.id} value={d.domain.id}>
                  {d.domain.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Spécialisation</span>
            <select
              value={filters.spec ?? ''}
              onChange={(e) => update({ spec: e.target.value || undefined })}
            >
              <option value="">Toutes</option>
              {specs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.specialization.name}
                </option>
              ))}
            </select>
          </label>
          <div className="journal__dates">
            <label className="field">
              <span>Du</span>
              <input
                type="date"
                value={filters.from ?? ''}
                max={filters.to}
                onChange={(e) => update({ from: e.target.value || undefined })}
              />
            </label>
            <label className="field">
              <span>Au</span>
              <input
                type="date"
                value={filters.to ?? ''}
                min={filters.from}
                onChange={(e) => update({ to: e.target.value || undefined })}
              />
            </label>
          </div>
          {active && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setParams({}, { replace: true })}
            >
              Effacer les filtres
            </button>
          )}
        </section>
      </aside>

      <section className="panel journal__timeline">
        {journal.isPending && <p className="muted">Chargement...</p>}
        {journal.isError && <p className="error">{journal.error.message}</p>}
        {journal.data?.length === 0 && (
          <p className="muted">
            {active
              ? 'Aucun événement pour ces filtres.'
              : 'Aucun rang gagné pour l’instant. Ouvre une spécialisation et monte ton premier talent.'}
          </p>
        )}
        {journal.data && journal.data.length > 0 && (
          <p className="journal__count muted">
            {journal.data.length} événement{journal.data.length > 1 ? 's' : ''}
          </p>
        )}
        {days.map((d) => (
          <div key={d.day} className="journal__day">
            <h2 className="journal__day-title">{formatDay(d.day)}</h2>
            <ul className="journal__entries">
              {d.entries.map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function Entry({ entry: e }: { entry: JournalEntry }) {
  const loss = e.delta < 0;
  return (
    <li className={`journal-entry${loss ? ' journal-entry--loss' : ''}`}>
      <span className="journal-entry__icon">
        {e.talentIcon ? <GameIcon icon={e.talentIcon} size={30} /> : '?'}
      </span>
      <div className="journal-entry__body">
        <div className="journal-entry__head">
          <Link
            to={
              e.domain
                ? specPath(e.domain.id, e.specializationId)
                : `/specialisation/${e.specializationId}`
            }
            className="journal-entry__name"
          >
            {e.talentName}
          </Link>
          <span className="journal-entry__rank">
            {loss ? 'Retrait · ' : ''}
            {rankLabel(e)}
          </span>
        </div>
        <div className="journal-entry__spec muted">
          {e.domain?.name ?? '?'} / {e.specialization?.name ?? e.specializationId}
          {e.orphan && <span className="journal-entry__orphan"> · talent retiré de l'arbre</span>}
        </div>
        {e.note && <p className="journal-entry__note">{e.note}</p>}
      </div>
    </li>
  );
}
