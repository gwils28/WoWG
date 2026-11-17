import { useState } from 'react';
import {
  findTalent,
  missingPrerequisites,
  requiredRank,
  talentState,
  type Ranks,
  type Talent,
  type TalentState,
  type TreeFile,
} from '@wowg/shared';
import { arrowPath, CELL, ICON, talentCenter, treeSize } from '../lib/layout';
import { GameIcon } from './GameIcon';

interface Props {
  tree: TreeFile;
  ranks: Ranks;
  /** Sans handlers, l'arbre est en lecture seule (prévisualisation d'import). */
  onAdd?: (talent: Talent, quick: boolean) => void;
  onRemove?: (talent: Talent) => void;
}

export function TalentTree({ tree, ranks, onAdd, onRemove }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { width, height } = treeSize(tree);
  const readOnly = !onAdd;

  const arrows = tree.talents.flatMap((child) =>
    child.prerequisites.flatMap((p) => {
      const parent = findTalent(tree, p.talentId);
      if (!parent) return [];
      const met = (ranks[parent.id] ?? 0) >= requiredRank(tree, p);
      return [{ key: `${parent.id}>${child.id}`, d: arrowPath(parent, child), met }];
    }),
  );
  const hoveredTalent = hovered ? findTalent(tree, hovered) : undefined;

  return (
    <div className="talent-tree" style={{ width, height }}>
      <div className="talent-tree__tiers" aria-hidden>
        {Array.from({ length: tree.grid.tiers }, (_, i) => (
          <div key={i} className="talent-tree__tier" style={{ top: 16 + i * CELL, height: CELL }} />
        ))}
      </div>

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

      {tree.talents.map((t) => (
        <TalentNode
          key={t.id}
          talent={t}
          rank={ranks[t.id] ?? 0}
          state={talentState(tree, ranks, t.id)}
          readOnly={readOnly}
          onHover={setHovered}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}

      {hoveredTalent && (
        <TalentTooltip tree={tree} ranks={ranks} talent={hoveredTalent} readOnly={readOnly} />
      )}
    </div>
  );
}

function TalentNode({
  talent,
  rank,
  state,
  readOnly,
  onHover,
  onAdd,
  onRemove,
}: {
  talent: Talent;
  rank: number;
  state: TalentState;
  readOnly: boolean;
  onHover: (id: string | null) => void;
  onAdd?: Props['onAdd'];
  onRemove?: Props['onRemove'];
}) {
  const c = talentCenter(talent);
  return (
    <button
      type="button"
      className={`talent talent--${state}${talent.ultimate ? ' talent--ultimate' : ''}${readOnly ? ' talent--readonly' : ''}`}
      style={{ left: c.x - ICON / 2, top: c.y - ICON / 2, width: ICON, height: ICON }}
      aria-label={`${talent.name}, rang ${rank} sur ${talent.maxRank}`}
      onMouseEnter={() => onHover(talent.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(talent.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => onAdd?.(talent, e.shiftKey)}
      onContextMenu={(e) => {
        if (!onRemove) return;
        e.preventDefault();
        onRemove(talent);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') onRemove?.(talent);
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

function TalentTooltip({
  tree,
  ranks,
  talent,
  readOnly,
}: {
  tree: TreeFile;
  ranks: Ranks;
  talent: Talent;
  readOnly: boolean;
}) {
  const rank = ranks[talent.id] ?? 0;
  const c = talentCenter(talent);
  const missing = missingPrerequisites(tree, ranks, talent.id);
  const toLeft = talent.column > tree.grid.columns / 2;
  const style = toLeft
    ? { right: treeSize(tree).width - (c.x - ICON / 2 - 12), top: c.y - ICON / 2 }
    : { left: c.x + ICON / 2 + 12, top: c.y - ICON / 2 };
  const next = talent.ranks[rank];
  const current = rank > 0 ? talent.ranks[rank - 1] : undefined;

  return (
    <div className="tooltip" style={style} role="tooltip">
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
      {!readOnly && (
        <p className="tooltip__hint">
          {next && missing.length === 0 ? 'Clic : monter un rang. ' : ''}
          {rank > 0 ? 'Clic droit : retirer un rang.' : ''}
        </p>
      )}
    </div>
  );
}
