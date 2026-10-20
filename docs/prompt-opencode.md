# Prompt: GRC Studio mit Audit-Modul

> Diesen Text vollständig als Aufgabe an den Coding-Agenten übergeben (z. B. opencode mit Claude Sonnet 5.5).
> Er beschreibt den aktuellen Stand von GRC Studio plus das neue Audit-Modul.

---

## Auftrag

Baue **GRC Studio**, einen lauffähigen Prototyp einer Governance-, Risk- & Compliance-Software (ähnlich BOC ADONIS)
als reine Browser-Anwendung ohne Backend. Kern ist die Prozessmodellierung in **BPMN 2.0 mit Subprozessen**.
Jedem Prozessschritt lassen sich **Rollen (mit RACI), Risiken, Chancen, Controls (IKS) und KPI** zuordnen, die in
eigenen Modulen mit den Metadaten aus **ISO 9001:2015, ISO/IEC 27001:2022 und ISO 37301:2021** gepflegt werden.
Dazu kommen eine **Benutzerverwaltung mit Systemrollen**, ein **Cockpit**, eine **Sprachumschaltung Deutsch/Englisch**
und ein **Audit-Modul** für interne Audits, Zertifizierungs-, System-, Kunden- und Lieferantenaudits.

Arbeite in kleinen, überprüfbaren Schritten. Nach jedem größeren Schritt `npm run build` (inkl. Typecheck) ausführen und
Fehler beheben. Am Ende muss `npm install && npm run dev` eine vollständig bedienbare App mit Demodaten liefern.

## Technik

- **Vite + React 19 + TypeScript** (strict, `noUnusedLocals`, `noUnusedParameters`), keine UI-Bibliothek, eigenes CSS.
- **bpmn-js 18** (`bpmn-js/lib/Modeler`, im Nur-Lese-Modus `bpmn-js/lib/NavigatedViewer`). CSS einbinden:
  `bpmn-js/dist/assets/diagram-js.css`, `bpmn-js.css`, `bpmn-font/css/bpmn-embedded.css`.
- **zustand 5** mit `persist`-Middleware (localStorage) als einziger Datenspeicher. Versionierte Persistenz mit
  `migrate`, damit ältere gespeicherte Daten weiter funktionieren.
- `vite.config.ts` mit `base: './'`, damit der Build auch aus einem Unterordner/Iframe läuft.
- Keine Browser-Dialoge (`alert`, `confirm`, `prompt`) und keine direkten Downloads als einziger Weg verwenden, weil die App
  auch in einem gesperrten Iframe laufen soll. Stattdessen:
  - **Zwei-Klick-Bestätigung** (`ConfirmButton`: erster Klick „Wirklich löschen?“, zweiter Klick führt aus, nach 4 s zurück),
  - **Inline-Eingabefelder** (z. B. Name eines neuen Prozesses),
  - **Hinweisleiste** (Notice) für Fehlermeldungen,
  - **Export-Dialog**, der den Inhalt in einer Textarea zeigt, mit „Herunterladen“ und „In Zwischenablage kopieren“.
- „Drucken“ nur anzeigen, wenn die App nicht in einem Iframe läuft (`window.self === window.top`).

### Projektstruktur (Vorschlag)

```
src/
  types.ts          Datenmodell
  schema.ts         deklarative Felddefinitionen je Modul (steuern die Formulare)
  iso.ts            Normkataloge (ISO 9001, ISO 27001 inkl. aller 93 Annex-A-Controls, ISO 37301)
  logic.ts          Hilfsfunktionen (Scores, Ampeln, Parser, Migration, Prüfungen)
  permissions.ts    Systemrollen und Rechte
  i18n.ts, i18n.en.ts  Übersetzung (deutsche Texte sind die Schlüssel)
  store.ts          zustand-Store inkl. Persistenz und Migration
  seed.ts           Demodaten
  ui.ts             UI-Zustand (Navigation, Auswahl, Export-Dialog, Hinweise)
  useRights.ts      Rechte des simulierten angemeldeten Benutzers
  bpmn/BpmnEditor.tsx, bpmn/templates.ts, bpmn/translate.ts
  components/       App-Shell, Cockpit, Prozessansicht, Zuordnungspanel, generische Modulansicht,
                    Felder, Rollen-/Benutzer-/Audit-Ansichten, Heatmap, Sparkline
```

