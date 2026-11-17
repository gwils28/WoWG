import { useMemo, useState } from 'react';
import gameIcons from '@iconify-json/game-icons/icons.json';
import { GameIcon } from './GameIcon';

const NAMES = Object.keys(gameIcons.icons).sort();
const MAX_RESULTS = 60;

/** Recherche dans les ~4000 icônes game-icons (hors ligne). */
export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '-');
    if (!q) return [];
    return NAMES.filter((n) => n.includes(q)).slice(0, MAX_RESULTS);
  }, [query]);

  return (
    <div className="icon-picker">
      <div className="icon-picker__current">
        <span className="icon-picker__preview">
          <GameIcon icon={value} size={32} />
        </span>
        <code>{value.replace('game-icons:', '')}</code>
      </div>
      <input
        type="search"
        placeholder="Chercher une icône en anglais (book, sword, run...)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <div className="icon-picker__grid">
          {results.length === 0 && <span className="muted">Aucune icône.</span>}
          {results.map((name) => {
            const icon = `game-icons:${name}`;
            return (
              <button
                key={name}
                type="button"
                title={name}
                className={`icon-picker__item${icon === value ? ' is-active' : ''}`}
                onClick={() => onChange(icon)}
              >
                <GameIcon icon={icon} size={26} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
