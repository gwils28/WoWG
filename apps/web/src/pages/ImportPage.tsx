import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError, type ImportPreview } from '../lib/api';
import { specPath } from '../lib/classes';
import { DiffSummary, diffMarks, hasChanges } from '../components/DiffSummary';
import { GameIcon } from '../components/GameIcon';
import { TalentTree } from '../components/TalentTree';
import { useToast } from '../components/Toast';

type Source = { path: string } | { content: unknown; fileName: string };

export function ImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const files = useQuery({ queryKey: ['tree-files'], queryFn: api.treeFiles });
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const toBody = (s: Source) => ('path' in s ? { path: s.path } : { content: s.content });

  const previewMut = useMutation({
    mutationFn: (s: Source) => api.previewImport(toBody(s)),
    onMutate: (s) => {
      setSource(s);
      setPreview(null);
      setErrors([]);
    },
    onSuccess: setPreview,
    onError: (e) => setErrors(e instanceof ApiError ? e.errors : [e.message]),
  });

  const applyMut = useMutation({
    mutationFn: (s: Source) => api.applyImport(toBody(s)),
    onSuccess: ({ specialization }) => {
      void qc.invalidateQueries();
      toast(`${specialization.specialization.name} importé`);
      navigate(specPath(specialization.domain.id, specialization.id));
    },
    onError: (e) => setErrors(e instanceof ApiError ? e.errors : [e.message]),
  });

  async function onUpload(file: File) {
    const text = await file.text();
    let content: unknown;
    try {
      content = JSON.parse(text);
    } catch (e) {
      setSource({ content: null, fileName: file.name });
      setPreview(null);
      setErrors([`${file.name} : JSON invalide (${(e as Error).message})`]);
      return;
    }
    previewMut.mutate({ content, fileName: file.name });
  }

  const label = (s: Source) => ('path' in s ? `trees/${s.path}` : s.fileName);

  return (
    <div className="import">
      <section className="panel import__sources">
        <h1>Importer un arbre</h1>
        <p className="muted">
          Les arbres sont générés par la skill <code>/generate-tree</code> dans <code>trees/</code>.
          Choisis un fichier pour voir ce qui changera avant d'appliquer.
        </p>
        <h2 className="import__h2">Fichiers dans trees/</h2>
        {files.data?.length === 0 && <p className="muted">Aucun fichier pour l'instant.</p>}
        <ul className="file-list">
          {files.data?.map((path) => (
            <li key={path}>
              <button
                type="button"
                className={`file-list__item${source && 'path' in source && source.path === path ? ' is-active' : ''}`}
                onClick={() => previewMut.mutate({ path })}
              >
                {path}
              </button>
            </li>
          ))}
        </ul>
        <h2 className="import__h2">Ou depuis ton ordinateur</h2>
        <label className="upload">
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
              e.target.value = '';
            }}
          />
          <span className="btn btn--ghost">Choisir un fichier .json</span>
        </label>
      </section>

      <section className="panel import__preview">
        {!source && <p className="muted">Sélectionne un fichier à prévisualiser.</p>}
        {previewMut.isPending && <p className="muted">Analyse...</p>}

        {errors.length > 0 && source && (
          <div className="editor__errors">
            <strong>{label(source)} : fichier refusé</strong>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {preview && source && (
          <>
            <header className="import__header">
              <GameIcon icon={preview.tree.specialization.icon} size={36} />
              <div>
                <h2>
                  {preview.tree.domain.name} / {preview.tree.specialization.name}
                </h2>
                <p className="muted">
                  {label(source)}
                  {'content' in source && ` → sera enregistré dans trees/${preview.targetPath}`}
                </p>
              </div>
            </header>
            <DiffSummary diff={preview.diff} />
            <div className="import__actions">
              <button
                type="button"
                className="btn btn--gold"
                disabled={!hasChanges(preview.diff) || applyMut.isPending}
                onClick={() => applyMut.mutate(source)}
              >
                {preview.diff.isNew ? "Créer l'arbre" : 'Appliquer les changements'}
              </button>
            </div>
            <div className="tree-scroll">
              <TalentTree
                tree={preview.tree}
                ranks={preview.ranks}
                marks={diffMarks(preview.diff)}
              />
            </div>
            {!preview.diff.isNew && (
              <p className="hint">Contour vert : talent ajouté · contour bleu : talent modifié</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