## Allgemeine Bedienkonzepte

- **Layout:** dunkle Seitenleiste links (Logo „GRC Studio“, Untertitel „Prototyp“, Sprachumschalter **DE | EN** oben neben
  dem Logo, Navigation, unten „Angemeldet als (Simulation)“, Daten exportieren/importieren, Demodaten laden).
  Hauptbereich rechts. Sachliches, ruhiges Business-Design, Akzentfarbe Dunkelblau, je Modul eine eigene Farbe
  (Risiken Rot, Chancen Grün, Controls Blau, Rollen Violett, KPI Orange, Benutzer Grau, Audits Petrol/Türkis).
- **Generische Modulansicht** für alle Fachmodule: links Liste (Suchfeld, sortierbare Spalten, Auswahl per Klick),
  rechts Detail-Editor mit Abschnitten (`fieldset` + `legend`) aus `schema.ts`. Neuer Eintrag über „+ <Modul>“.
  Änderungen werden sofort gespeichert. Unten „Angelegt … · zuletzt geändert …“.
- **IDs werden automatisch vergeben** (Präfix je Modul + laufende Nummer, z. B. `RO-001`) und im Formular nur angezeigt.
- **Feldtypen** in `schema.ts`: text, textarea, number, date, bool (Checkbox + Ja/Nein), select, multiselect (Checkboxen),
  scale (1–5 als Knopfreihe), ref (Dropdown auf anderes Modul, optional mit „n/a (nicht anwendbar)“), refs (Tags + suchbarer
  Picker), iso (Normkapitel-Picker), annexA (Annex-A-Picker), measurements (Messreihe), members (Personenliste),
  roleList (wiederholbare Rollen-Dropdowns), systemRoles (Systemrollen-Auswahl), readonly.
- **Suchbarer Picker** (Eingabefeld mit Trefferliste) mit optionaler Funktion „+ Neu anlegen: „…““.
- Jedes Element eines Moduls zeigt **„Verwendet in Prozessschritten“** (Tags „P-001 › Schrittname“ mit RACI-Kürzel),
  ein Klick springt in das BPMN-Modell und markiert den Schritt (auch innerhalb von Subprozessen).

## Prozessmodul (BPMN 2.0)

- Linke Spalte: Prozessliste gruppiert nach **Führungsprozess / Kernprozess / Unterstützungsprozess**, Buttons „+ Prozess“
  (Inline-Namensfeld) und „BPMN importieren“ (.bpmn/.xml).
- Arbeitsbereich mit Reitern **Modell (BPMN) | Steckbrief | Schrittmatrix**, Buttons „⬇ BPMN“, „⬇ SVG“, „Löschen“.
- **Modell:** bpmn-js-Modeler, eine Instanz je geöffnetem Prozess. XML bei `commandStack.changed` entprellt (400 ms)
  speichern; beim Wechsel/Unmount ausstehende Änderungen noch sichern (Prozess-ID mitgeben, nicht die aktuelle aus dem Closure).
  - **Subprozesse:** zugeklappte Subprozesse mit Drill-down (bpmn-js-Drilldown, Brotkrumen). Im Panel zusätzlich Knopf
    „⤵ Subprozess öffnen“ (`canvas.findRoot(id + '_plane')` → `setRootElement`), weil leere Subprozesse kein Drilldown-Symbol haben.
  - **Aufrufaktivitäten** (Call Activity) lassen sich im Panel mit einem anderen Prozess verknüpfen („Aufgerufener Prozess“, „Öffnen →“).
  - **Badges unter jeder Aktivität** (diagram-js-Overlays): Ro n (Rollen), R n (Risiken), Ch n (Chancen), K n (Controls),
    KPI n, A n (offene Audit-Feststellungen, neu); englisch Ro/R/Op/C/KPI/A.
  - Palette und Kontextmenü auf Deutsch übersetzen (eigenes `translate`-Modul), auf Englisch Originaltexte.
  - Elementtyp aus `businessObject.$type` immer in XML-Schreibweise normalisieren (`bpmn:UserTask` → `userTask`),
    sonst funktionieren Typvergleiche (z. B. `callActivity`) nicht.
  - In React StrictMode wird der Editor doppelt gemountet: Importfehler nach dem Zerstören ignorieren.
  - Nur-Lese-Modus (ohne Bearbeitungsrecht): `NavigatedViewer` statt Modeler, Panel deaktiviert.
