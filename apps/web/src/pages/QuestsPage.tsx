import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, type CustomQuestView, type QuestOffer, type QuestRun } from '../lib/api';
import { groupOffers, offerKey } from '../lib/quests';
import { GameIcon } from '../components/GameIcon';
import { CompletedRow, OfferCard, RunCard } from '../components/quests/QuestCards';
import { CustomQuestDialog } from '../components/quests/CustomQuestDialog';
import { AcceptDialog, TurnInDialog } from '../components/quests/QuestDialogs';
import { GoldAmount } from '../components/quests/QuestParts';
import { useQuestActions } from '../components/quests/useQuestActions';

const COMPLETED_PAGE = 10;

type Open =
  | { kind: 'accept'; offer: QuestOffer }
  | { kind: 'turn-in'; run: QuestRun }
  | { kind: 'custom'; quest?: CustomQuestView }
  | null;

export function QuestsPage() {
  const board = useQuery({ queryKey: ['quests'], queryFn: api.quests });
  const character = useQuery({ queryKey: ['character'], queryFn: api.character });
  const actions = useQuestActions();
  const [open, setOpen] = useState<Open>(null);
  const [showAll, setShowAll] = useState(false);
  const [params, setParams] = useSearchParams();
  const classFilter = params.get('classe');

  if (board.isPending) return <p className="muted">Chargement...</p>;
  if (board.isError) return <p className="error">{board.error.message}</p>;
  const { gold, active, available, completed } = board.data;

  const offers = classFilter
    ? available.filter((o) => o.source === 'tree' && o.origin?.domain.id === classFilter)
    : available;
  const groups = groupOffers(offers, character.data?.pinned ?? []);
  const filterName = classFilter
    ? (character.data?.domains.find((d) => d.domain.id === classFilter)?.domain.name ?? classFilter)
    : null;
  const shownCompleted = showAll ? completed : completed.slice(0, COMPLETED_PAGE);
  const close = () => setOpen(null);

  return (
    <div className="quests">
      <header className="quests__header">
        <GameIcon icon="game-icons:scroll-quill" size={28} className="domain__icon" />
        <h1>Quêtes</h1>
        <span className="quests__gold">
          <GoldAmount amount={gold} />
        </span>
        <button type="button" className="btn btn--gold" onClick={() => setOpen({ kind: 'custom' })}>
          Nouvelle quête
        </button>
      </header>

      <section className="panel quests__section">
        <h2>
          En cours <span className="quests__count">{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <p className="muted">
            Aucune quête en cours. Accepte une quête disponible ci-dessous, ou repère les « ! » sur
            tes arbres.
          </p>
        ) : (
          <div className="quest-grid">
            {active.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                actions={actions}
                onTurnIn={(r) => setOpen({ kind: 'turn-in', run: r })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel quests__section">
        <h2>
          Disponibles <span className="quests__count">{offers.length}</span>
        </h2>
        {filterName && (
          <p className="quests__filter">
            Classe : <strong>{filterName}</strong>{' '}
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setParams({}, { replace: true })}
            >
              Toutes les classes
            </button>
          </p>
        )}
        {groups.length === 0 && (
          <p className="muted">
            Aucune quête disponible. Les quêtes proposées apparaissent quand leurs talents sont
            débloqués ; tu peux aussi écrire les tiennes.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key} className="quests__group">
            <h3 className="quests__group-title">
              {g.icon && <GameIcon icon={g.icon} size={20} />}
              {g.key === 'custom' ? g.title : <Link to={`/classe/${g.key}`}>{g.title}</Link>}
            </h3>
            <div className="quest-grid">
              {g.offers.map((o) => (
                <OfferCard
                  key={offerKey(o)}
                  offer={o}
                  actions={actions}
                  onAccept={(offer) => setOpen({ kind: 'accept', offer })}
                  onEdit={
                    o.source === 'custom' ? () => setOpen({ kind: 'custom', quest: o }) : undefined
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel quests__section">
        <h2>
          Terminées <span className="quests__count">{completed.length}</span>
        </h2>
        {completed.length === 0 ? (
          <p className="muted">Aucune quête rendue pour l'instant.</p>
        ) : (
          <ul className="quest-done-list">
            {shownCompleted.map((run) => (
              <CompletedRow key={run.id} run={run} actions={actions} />
            ))}
          </ul>
        )}
        {completed.length > COMPLETED_PAGE && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Réduire' : `Tout afficher (${completed.length})`}
          </button>
        )}
      </section>

      {open?.kind === 'accept' && (
        <AcceptDialog offer={open.offer} actions={actions} onClose={close} />
      )}
      {open?.kind === 'turn-in' && (
        <TurnInDialog run={open.run} actions={actions} onClose={close} />
      )}
      {open?.kind === 'custom' && (
        <CustomQuestDialog initial={open.quest} actions={actions} onClose={close} />
      )}
    </div>
  );
}
