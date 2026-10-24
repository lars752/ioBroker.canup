'use strict';

/**
 * Richtet die CAN-Schnittstelle per slcand ein.
 *
 * Schritte:
 *   1. slcand starten (öffnet die serielle Schnittstelle, erzeugt can<N>)
 *   2. ip link set up can<N>
 *   3. ip link set can<N> txqueuelen <len>
 *
 * Rückgabe: { ok: boolean, log: string[] }
 *
 * Das sudo-Passwort wird per Pipe an `sudo -S` übergeben und erscheint
 * nicht in der Prozessliste.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const STEP_TIMEOUT_MS = 10000;

/**
 * Führt einen Befehl mit sudo aus.
 * Das Passwort wird über stdin gepiped (sudo -S), nicht als Argument.
 */
function sudoExec(password, bin, args, log) {
    return new Promise((resolve, reject) => {
        // `sudo -S -p ''` liest das Passwort von stdin ohne Prompt
        const proc = execFile(
            'sudo',
            ['-S', '-p', '', bin, ...args],
            { timeout: STEP_TIMEOUT_MS },
            (err, stdout, stderr) => {
                const out = (stdout + stderr).trim();
                if (out) log.push(out);
                if (err) {
                    reject(new Error(`${bin} ${args.join(' ')}: ${err.message}`));
                } else {
                    resolve(out);
                }
            }
        );
        // Passwort senden und stdin schließen
        proc.stdin.write(password + '\n');
        proc.stdin.end();
    });
}

/**
 * Prüft, ob die CAN-Schnittstelle bereits UP ist.
 * Gibt { up: boolean } zurück.
 */
async function checkInterface(cfg) {
    return new Promise((resolve) => {
        execFile(cfg.ipPath, ['link', 'show', cfg.canInterface], { timeout: 5000 }, (err, stdout) => {
            if (err) return resolve({ up: false });
            // "state UP" oder "UP" im Flags-Bereich
            resolve({ up: /\bUP\b/.test(stdout) });
        });
    });
}

/**
 * Hauptfunktion: richtet die Schnittstelle ein.
 * @param {object} cfg  - aus native: { usbDeviceId, canInterface, bitrate, txqueuelen, slcandPath, ipPath, sudoPassword }
 * @param {object} log  - { info, warn, error } (Adapter-Log oder stub)
 * @returns {Promise<{ ok: boolean, status: string }>}
 */
async function bringUp(cfg, log) {
    const lines = [];

    if (!cfg.usbDeviceId) {
        return { ok: false, status: 'Kein USB-Gerät konfiguriert' };
    }
    if (!cfg.sudoPassword) {
        return { ok: false, status: 'Kein sudo-Passwort konfiguriert' };
    }

    const devPath = `/dev/serial/by-id/${cfg.usbDeviceId}`;
    if (!fs.existsSync(devPath)) {
        return { ok: false, status: `Gerät nicht gefunden: ${devPath}` };
    }

    // Bereits UP? Dann nichts tun.
    const { up } = await checkInterface(cfg);
    if (up) {
        log.info(`${cfg.canInterface} ist bereits UP – kein Eingriff nötig`);
        return { ok: true, status: `${cfg.canInterface} war bereits UP` };
    }

    // Bitrate-Buchstabe für slcand: s6 = 500 kbit/s, s8 = 1 Mbit/s usw.
    // Mapping nach can-utils slcand(1): s0=10k s1=20k s2=50k s3=100k s4=125k s5=250k s6=500k s7=800k s8=1M
    const bitrateMap = { '10000': 's0', '20000': 's1', '50000': 's2', '100000': 's3',
                         '125000': 's4', '250000': 's5', '500000': 's6', '800000': 's7', '1000000': 's8' };
    const sFlag = bitrateMap[String(cfg.bitrate)] || 's6';

    try {
        // Schritt 1: slcand
        log.info(`Starte slcand: ${cfg.slcandPath} -o -c -${sFlag} ${devPath} ${cfg.canInterface}`);
        await sudoExec(cfg.sudoPassword, cfg.slcandPath, ['-o', '-c', `-${sFlag}`, devPath, cfg.canInterface], lines);

        // Schritt 2: ip link set up
        log.info(`Aktiviere Schnittstelle: ${cfg.ipPath} link set up ${cfg.canInterface}`);
        await sudoExec(cfg.sudoPassword, cfg.ipPath, ['link', 'set', 'up', cfg.canInterface], lines);

        // Schritt 3: txqueuelen
        const qlen = String(cfg.txqueuelen || 1000);
        log.info(`Setze txqueuelen: ${cfg.ipPath} link set ${cfg.canInterface} txqueuelen ${qlen}`);
        await sudoExec(cfg.sudoPassword, cfg.ipPath, ['link', 'set', cfg.canInterface, 'txqueuelen', qlen], lines);

        return { ok: true, status: `${cfg.canInterface} UP (${devPath})` };
    } catch (e) {
        const msg = `Einrichtung fehlgeschlagen: ${e.message}`;
        log.error(msg);
        if (lines.length) log.error(lines.join(' | '));
        return { ok: false, status: msg };
    }
}

/**
 * Listet alle Einträge unter /dev/serial/by-id/ auf.
 * Gibt ein Array von Strings zurück (nur die Dateinamen, nicht den Pfad).
 */
function listUsbDevices() {
    const dir = '/dev/serial/by-id';
    try {
        return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    } catch (_) {
        return [];
    }
}

module.exports = { bringUp, checkInterface, listUsbDevices };