- **Zuordnungspanel rechts (360 px)** für die ausgewählte Aktivität (Task, Subprozess, Call Activity):
  Typ und ID, Name, je Modul ein Abschnitt mit zugeordneten Einträgen (Code, Titel, Kurzinfo, × entfernen) und Picker
  „<Modul> zuordnen oder neu anlegen…“. Kurzinfos: Rollen mit **RACI-Auswahl (R/A/C/I)**, Risiken mit Netto-Stufe, Controls
  mit ★ für Key Control und Wirksamkeitsfarbe, Chancen mit Potenzial, KPI mit Ampel und letztem Wert. Dazu Notiz/Arbeitsanweisung.
  - Hinweis „Keine durchführende Rolle (R) festgelegt“.
  - **IKS-Prüfung:** Risiken im Schritt ohne mitigierende Kontrolle im selben Schritt werden gemeldet, mit Vorschlagsknöpfen
    für Controls, die genau diese Risiken adressieren.
  - Ohne Auswahl: Prozessübersicht (Anzahl zugeordneter Elemente je Modul, höchstes Bruttorisiko, Legende der Badges, Anleitung Subprozess).
- **Steckbrief (ISO 9001 4.4):** ID, Bezeichnung, Kategorie, Prozessverantwortlicher (Rolle), Version, Freigabestatus
  (Entwurf/In Prüfung/Freigegeben/Archiviert), nächste Überprüfung, relevante Managementsysteme (ISO 9001/27001/37301),
  Zweck & Anwendungsbereich, Inputs, Outputs, Ressourcen.
- **Schrittmatrix:** alle Aktivitäten inkl. Subprozess-Schritte (eingerückt, ▣ für Subprozess) mit Rollen (inkl. RACI),
  Risiken, Controls, Chancen, KPI, Audit-Feststellungen. Klick öffnet den Schritt im Modell. CSV-Export (Semikolon, UTF-8-BOM).
- Aktivitäten aus dem XML mit `DOMParser` lesen (Namespace `http://www.omg.org/spec/BPMN/20100524/MODEL`, Verschachtelungstiefe
  über `subProcess` mitzählen, Ergebnis cachen).
- Zuordnungen werden pro Prozess als `assignments: Record<bpmnElementId, StepAssignment>` gespeichert.

## Fachmodule und Felder

### Risiken (ISO 9001 6.1, ISO 27001 6.1.2/8.2, ISO 37301 4.6)
- Stammdaten: ID, Bezeichnung, Beschreibung, Risikokategorie (Qualität, Informationssicherheit, Compliance, Operativ,
  Finanziell, Strategisch, Datenschutz), Status (Identifiziert, Bewertet, In Behandlung, Akzeptiert, Geschlossen), Risikoeigner (Rolle).
- Identifikation: Ursache/Bedrohung/Schwachstelle, Auswirkung, betroffene Werte (Assets), Schutzziele (V/I/V),
  Compliance-Verpflichtung, interessierte Parteien.
- Bewertung brutto: Eintrittswahrscheinlichkeit 1–5, Schadensausmaß 1–5, letzte Bewertung, nächste Überprüfung.
- Behandlung: Option (Vermeiden/Reduzieren/Übertragen/Akzeptieren), Behandlungsplan, Rest-Wahrscheinlichkeit, Rest-Ausmaß,
  Restrisiko akzeptiert von/am. Normreferenzen.
