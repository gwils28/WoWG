import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { api } from '../lib/api';
import { specPath } from '../lib/classes';
import { SpecializationPage } from './SpecializationPage';

/** /classe/:domainId/:specId ; sans spécialisation, ouvre la première de la classe. */
export function ClassPage() {
  const { domainId = '', specId } = useParams();
  const specs = useQuery({ queryKey: ['specs'], queryFn: api.specializations });
  if (specId) return <SpecializationPage id={specId} />;
  if (specs.isLoading) return <p className="muted">Chargement...</p>;
  const first = specs.data?.find((s) => s.domain.id === domainId);
  if (!first) return <p className="error">Classe « {domainId} » introuvable.</p>;
  return <Navigate to={specPath(domainId, first.id)} replace />;
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
