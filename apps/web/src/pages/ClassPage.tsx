import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router';
import { GameIcon } from '../components/GameIcon';
import { ArchiveButton } from '../components/ArchiveButton';
import { PinButton } from '../components/PinButton';
import { TalentTree } from '../components/TalentTree';
import { useRankActions } from '../components/useRankActions';
import { api, type SpecSummary } from '../lib/api';
import { specPath } from '../lib/classes';
import { fitScale, treeSize } from '../lib/layout';
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
  const siblings = (specs.data ?? []).filter((s) => s.domain.id === domainId);
  const details = useQueries({
    queries: siblings.map((s) => ({
      queryKey: ['spec', s.id],
      queryFn: () => api.specialization(s.id),
    })),
  });
  // les arbres de la classe sur une seule ligne : une même échelle pour tous, réduite si besoin
  const rowRef = useRef<HTMLDivElement>(null);
  const rowWidth = useWidth(rowRef);
  const widths = details.map((d) => (d.data ? treeSize(d.data.tree).width : 0));
  const scale = fitScale(rowWidth, widths);
  if (specs.isLoading) return <p className="muted">Chargement...</p>;
  const domain = siblings[0]?.domain;
  if (!domain) return <p className="error">Classe « {domainId} » introuvable.</p>;
  const archived = siblings[0]?.archived ?? false;
  const summary = [
    ...(character.data?.domains ?? []),
    ...(character.data?.archive.domains ?? []),
  ].find((d) => d.domain.id === domainId);
  const points = siblings.reduce((n, s) => n + s.points, 0);
  const maxPoints = siblings.reduce((n, s) => n + s.maxPoints, 0);

  return (
    <div className="class-overview">
      <header className="spec-page__header">
        {summary?.portrait ? (
          <img
            src={summary.portrait}
            alt={`Personnage ${domain.name}, portrait ${summary.portraitTier} sur 5`}
            className="class-overview__portrait"
          />
        ) : (
          <GameIcon icon={domain.icon} size={28} className="domain__icon" />
        )}
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
      <div className="class-trees" ref={rowRef}>
        {siblings.map((s) => (
          <SpecColumn key={s.id} summary={s} scale={scale} />
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
function SpecColumn({ summary, scale }: { summary: SpecSummary; scale: number }) {
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
          <Scaled tree={spec.data.tree} scale={scale}>
            <TalentTree
              tree={spec.data.tree}
              ranks={ranks}
              onAdd={summary.archived ? undefined : onAdd}
              onRemove={summary.archived ? undefined : onRemove}
              quests={talentQuestMarks(spec.data.tree, spec.data.questStates)}
            />
          </Scaled>
        )}
      </div>
      {dialog}
    </section>
  );
}

/** Réduit un arbre à l'échelle donnée en gardant une boîte à la bonne taille (clics et infobulles
 * suivent : l'infobulle se place d'après la position affichée du talent). */
function Scaled({
  tree,
  scale,
  children,
}: {
  tree: Parameters<typeof treeSize>[0];
  scale: number;
  children: React.ReactNode;
}) {
  const { width, height } = treeSize(tree);
  if (scale >= 1) return <>{children}</>;
  return (
    <div style={{ width: width * scale, height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  );
}

/** Largeur d'un élément, suivie au redimensionnement. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
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