- Score = W × A; Stufen: <5 Gering, 5–9 Mittel, 10–14 Hoch, ≥15 Kritisch.
- Listenkopf: **5×5-Risikomatrix** mit Umschalter Brutto/Netto, Klick auf Zelle filtert die Liste. Spalten: Kategorie, Eigner,
  Brutto, Netto, Anzahl Controls (0 rot), Status. Detail zeigt „Mitigierende Controls“.

### Chancen (ISO 9001 6.1)
Kategorie (Kundenzufriedenheit, Effizienz, Innovation, Markt, Compliance, Informationssicherheit), Status (Identifiziert,
Bewertet, In Umsetzung, Realisiert, Verworfen), Verantwortlich (Rolle), erwarteter Nutzen, Realisierungswahrscheinlichkeit 1–5,
Nutzenpotenzial 1–5, Maßnahmen, nächste Überprüfung, Normreferenzen. Potenzial = W × N.

### Controls / IKS (ISO 27001 Annex A + SoA, ISO 37301 8.2)
Kontrollziel, Schlüsselkontrolle, Kontrollart (Präventiv/Detektiv/Korrektiv), Automatisierungsgrad (Manuell, IT-abhängig manuell,
Teilautomatisiert, Automatisiert), Frequenz (Ereignisbezogen … Jährlich), Kontrollverantwortlicher und -durchführender (Rollen),
Nachweis, adressierte Risiken (refs). **SoA:** Annex-A-Controls (alle 93 der ISO/IEC 27001:2022 mit englischen Titeln), anwendbar
Ja/Nein, Umsetzungsstatus (Geplant, Teilweise umgesetzt, Umgesetzt, Nicht umgesetzt), Begründung. **Wirksamkeitsprüfung:**
Prüfmethode (Befragung, Beobachtung, Einsichtnahme, Nachvollzug, Stichprobe), Design- und operative Wirksamkeit (Nicht geprüft,
Wirksam, Eingeschränkt wirksam, Nicht wirksam), letzte/nächste Prüfung, Prüfergebnis. Weitere Normreferenzen.

### KPI (ISO 9001 6.2/9.1, ISO 27001 9.1, ISO 37301 9.1)
Zugehöriges Ziel, Formel, Einheit, Optimierungsrichtung (höher/niedriger ist besser), Zielwert, Warnschwelle, kritische Schwelle,
Messfrequenz, Datenquelle, Verantwortlich für Messung/Auswertung (Rollen), Messreihe (Datum, Wert; erfassen/entfernen),
Normreferenzen. Ampel aus letztem Wert (grün = Ziel erreicht, gelb, rot = kritisch). Detail mit kleinem SVG-Verlauf inkl. Ziellinie.

### Rollen (ISO 9001 5.3/7.2, ISO 27001 5.3 und A.5.3, ISO 37301 5.3)
Formularreihenfolge genau so:
1. **Stammdaten:** ID (automatisch, nur Anzeige), Bezeichnung, Beschreibung, Rollentyp (Führungsrolle, Fachrolle, Gremium,
   Beauftragter), Organisationseinheit als Dropdown (**Generic, Technology, Operation, Marketing, Sales, Finance and Admin,
   Business Enablement, Other**), Pflichtrolle Ja/Nein (z. B. ISB, DSB, Ausfuhrverantwortlicher), Compliance-Funktion/sensible
   Rolle Ja/Nein, Rollenverantwortlicher (Benutzer, definiert und reviewt die Rolle).
2. **Verantwortung & Kompetenz:** Verantwortlichkeiten, Befugnisse, erforderliche Kompetenzen, Pflichtschulungen/Awareness.
3. **Berichtslinien:** berichtet fachlich an, berichtet disziplinarisch an (jeweils Rolle oder „n/a“).
4. **Zugeordnete Personen:** Tabelle aus der Benutzerverwaltung: Person, Funktion (Inhaber/Stellvertretung), seit, eingearbeitet,
   × entfernen; neue Person über Picker.
