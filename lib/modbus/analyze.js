// Based on work in https://github.com/jaredmauch/eg4-bridge
// eg4_registers.json from: https://github.com/jaredmauch/eg4-bridge/blob/main/doc/eg4_registers.json

// analyze.js
// This script is designed to decode and analyze a single binary packet captured from an EG4 inverter.
// It reads a .bin file, validates its structure, and attempts to parse the proprietary EG4 wrapper
// to extract and interpret the inner Modbus data frame.

import { crc16modbus as crc16 } from 'crc';
import registers from './register-map.js';

const debug_detail = false;

/**
 * Parses the raw Modbus register data from the packet's "values" buffer.
 * It iterates through a known register map and decodes each value according to its defined datatype and scale.
 * NOTE: This function currently assumes all packets start from register 0, which is a key point of investigation.
 * @param {Buffer} valuesBuffer - The raw binary buffer containing only the register data.
 * @param {Array} registerMap - The array of register definitions from eg4_registers.json.
 * @returns {Object} An object containing the decoded register values, keyed by their shortname.
 */
function parseValues(valuesBuffer, registerMap, registerOffset) {
    const decoded = {};
    let offset = 0;

    for (const register of registerMap) {
        const registerNumber = register.register_number;
        const name = register.name;
        const shortname = register.shortname;
        const datatype = register.datatype;
        const scale = register.unit_scale || 1.0;

        if (offset >= valuesBuffer.length) break;
        if (registerNumber < registerOffset) continue;

        let value;
        if (shortname === 'battery_status') {
            const rawValue = valuesBuffer.readUInt16LE(offset);
            const soc = rawValue & 0xFF;
            const soh = (rawValue >> 8) & 0xFF;
            if (debug_detail) {
                decoded['soc'] = { name: 'State of Charge', rawValue: soc, scaledValue: soc, unit: '%' };
                decoded['soh'] = { name: 'State of Health', rawValue: soh, scaledValue: soh, unit: '%' };
            } else {
                decoded['State of Charge'] = `${soc}%`;
                decoded['State of Health'] = `${100 - soh}%`;
            }
            offset += 2;
            continue;
        }

        switch (datatype) {
            case 'uint16':
                value = valuesBuffer.readUInt16LE(offset);
                offset += 2;
                break;
            case 'int16':
                value = valuesBuffer.readInt16LE(offset);
                offset += 2;
                break;
            case 'uint32':
                value = valuesBuffer.readUInt32LE(offset);
                offset += 4;
                break;
            default:
                value = valuesBuffer.readUInt16LE(offset);
                offset += 2;
        }

        if (debug_detail) {
            decoded[shortname] = { name, register: registerNumber, rawValue: value, scaledValue: value * scale, unit: register.unit };
        } else {
            decoded[name] = register.unit ? `${parseFloat((value * scale).toFixed(2))} ${register.unit}` : parseFloat((value * scale).toFixed(2));
        }
    }
    return decoded;
}

/**
 * Parses the main proprietary packet structure to extract the inner Modbus data.
 * @param {Buffer} buffer - The full binary packet buffer.
 * @param {Array} registers - The full register definition object from the JSON file.
 */
export function parseTranslatedData(buffer) {
    const datalog = buffer.slice(8, 18).toString('hex');
    const data = buffer.slice(20, buffer.length - 2);
    const receivedChecksum = buffer.slice(buffer.length - 2).readUInt16LE(0);
    const calculatedChecksum = crc16(data);

    if (receivedChecksum !== calculatedChecksum) {
        throw new Error('Checksum mismatch!');
    }

    const deviceFunction = data[1];
    const inverterSerial = data.slice(2, 12).toString('ascii');
    const register = data.readUInt16LE(12);
    const valueLength = data[14];
    const values = data.slice(15);

    let registerMap;
    if (deviceFunction === 0x03) { // Read Hold Registers
        registerMap = registers.registers.find(r => r.register_type === 'hold').register_map;
    } else if (deviceFunction === 0x04) { // Read Input Registers
        registerMap = registers.registers.find(r => r.register_type === 'input').register_map;
    }

    if (!registerMap) {
        throw new Error(`Unsupported device function: 0x${deviceFunction.toString(16)}`);
    }

    const decodedValues = parseValues(values, registerMap, register);
    const sortedValues = {};
    for (let key of Object.keys(decodedValues).sort()) {
        sortedValues[key] = decodedValues[key];
    }

    return {
        datalog,
        deviceFunction,
        inverterSerial,
        startingRegister: register,
        valueLength,
        decodedValues: sortedValues
    };
}

export function analyzePacketBuffer(buffer) {
    if (buffer.slice(0, 2).toString('hex') !== 'a11a') {
        throw new Error('Invalid packet header');
    }

    const tcpFunction = buffer[7];
    if (tcpFunction === 194) { // TranslatedData
        return parseTranslatedData(buffer);
    } else {
        throw new Error(`Unsupported TCP function: ${tcpFunction}`);
    }
}
