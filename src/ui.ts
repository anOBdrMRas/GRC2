import { create } from 'zustand';
import type { EntityKind } from './types';

export type View = 'dashboard' | 'processes' | EntityKind;

export interface ExportFile {
  filename: string;
  content: string;
  type: string;
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
  /** file offered in the export dialog (downloads may be blocked, e.g. when embedded) */
  exportFile: ExportFile | null;
  setExportFile: (f: ExportFile | null) => void;
  notice: string | null;
  setNotice: (msg: string | null) => void;
}

export const useUi = create<UiState>()((set) => ({
  view: 'dashboard',
  selected: {},
  focusElementId: null,
  go: (view, id) => set((s) => ({ view, selected: id ? { ...s.selected, [view]: id } : s.selected })),
  openStep: (processId, elementId) =>
    set((s) => ({ view: 'processes', selected: { ...s.selected, processes: processId }, focusElementId: elementId })),
  select: (view, id) => set((s) => ({ selected: { ...s.selected, [view]: id } })),
  clearFocus: () => set({ focusElementId: null }),
  exportFile: null,
  setExportFile: (exportFile) => set({ exportFile }),
  notice: null,
  setNotice: (notice) => set({ notice }),
}));