5. **Funktionstrennung:** unvereinbare Rollen als **wiederholbare Dropdown-Zeilen** – „+ Unvereinbare Rolle hinzufügen“ fügt eine
   neue Zeile hinzu (beliebig oft), jede Zeile ein Dropdown mit den anderen Rollen (bereits gewählte und die eigene Rolle nicht
   anbieten), × entfernt. Der Eintrag wird **automatisch symmetrisch** bei beiden Rollen gesetzt bzw. entfernt.
6. **Bestellung / Ernennung:** formale Bestellung erforderlich, bestellt am, bestellt durch (Benutzer), Bestellungsdokument.
7. **Normbezug**, 8. **Gültigkeit & Review** (Version, Status, letzte/nächste Überprüfung).
9. Ganz unten (nur Anzeige) **abgeleitete Verantwortung**: Prozessschritte mit RACI, Prozessverantwortung, Risikoeigner für,
   Chancen, Controls verantwortet/durchgeführt, KPI gemessen/ausgewertet, unterstellte Rollen, offene Audit-Feststellungen.

- Oben ein **Handlungsbedarf**-Kasten: Rolle unbesetzt, Stellvertretung nicht eingearbeitet, Bestellung erforderlich aber
  Datum/Dokument fehlt, Pflichtrolle ohne Rollenverantwortlichen, Review überfällig, inaktive Personen zugeordnet,
  **Funktionstrennung auf Personenebene** (eine Person hält zwei unvereinbare Rollen) und **im Prozess** (zwei unvereinbare
  Rollen haben im selben Schritt R oder A).
- Liste: Filter-Chips nach Rollentyp, Checkbox „nur Pflichtrollen“; Spalten Typ, Inhaber (rot „unbesetzt“), Pflicht (●), Status.
- Knopf **„Rollenbeschreibung“**: Modal mit druckbarer Gesamtbeschreibung (1. Einordnung, 2. Aufgaben/Befugnisse/Kompetenzen,
  3. Berichtslinien, 4. Stelleninhaber und Vertretung, 5. Funktionstrennung, 6. Bestellung, 7. Verantwortung im Managementsystem
  (abgeleitet), 8. Beteiligung an Prozessschritten), „Drucken“ (Print-CSS nur für diesen Bereich) und „Als HTML exportieren“.

### Benutzerverwaltung
- Benutzer: Benutzer-ID (U-001 …), Name, E-Mail/Login, Status (Aktiv/Inaktiv/Gesperrt), Abteilung, Stellenbezeichnung,
  Zugang gültig bis, Bemerkung, **Systemrollen** (Kartenauswahl mit Beschreibung).
- Detail zeigt: Handlungsbedarf (abgelaufener Zugang, unvereinbare Systemrollen, Funktionstrennungskonflikte), organisatorische
  Rollen der Person, Rollen, für die sie Rollenverantwortliche ist, effektive Rechte im Tool.
- Reiter **„Systemrollen“** mit Berechtigungsmatrix (Systemrolle × Modul: Bearbeiten/Lesen/–, Benutzer je Rolle) und Liste der
  unvereinbaren Systemrollen.
- Systemrollen (Rechte je Modul `processes, risk, opportunity, control, role, kpi, audit, user`; mehrere Rollen → höchstes Recht):
  Administrator (alles bearbeiten), GRC-Manager (alles außer Benutzer bearbeiten, Benutzer lesen), Prozessmodellierer (Prozesse),
  Risikomanager (Risiken, Chancen), IKS-Verantwortlicher (Controls), Compliance Officer (Risiken, Controls, Rollen),
  Organisationsverantwortlicher (Rollen; Benutzer lesen), KPI-Verantwortlicher (KPI), **Auditmanager (Audits; neu)**,
  Auditor (alles lesen inkl. Benutzer; **Audits bearbeiten**), Leser (alles lesen außer Benutzer). Sonst jeweils Lesen,
  Benutzerverwaltung ohne Zugriff. Unvereinbar: Administrator + Auditor, IKS-Verantwortlicher + Auditor.
