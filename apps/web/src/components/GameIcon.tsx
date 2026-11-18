import { addCollection, Icon } from '@iconify/react';
import gameIcons from '@iconify-json/game-icons/icons.json';

// Collection embarquée : aucun appel réseau à l'API Iconify.
addCollection(gameIcons);

export function GameIcon({
  icon,
  size = 32,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  return <Icon icon={icon} width={size} height={size} className={className} aria-hidden />;
}
