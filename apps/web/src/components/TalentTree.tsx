import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  arrowCells,
  findTalent,
  missingPrerequisites,
  requiredRank,
  talentState,
  type Ranks,
  type Talent,
  type TalentState,
  type TreeFile,
} from '@wowg/shared';
import { arrowPath, CELL, ICON, PAD, placeTooltip, talentCenter, treeSize } from '../lib/layout';
import { GameIcon } from './GameIcon';

export type TalentMark = 'added' | 'modified';

export interface EditHandlers {
  selectedId: string | null;
  invalidIds: Set<string>;
  onSelect: (id: string) => void;
  onEmptyCell: (tier: number, column: number) => void;
}

interface Props {
  tree: TreeFile;
  ranks: Ranks;
  /** Mode jeu : monter / retirer des rangs. */
  onAdd?: (talent: Talent, quick: boolean) => void;
  onRemove?: (talent: Talent) => void;
  /** Mode édition : sélection d'un talent, ajout sur une case vide. */
  edit?: EditHandlers;
  /** Prévisualisation d'import : talents ajoutés ou modifiés. */
  marks?: Record<string, TalentMark>;
}

export function TalentTree({ tree, ranks, onAdd, onRemove, edit, marks }: Props) {
  // talent survolé et son bouton, ancre de l'infobulle
  const [hovered, setHovered] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const { width, height } = treeSize(tree);
  const interactive = Boolean(onAdd || edit);

  const arrows = tree.talents.flatMap((child) =>
    child.prerequisites.flatMap((p) => {
      const parent = findTalent(tree, p.talentId);
      if (!parent) return [];
      const met = (ranks[parent.id] ?? 0) >= requiredRank(tree, p);
      return [{ key: `${parent.id}>${child.id}`, d: arrowPath(parent, child), met }];
    }),
  );
  const hoveredTalent = hovered ? findTalent(tree, hovered.id) : undefined;
  // l'infobulle est en position fixe : on la ferme si la page ou l'arbre défile
  useEffect(() => {
    if (!hovered) return;
    const close = () => setHovered(null);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [hovered]);
  const occupied = new Set(tree.talents.map((t) => `${t.tier}:${t.column}`));
  // une case sur le trajet d'une flèche ne peut pas accueillir de talent (validation)
  const onArrow = new Set(
    tree.talents.flatMap((child) =>
      child.prerequisites.flatMap((p) => {
        const parent = findTalent(tree, p.talentId);
        return parent && parent.tier < child.tier
          ? arrowCells(parent, child).map((c) => `${c.tier}:${c.column}`)
          : [];
      }),
    ),
  );

  return (
    <div className={`talent-tree${edit ? ' talent-tree--edit' : ''}`} style={{ width, height }}>
      <div className="talent-tree__tiers" aria-hidden>
        {Array.from({ length: tree.grid.tiers }, (_, i) => (
          <div
            key={i}
            className="talent-tree__tier"
            style={{ top: PAD + i * CELL, height: CELL }}
          />
        ))}
      </div>

      {edit &&
        Array.from({ length: tree.grid.tiers }, (_, i) =>
          Array.from({ length: tree.grid.columns }, (_, j) => {
            const tier = i + 1;
            const column = j + 1;
            const key = `${tier}:${column}`;
            if (occupied.has(key) || onArrow.has(key)) return null;
            const c = talentCenter({ tier, column });
            return (
              <button
                key={`${tier}:${column}`}
                type="button"
                className="empty-cell"
                style={{ left: c.x - ICON / 2, top: c.y - ICON / 2, width: ICON, height: ICON }}
                aria-label={`Ajouter un talent palier ${tier} colonne ${column}`}
                onClick={() => edit.onEmptyCell(tier, column)}
              >
                +
              </button>
            );
          }),
        )}

      <svg className="talent-tree__arrows" width={width} height={height} aria-hidden>
        <defs>
          {(['met', 'unmet'] as const).map((k) => (
            <marker
              key={k}
              id={`arrow-${k}`}
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={`arrow-head arrow-head--${k}`} />
            </marker>
          ))}
        </defs>
        {arrows.map((a) => (
          <path
            key={a.key}
            d={a.d}
            className={`arrow ${a.met ? 'arrow--met' : 'arrow--unmet'}`}
            markerEnd={`url(#arrow-${a.met ? 'met' : 'unmet'})`}
          />
        ))}
      </svg>

      {tree.talents.map((t) => {
        const classes = [
          edit?.selectedId === t.id && 'talent--selected',
          edit?.invalidIds.has(t.id) && 'talent--invalid',
          marks?.[t.id] && `talent--mark-${marks[t.id]}`,
          !interactive && 'talent--readonly',
        ].filter(Boolean);
        return (
          <TalentNode
            key={t.id}
            talent={t}
            rank={ranks[t.id] ?? 0}
            state={talentState(tree, ranks, t.id)}
            extraClass={classes.join(' ')}
            onHover={(anchor) => setHovered(anchor ? { id: t.id, anchor } : null)}
            onClick={(quick) => (edit ? edit.onSelect(t.id) : onAdd?.(t, quick))}
            onRemove={edit ? undefined : onRemove && (() => onRemove(t))}
          />
        );
      })}

      {hovered && hoveredTalent && (
        <TalentTooltip
          anchor={hovered.anchor}
          tree={tree}
          ranks={ranks}
          talent={hoveredTalent}
          hint={edit ? 'Clic : modifier ce talent.' : undefined}
          playable={Boolean(onAdd)}
        />
      )}
    </div>
  );
}

function TalentNode({
  talent,
  rank,
  state,
  extraClass,
  onHover,
  onClick,
  onRemove,
}: {
  talent: Talent;
  rank: number;
  state: TalentState;
  extraClass: string;
  onHover: (anchor: HTMLElement | null) => void;
  onClick: (quick: boolean) => void;
  onRemove?: () => void;
}) {
  const c = talentCenter(talent);
  return (
    <button
      type="button"
      className={`talent talent--${state}${talent.ultimate ? ' talent--ultimate' : ''} ${extraClass}`}
      style={{ left: c.x - ICON / 2, top: c.y - ICON / 2, width: ICON, height: ICON }}
      aria-label={`${talent.name}, rang ${rank} sur ${talent.maxRank}`}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(e.currentTarget)}
      onBlur={() => onHover(null)}
      onClick={(e) => onClick(e.shiftKey)}
      onContextMenu={(e) => {
        if (!onRemove) return;
        e.preventDefault();
        onRemove();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') onRemove?.();
      }}
    >
      <GameIcon icon={talent.icon} size={ICON - 14} className="talent__icon" />
      {state !== 'locked' && (
        <span className="talent__rank">
          {rank}/{talent.maxRank}
        </span>
      )}
    </button>
  );
}

