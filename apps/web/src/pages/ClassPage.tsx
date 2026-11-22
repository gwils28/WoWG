import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router';
import { GameIcon } from '../components/GameIcon';
import { ArchiveButton } from '../components/ArchiveButton';
import { PinButton } from '../components/PinButton';
import { TalentTree } from '../components/TalentTree';
import { useRankActions } from '../components/useRankActions';
import { api, type SpecSummary } from '../lib/api';
import { specPath } from '../lib/classes';
import { talentQuestMarks } from '../lib/quests';
import { SpecializationPage } from './SpecializationPage';

/** /classe/:domainId : les spécialisations côte à côte ; /classe/:domainId/:specId : une seule. */
export function ClassPage() {
  const { domainId = '', specId } = useParams();
  if (specId) return <SpecializationPage id={specId} />;
  return <ClassOverview domainId={domainId} />;
}

function ClassOverview({ domainId }: { domainId: string }) {
  const specs = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  const character = useQuery({ queryKey: ['character'], queryFn: api.character });
  if (specs.isLoading) return <p className="muted">Chargement...</p>;
  const siblings = (specs.data ?? []).filter((s) => s.domain.id === domainId);
  const domain = siblings[0]?.domain;
  if (!domain) return <p className="error">Classe « {domainId} » introuvable.</p>;
  const archived = siblings[0]?.archived ?? false;
  const points = siblings.reduce((n, s) => n + s.points, 0);
  const maxPoints = siblings.reduce((n, s) => n + s.maxPoints, 0);

  return (
    <div className="class-overview">
      <header className="spec-page__header">
        <GameIcon icon={domain.icon} size={28} className="domain__icon" />
        <h1>{domain.name}</h1>
        {!archived && (
          <PinButton
            domainId={domain.id}
            name={domain.name}
            pinned={character.data?.pinned.includes(domain.id) ?? false}
          />
        )}
        <span className="class-overview__points">
          {points}
          <small>/{maxPoints}</small>
        </span>
        {!archived && (
          <Link to={`/quetes?classe=${domain.id}`} className="spec-page__all">
            Quêtes de la classe
          </Link>
        )}
        <Link to={archived ? '/archives' : '/classes'} className="spec-page__all">
          {archived ? 'Archives' : 'Toutes les classes'}
        </Link>
        <ArchiveButton domainId={domain.id} name={domain.name} archived={archived} />
      </header>
      {archived && (
        <p className="notice">Classe archivée : lecture seule, hors niveau et hors quêtes.</p>
      )}
      <div className="class-trees">
        {siblings.map((s) => (
          <SpecColumn key={s.id} summary={s} />
        ))}
      </div>
      {!archived && (
        <p className="hint class-overview__hint">
          Clic : monter un rang · Maj + clic : sans note · Clic droit : retirer
        </p>
      )}
    </div>
  );
}

/** Un arbre de la classe, jouable, en version compacte. */
function SpecColumn({ summary }: { summary: SpecSummary }) {
  const spec = useQuery({
    queryKey: ['spec', summary.id],
    queryFn: () => api.specialization(summary.id),
  });
  const ranks = spec.data?.ranks ?? {};
  const { onAdd, onRemove, dialog } = useRankActions(summary.id, spec.data?.tree, ranks);
  const s = summary.specialization;

  return (
    <section className="panel tree-panel class-tree">
      <header className="tree-panel__header">
        <span className="tree-panel__icon">
          <GameIcon icon={s.icon} size={26} />
        </span>
        <div>
          <h2>{s.name}</h2>
          <Link to={specPath(summary.domain.id, summary.id)} className="class-tree__detail">
            {summary.archived ? 'Détail' : 'Détail et édition'}
          </Link>
        </div>
        <span className="tree-panel__points">
          {spec.data?.points ?? summary.points}
          <small>/{summary.maxPoints}</small>
        </span>
      </header>
      <div className="tree-scroll">
        {spec.isLoading && <p className="muted">Chargement...</p>}
        {spec.isError && <p className="error">{spec.error.message}</p>}
        {spec.data && (
          <TalentTree
            tree={spec.data.tree}
            ranks={ranks}
            onAdd={summary.archived ? undefined : onAdd}
            onRemove={summary.archived ? undefined : onRemove}
            quests={talentQuestMarks(spec.data.tree, spec.data.questStates)}
          />
        )}
      </div>
      {dialog}
    </section>
  );
}

/** Ancienne adresse /specialisation/:id, gardée pour les liens existants. */
export function LegacySpecRedirect() {
  const { id = '' } = useParams();
  const specs = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  if (specs.isLoading) return <p className="muted">Chargement...</p>;
  const spec = specs.data?.find((s) => s.id === id);
  if (!spec) return <p className="error">Spécialisation « {id} » introuvable.</p>;
  return <Navigate to={specPath(spec.domain.id, spec.id)} replace />;
}
