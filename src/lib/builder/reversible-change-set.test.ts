import { describe, expect, it } from 'vitest';
import { canApplyChangeSet, summarizeChangeSet, undoChangeSet, type ReversibleChangeSet } from './reversible-change-set';

const changeSet: ReversibleChangeSet = {
  id: 'hero-upgrade', title: 'Improve hero conversion path', status: 'previewed', requiresPreview: true, reversible: true,
  changes: [
    { id: '1', operation: 'update', target: 'section', targetId: 'hero', summary: 'Clarify headline' },
    { id: '2', operation: 'create', target: 'component', targetId: 'cta', summary: 'Add repeated CTA' },
    { id: '3', operation: 'move', target: 'section', targetId: 'proof', summary: 'Move proof above fold' },
  ],
};

describe('reversible change sets', () => {
  it('summarizes reviewable AI changes and only applies previewed changes', () => {
    expect(summarizeChangeSet(changeSet)).toEqual({ created: 1, updated: 1, deleted: 0, moved: 1, affectedTargets: ['section', 'component'] });
    expect(canApplyChangeSet(changeSet)).toBe(true);
  });

  it('only marks applied change sets as undone', () => {
    expect(undoChangeSet(changeSet).status).toBe('previewed');
    expect(undoChangeSet({ ...changeSet, status: 'applied' }).status).toBe('undone');
  });
});