/**
 * Infobulle rendue dans `body` en position fixe : elle n'est plus rognée par le conteneur
 * défilant de l'arbre (#4). Mesurée après rendu puis placée dans la fenêtre.
 */
function TalentTooltip({
  anchor,
  tree,
  ranks,
  talent,
  hint,
  playable,
}: {
  anchor: HTMLElement;
  tree: TreeFile;
  ranks: Ranks;
  talent: Talent;
  hint?: string;
  playable: boolean;
}) {
  const rank = ranks[talent.id] ?? 0;
  const missing = missingPrerequisites(tree, ranks, talent.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    setPos(
      placeTooltip(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: document.documentElement.clientWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, talent, rank, missing.length]);
  // première passe invisible, le temps de mesurer la taille réelle
  const style = pos
    ? { left: pos.x, top: pos.y }
    : { left: 0, top: 0, visibility: 'hidden' as const };
  const next = talent.ranks[rank];
  const current = rank > 0 ? talent.ranks[rank - 1] : undefined;
  const playHint = [
    next && missing.length === 0 ? 'Clic : monter un rang.' : '',
    rank > 0 ? 'Clic droit : retirer un rang.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div ref={ref} className="tooltip" style={style} role="tooltip">
      <div className="tooltip__title">{talent.name}</div>
      <div className="tooltip__rank">
        Rang {rank}/{talent.maxRank}
        {talent.ultimate && <span className="tooltip__ultimate"> · Talent ultime</span>}
      </div>
      <p className="tooltip__desc">{talent.description}</p>
      {current && (
        <p className="tooltip__criterion">
          <span className="tooltip__label">Acquis :</span> {current}
        </p>
      )}
      {next && (
        <p className="tooltip__criterion tooltip__criterion--next">
          <span className="tooltip__label">Rang suivant :</span> {next}
        </p>
      )}
      {missing.map((m) => (
        <p key={m.talentId} className="tooltip__missing">
          Requiert {m.required} point{m.required > 1 ? 's' : ''} en {m.name} ({m.current}/
          {m.required})
        </p>
      ))}
      {(hint || (playable && playHint)) && <p className="tooltip__hint">{hint ?? playHint}</p>}
    </div>,
    document.body,
  );
}
