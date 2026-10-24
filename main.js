'use strict';

const utils = require('@iobroker/adapter-core');
const { bringUp, checkInterface, listUsbDevices } = require('./lib/setup');

class Canup extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'canup' });
        this._retryTimer = null;
        this._pollTimer = null;
        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);
        await this.setStateAsync('Status', { val: 'Starte…', ack: true });

        const cfg = this._buildCfg();
        if (!cfg.usbDeviceId) {
            this.log.warn('Kein USB-Gerät konfiguriert – Adapter bleibt inaktiv');
            await this.setStateAsync('Status', { val: 'Kein USB-Gerät konfiguriert', ack: true });
            return;
        }

        await this._setup(cfg);
        // Alle 60 s Status prüfen und bei Bedarf erneut einrichten
        this._pollTimer = setInterval(() => this._poll(cfg), 60000);
    }

    _buildCfg() {
        const n = this.config;
        return {
            usbDeviceId:  n.usbDeviceId  || '',
            canInterface: n.canInterface || 'can0',
            bitrate:      String(n.bitrate || '500000'),
            txqueuelen:   Number(n.txqueuelen) || 1000,
            slcandPath:   n.slcandPath  || '/usr/bin/slcand',
            ipPath:       n.ipPath      || '/usr/bin/ip',
            sudoPassword: n.sudoPassword || '',
            retryOnFailSec: Number(n.retryOnFailSec) || 30,
        };
    }

    async _setup(cfg) {
        this.log.info(`Richte CAN-Schnittstelle ein: ${cfg.canInterface} via /dev/serial/by-id/${cfg.usbDeviceId}`);
        const { ok, status } = await bringUp(cfg, this.log);

        await this.setStateAsync('Status',      { val: status, ack: true });
        await this.setStateAsync('InterfaceUp', { val: ok,     ack: true });
        await this.setStateAsync('info.connection', ok, true);

        if (ok) {
            await this.setStateAsync('LastSetup', { val: Date.now(), ack: true });
            this.log.info(`CAN-Schnittstelle bereit: ${status}`);
        } else {
            this.log.error(`CAN-Einrichtung fehlgeschlagen: ${status}`);
            if (cfg.retryOnFailSec > 0) {
                this.log.info(`Neuer Versuch in ${cfg.retryOnFailSec} s…`);
                this._retryTimer = setTimeout(() => this._setup(cfg), cfg.retryOnFailSec * 1000);
            }
        }
    }

    async _poll(cfg) {
        const { up } = await checkInterface(cfg);
        const prev = (await this.getStateAsync('InterfaceUp'))?.val;
        if (up !== prev) {
            await this.setStateAsync('InterfaceUp', { val: up, ack: true });
            await this.setStateAsync('info.connection', up, true);
            if (!up) {
                this.log.warn(`${cfg.canInterface} ist nicht mehr UP – versuche Neueinrichtung`);
                await this.setStateAsync('Status', { val: `${cfg.canInterface} DOWN – Neueinrichtung…`, ack: true });
                await this._setup(cfg);
            }
        }
    }

    /** Admin-Nachrichten: USB-Geräteliste abrufen.
     *  selectSendTo erwartet ein Array [{ label, value }, …] direkt als Antwort. */
    async onMessage(obj) {
        if (!obj || !obj.callback) return;
        if (obj.command === 'listUsbDevices') {
            const names = listUsbDevices();
            const options = names.length
                ? names.map(n => ({ label: n, value: n }))
                : [{ label: '(keine Geräte gefunden)', value: '' }];
            this.sendTo(obj.from, obj.command, options, obj.callback);
        }
    }

    onUnload(callback) {
        try {
            if (this._retryTimer) clearTimeout(this._retryTimer);
            if (this._pollTimer) clearInterval(this._pollTimer);
            this.setState('info.connection', false, true);
        } finally {
            callback();
        }
    }
}

if (require.main !== module) module.exports = (options) => new Canup(options);
else new Canup();
