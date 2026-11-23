import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LEVEL_TIERS, MAX_LEVEL } from '@wowg/shared';
import { api, type Character } from '../lib/api';
import { GameIcon } from '../components/GameIcon';

export function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['character'], queryFn: api.character });
  if (isLoading) return <p className="muted">Chargement...</p>;
  if (error || !data)
    return <p className="error">Impossible de charger la fiche : {String(error)}</p>;

  return (
    <div className="home">
      <CharacterHero c={data} />
      <Party c={data} />
      <TierTrack c={data} />
      <ImportHint c={data} />
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
          <img
            src={c.tier.portrait}
            alt={`Portrait du ${c.hero?.domain.name ?? 'personnage'}, palier ${c.tier.name}`}
          />
        ) : (
          <div className="hero__placeholder" aria-hidden>
            <GameIcon icon={c.hero?.domain.icon ?? 'game-icons:hood'} size={96} />
          </div>
        )}
        {c.hero && (
          <Link to={`/classe/${c.hero.domain.id}`} className="hero__nameplate">
            <GameIcon icon={c.hero.domain.icon} size={18} />
            {c.hero.domain.name}
          </Link>
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
          <div>
            <dt>Or</dt>
            <dd>
              <Link to="/quetes" className="hero__gold">
                {c.gold}
              </Link>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Les personnages des classes actives ; un clic met le personnage choisi au premier plan. */
function Party({ c }: { c: Character }) {
  const qc = useQueryClient();
  const focus = useMutation({
    mutationFn: api.setHero,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['character'] }),
  });
  if (c.domains.length === 0) return null;
  return (
    <section className="party" aria-label="Personnages des classes">
      {c.domains.map((d) => {
        const focused = c.hero?.domain.id === d.domain.id;
        const pct = d.maxPoints ? Math.round((d.points / d.maxPoints) * 100) : 0;
        return (
          <button
            key={d.domain.id}
            type="button"
            className={`party__member${focused ? ' party__member--focus' : ''}`}
            aria-pressed={focused}
            disabled={focus.isPending}
            onClick={() => !focused && focus.mutate(d.domain.id)}
            title={
              focused
                ? `${d.domain.name} au premier plan`
                : `Mettre ${d.domain.name} au premier plan`
            }
          >
            <span className="party__portrait">
              {d.portrait ? (
                <img src={d.portrait} alt="" loading="lazy" />
              ) : (
                <GameIcon icon={d.domain.icon} size={48} />
              )}
            </span>
            <span className="party__name">
              <GameIcon icon={d.domain.icon} size={16} />
              {d.domain.name}
            </span>
            <span className="party__xp" aria-label={`${d.points} points sur ${d.maxPoints}`}>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="party__points muted">
              {d.points} / {d.maxPoints}
            </span>
          </button>
        );
      })}
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

/** Seulement tant qu'aucun arbre n'est importé : les classes vivent sur la page Classes. */
function ImportHint({ c }: { c: Character }) {
  if (c.domains.length > 0) return null;
  return (
    <section className="panel empty">
      <p>Aucun arbre importé pour l'instant.</p>
      <p className="muted">
        Génère un arbre avec la skill <code>/generate-tree</code>, puis importe-le depuis la page{' '}
        <Link to="/outils">Outils</Link>.
      </p>
    </section>
  );
}
