import { create } from 'zustand';
import type { EntityKind } from './types';
import { t } from './i18n';

export type View = 'home' | 'ia' | 'content' | 'processes' | 'orgchart' | EntityKind;

export interface ExportFile {
  filename: string;
  content: string;
  type: string;
  /** binary file (e.g. Excel); content is then only a description */
  blob?: Blob;
}

interface UiState {
  view: View;
  /** selected entity id per module */
  selected: Partial<Record<View, string>>;
  /** element to focus when the process editor opens */
  focusElementId: string | null;
  go: (view: View, id?: string) => void;
  openStep: (processId: string, elementId: string) => void;
  select: (view: View, id: string | undefined) => void;
  clearFocus: () => void;
  /** audit finding to expand when the audit module opens */
  focusFindingId: string | null;
  openFinding: (auditId: string, findingId: string) => void;
  clearFindingFocus: () => void;
  /** file offered in the export dialog (downloads may be blocked, e.g. when embedded) */
  exportFile: ExportFile | null;
  setExportFile: (f: ExportFile | null) => void;
  notice: string | null;
  setNotice: (msg: string | null) => void;
  /** AI process draft dialog in the process module */
  draftOpen: boolean;
  setDraftOpen: (open: boolean) => void;
  /** a form has unsaved changes: leaving it asks first */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** element just created: its form opens in edit mode */
  justCreatedId: string | null;
}

/** Asks before unsaved changes are discarded; true = may leave. */
export function mayLeave(): boolean {
  if (!useUi.getState().dirty) return true;
  // eslint-disable-next-line no-alert
  const ok = window.confirm(t('Ungespeicherte Änderungen verwerfen?'));
  if (ok) useUi.setState({ dirty: false });
  return ok;
}

export const useUi = create<UiState>()((set) => ({
  view: 'home',
  selected: {},
  focusElementId: null,
  go: (view, id) => mayLeave() && set((s) => ({ view, selected: id ? { ...s.selected, [view]: id } : s.selected })),
  openStep: (processId, elementId) =>
    mayLeave() && set((s) => ({ view: 'processes', selected: { ...s.selected, processes: processId }, focusElementId: elementId })),
  select: (view, id) => mayLeave() && set((s) => ({ selected: { ...s.selected, [view]: id } })),
  clearFocus: () => set({ focusElementId: null }),
  focusFindingId: null,
  openFinding: (auditId, findingId) =>
    mayLeave() && set((s) => ({ view: 'audit', selected: { ...s.selected, audit: auditId }, focusFindingId: findingId })),
  clearFindingFocus: () => set({ focusFindingId: null }),
  exportFile: null,
  setExportFile: (exportFile) => set({ exportFile }),
  notice: null,
  setNotice: (notice) => set({ notice }),
  draftOpen: false,
  setDraftOpen: (draftOpen) => set({ draftOpen }),
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
  justCreatedId: null,
}));
