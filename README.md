# TV-Fernbedienung

Eine fertige Fernbedienungs-Karte für Fernseher mit **Android TV / Google TV** in Home Assistant.
Du wählst nur die Geräte aus – Steuerkreuz, Lautstärke, Apps, Ziffernblock und Tastatur sind schon fertig.

## Was die Karte kann

- An/Aus, Stumm, Menü, Einstellungen, Zurück, Suche, Home
- Steuerkreuz mit OK
- Lautstärke, Play/Pause, Spulen, Sender hoch/runter
- **Medien**: was gerade läuft, Lautstärke-Regler, Licht am Fernseher, TV an/aus
- **Apps**: App-Kacheln, die laufende App wird markiert
- **Sender**: Ziffernblock
- **Tastatur**: Text an den Fernseher schicken

## Installieren

1. Home Assistant → **Marketplace** → oben **„Über Link hinzufügen“**
2. Link eintragen: `https://github.com/sampvp-cmyk/tv-fernbedienung-card`
3. **TV-Fernbedienung** öffnen → **Installieren** → Browser neu laden

## Benutzen

Dashboard bearbeiten → **Karte hinzufügen** → **TV-Fernbedienung** suchen und auswählen. Dann einstellen:

| Feld | Bedeutung |
|---|---|
| Fernbedienung | Das `remote.…`-Gerät des Fernsehers (Integration „Android TV Remote“) |
| Mediaplayer | Optional, für Lautstärke und Titel |
| Name oben | Optional, sonst der Gerätename |
| Licht am Fernseher | Optional, erscheint im Reiter „Medien“ |
| Apps | Optional, leer = Standard-Apps |

### Beispiel in YAML

```yaml
type: custom:tv-fernbedienung-card
remote: remote.fernseher
media_player: media_player.fernseher
name: Wohnzimmer-TV
light: light.fernseher_licht
light_name: TV-Licht
```

### Eigene Apps

```yaml
apps:
  - name: YouTube
    activity: https://www.youtube.com        # Link oder Paketname zum Starten
    package: com.google.android.youtube.tv   # zum Markieren, wenn sie läuft
    icon: mdi:youtube
    color: "#202020"
    icon_color: "#ff0000"
    background: "#ffffff"
  - name: Startseite
    key: HOME                                 # statt App eine Taste senden
  - name: Jellyfin
    package: org.jellyfin.androidtv
    hidden: true                              # nur für die Anzeige „läuft gerade“
```
