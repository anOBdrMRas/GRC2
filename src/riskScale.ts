// Lists and 4-level scales of the Risk Register (compliance risk assessment, ISO 37301 4.6 / A.4.6).

export const riskDepartments = [
  'ECC',
  'I&A',
  'Global IT',
  'HR',
  'Finance',
  'Controlling',
  'EHS',
  'Global Sourcing',
  'Sales',
  'Marketing',
  'Product Marketing',
  'Engineering',
  'Facility',
  'Customer Repair & Service',
  'Manufacturing Engineering',
  'Product Qualification',
  'Test System Solutions',
  'Global Order Processing',
  'Project Management (PJM)',
  'Management Board - CTO/COO',
  'Management Board - CEO',
];

export const riskCategories = ['Qualität', 'Informationssicherheit', 'Umwelt', 'Compliance', 'Finanziell', 'Strategisch', 'Operativ'];

export const consequenceTypes = [
  'Personen- oder Umweltschaden',
  'Wirtschaftlicher Schaden',
  'Reputationsschaden',
  'Behördliche Maßnahmen',
  'Zivil- oder strafrechtliche Haftung',
];

export const assessmentReasons = [
  'Periodisch (Bereichsworkshop)',
  'Neue oder geänderte Aktivität, Produkt oder Service',
  'Änderung der Struktur oder Strategie',
  'Wesentliche externe Änderung',
  'Änderung einer Compliance-Verpflichtung',
  'Fusion oder Übernahme',
  'Nichtkonformität',
  'Beinahe-Vorfall',
  'Audit- oder Hinweisgeber-Feststellung',
  'Sonstiges',
];

export const treatmentOptions = ['Reduzieren', 'Vermeiden', 'Übertragen', 'Akzeptieren'];

/** 4 levels, index 0 = level 1 */
export const likelihoodLevels: [string, string][] = [
  ['Sehr gering', 'Ist noch nicht vorgekommen – auch nicht bei vergleichbaren Unternehmen –, kann aber nicht ausgeschlossen werden.'],
  ['Gering', 'Kann in 5–10 Jahren eintreten.'],
  ['Mittel', 'Kann in 3–5 Jahren eintreten.'],
  ['Hoch', 'Kann innerhalb von 3 Jahren eintreten oder ist bereits eingetreten.'],
];

export const impactNames = ['Unbedeutend', 'Mittel', 'Erheblich', 'Schwerwiegend bis existenzbedrohend'];

/** impact descriptions per consequence type (4 levels each) */
export const impactLevels: Record<string, string[]> = {
  'Personen- oder Umweltschaden': [
    'Keine oder geringfügige Verletzung bzw. Umweltbeeinträchtigung ohne bleibende Folgen.',
    'Verletzung mit Arbeitsausfall bzw. örtlich begrenzte, behebbare Umweltbeeinträchtigung.',
    'Schwere Verletzung bzw. erhebliche Umweltschädigung mit längerer Sanierung.',
    'Bleibende Schäden oder Tod bzw. großflächige, nicht behebbare Umweltschädigung.',
  ],
  'Wirtschaftlicher Schaden': ['< 25 TUSD', '25–300 TUSD', '300 TUSD – 3 Mio. USD', '≥ 3 Mio. USD'],
  Reputationsschaden: [
    'Kein oder nur intern wahrgenommener Vorfall.',
    'Beschwerden einzelner Kunden oder Partner, lokale Berichterstattung.',
    'Verlust wichtiger Kunden oder Partner, überregionale Berichterstattung.',
    'Nachhaltiger Vertrauensverlust am Markt, internationale Berichterstattung.',
  ],
  'Behördliche Maßnahmen': [
    'Hinweis oder Rückfrage einer Behörde.',
    'Behördliche Auflage oder Verwarnung.',
    'Bußgeld, Prüfung oder Entzug einzelner Genehmigungen.',
    'Betriebsuntersagung, Entzug wesentlicher Genehmigungen oder Ausschluss von Ausschreibungen.',
  ],
  'Zivil- oder strafrechtliche Haftung': [
    'Unbegründete oder geringfügige Ansprüche.',
    'Begründete zivilrechtliche Ansprüche in begrenzter Höhe.',
    'Erhebliche Schadensersatzforderungen oder Ermittlungsverfahren.',
    'Strafrechtliche Verurteilung von Organen oder Mitarbeitenden, existenzbedrohende Ansprüche.',
  ],
};
