import { BackupPanel } from '../components/BackupPanel';
import { ImportPage } from './ImportPage';

/** Maintenance, rarement utilisée : import d'arbres et sauvegarde de la progression. */
export function ToolsPage() {
  return (
    <div className="tools">
      <ImportPage />
      <BackupPanel />
    </div>
  );
}
