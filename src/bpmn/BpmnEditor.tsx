import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import type { ProcessModel, StepAssignment } from '../types';
import { modules } from '../schema';
import { translateModule } from './translate';

// bpmn-js services are loosely typed on purpose; the prototype only uses a small surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

export interface SelectedElement {
  id: string;
  type: string;
  name: string;
  isActivity: boolean;
  isCollapsedSubProcess: boolean;
}

export interface BpmnEditorHandle {
  saveXml: () => Promise<string>;
  saveSvg: () => Promise<string>;
  openSubProcess: (id: string) => void;
  fit: () => void;
}

interface Props {
  process: ProcessModel;
  focusElementId: string | null;
  onFocused: () => void;
  onSelect: (el: SelectedElement | null) => void;
  onXmlChange: (processId: string, xml: string) => void;
}

const badgeDefs: { key: keyof Omit<StepAssignment, 'note'>; label: string; color: string; title: string }[] = [
  { key: 'roles', label: 'Ro', color: modules.role.color, title: 'Rollen' },
  { key: 'risks', label: 'R', color: modules.risk.color, title: 'Risiken' },
  { key: 'opportunities', label: 'Ch', color: modules.opportunity.color, title: 'Chancen' },
  { key: 'controls', label: 'K', color: modules.control.color, title: 'Controls' },
  { key: 'kpis', label: 'KPI', color: modules.kpi.color, title: 'KPI' },
];

function describe(element: Svc): SelectedElement {
  const bo = element.businessObject;
  return {
    id: element.id,
    type: bo.$type.replace('bpmn:', ''),
    name: bo.name ?? '',
    isActivity: bo.$instanceOf('bpmn:Activity'),
    isCollapsedSubProcess: bo.$instanceOf('bpmn:SubProcess') && element.collapsed === true,
  };
}

export const BpmnEditor = forwardRef<BpmnEditorHandle, Props>(function BpmnEditor(
  { process, focusElementId, onFocused, onSelect, onXmlChange },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<Svc>(null);
  const assignments = useRef(process.assignments);
  assignments.current = process.assignments;
  const callbacks = useRef({ onSelect, onXmlChange, onFocused });
  callbacks.current = { onSelect, onXmlChange, onFocused };
  const focusRef = useRef(focusElementId);
  focusRef.current = focusElementId;

  const renderOverlays = () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const overlays = modeler.get('overlays');
    const registry = modeler.get('elementRegistry');
    overlays.remove({ type: 'grc' });
    for (const [id, a] of Object.entries(assignments.current)) {
      const el = registry.get(id);
      if (!el || el.waypoints) continue;
      const html = badgeDefs
        .filter((b) => a[b.key].length > 0)
        .map((b) => `<span class="grc-badge" style="background:${b.color}" title="${b.title}">${b.label} ${a[b.key].length}</span>`)
        .join('');
      if (!html) continue;
      overlays.add(id, 'grc', { position: { bottom: 4, left: 0 }, html: `<div class="grc-badges">${html}</div>` });
    }
  };

  const focusElement = (id: string) => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const registry = modeler.get('elementRegistry');
    const canvas = modeler.get('canvas');
    const el = registry.get(id);
    if (!el) return;
    let root = el;
    while (root.parent) root = root.parent;
    canvas.setRootElement(root);
    modeler.get('selection').select(el);
    canvas.scrollToElement(el, { top: 200, bottom: 200, left: 200, right: 200 });
  };

  // One modeler instance per opened process.
  useEffect(() => {
    const modeler: Svc = new Modeler({ container: container.current!, additionalModules: [translateModule] });
    modelerRef.current = modeler;
    let saveTimer: number | undefined;
    let dirty = false;
    let disposed = false;
    const processId = process.id;

    const save = async () => {
      dirty = false;
      const { xml } = await modeler.saveXML({ format: true });
      callbacks.current.onXmlChange(processId, xml);
    };

    const eventBus = modeler.get('eventBus');
    eventBus.on('commandStack.changed', () => {
      dirty = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 400);
      renderOverlays();
    });
    eventBus.on('selection.changed', (e: Svc) => {
      const el = e.newSelection[0];
      callbacks.current.onSelect(el && !el.waypoints && el.type !== 'label' ? describe(el) : null);
    });
    eventBus.on('element.changed', (e: Svc) => {
      const selected = modeler.get('selection').get();
      if (selected.length === 1 && selected[0] === e.element) callbacks.current.onSelect(describe(e.element));
    });
    eventBus.on('root.set', () => callbacks.current.onSelect(null));

    modeler
      .importXML(process.xml)
      .then(() => {
        if (disposed) return;
        modeler.get('canvas').zoom('fit-viewport', 'auto');
        renderOverlays();
        if (focusRef.current) {
          focusElement(focusRef.current);
          callbacks.current.onFocused();
        }
      })
      .catch((err: Error) => {
        if (!disposed) alert(`BPMN konnte nicht geladen werden: ${err.message}`);
      });

    return () => {
      disposed = true;
      window.clearTimeout(saveTimer);
      const finish = () => modeler.destroy();
      if (dirty) save().finally(finish);
      else finish();
      modelerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process.id]);

  useEffect(renderOverlays, [process.assignments]);

  useEffect(() => {
    if (focusElementId && modelerRef.current?.get('elementRegistry').get(focusElementId)) {
      focusElement(focusElementId);
      onFocused();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusElementId]);

  useImperativeHandle(ref, () => ({
    saveXml: async () => (await modelerRef.current.saveXML({ format: true })).xml,
    saveSvg: async () => (await modelerRef.current.saveSVG()).svg,
    openSubProcess: (id: string) => {
      const canvas = modelerRef.current.get('canvas');
      const plane = canvas.findRoot(`${id}_plane`);
      if (plane) canvas.setRootElement(plane);
      canvas.zoom('fit-viewport', 'auto');
    },
    fit: () => modelerRef.current.get('canvas').zoom('fit-viewport', 'auto'),
  }));

  return <div className="bpmn-canvas" ref={container} />;
});
