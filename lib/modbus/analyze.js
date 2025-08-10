// Based on work in https://github.com/jaredmauch/eg4-bridge
// eg4_registers.json from: https://github.com/jaredmauch/eg4-bridge/blob/main/doc/eg4_registers.json

// analyze.js
// This script is designed to decode and analyze a single binary packet captured from an EG4 inverter.
// It reads a .bin file, validates its structure, and attempts to parse the proprietary EG4 wrapper
// to extract and interpret the inner Modbus data frame.

const fs = require('fs');
const crc16 = require('crc/crc16modbus');

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
    let offset = 0; // Start at the beginning of the values buffer.

    // Loop through the register definitions to decode the buffer.
    for (const register of registerMap) {
        const registerNumber = register.register_number;
        const name = register.name;
        const shortname = register.shortname;
        const datatype = register.datatype;
        const scale = register.unit_scale || 1.0;

        // Stop if we've read past the end of the buffer.
        if (offset >= valuesBuffer.length) {
            break;
        }
        if (registerNumber < registerOffset) {
            break;
        }

        let value;
        // The 'battery_status' register is a special case. It's a 16-bit integer
        // where the lower byte is the State of Charge (SOC) and the upper byte is the State of Health (SOH).
        if (shortname === 'battery_status') {
            const rawValue = valuesBuffer.readUInt16LE(offset);
            const soc = rawValue & 0xFF; // Extract the lower byte for SOC.
            const soh = (rawValue >> 8) & 0xFF; // Extract the upper byte for SOH.
            decoded['soc'] = {
                name: 'State of Charge',
                rawValue: soc,
                scaledValue: soc,
                unit: '%',
            };
            decoded['soh'] = {
                name: 'State of Health',
                rawValue: soh,
                scaledValue: soh,
                unit: '%',
            };
            offset += 2; // Advance the buffer offset by 2 bytes.
            continue; // Continue to the next register.
        }
        // For all other registers, decode based on the specified datatype.
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
                // Assuming 2 bytes for unknown types for now
                value = valuesBuffer.readUInt16LE(offset);
                offset += 2;
        }

        // Store the decoded and scaled value.
        decoded[shortname] = {
            name,
            register: registerNumber,
            rawValue: value,
            scaledValue: value * scale,
            unit: register.unit,
        };
    }

    return decoded;
}

/**
 * Parses the main proprietary packet structure to extract the inner Modbus data.
 * @param {Buffer} buffer - The full binary packet buffer.
 * @param {Array} registers - The full register definition object from the JSON file.
 */
function parseTranslatedData(buffer, registers) {
    // The datalog serial number is at a fixed offset.
    const datalog = buffer.slice(8, 18).toString('hex');
    // The main data payload is located between offset 20 and the last 2 bytes (checksum).
    const data = buffer.slice(20, buffer.length - 2);
    // The last 2 bytes are the CRC checksum.
    const receivedChecksum = buffer.slice(buffer.length - 2).readUInt16LE(0);
    // Calculate the checksum on the data payload to verify integrity.
    const calculatedChecksum = crc16(data);

    console.log(`Datalog: ${datalog}`);
    console.log(`Received Checksum: ${receivedChecksum.toString(16)}`);
    console.log(`Calculated Checksum: ${calculatedChecksum.toString(16)}`);

    // If checksums don't match, the packet is corrupt or parsed incorrectly.
    if (receivedChecksum !== calculatedChecksum) {
        console.error('Checksum mismatch!');
        return;
    }

    // --- Inner Modbus Frame Parsing ---
    // The Modbus function code (e.g., 0x03 for Read Hold, 0x04 for Read Input).
    const deviceFunction = data[1];
    // The serial number of the inverter itself.
    const inverterSerial = data.slice(2, 12).toString('ascii');

    // *** KEY FIELD FOR MULTI-PACKET ANALYSIS ***
    // This value indicates the starting register number for the data in this packet.
    // For the first packet in a burst, this is 0. For subsequent packets, it will be an offset like 40, 80, etc.
    const register = data.readUInt16LE(12);

    // The length of the register value data that follows.
    const valueLength = data[14]; // Assuming value length byte is present
    // The raw binary data for the registers.
    const values = data.slice(15);

    console.log(`Device Function: 0x${deviceFunction.toString(16)}`);
    console.log(`Inverter Serial: ${inverterSerial}`);
    // We log the starting register here. This is the crucial value for understanding the multi-packet issue.
    console.log(`Starting Register: ${register}`);
    console.log(`Value Length: ${valueLength} bytes`);
    //console.log(`Values (Hex): ${values.toString('hex')}`);

    // Select the correct register map based on the device function code.
    let registerMap;
    if (deviceFunction === 0x03) { // Read Hold Registers
        registerMap = registers.find(r => r.register_type === 'hold').register_map;
    } else if (deviceFunction === 0x04) { // Read Input Registers
        registerMap = registers.find(r => r.register_type === 'input').register_map;
    }

    // If we have a valid map, proceed to parse the values.
    if (registerMap) {
        const decodedValues = parseValues(values, registerMap, register);
        console.log('--- Decoded Values ---');
        console.log(JSON.stringify(decodedValues, null, 2));
        console.log('----------------------');
    }
}

/**
 * Main function to analyze a single packet file.
 * @param {string} filepath - The path to the .bin packet file.
 * @param {Array} registers - The full register definition object.
 */
function analyzePacket(filepath, registers) {
    if (!fs.existsSync(filepath)) {
        console.error(`File not found: ${filepath}`);
        process.exit(1);
    }

    const buffer = fs.readFileSync(filepath);

    console.log(`Analyzing packet: ${filepath}`);
    console.log(`Packet size: ${buffer.length} bytes`);
    console.log('--- Packet Content (Hex) ---');
    console.log(buffer.toString('hex'));
    console.log('----------------------------');

    // All valid packets start with the magic header 'a11a'.
    const header = buffer.slice(0, 2).toString('hex');
    if (header !== 'a11a') {
        console.error('Invalid packet header');
        return;
    }

    // The TCP Function byte determines the overall packet type.
    // 194 indicates "TranslatedData", which contains a Modbus frame.
    const tcpFunction = buffer[7];
    console.log(`TCP Function: ${tcpFunction}`);

    if (tcpFunction === 194) { // TranslatedData
        console.log('--- Parsing TranslatedData ---');
        parseTranslatedData(buffer, registers);
        console.log('----------------------------');
    }
}

// --- Script Execution ---
const filepath = process.argv[2];
if (!filepath) {
    console.error('Usage: node analyze.js <path_to_packet_file>');
    process.exit(1);
}

// Load the register definitions from the JSON file.
const registers = require('./register-map.js').registers;

// Start the analysis.
analyzePacket(filepath, registers);