- **„Angemeldet als (Simulation)“** in der Seitenleiste wechselt den Benutzer und setzt die Rechte durch: Module ohne Recht
  verschwinden aus der Navigation, ohne Bearbeitungsrecht ist alles schreibgeschützt (Badge „Nur Lesen“, keine Anlegen/Löschen-Knöpfe,
  BPMN als Viewer). Datenimport und „Demodaten laden“ nur mit Bearbeitungsrecht auf der Benutzerverwaltung.

## Neues Modul: Audits (ISO 19011, ISO 9001 9.2, ISO 27001 9.2, ISO 37301 9.2, ISO/IEC 17021-1)

Ziel: Audits planen, durchführen und Feststellungen bis zur Wirksamkeitsprüfung der Korrekturmaßnahmen nachverfolgen.

### Audit (Präfix `AU-`)
1. **Stammdaten:** ID (automatisch), Bezeichnung, Beschreibung, **Audittyp** (Internes Audit, Zertifizierungsaudit,
   Systemaudit, Kundenaudit, Lieferantenaudit), bei Zertifizierungsaudit zusätzlich **Auditart** (Erstzertifizierung Stufe 1,
   Erstzertifizierung Stufe 2, Überwachungsaudit, Rezertifizierung, Sonderaudit), Auditprogramm/Jahr, Status (Geplant,
   In Vorbereitung, Durchgeführt, Bericht erstellt, Maßnahmen offen, Abgeschlossen, Abgesagt).
2. **Umfang & Kriterien:** Normen/Regelwerke (ISO 9001, ISO 27001, ISO 37301, Kundenanforderung, Lieferantenanforderung, Sonstiges),
   Auditkriterien (Normkapitel-Picker), auditierte Prozesse (refs auf Prozesse), auditierte Rollen/Organisationseinheiten,
   Standorte, Auditziel und Geltungsbereich.
3. **Beteiligte:** Leitender Auditor (Benutzer oder Freitext bei extern), Auditteam (Benutzer), externe Organisation
   (Zertifizierungsstelle, Kunde bzw. Lieferant – je nach Typ beschriftet), Ansprechpartner auditierte Seite (Benutzer).
4. **Termine:** geplantes Datum, tatsächliches Datum von/bis, Berichtsdatum, Auditbericht (Dokument/Ablageort),
   Zertifikat gültig bis (nur Zertifizierung), nächstes Audit fällig.
5. **Ergebnis:** Gesamturteil (Konform, Konform mit Feststellungen, Nicht konform), Zusammenfassung, Stärken.
6. **Feststellungen** als Tabelle innerhalb des Audits (siehe unten) mit „+ Feststellung“.

### Feststellung (Finding, Präfix `F-`, gehört zu genau einem Audit)
Typ (Hauptabweichung, Nebenabweichung, Beobachtung, Verbesserungspotenzial, Positive Feststellung), Normkapitel, Beschreibung,
Nachweis/Evidenz, betroffener Prozess und optional **Prozessschritt** (Dropdown der Aktivitäten des gewählten Prozesses),
betroffene Risiken und Controls (refs), verantwortliche Rolle und Person, **Ursachenanalyse**, **Korrekturmaßnahme**
(ISO 9001 10.2), Frist, Status (Offen, In Bearbeitung, Umgesetzt, Wirksamkeit geprüft, Geschlossen), Wirksamkeitsprüfung
am / durch / Ergebnis. Eine Feststellung gilt als **überfällig**, wenn Frist < heute und Status nicht Geschlossen.

### Ansichten und Verknüpfungen
- Liste mit Reitern **Audits | Feststellungen | Auditprogramm**:
  - Audits: Spalten Typ, geplant, Status (Pill), offene/überfällige Feststellungen; Filter-Chips nach Audittyp.
  - Feststellungen: alle Feststellungen aller Audits mit Typ (farbig: Hauptabweichung rot, Nebenabweichung orange …), Audit,
    Prozess/Schritt, Verantwortlich, Frist (rot wenn überfällig), Status; Klick öffnet das Audit mit markierter Feststellung.
  - Auditprogramm: Jahresübersicht (Monate × Audits, farbig nach Typ) und Abdeckung: welche Prozesse/Normkapitel im laufenden
    Jahr noch nicht auditiert wurden.
