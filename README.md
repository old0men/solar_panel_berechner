# solar_panel_berechner

API fuer einen Solarpanel-Rechner mit SQLite-Datenbank und Cookie-basierter Benutzererkennung.

## Start

```bash
npm install
npm start
```

Die API startet auf `http://localhost:3000`.

## Benutzererkennung

Der Server setzt beim ersten Request automatisch das Cookie `solar_user_id`.
Alle gespeicherten Berechnungen werden diesem Benutzer ueber das Cookie zugeordnet.

## Paneltypen

Die API verwendet feste Paneltypen. Im Code und in den Requests werden englische Werte benutzt:

- `polycrystalline` = Polykristallin, Wirkungsgrad 16-20 Prozent, Standardwert 18 Prozent
- `monocrystalline` = Monokristallin, Wirkungsgrad 20-23 Prozent, Standardwert 21.5 Prozent
- `thinFilm` = Duennschichtzellen, Wirkungsgrad 10-12 Prozent, Standardwert 11 Prozent

## REST API

### `GET /api/health`

Liefert einen einfachen Gesundheitscheck.

### `GET /api/users/me`

Liefert den aktuell ueber das Cookie erkannten Benutzer.

### `GET /api/panel-types`

Liefert alle verfuegbaren Paneltypen mit Wirkungsgradbereichen.

### `POST /api/calculations`

Erstellt eine Berechnung und speichert sie fuer den aktuellen Benutzer.

Beispiel-Request:

```json
{
  "calculationType": "moment",
  "type": "monocrystalline",
  "latitude": 47.3769,
  "longitude": 8.5417,
  "dayOfYear": 172,
  "hour": 12,
  "panelTilt": 35,
  "panelAzimuth": 0,
  "panelArea": 1.6
}
```

Felder:

- `calculationType`: `moment`, `daily` oder `annual`
- `type`: `polycrystalline`, `monocrystalline` oder `thinFilm`
- `latitude`
- `longitude`
- `panelTilt`
- `panelAzimuth`
- `panelArea` optional
- `dayOfYear` nur fuer `moment` und `daily`
- `hour` nur fuer `moment`

Die API setzt den Wirkungsgrad automatisch aus dem gewaehlten Paneltyp.

### `GET /api/calculations`

Liefert alle gespeicherten Berechnungen des aktuellen Benutzers.

### `GET /api/calculations/:id`

Liefert eine gespeicherte Berechnung des aktuellen Benutzers.

### `DELETE /api/calculations/:id`

Loescht eine gespeicherte Berechnung des aktuellen Benutzers.

## Datenbank

Die SQLite-Datei liegt unter:

`data/solar-calculator.sqlite`
