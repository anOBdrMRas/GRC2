// Declarative field definitions that drive the generic module editors.
import type { EntityKind } from './types';
import { orgUnits } from './logic';

export const auditTypes = ['Internes Audit', 'Zertifizierungsaudit', 'Systemaudit', 'Kundenaudit', 'Lieferantenaudit'];
export const auditStatuses = ['Geplant', 'In Vorbereitung', 'Durchgeführt', 'Bericht erstellt', 'Maßnahmen offen', 'Abgeschlossen', 'Abgesagt'];
export const findingTypes = ['Hauptabweichung', 'Nebenabweichung', 'Beobachtung', 'Verbesserungspotenzial', 'Positive Feststellung'];
export const findingStatuses = ['Offen', 'In Bearbeitung', 'Umgesetzt', 'Wirksamkeit geprüft', 'Geschlossen'];

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'bool'
  | 'select'
  | 'multiselect'
  | 'scale' // 1..5
  | 'ref' // single reference to another entity
  | 'refs' // multiple references
  | 'iso' // ISO clause references
  | 'annexA'
  | 'measurements'
  | 'members' // persons holding a role
  | 'readonly' // shown, not editable (e.g. generated IDs)
  | 'roleList' // repeatable dropdowns with other roles
  | 'processRefs' // multiple processes
  | 'positionRoles' // roles of a position with comment
  | 'positionHolders' // persons holding a position (stored on the user)
  | 'roleRelations' // read-only: positions and persons holding a role
  | 'findings' // audit findings table
  | 'systemRoles'; // tool system roles of a user

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  refKind?: EntityKind;
  /** ref fields: offer an explicit "n/a" (not applicable) choice */
  allowNA?: boolean;
  /** show the field only when this returns true for the entity's values */
  showIf?: (values: Record<string, unknown>) => boolean;
  hint?: string;
  wide?: boolean;
}

export interface SectionDef {
  title: string;
  fields: FieldDef[];
}

export interface ModuleDef {
  kind: EntityKind;
  label: string;
  plural: string;
  codePrefix: string;
  color: string;
  sections: SectionDef[];
}

const scaleHint = '1 = sehr gering … 5 = sehr hoch';

const base: SectionDef = {
  title: 'Stammdaten',
  fields: [
    { key: 'code', label: 'ID', type: 'text' },
    { key: 'title', label: 'Bezeichnung', type: 'text' },
    { key: 'description', label: 'Beschreibung', type: 'textarea', wide: true },
  ],
};