- **Prozessintegration:** Badge „A n“ (offene Feststellungen) unter Aktivitäten, Abschnitt „Audit-Feststellungen“ im
  Zuordnungspanel (nur Anzeige + Sprung), Spalte in der Schrittmatrix, im Prozess-Steckbrief Liste der Audits zum Prozess.
- **Controls:** Feststellungen zu einem Control im Control-Detail anzeigen; bei Haupt-/Nebenabweichung Hinweis, die operative
  Wirksamkeit zu überprüfen.
- **Rollen:** offene Feststellungen, für die die Rolle verantwortlich ist, in der abgeleiteten Verantwortung.
- **Unabhängigkeit (ISO 19011):** Warnung, wenn der leitende Auditor oder ein Teammitglied eine Rolle hält, die einen
  auditierten Prozess verantwortet oder in ihm R/A hat.
- **Cockpit:** Kachel „Audits“, Karte „Anstehende Audits (nächste 90 Tage)“, Karte „Überfällige Feststellungen“, Balken
  „Feststellungen nach Typ“, Zertifikate, die in < 180 Tagen ablaufen.
- Systemrolle **Auditmanager** bearbeitet Audits; Auditoren dürfen Audits bearbeiten, alles andere nur lesen.

## Cockpit
Kacheln (Prozesse · Anzahl Aktivitäten, Risiken, Chancen, Controls, Rollen, KPI, Benutzer, Audits; klickbar), Risikomatrix brutto
und netto, IKS – operative Wirksamkeit (Balken je Wirksamkeitsstufe), Rollenabdeckung der Prozessschritte (% mit R), KPI-Ampel.
„Handlungsbedarf“-Karten (grüner Rand „✓ nichts offen“ oder oranger Rand mit Liste, jeweils klickbar): Risiken ohne Kontrolle,
hohe Restrisiken (≥ 10), Controls nicht (voll) wirksam/ungeprüft, Prozessschritte ohne Verantwortung (R/A), Rollen
(Pflichtrolle unbesetzt, Stellvertretung nicht eingearbeitet, Personen mit unvereinbaren Rollen, Review überfällig),
überfällige Reviews/Prüfungen, plus die Audit-Karten.

## Sprache (DE/EN)
- `t(deutscherText, vars?)` mit `{platzhalter}`; Englisch aus `i18n.en.ts`, Deutsch ist der Schlüssel. Sprache in eigenem
  persistierten Store. Bei Sprachwechsel App-Wurzel mit `key={lang}` neu mounten.
- Übersetzt werden alle UI-Texte, Feldnamen, Hinweise, Auswahlwerte (gespeichert wird immer der deutsche Wert, angezeigt `t(wert)`),
  Statusanzeigen, Systemrollen, ISO-9001/37301-Kapiteltitel, BPMN-Palette, Diagramm-Badges. ISO-27001-Titel bleiben englisch,
  Organisationseinheiten sind in beiden Sprachen englisch. **Eingegebene Inhalte werden nicht übersetzt.**
- Im Dev-Modus fehlende Übersetzungen einmalig per `console.warn('[i18n] missing: …')` melden; am Ende darf keine fehlen.

## Demodaten (beim ersten Start und über „Demodaten laden“)
- Prozess **P-001 Beschaffung (Purchase-to-Pay)** (Kernprozess): Bedarf entstanden → Bedarfsanforderung erfassen → Anforderung
  genehmigen → Gateway „Genehmigt?“ (nein → Endereignis „Anforderung abgelehnt“) → **zugeklappter Subprozess „Lieferant
  auswählen“** (Angebote einholen → Angebote vergleichen → Lieferant prüfen (Compliance & IS) → Vergabeentscheidung
  dokumentieren) → Bestellung auslösen → Wareneingang prüfen → Rechnung prüfen & freigeben → Zahlung ausführen → Rechnung bezahlt.
  BPMN-XML inkl. DI und eigener `BPMNDiagram`-Plane für den Subprozess erzeugen.
