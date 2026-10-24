# ioBroker.canup

Richtet beim ioBroker-Start einen **slcand-USB-CAN-Adapter** ein und überwacht danach die Schnittstelle.

Das USB-Gerät wird über seinen stabilen Symlink unter `/dev/serial/by-id/` angesprochen, sodass der Pfad auch nach einem Neustart oder USB-Reconnect zuverlässig stimmt. Das sudo-Passwort wird von ioBroker **verschlüsselt** gespeichert und nie als Argument übergeben – nur per Pipe an `sudo -S`.

## Funktionen

- Startet `slcand`, setzt die Schnittstelle UP und konfiguriert die TX-Warteschlange.
- Wählt das USB-Gerät per Name aus `/dev/serial/by-id/` – kein fester `ttyUSB0`-Pfad.
- Bitrate frei wählbar (10 kbit/s … 1 Mbit/s).
- Überwacht die Schnittstelle alle 60 s und richtet sie bei Bedarf neu ein.
- Optionaler automatischer Neuversuch nach einem Fehler.
- `info.connection` zeigt, ob die Schnittstelle UP ist.

## Installation

1. ioBroker Admin → Adapter → Experten-Modus → „Adapter aus eigener URL installieren":  
   `https://github.com/lars752/ioBroker.canup`  
   Alternativ: `iobroker url https://github.com/lars752/ioBroker.canup`
2. Instanz anlegen und konfigurieren.

**Voraussetzungen:** Node.js ≥ 18, js-controller ≥ 5.0.19, Admin ≥ 6, `can-utils` (`sudo apt install can-utils`).

## sudo einrichten

Der ioBroker-Benutzer braucht das Recht, `slcand` und `ip` per sudo auszuführen. Empfohlen ist eine enge `/etc/sudoers`-Regel statt `NOPASSWD: ALL`:

```
# /etc/sudoers.d/iobroker-can  (sudo visudo -f /etc/sudoers.d/iobroker-can)
iobroker ALL=(root) /usr/bin/slcand, /usr/bin/ip
```

Mit dieser Regel ist das Passwort weiterhin erforderlich (daher das Passwortfeld im Adapter).  
Alternativ kann `NOPASSWD` ergänzt werden – dann bleibt das Passwortfeld leer.

## Konfiguration

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Gerätename | — | Eintrag unter `/dev/serial/by-id/` |
| CAN-Schnittstellenname | `can0` | Name der erzeugten Schnittstelle |
| Bitrate | 500 kbit/s | Baudrate des CAN-Bus |
| TX-Warteschlange | 1000 | txqueuelen |
| Erneuter Versuch | 30 s | Wartezeit nach Fehler, 0 = nie |
| sudo-Passwort | — | Wird verschlüsselt gespeichert |
| Pfad zu slcand | `/usr/bin/slcand` | Ggf. anpassen (`which slcand`) |
| Pfad zu ip | `/usr/bin/ip` | Ggf. anpassen (`which ip`) |

Der Knopf **„Verfügbare USB-Geräte einlesen"** gibt die gefundenen Einträge aus `/dev/serial/by-id/` im Log aus. Den passenden Gerätenamen dann in das Textfeld eintragen.

## Datenpunkte (`canup.0.*`)

| Datenpunkt | Inhalt |
|---|---|
| `info.connection` | `true` wenn die Schnittstelle UP ist |
| `InterfaceUp` | Schnittstelle ist UP |
| `Status` | Letzter Statustext |
| `LastSetup` | Zeitpunkt der letzten Einrichtung (Unix-ms) |

## Entwicklung

```bash
npm install
npm test     # läuft ohne ioBroker-Instanz und ohne Hardware
```

## Lizenz

MIT
