export type ChangeOperation = 'create' | 'update' | 'delete' | 'move';

export type BuilderChange = {
  id: string;
  operation: ChangeOperation;
  target: 'page' | 'section' | 'component' | 'setting';
  targetId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type ReversibleChangeSet = {
  id: string;
  title: string;
  changes: BuilderChange[];
  status: 'draft' | 'previewed' | 'applied' | 'undone';
  requiresPreview: true;
  reversible: true;
};

export type ChangeSetSummary = {
  created: number;
  updated: number;
  deleted: number;
  moved: number;
  affectedTargets: BuilderChange['target'][];
};

export function summarizeChangeSet(changeSet: ReversibleChangeSet): ChangeSetSummary {
  const counts = { created: 0, updated: 0, deleted: 0, moved: 0 };
  const affectedTargets = new Set<BuilderChange['target']>();

  for (const change of changeSet.changes) {
    affectedTargets.add(change.target);
    if (change.operation === 'create') counts.created += 1;
    if (change.operation === 'update') counts.updated += 1;
    if (change.operation === 'delete') counts.deleted += 1;
    if (change.operation === 'move') counts.moved += 1;
  }

  return { ...counts, affectedTargets: [...affectedTargets] };
}

export function canApplyChangeSet(changeSet: ReversibleChangeSet): boolean {
  return changeSet.status === 'previewed' && changeSet.changes.length > 0;
}

export function undoChangeSet(changeSet: ReversibleChangeSet): ReversibleChangeSet {
  if (changeSet.status !== 'applied') return changeSet;
  return { ...changeSet, status: 'undone' };
}
