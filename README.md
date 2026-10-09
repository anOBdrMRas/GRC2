# GRC Studio – Prototyp

Prototyp einer Governance-, Risk- & Compliance-Software (ähnlich ADONIS) mit
BPMN-2.0-Prozessmodellierung und integrierten GRC-Modulen.

## Funktionen

- **Prozessmodellierung (BPMN 2.0)** auf Basis von [bpmn-js](https://bpmn.io)
  - Prozesslandkarte nach Führungs-, Kern- und Unterstützungsprozessen
  - Subprozesse (zugeklappte Subprozesse mit Drill-down und Brotkrumen-Navigation)
  - Aufrufaktivitäten (Call Activities) können mit anderen Prozessen verknüpft werden
  - Import/Export als `.bpmn`, Export als `.svg`
  - Prozesssteckbrief (ISO 9001 4.4: Verantwortlicher, Inputs, Outputs, Ressourcen, Freigabestatus, Review)
  - Schrittmatrix aller Aktivitäten mit ihren Zuordnungen (CSV-Export für Excel)
- **Zuordnung je Prozessschritt** (Aufgabe, Subprozess, Aufrufaktivität):
  Rollen (mit RACI), Risiken, Chancen, Controls und KPI – auswählen oder direkt neu anlegen.
  Badges im Diagramm zeigen die Zuordnungen an.
  - IKS-Prüfung: Hinweis, wenn ein Risiko im Schritt keine mitigierende Kontrolle hat, inkl. Vorschlag passender Controls
- **Module** mit Metadaten nach ISO 9001, ISO/IEC 27001:2022 und ISO 37301:
  - *Risiken*: Ursache, Auswirkung, Assets, Schutzziele (C/I/A), Compliance-Verpflichtung,
    Brutto-/Netto-Bewertung (5×5), Behandlungsoption, Restrisiko-Akzeptanz, Review-Termine, Risikomatrix
  - *Chancen* (ISO 9001 6.1): Nutzen, Wahrscheinlichkeit, Potenzial, Maßnahmen
  - *Controls (IKS)*: Kontrollziel, Art, Automatisierung, Frequenz, Key Control, Verantwortliche,
    Nachweis, adressierte Risiken, Statement of Applicability (alle 93 Annex-A-Controls),
    Design- und operative Wirksamkeit, Prüfmethode, Prüftermine
  - *Rollen*: automatisch vergebene ID, Rollentyp (Führungsrolle, Fachrolle, Gremium, Beauftragter),
    Organisationseinheit (Generic, Technology, Operation, Marketing, Sales, Finance and Admin,
    Business Enablement, Other), Pflichtrolle (ja/nein), Stelleninhaber und Stellvertretungen aus der
    Benutzerverwaltung (inkl. „eingearbeitet“), Rollenverantwortlicher, fachliche und disziplinarische
    Berichtslinie (auch „n/a“), unvereinbare Rollen als beliebig erweiterbare Liste („+“, wird bei beiden Rollen eingetragen)
    mit Funktionstrennungsprüfung auf Prozess- und Personenebene, Bestellung/Ernennung, Normbezug,
    Version/Status/Review, abgeleitete Verantwortung und druckbare Rollenbeschreibung
  - *Benutzerverwaltung*: Benutzer mit Systemrollen (Administrator, GRC-Manager, Prozessmodellierer,
    Risikomanager, IKS-Verantwortlicher, Compliance Officer, Organisationsverantwortlicher,
    KPI-Verantwortlicher, Auditor, Leser), Berechtigungsmatrix und simulierte Anmeldung („Angemeldet als“),
    die Lese-/Bearbeitungsrechte in allen Modulen durchsetzt
  - *KPI*: Ziel, Formel, Einheit, Ziel-/Warn-/Kritisch-Schwellen, Frequenz, Datenquelle,
    Messreihe mit Ampel und Verlauf
  - Jedes Element zeigt, in welchen Prozessschritten es verwendet wird (mit Sprung ins Modell)
- **Cockpit**: Risikomatrizen, IKS-Wirksamkeit, Rollenabdeckung, KPI-Ampel und Handlungsbedarf

Die Oberfläche lässt sich oben links zwischen Deutsch und Englisch umschalten (eingegebene Inhalte werden nicht übersetzt).

Alle Daten werden im Browser (localStorage) gespeichert und lassen sich als JSON exportieren/importieren.
Beim ersten Start werden Demodaten (Beschaffungsprozess mit Subprozess, Berechtigungsmanagement) geladen.

## Starten

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen. Produktions-Build: `npm run build`.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/types.ts` | Datenmodell |
| `src/schema.ts` | Felddefinitionen der Module (steuern die Formulare) |
| `src/iso.ts` | Normkataloge ISO 9001, ISO 27001 (inkl. Annex A), ISO 37301 |
| `src/store.ts` | Zustand & Persistenz (zustand) |
| `src/bpmn/` | BPMN-Editor, Vorlagen, deutsche Übersetzungen |
| `src/components/` | Cockpit, Prozessansicht, Zuordnungspanel, generische Modulansicht |
