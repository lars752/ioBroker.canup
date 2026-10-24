'use strict';

/**
 * Unit-Tests für lib/setup.js – laufen ohne ioBroker und ohne echte Hardware.
 * Wird mit `npm test` ausgeführt.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// --- Minimal-Stub für execFile / existsSync ---
const setup = require('../lib/setup');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓  ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗  ${name}`);
        console.error(`     ${e.message}`);
        failed++;
    }
}

// --- listUsbDevices ---
console.log('\nlistUsbDevices');
test('gibt ein Array zurück', () => {
    const result = setup.listUsbDevices();
    assert(Array.isArray(result), 'Ergebnis ist kein Array');
});

// --- bringUp: fehlende Konfiguration ---
console.log('\nbringUp – Konfigurationsfehler');

async function runAsync() {
    {
        const { ok, status } = await setup.bringUp(
            { usbDeviceId: '', canInterface: 'can0', bitrate: '500000',
              txqueuelen: 1000, slcandPath: '/usr/bin/slcand', ipPath: '/usr/bin/ip', sudoPassword: 'x' },
            { info: () => {}, warn: () => {}, error: () => {} }
        );
        test('kein USB-Gerät → ok=false', () => assert.strictEqual(ok, false));
        test('kein USB-Gerät → Fehlermeldung enthält "Gerät"', () => assert(/gerät/i.test(status)));
    }
    {
        const { ok, status } = await setup.bringUp(
            { usbDeviceId: 'irgendwas', canInterface: 'can0', bitrate: '500000',
              txqueuelen: 1000, slcandPath: '/usr/bin/slcand', ipPath: '/usr/bin/ip', sudoPassword: '' },
            { info: () => {}, warn: () => {}, error: () => {} }
        );
        test('kein Passwort → ok=false', () => assert.strictEqual(ok, false));
        test('kein Passwort → Fehlermeldung enthält "Passwort"', () => assert(/passwort/i.test(status)));
    }
    {
        // Nicht-existentes Gerät
        const { ok, status } = await setup.bringUp(
            { usbDeviceId: 'usb-geraet-das-nicht-existiert', canInterface: 'can0', bitrate: '500000',
              txqueuelen: 1000, slcandPath: '/usr/bin/slcand', ipPath: '/usr/bin/ip', sudoPassword: 'x' },
            { info: () => {}, warn: () => {}, error: () => {} }
        );
        test('Gerät nicht vorhanden → ok=false', () => assert.strictEqual(ok, false));
        test('Gerät nicht vorhanden → Fehlermeldung enthält "nicht gefunden"', () => assert(/nicht gefunden/i.test(status)));
    }

    console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
    if (failed > 0) process.exit(1);
}

runAsync().catch(e => { console.error(e); process.exit(1); });
