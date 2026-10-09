import { useLang } from '../i18n';

// German labels for the most common bpmn-js palette / context pad entries.
const de: Record<string, string> = {
  'Activate the hand tool': 'Hand-Werkzeug',
  'Activate hand tool': 'Hand-Werkzeug',
  'Activate the lasso tool': 'Lasso-Werkzeug',
  'Activate lasso tool': 'Lasso-Werkzeug',
  'Activate the create/remove space tool': 'Platz einfügen/entfernen',
  'Activate create/remove space tool': 'Platz einfügen/entfernen',
  'Activate the global connect tool': 'Verbinden',
  'Activate global connect tool': 'Verbinden',
  'Create StartEvent': 'Startereignis',
  'Create start event': 'Startereignis',
  'Create EndEvent': 'Endereignis',
  'Create end event': 'Endereignis',
  'Create Intermediate/Boundary Event': 'Zwischenereignis',
  'Create intermediate/boundary event': 'Zwischenereignis',
  'Create Gateway': 'Gateway',
  'Create gateway': 'Gateway',
  'Create Task': 'Aufgabe',
  'Create task': 'Aufgabe',
  'Create expanded SubProcess': 'Aufgeklappter Subprozess',
  'Create expanded sub-process': 'Aufgeklappter Subprozess',
  'Create DataObjectReference': 'Datenobjekt',
  'Create data object reference': 'Datenobjekt',
  'Create DataStoreReference': 'Datenspeicher',
  'Create data store reference': 'Datenspeicher',
  'Create Pool/Participant': 'Pool / Teilnehmer',
  'Create pool/participant': 'Pool / Teilnehmer',
  'Create Group': 'Gruppe',
  'Create group': 'Gruppe',
  'Append EndEvent': 'Endereignis anhängen',
  'Append end event': 'Endereignis anhängen',
  'Append Gateway': 'Gateway anhängen',
  'Append gateway': 'Gateway anhängen',
  'Append Task': 'Aufgabe anhängen',
  'Append task': 'Aufgabe anhängen',
  'Append Intermediate/Boundary Event': 'Zwischenereignis anhängen',
  'Append intermediate/boundary event': 'Zwischenereignis anhängen',
  'Append TextAnnotation': 'Anmerkung hinzufügen',
  'Add text annotation': 'Anmerkung hinzufügen',
  'Change type': 'Typ ändern',
  'Change element': 'Typ ändern',
  Remove: 'Löschen',
  Delete: 'Löschen',
  'Connect using Sequence/MessageFlow or Association': 'Verbinden',
  'Connect using sequence/message flow or association': 'Verbinden',
  'Connect to other element': 'Verbinden',
};

export function customTranslate(template: string, replacements?: Record<string, string>) {
  // bpmn-js ships English labels; only German needs a dictionary.
  const t = useLang.getState().lang === 'de' ? (de[template] ?? template) : template;
  return t.replace(/{([^}]+)}/g, (_, key) => replacements?.[key] ?? `{${key}}`);
}

export const translateModule = { translate: ['value', customTranslate] };