export const modules: Record<EntityKind, ModuleDef> = {
  risk: {
    kind: 'risk',
    label: 'Risiko',
    plural: 'Risiken',
    codePrefix: 'R',
    color: '#d64545',
    sections: [
      {
        ...base,
        fields: [
          ...base.fields,
          {
            key: 'category',
            label: 'Risikokategorie',
            type: 'select',
            options: ['Qualität', 'Informationssicherheit', 'Compliance', 'Operativ', 'Finanziell', 'Strategisch', 'Datenschutz'],
          },
          { key: 'status', label: 'Status', type: 'select', options: ['Identifiziert', 'Bewertet', 'In Behandlung', 'Akzeptiert', 'Geschlossen'] },
          { key: 'ownerRoleId', label: 'Risikoeigner', type: 'ref', refKind: 'role', hint: 'ISO 27001 6.1.2 c) 2)' },
        ],
      },
      {
        title: 'Risikoidentifikation',
        fields: [
          { key: 'cause', label: 'Ursache / Bedrohung / Schwachstelle', type: 'textarea' },
          { key: 'consequence', label: 'Auswirkung', type: 'textarea' },
          { key: 'affectedAssets', label: 'Betroffene Werte (Assets)', type: 'text', hint: 'ISO 27001 A.5.9' },
          { key: 'protectionGoals', label: 'Schutzziele', type: 'multiselect', options: ['Vertraulichkeit', 'Integrität', 'Verfügbarkeit'] },
          { key: 'complianceObligation', label: 'Compliance-Verpflichtung', type: 'text', hint: 'ISO 37301 4.5 (Gesetz, Vertrag, Norm)' },
          { key: 'interestedParties', label: 'Interessierte Parteien', type: 'text', hint: 'ISO 9001 / 37301 4.2' },
        ],
      },
      {
        title: 'Bewertung (brutto)',
        fields: [
          { key: 'likelihood', label: 'Eintrittswahrscheinlichkeit', type: 'scale', hint: scaleHint },
          { key: 'impact', label: 'Schadensausmaß', type: 'scale', hint: scaleHint },
          { key: 'lastAssessment', label: 'Letzte Bewertung', type: 'date' },
          { key: 'nextReview', label: 'Nächste Überprüfung', type: 'date' },
        ],
      },
      {
        title: 'Behandlung & Restrisiko (netto)',
        fields: [
          { key: 'treatment', label: 'Behandlungsoption', type: 'select', options: ['Vermeiden', 'Reduzieren', 'Übertragen', 'Akzeptieren'], hint: 'ISO 27001 6.1.3' },
          { key: 'treatmentPlan', label: 'Behandlungsplan / Maßnahmen', type: 'textarea', wide: true },
          { key: 'residualLikelihood', label: 'Rest-Wahrscheinlichkeit', type: 'scale', hint: scaleHint },
          { key: 'residualImpact', label: 'Rest-Ausmaß', type: 'scale', hint: scaleHint },
          { key: 'acceptedBy', label: 'Restrisiko akzeptiert von', type: 'text', hint: 'ISO 27001 6.1.3 f)' },
          { key: 'acceptedAt', label: 'Akzeptiert am', type: 'date' },
        ],
      },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Normreferenzen', type: 'iso', wide: true }] },
    ],
  },
  opportunity: {
    kind: 'opportunity',
    label: 'Chance',
    plural: 'Chancen',
    codePrefix: 'CH',
    color: '#2f9e44',
    sections: [
      {
        ...base,
        fields: [
          ...base.fields,
          { key: 'category', label: 'Kategorie', type: 'select', options: ['Kundenzufriedenheit', 'Effizienz', 'Innovation', 'Markt', 'Compliance', 'Informationssicherheit'] },
          { key: 'status', label: 'Status', type: 'select', options: ['Identifiziert', 'Bewertet', 'In Umsetzung', 'Realisiert', 'Verworfen'] },
          { key: 'ownerRoleId', label: 'Verantwortlich', type: 'ref', refKind: 'role' },
        ],
      },
      {
        title: 'Bewertung',
        fields: [
          { key: 'benefit', label: 'Erwarteter Nutzen', type: 'textarea', wide: true },
          { key: 'likelihood', label: 'Realisierungswahrscheinlichkeit', type: 'scale', hint: scaleHint },
          { key: 'benefitScore', label: 'Nutzenpotenzial', type: 'scale', hint: scaleHint },
          { key: 'measures', label: 'Maßnahmen zur Nutzung', type: 'textarea', wide: true },
          { key: 'nextReview', label: 'Nächste Überprüfung', type: 'date' },
        ],
      },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Normreferenzen', type: 'iso', wide: true }] },
    ],
  },
  control: {
    kind: 'control',
    label: 'Kontrolle',
    plural: 'Controls (IKS)',
    codePrefix: 'K',
    color: '#1971c2',
    sections: [
      {
        ...base,
        fields: [
          ...base.fields,
          { key: 'objective', label: 'Kontrollziel', type: 'textarea', wide: true },
          { key: 'keyControl', label: 'Schlüsselkontrolle (Key Control)', type: 'bool' },
        ],
      },
      {
        title: 'Kontrolldesign',
        fields: [
          { key: 'controlType', label: 'Kontrollart', type: 'select', options: ['Präventiv', 'Detektiv', 'Korrektiv'] },
          { key: 'automation', label: 'Automatisierungsgrad', type: 'select', options: ['Manuell', 'IT-abhängig manuell', 'Teilautomatisiert', 'Automatisiert'] },
          {
            key: 'frequency',
            label: 'Frequenz',
            type: 'select',
            options: ['Ereignisbezogen', 'Täglich', 'Wöchentlich', 'Monatlich', 'Quartalsweise', 'Halbjährlich', 'Jährlich'],
          },
          { key: 'ownerRoleId', label: 'Kontrollverantwortlicher', type: 'ref', refKind: 'role' },
          { key: 'executorRoleId', label: 'Kontrolldurchführender', type: 'ref', refKind: 'role' },
          { key: 'evidence', label: 'Nachweis / Dokumentation', type: 'text', hint: 'ISO 9001 7.5' },
          { key: 'mitigatesRiskIds', label: 'Adressierte Risiken', type: 'refs', refKind: 'risk', wide: true },
        ],
      },
      {
        title: 'Statement of Applicability (ISO 27001)',
        fields: [
          { key: 'annexA', label: 'Annex-A-Controls', type: 'annexA', wide: true },
          { key: 'soaApplicable', label: 'Anwendbar', type: 'select', options: ['Ja', 'Nein'] },
          { key: 'implementation', label: 'Umsetzungsstatus', type: 'select', options: ['Geplant', 'Teilweise umgesetzt', 'Umgesetzt', 'Nicht umgesetzt'] },
          { key: 'soaJustification', label: 'Begründung (Aufnahme/Ausschluss)', type: 'textarea', wide: true },
        ],
      },
      {
        title: 'Wirksamkeitsprüfung',
        fields: [
          { key: 'testMethod', label: 'Prüfmethode', type: 'select', options: ['Befragung', 'Beobachtung', 'Einsichtnahme', 'Nachvollzug', 'Stichprobe'] },
          { key: 'designEffectiveness', label: 'Design-Wirksamkeit', type: 'select', options: ['Nicht geprüft', 'Wirksam', 'Eingeschränkt wirksam', 'Nicht wirksam'] },
          {
            key: 'operatingEffectiveness',
            label: 'Operative Wirksamkeit',
            type: 'select',
            options: ['Nicht geprüft', 'Wirksam', 'Eingeschränkt wirksam', 'Nicht wirksam'],
          },
          { key: 'lastTest', label: 'Letzte Prüfung', type: 'date' },
          { key: 'nextTest', label: 'Nächste Prüfung', type: 'date' },
          { key: 'testResult', label: 'Prüfergebnis / Feststellungen', type: 'textarea', wide: true },
        ],
      },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Weitere Normreferenzen', type: 'iso', wide: true }] },
    ],
  },
  role: {
    kind: 'role',
    label: 'Rolle',
    plural: 'Rollen',
    codePrefix: 'RO',
    color: '#7048e8',
    sections: [
      {
        ...base,
        fields: [
          { key: 'code', label: 'ID', type: 'readonly', hint: 'wird automatisch vergeben' },
          ...base.fields.filter((f) => f.key !== 'code'),
          { key: 'roleType', label: 'Rollentyp', type: 'select', options: ['Führungsrolle', 'Fachrolle', 'Gremium', 'Beauftragter'] },
          { key: 'orgUnit', label: 'Organisationseinheit', type: 'select', options: orgUnits },
          { key: 'mandatory', label: 'Pflichtrolle', type: 'bool', hint: 'von Norm, Gesetz oder Behörde gefordert, z. B. ISB, DSB, Ausfuhrverantwortlicher' },
          { key: 'complianceRelevant', label: 'Compliance-Funktion / sensible Rolle', type: 'bool', hint: 'ISO 37301 5.3.2' },
          { key: 'roleOwnerUserId', label: 'Rollenverantwortlicher', type: 'ref', refKind: 'user', hint: 'definiert und reviewt die Rolle' },
        ],
      },
      {
        title: 'Verantwortung & Kompetenz',
        fields: [
          { key: 'responsibilities', label: 'Verantwortlichkeiten', type: 'textarea', wide: true, hint: 'ISO 9001 5.3' },
          { key: 'authorities', label: 'Befugnisse', type: 'textarea', wide: true },
          { key: 'competencies', label: 'Erforderliche Kompetenzen', type: 'textarea', hint: 'ISO 9001 7.2' },
          { key: 'trainings', label: 'Pflichtschulungen / Awareness', type: 'textarea', hint: 'ISO 27001 A.6.3 · ISO 37301 7.2.3' },
        ],
      },
      {
        title: 'Stellen & Personen',
        fields: [{ key: 'id', label: 'Stellen mit dieser Rolle und ihre Inhaber', type: 'roleRelations', wide: true, hint: 'Pflege im Modul Stellen' }],
      },
      {
        title: 'Direkt zugeordnete Personen',
        fields: [
          {
            key: 'members',
            label: 'Ausnahmen ohne Stelle',
            type: 'members',
            wide: true,
            hint: 'z. B. bestellte Beauftragte, Externe, Stellvertretungen',
          },
        ],
      },
      {
        title: 'Funktionstrennung',
        fields: [
          {
            key: 'incompatibleRoleIds',
            label: 'Unvereinbare Rollen (SoD)',
            type: 'roleList',
            wide: true,
            hint: 'ISO 27001 A.5.3 · wird bei beiden Rollen eingetragen',
          },
        ],
      },
      {
        title: 'Bestellung / Ernennung',
        fields: [
          { key: 'appointmentRequired', label: 'Formale Bestellung erforderlich', type: 'bool', hint: 'ISO 37301 5.3.2 · ISO 27001 5.3' },
          { key: 'appointedAt', label: 'Bestellt am', type: 'date' },
          { key: 'appointedByUserId', label: 'Bestellt durch', type: 'ref', refKind: 'user' },
          { key: 'appointmentDocument', label: 'Bestellungsdokument', type: 'text', hint: 'Dokumentenname, Ablageort oder Link' },
        ],
      },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Normreferenzen', type: 'iso', wide: true }] },
      {
        title: 'Gültigkeit & Review',
        fields: [
          { key: 'version', label: 'Version', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'] },
          { key: 'lastReview', label: 'Letzte Überprüfung', type: 'date' },
          { key: 'nextReview', label: 'Nächste Überprüfung', type: 'date' },
        ],
      },
    ],
  },
  position: {
    kind: 'position',
    label: 'Stelle',
    plural: 'Stellen',
    codePrefix: 'ST',
    color: '#ae3ec9',
    sections: [
      {
        ...base,
        fields: [
          { key: 'code', label: 'ID', type: 'readonly', hint: 'wird automatisch vergeben' },
          ...base.fields.filter((f) => f.key !== 'code'),
          { key: 'orgUnit', label: 'Organisationseinheit', type: 'select', options: orgUnits },
          { key: 'isManager', label: 'Führungsstelle', type: 'bool', hint: 'mit disziplinarischer Personalverantwortung' },
          { key: 'headcount', label: 'Planstellen (Anzahl)', type: 'number' },
          { key: 'location', label: 'Standort', type: 'text' },
        ],
      },
      {
        title: 'Stellenbeschreibung',
        fields: [
          { key: 'purpose', label: 'Ziel / Zweck der Stelle', type: 'textarea', wide: true },
          { key: 'tasks', label: 'Hauptaufgaben', type: 'textarea', wide: true, hint: 'ISO 9001 5.3' },
          { key: 'authorities', label: 'Befugnisse / Vollmachten', type: 'textarea', wide: true, hint: 'z. B. Unterschriftsregelung' },
        ],
      },
      {
        title: 'Anforderungen & Kompetenz',
        fields: [
          { key: 'qualification', label: 'Ausbildung / Qualifikation', type: 'textarea', hint: 'ISO 9001 7.2' },
          { key: 'experience', label: 'Berufserfahrung', type: 'textarea' },
          { key: 'competencies', label: 'Fachliche & persönliche Kompetenzen', type: 'textarea', wide: true, hint: 'ISO 9001 7.2 · ISO 37301 7.2' },
          { key: 'trainings', label: 'Pflichtschulungen / Awareness', type: 'textarea', wide: true, hint: 'ISO 27001 A.6.3 · ISO 37301 7.3' },
          { key: 'screeningRequired', label: 'Sicherheitsüberprüfung erforderlich', type: 'bool', hint: 'ISO 27001 A.6.1 · ISO 37301 7.2.2' },
          { key: 'ndaRequired', label: 'Vertraulichkeitsvereinbarung erforderlich', type: 'bool', hint: 'ISO 27001 A.6.6' },
        ],
      },
      {
        title: 'Hierarchie & Berichtslinien',
        fields: [
          { key: 'reportsToDisciplinaryId', label: 'Berichtet disziplinarisch an', type: 'ref', refKind: 'position', allowNA: true },
          { key: 'reportsToFunctionalId', label: 'Berichtet fachlich an', type: 'ref', refKind: 'position', allowNA: true },
          { key: 'deputyPositionId', label: 'Vertretung durch Stelle', type: 'ref', refKind: 'position' },
          { key: 'deputyInducted', label: 'Vertretung eingearbeitet', type: 'bool', hint: 'ISO 27001 A.5.29' },
        ],
      },
      {
        title: 'Stelleninhaber',
        fields: [{ key: 'id', label: 'Personen auf dieser Stelle', type: 'positionHolders', wide: true, hint: 'wird beim Benutzer gespeichert' }],
      },
      {
        title: 'Zugeordnete Rollen',
        fields: [{ key: 'roles', label: 'Rollen dieser Stelle mit Kommentar', type: 'positionRoles', wide: true, hint: 'Inhaber der Stelle übernehmen diese Rollen' }],
      },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Normreferenzen', type: 'iso', wide: true }] },
      {
        title: 'Gültigkeit & Review',
        fields: [
          { key: 'version', label: 'Version', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Entwurf', 'In Prüfung', 'Freigegeben', 'Archiviert'] },
          { key: 'lastReview', label: 'Letzte Überprüfung', type: 'date' },
          { key: 'nextReview', label: 'Nächste Überprüfung', type: 'date' },
        ],
      },
    ],
  },
  kpi: {
    kind: 'kpi',
    label: 'KPI',
    plural: 'KPI',
    codePrefix: 'KPI',
    color: '#e8590c',
    sections: [
      {
        ...base,
        fields: [...base.fields, { key: 'objective', label: 'Zugehöriges Ziel', type: 'text', wide: true, hint: 'ISO 9001 6.2 / ISO 27001 6.2' }],
      },
      {
        title: 'Messvorschrift',
        fields: [
          { key: 'formula', label: 'Berechnungsformel', type: 'text', wide: true },
          { key: 'unit', label: 'Einheit', type: 'text' },
          { key: 'direction', label: 'Optimierungsrichtung', type: 'select', options: ['higher', 'lower'], hint: 'higher = größer ist besser' },
          { key: 'target', label: 'Zielwert', type: 'number' },
          { key: 'warning', label: 'Warnschwelle', type: 'number' },
          { key: 'critical', label: 'Kritische Schwelle', type: 'number' },
          {
            key: 'frequency',
            label: 'Messfrequenz',
            type: 'select',
            options: ['Täglich', 'Wöchentlich', 'Monatlich', 'Quartalsweise', 'Jährlich'],
          },
          { key: 'dataSource', label: 'Datenquelle', type: 'text' },
          { key: 'ownerRoleId', label: 'Verantwortlich für Messung', type: 'ref', refKind: 'role', hint: 'ISO 9001 9.1.1' },
          { key: 'evaluatorRoleId', label: 'Verantwortlich für Auswertung', type: 'ref', refKind: 'role' },
        ],
      },
      { title: 'Messwerte', fields: [{ key: 'measurements', label: 'Messreihe', type: 'measurements', wide: true }] },
      { title: 'Normbezug', fields: [{ key: 'isoRefs', label: 'Normreferenzen', type: 'iso', wide: true }] },
    ],
  },
  user: {
    kind: 'user',
    label: 'Benutzer',
    plural: 'Benutzerverwaltung',
    codePrefix: 'U',
    color: '#495057',
    sections: [
      {
        title: 'Benutzer',
        fields: [
          { key: 'code', label: 'Benutzer-ID', type: 'text' },
          { key: 'title', label: 'Name', type: 'text' },
          { key: 'email', label: 'E-Mail / Login', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Aktiv', 'Inaktiv', 'Gesperrt'] },
          { key: 'department', label: 'Abteilung', type: 'text' },
          { key: 'jobTitle', label: 'Stellenbezeichnung', type: 'text' },
          { key: 'positionId', label: 'Stelle', type: 'ref', refKind: 'position' },
          { key: 'positionSince', label: 'Stelle seit', type: 'date' },
          { key: 'validUntil', label: 'Zugang gültig bis', type: 'date', hint: 'leer = unbefristet' },
          { key: 'description', label: 'Bemerkung', type: 'textarea', wide: true },
        ],
      },
      {
        title: 'Systemrollen (Berechtigungen im Tool)',
        fields: [{ key: 'systemRoles', label: 'Zugewiesene Systemrollen', type: 'systemRoles', wide: true }],
      },
    ],
  },
  audit: {
    kind: 'audit',
    label: 'Audit',
    plural: 'Audits',
    codePrefix: 'AU',
    color: '#0c8599',
    sections: [
      {
        ...base,
        fields: [
          { key: 'code', label: 'ID', type: 'readonly', hint: 'wird automatisch vergeben' },
          ...base.fields.filter((f) => f.key !== 'code'),
          { key: 'auditType', label: 'Audittyp', type: 'select', options: auditTypes },
          {
            key: 'certStage',
            label: 'Auditart',
            type: 'select',
            options: ['', 'Erstzertifizierung Stufe 1', 'Erstzertifizierung Stufe 2', 'Überwachungsaudit', 'Rezertifizierung', 'Sonderaudit'],
            hint: 'ISO/IEC 17021-1',
            showIf: (v) => v.auditType === 'Zertifizierungsaudit',
          },
          { key: 'programYear', label: 'Auditprogramm (Jahr)', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: auditStatuses },
        ],
      },
      {
        title: 'Umfang & Kriterien',
        fields: [
          {
            key: 'standards',
            label: 'Normen / Regelwerke',
            type: 'multiselect',
            options: ['ISO 9001', 'ISO 27001', 'ISO 37301', 'Kundenanforderung', 'Lieferantenanforderung', 'Sonstiges'],
          },
          { key: 'objective', label: 'Auditziel & Geltungsbereich', type: 'textarea', wide: true, hint: 'ISO 19011 5.2 / 6.2' },
          { key: 'criteria', label: 'Auditkriterien (Normkapitel)', type: 'iso', wide: true },
          { key: 'processIds', label: 'Auditierte Prozesse', type: 'processRefs', wide: true },
          { key: 'auditedRoleIds', label: 'Auditierte Rollen', type: 'refs', refKind: 'role', wide: true },
          { key: 'sites', label: 'Standorte', type: 'text' },
        ],
      },
      {
        title: 'Beteiligte',
        fields: [
          { key: 'leadAuditorUserId', label: 'Leitender Auditor', type: 'ref', refKind: 'user' },
          { key: 'externalLeadAuditor', label: 'Leitender Auditor (extern)', type: 'text', hint: 'bei Zertifizierungs-, Kunden- oder Lieferantenaudits' },
          { key: 'teamUserIds', label: 'Auditteam', type: 'refs', refKind: 'user', wide: true },
          { key: 'externalOrg', label: 'Externe Organisation', type: 'text', hint: 'Zertifizierungsstelle, Kunde oder Lieferant' },
          { key: 'auditeeContactUserId', label: 'Ansprechpartner auditierte Seite', type: 'ref', refKind: 'user' },
        ],
      },
      {
        title: 'Termine',
        fields: [
          { key: 'plannedDate', label: 'Geplant am', type: 'date' },
          { key: 'startDate', label: 'Durchgeführt von', type: 'date' },
          { key: 'endDate', label: 'Durchgeführt bis', type: 'date' },
          { key: 'reportDate', label: 'Berichtsdatum', type: 'date' },
          { key: 'reportDocument', label: 'Auditbericht', type: 'text', hint: 'Dokumentenname, Ablageort oder Link' },
          {
            key: 'certificateValidUntil',
            label: 'Zertifikat gültig bis',
            type: 'date',
            showIf: (v) => v.auditType === 'Zertifizierungsaudit',
          },
          { key: 'nextAuditDue', label: 'Nächstes Audit fällig', type: 'date' },
        ],
      },
      {
        title: 'Ergebnis',
        fields: [
          { key: 'verdict', label: 'Gesamturteil', type: 'select', options: ['', 'Konform', 'Konform mit Feststellungen', 'Nicht konform'] },
          { key: 'summary', label: 'Zusammenfassung', type: 'textarea', wide: true },
          { key: 'strengths', label: 'Stärken', type: 'textarea', wide: true },
        ],
      },
      { title: 'Feststellungen', fields: [{ key: 'findings', label: 'Feststellungen & Korrekturmaßnahmen', type: 'findings', wide: true, hint: 'ISO 9001 10.2' }] },
    ],
  },
};

export const kindOrder: EntityKind[] = ['risk', 'opportunity', 'control', 'role', 'position', 'kpi', 'audit', 'user'];
