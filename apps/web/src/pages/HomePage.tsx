import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LEVEL_TIERS, MAX_LEVEL } from '@wowg/shared';
import { api, type Character, type DomainSummary } from '../lib/api';
import { pinnedDomains, recentDomains, sortDomains, specPath } from '../lib/classes';
import { GameIcon } from '../components/GameIcon';
import { PinButton } from '../components/PinButton';

const HOME_CLASSES = 4;

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['character'], queryFn: api.character });
  if (isLoading) return <p className="muted">Chargement...</p>;
  if (error || !data)
    return <p className="error">Impossible de charger la fiche : {String(error)}</p>;

  return (
    <div className="home">
      <CharacterHero c={data} />
      <TierTrack c={data} />
      <HomeClasses c={data} />
    </div>
  );
}

function CharacterHero({ c }: { c: Character }) {
  const maxed = c.level >= MAX_LEVEL;
  const pct = maxed ? 100 : c.toNext ? Math.round((c.intoLevel / c.toNext) * 100) : 0;
  const next = LEVEL_TIERS[c.tier.index];
  const specs = c.domains.reduce((n, d) => n + d.specializations.length, 0);

  return (
    <section className={`panel hero hero--tier-${c.tier.index}`}>
      <div className="hero__portrait">
        {c.tier.portrait ? (
          <img src={c.tier.portrait} alt={`Portrait du personnage, palier ${c.tier.name}`} />
        ) : (
          <div className="hero__placeholder" aria-hidden>
            <GameIcon icon="game-icons:hood" size={96} />
          </div>
        )}
      </div>

      <div className="hero__body">
        <span className="hero__eyebrow">Fiche de personnage</span>
        <div className="hero__identity">
          <div className="character__emblem" aria-label={`Niveau ${c.level}`}>
            <span className="character__level">{c.level}</span>
            <span className="character__level-label">Niveau</span>
          </div>
          <div>
            <h1 className="hero__tier">{c.tier.name}</h1>
            <p className="hero__range muted">
              Palier {c.tier.index} sur {LEVEL_TIERS.length} · niveaux {c.tier.from} à {c.tier.to}
            </p>
          </div>
        </div>

        <div
          className="xp"
          title={maxed ? 'Niveau maximum' : `${c.intoLevel} / ${c.toNext} points`}
        >
          <div className="xp__fill" style={{ width: `${pct}%` }} />
          <span className="xp__label">
            {maxed
              ? 'Niveau maximum atteint'
              : `${c.intoLevel} / ${c.toNext} vers le niveau ${c.level + 1}`}
          </span>
        </div>
        {next && (
          <p className="hero__next">
            Encore <strong>{next.from - c.level}</strong> niveau{next.from - c.level > 1 ? 'x' : ''}{' '}
            avant le palier <strong>{next.name}</strong>.
          </p>
        )}

        <dl className="hero__stats">
          <div>
            <dt>Rangs acquis</dt>
            <dd>{c.points}</dd>
          </div>
          <div>
            <dt>Classes</dt>
            <dd>{c.domains.length}</dd>
          </div>
          <div>
            <dt>Spécialisations</dt>
            <dd>{specs}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Les 5 paliers : acquis, en cours, à venir (portrait assombri). */
function TierTrack({ c }: { c: Character }) {
  return (
    <ol className="tier-track" aria-label="Paliers du personnage">
      {LEVEL_TIERS.map((t, i) => {
        const state =
          t.index < c.tier.index ? 'done' : t.index === c.tier.index ? 'current' : 'locked';
        const portrait = c.portraits[i];
        return (
          <li key={t.index} className={`tier tier--${state}`}>
            <span className="tier__thumb">
              {portrait ? (
                <img src={portrait} alt="" loading="lazy" />
              ) : (
                <GameIcon icon="game-icons:hood" size={40} />
              )}
              {state === 'locked' && (
                <span className="tier__lock" aria-hidden>
                  <GameIcon icon="game-icons:padlock" size={22} />
                </span>
              )}
            </span>
            <span className="tier__name">{t.name}</span>
            <span className="tier__range">
              Niv. {t.from} à {t.to}
            </span>
            <span className="visually-hidden">
              {state === 'done' ? 'acquis' : state === 'current' ? 'en cours' : 'à venir'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HomeClasses({ c }: { c: Character }) {
  if (c.domains.length === 0) {
    return (
      <section className="panel empty">
        <p>Aucun arbre importé pour l'instant.</p>
        <p className="muted">
          Génère un arbre avec la skill <code>/generate-tree</code>, puis importe-le depuis la page{' '}
          <Link to="/import">Import</Link>.
        </p>
      </section>
    );
  }
  const pinned = pinnedDomains(c.domains, c.pinned);
  const recent = recentDomains(c.domains, Math.max(0, HOME_CLASSES - pinned.length));
  // sans épingle ni activité : les premières par activité puis par nom
  const shown =
    pinned.length + recent.length > 0
      ? [...pinned, ...recent]
      : sortDomains(c.domains, 'activity').slice(0, HOME_CLASSES);

  return (
    <section className="home-classes">
      <header className="home-classes__header">
        <h2>{pinned.length ? 'Classes épinglées et récentes' : 'Classes récentes'}</h2>
        <Link to="/classes">Toutes les classes ({c.domains.length}) →</Link>
      </header>
      <div className="domains">
        {shown.map((d) => (
          <DomainPanel key={d.domain.id} d={d} />
        ))}
      </div>
    </section>
  );
}

function DomainPanel({ d }: { d: DomainSummary }) {
  return (
    <section className="panel domain">
      <header className="domain__header">
        <GameIcon icon={d.domain.icon} size={32} className="domain__icon" />
        <h2>{d.domain.name}</h2>
        <span className="domain__points">{d.points} pts</span>
        <PinButton domainId={d.domain.id} name={d.domain.name} pinned={d.pinned} />
      </header>
      <ul className="specs">
        {d.specializations.map((s) => (
          <li key={s.id}>
            <Link to={specPath(d.domain.id, s.id)} className="spec-row">
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
  );
}