- Prozess **P-002 Berechtigungsmanagement** (Unterstützungsprozess): Antrag stellen → genehmigen → einrichten → rezertifizieren.
- ~14 Benutzer (u. a. Administrator, Leitung Einkauf, Einkäufer, Kreditoren, Compliance Officer, ISB, Geschäftsführer,
  interner Revisor als Auditor, QM, externer DSB), ~14 Rollen (Bedarfsträger, Kostenstellenverantwortlicher, Einkäufer,
  Leitung Einkauf, Kreditorenbuchhaltung, Compliance Officer, ISB, Wareneingang, IT-Administration, Geschäftsführung, QMB,
  Datenschutzbeauftragter, Ausfuhrverantwortlicher, Compliance-Komitee), 6 Risiken, 2 Chancen, 7 Controls, 5 KPI mit Messreihen,
  sinnvolle Zuordnungen inkl. RACI zu den Schritten.
- Absichtlich enthaltene Befunde zum Ausprobieren: eine Person ist Stellvertretung im Einkauf und zugleich in der
  Kreditorenbuchhaltung (unvereinbar), der IT-Administrator ist zugleich Stellvertreter des ISB, eine Stellvertretung ist nicht
  eingearbeitet, ein Control ist nur eingeschränkt wirksam.
- **Audits:** ein internes Audit „Beschaffung 2026“ (abgeschlossen, 1 Nebenabweichung zum Vier-Augen-Prinzip bei der Vergabe,
  1 Verbesserungspotenzial), ein ISO-27001-Überwachungsaudit der Zertifizierungsstelle (durchgeführt, 1 Nebenabweichung zur
  Rezertifizierung von Berechtigungen, überfällig), ein Lieferantenaudit (geplant in 6 Wochen), ein Kundenaudit (in Vorbereitung),
  ein Systemaudit ISO 37301 (geplant). Der Revisor darf nicht zugleich Prozessverantwortung im auditierten Prozess haben.

## Daten & Migration
- Export aller Daten als JSON (über den Export-Dialog), Import (validieren, Fehler als Hinweis), „Demodaten laden“ mit Zwei-Klick-Bestätigung.
- Beim Löschen eines Elements alle Referenzen entfernen (Zuordnungen, adressierte Risiken, Rollenreferenzen, Mitgliedschaften, Feststellungen).
- Persistenz versionieren; `migrate`/Import füllt neue Felder mit Standardwerten auf.

## Abnahmekriterien
1. `npm run build` läuft ohne TypeScript-Fehler; die App startet ohne Konsolenfehler, auch im StrictMode.
2. Neuen Prozess anlegen, Aufgabe anhängen, in zugeklappten Subprozess umwandeln, hineinnavigieren, dort Aufgaben modellieren,
   Rollen/Risiken/Controls/KPI zuordnen – nach Neuladen ist alles noch da, Badges stimmen.
3. Klick auf „Verwendet in Prozessschritten“ öffnet den richtigen Schritt, auch im Subprozess.
4. Funktionstrennung: Rolle per „+“ hinzufügen erscheint bei beiden Rollen; Konflikte werden in Rolle, Benutzer und Cockpit angezeigt.
5. Als „Auditor“ angemeldet: alles lesbar, nur Audits bearbeitbar, BPMN ohne Palette.
6. Umschalten auf EN: keine deutschen UI-Texte mehr (außer eingegebenen Inhalten), keine `[i18n] missing`-Warnungen.
7. Audit anlegen, Feststellung mit Prozessschritt verknüpfen → Badge „A 1“ am Schritt, Eintrag im Panel, in der Schrittmatrix,
   in der Feststellungsliste und im Cockpit; Frist in der Vergangenheit → überfällig markiert.
8. Keine Verwendung von `alert/confirm/prompt`; alle Exporte über den Export-Dialog.

Schreibe zum Schluss eine README (Deutsch) mit Funktionsübersicht, Start (`npm install`, `npm run dev`) und Projektstruktur.
