'use strict';

/**
 * node-switchbot 3.6.8's WoSensorTHPro.parseServiceData only accepts a 6-byte
 * serviceData buffer (the older/basic Meter Pro broadcast format) and silently
 * drops anything else. The sibling WoSensorTHProCO2 class already handles two
 * newer formats (7-byte and 3-byte serviceData, both pulling extra fields from
 * manufacturerData) - this patch reuses that same byte layout for plain
 * Meter Pro devices whenever the original parser returns null, since Meter Pro
 * and Meter Pro CO2 share the same sensor platform/firmware lineage.
 *
 * @param {Object} nsb - the imported node-switchbot module namespace
 * @param {(msg: string) => void} log - adapter logger function
 */
function applyMeterProPatch(nsb, log) {
    const { Advertising, SwitchBotBLEModel, SwitchBotBLEModelName, SwitchBotBLEModelFriendlyName } = nsb;
    const originalParseServiceData = Advertising.parseServiceData.bind(Advertising);

    Advertising.parseServiceData = async function (model, serviceData, manufacturerData, emitLog) {
        const result = await originalParseServiceData(model, serviceData, manufacturerData, emitLog);
        if (result || model !== SwitchBotBLEModel.MeterPro) {
            return result;
        }

        const parsed = parseMeterProExtended(
            serviceData, manufacturerData, SwitchBotBLEModel, SwitchBotBLEModelName, SwitchBotBLEModelFriendlyName);
        if (parsed) {
            log(`[meterProPatch] parsed Meter Pro advertisement via fallback format (serviceData length ${serviceData ? serviceData.length : 'n/a'})`);
        } else {
            log(`[meterProPatch] Meter Pro advertisement did not match any known format (serviceData length ${serviceData ? serviceData.length : 'n/a'}, manufacturerData length ${manufacturerData ? manufacturerData.length : 'n/a'})`);
        }
        return parsed;
    };
}

function parseMeterProExtended(serviceData, manufacturerData, SwitchBotBLEModel, SwitchBotBLEModelName, SwitchBotBLEModelFriendlyName) {
    const base = {
        model: SwitchBotBLEModel.MeterPro,
        modelName: SwitchBotBLEModelName.MeterPro,
        modelFriendlyName: SwitchBotBLEModelFriendlyName.MeterPro
    };

    // Same layout as WoSensorTHProCO2's 7-byte branch, just without the co2 field
    if (serviceData && serviceData.length === 7 && manufacturerData && manufacturerData.length >= 6) {
        const byte2 = serviceData.readUInt8(2);
        const byte3 = serviceData.readUInt8(3);
        const byte4 = serviceData.readUInt8(4);
        const byte5 = serviceData.readUInt8(5);
        const tempSign = (byte4 & 0b10000000) ? 1 : -1;
        const tempC = tempSign * ((byte4 & 0b01111111) + (byte3 & 0b00001111) / 10);
        const tempF = Math.round(((tempC * 9) / 5 + 32) * 10) / 10;
        return {
            ...base,
            celsius: tempC,
            fahrenheit: tempF,
            fahrenheit_mode: !!(byte5 & 0b10000000),
            humidity: byte5 & 0b01111111,
            battery: byte2 & 0b01111111
        };
    }

    // Same layout as WoSensorTHProCO2's 3-byte branch, just without the co2 field
    if (serviceData && serviceData.length === 3 && manufacturerData && manufacturerData.length >= 13) {
        const mdByte10 = manufacturerData.readUInt8(10);
        const mdByte11 = manufacturerData.readUInt8(11);
        const mdByte12 = manufacturerData.readUInt8(12);
        const sdByte2 = serviceData.readUInt8(2);
        const tempSign = (mdByte11 & 0b10000000) ? 1 : -1;
        const tempC = tempSign * ((mdByte11 & 0b01111111) + (mdByte10 & 0b00001111) / 10);
        const tempF = Math.round(((tempC * 9) / 5 + 32) * 10) / 10;
        return {
            ...base,
            celsius: tempC,
            fahrenheit: tempF,
            fahrenheit_mode: !!(mdByte12 & 0b10000000),
            humidity: mdByte12 & 0b01111111,
            battery: sdByte2 & 0b01111111
        };
    }

    return null;
}

module.exports = { applyMeterProPatch };
