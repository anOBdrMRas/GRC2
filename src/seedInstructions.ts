// Demo work instructions (rich text with a table and an embedded graphic).
import type { WorkInstruction, WorkflowEntry } from './types';
import { blankEntity } from './logic';

const svg = (title: string, steps: string[]) => {
  const w = 160;
  const boxes = steps
    .map((s, i) => {
      const x = 10 + i * (w + 30);
      const arrow =
        i < steps.length - 1
          ? `<path d="M${x + w + 4} 45 h22" stroke="#5f3dc4" stroke-width="2" marker-end="url(#a)"/>`
          : '';
      return `<rect x="${x}" y="20" width="${w}" height="50" rx="8" fill="#f3f0ff" stroke="#5f3dc4"/><text x="${x + w / 2}" y="50" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#2b2b2b">${s}</text>${arrow}`;
    })
    .join('');
  const width = 20 + steps.length * (w + 30) - 30;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="90" viewBox="0 0 ${width} 90"><title>${title}</title><defs><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#5f3dc4"/></marker></defs>${boxes}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(doc)}`;
};

const wf = (owner: string): WorkflowEntry[] => [
  { step: 'submitted', byUserId: owner, at: '2026-03-02T09:15:00.000Z', comment: '', status: 'In Prüfung' },
  { step: 'approved', byUserId: 'U-013', at: '2026-03-04T14:40:00.000Z', comment: 'Formal geprüft, freigegeben.', status: 'Freigegeben' },
];

const make = (code: string, title: string, patch: Partial<WorkInstruction>): WorkInstruction => ({
  ...blankEntity('instruction', code, title),
  id: code,
  ...patch,
});

export function demoInstructions(): WorkInstruction[] {
  return [
    make('WI-001', 'Bestellanforderung prüfen und genehmigen', {
      description: 'Wie Genehmiger eine Bestellanforderung im ERP prüfen, genehmigen oder zurückweisen.',
      ownerUserId: 'U-002',
      status: 'Freigegeben',
      version: '1.0',
      workflow: wf('U-002'),
      content: [
        '<h2>Zweck</h2>',
        '<p>Bestellungen werden erst ausgelöst, wenn die <strong>Bestellanforderung (BANF)</strong> nach der Unterschriften- und Freigaberichtlinie genehmigt ist. Diese Anweisung beschreibt die Prüfung durch die genehmigende Führungskraft.</p>',
        `<p><img src="${svg('Ablauf Genehmigung', ['BANF erfasst', 'Prüfen', 'Genehmigen', 'Bestellung'])}" alt="Ablauf der Genehmigung"></p>`,
        '<h2>Vorgehen</h2>',
        '<ol><li><p>Im ERP die Aufgabenliste <em>„Freigaben“</em> öffnen.</p></li><li><p>Bedarf, Kostenstelle und Betrag mit dem Budget abgleichen.</p></li><li><p>Bei mehr als 10.000 € prüfen, ob drei Angebote vorliegen.</p></li><li><p>Genehmigen oder mit Begründung zurückweisen.</p></li></ol>',
        '<h2>Freigabegrenzen</h2>',
        '<table><tbody><tr><th><p>Betrag (netto)</p></th><th><p>Genehmigung durch</p></th><th><p>Angebote</p></th></tr><tr><td><p>bis 2.500 €</p></td><td><p>Kostenstellenverantwortliche/r</p></td><td><p>1</p></td></tr><tr><td><p>bis 25.000 €</p></td><td><p>Leitung Einkauf</p></td><td><p>3</p></td></tr><tr><td><p>über 25.000 €</p></td><td><p>Geschäftsführung</p></td><td><p>3 + Vergabevermerk</p></td></tr></tbody></table>',
        '<blockquote><p><strong>Wichtig:</strong> Eine Bestellung ohne genehmigte BANF ist nicht zulässig (Risiko R-001, Kontrolle K-001).</p></blockquote>',
      ].join(''),
    }),
    make('WI-002', 'Budgetplanung der Bereiche', {
      description: 'Erstellung und Abgabe der Budgetplanung je Bereich für das Folgejahr.',
      ownerUserId: 'U-005',
      status: 'In Prüfung',
      version: '0.3',
      workflow: [{ step: 'submitted', byUserId: 'U-005', at: '2026-11-12T10:05:00.000Z', comment: 'Bitte vor dem Planungsstart prüfen.', status: 'In Prüfung' }],
      content: [
        '<h2>Termine</h2>',
        '<table><tbody><tr><th><p>Schritt</p></th><th><p>Termin</p></th><th><p>Verantwortlich</p></th></tr><tr><td><p>Planungsvorlage versenden</p></td><td><p>15.09.</p></td><td><p>Controlling</p></td></tr><tr><td><p>Bereichsplanung abgeben</p></td><td><p>15.10.</p></td><td><p>Bereichsleitungen</p></td></tr><tr><td><p>Konsolidierung</p></td><td><p>31.10.</p></td><td><p>Finanzen</p></td></tr><tr><td><p>Freigabe Gesamtbudget</p></td><td><p>30.11.</p></td><td><p>Geschäftsführung</p></td></tr></tbody></table>',
        '<h2>Vorgehen</h2>',
        '<ul><li><p>Vorlage <em>Budget_Bereich.xlsx</em> verwenden, keine eigenen Formate.</p></li><li><p>Personalkosten nur über die HR-Planung übernehmen.</p></li><li><p>Investitionen über 50.000 € mit kurzer Begründung und Wirtschaftlichkeitsrechnung.</p></li></ul>',
        `<p><img src="${svg('Budgetzyklus', ['Vorlage', 'Bereichsplanung', 'Konsolidierung', 'Freigabe'])}" alt="Budgetzyklus"></p>`,
      ].join(''),
    }),
    make('WI-003', 'Eingangsrechnung prüfen (3-Wege-Abgleich)', {
      description: 'Abgleich von Bestellung, Wareneingang und Rechnung vor der Zahlungsfreigabe.',
      ownerUserId: 'U-005',
      status: 'Entwurf',
      version: '0.1',
      workflow: [],
      content:
        '<h2>Vorgehen</h2><ol><li><p>Rechnung im Rechnungseingangsbuch erfassen.</p></li><li><p>Bestellung, Wareneingang und Rechnung abgleichen (Menge, Preis, Konditionen).</p></li><li><p>Abweichungen über 2 % an den Einkauf melden.</p></li></ol><p><mark>Entwurf – Abschnitt zu Gutschriften folgt.</mark></p>',
    }),
  ];
}
