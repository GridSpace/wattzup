// compare.js
//
// ## Description
// This utility decodes a single binary packet captured from an EG4 inverter and
// compares its contents with the most closely matching row from a CSV log file.
// Its primary purpose is to verify the accuracy of the packet decoding logic
// against known-good data downloaded from the official monitoring portal.
//
// ## How to Use
// The script is executed via Node.js and requires two command-line arguments:
//
//   node compare.js <path_to_packet_file> <path_to_csv_file>
//
// ### Arguments
//
// 1.  `<path_to_packet_file>`: The absolute or relative path to a single .bin file
//     captured by the `collect.js` script. The script expects this filename to
//     contain a timestamp (e.g., '2025-0810-163233.10_4_2_41.0001.bin').
//
// 2.  `<path_to_csv_file>`: The absolute or relative path to a CSV file containing
//     telemetry data for the same inverter. This data should be downloaded from
//     the official EG4 monitoring portal (monitor.eg4electronics.com) and then
//     converted from its original .xls format to .csv.
//
// ## Logic
//
// 1.  **Load Register Map:** It `require()`s the augmented register map from `register-map.js`,
//     which contains pre-calculated byte offsets for each register.
//
// 2.  **Decode Packet:** It reads the specified binary packet file, validates its checksum,
//     and decodes the inner Modbus data frame using the register map. It correctly
//     handles packets that start at a non-zero register offset.
//
// 3.  **Parse CSV:** It reads the specified CSV file into memory.
//
// 4.  **Timestamp Matching:** It extracts the timestamp from the binary packet's filename
//     and searches the CSV data to find the row with the closest timestamp. Both timestamps
//     are treated as UTC for an accurate comparison.
//
// 5.  **Output:** The script prints the decoded data from the binary packet and the data
//     from the closest matching CSV row in a side-by-side JSON format for easy comparison.
//
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import crc16 from 'crc/crc16modbus.js';
import registers from './register-map.js';

function parseValues(valuesBuffer, registerMap, startingRegister) {
    const decoded = {};

    for (const register of registerMap) {
        if (register.register_number < startingRegister) {
            continue;
        }

        const bufferOffset = register.byte_offset - (registerMap.find(r => r.register_number === startingRegister)?.byte_offset || 0);

        if (bufferOffset < 0 || bufferOffset >= valuesBuffer.length) {
            continue;
        }

        const { shortname, datatype, unit_scale } = register;
        const scale = unit_scale || 1.0;
        let value;

        try {
            if (shortname === 'battery_status') {
                const rawValue = valuesBuffer.readUInt16LE(bufferOffset);
                decoded['soc'] = rawValue & 0xFF;
                decoded['soh'] = (rawValue >> 8) & 0xFF;
                continue;
            }

            switch (datatype) {
                case 'uint16':
                    value = valuesBuffer.readUInt16LE(bufferOffset);
                    break;
                case 'int16':
                    value = valuesBuffer.readInt16LE(bufferOffset);
                    break;
                case 'uint32':
                     if (bufferOffset + 4 > valuesBuffer.length) continue;
                    value = valuesBuffer.readUInt32LE(bufferOffset);
                    break;
                default:
                    continue;
            }
            decoded[shortname] = value * scale;
        } catch (e) {
            continue;
        }
    }
    return decoded;
}

function parseTranslatedData(buffer) {
    const data = buffer.slice(20, buffer.length - 2);
    const receivedChecksum = buffer.slice(buffer.length - 2).readUInt16LE(0);
    const calculatedChecksum = crc16(data);

    if (receivedChecksum !== calculatedChecksum) {
        return null;
    }

    const deviceFunction = data[1];
    const startingRegister = data.readUInt16LE(12);
    const values = data.slice(15);

    let registerMap;
    if (deviceFunction === 0x03) { // Read Hold
        registerMap = registers.registers.find(r => r.register_type === 'hold').register_map;
    } else if (deviceFunction === 0x04) { // Read Input
        registerMap = registers.registers.find(r => r.register_type === 'input').register_map;
    } else {
        return null;
    }

    return parseValues(values, registerMap, startingRegister);
}

function findClosestRow(packetTimestamp, csvData) {
    let closestRow = null;
    let minDiff = Infinity;

    for (const row of csvData) {
        const rowTimestamp = new Date(row.Time);
        const diff = Math.abs(rowTimestamp - packetTimestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closestRow = row;
        }
    }

    return closestRow;
}

const packetFilepath = process.argv[2];
const csvFilepath = process.argv[3];

if (!packetFilepath || !csvFilepath) {
    console.error('Usage: node compare.js <path_to_packet_file> <path_to_csv_file>');
    process.exit(1);
}

const packetBuffer = fs.readFileSync(packetFilepath);
const csvContent = fs.readFileSync(csvFilepath);
const csvData = parse(csvContent, { columns: true, skip_empty_lines: true });

const decodedPacket = parseTranslatedData(packetBuffer);

if (!decodedPacket) {
    console.error('Could not decode packet');
    process.exit(1);
}

const packetFilename = packetFilepath.split('/').pop();
const match = packetFilename.match(/(\d{4})-(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);

if (!match) {
    console.error(`Could not parse timestamp from filename: ${packetFilename}`);
    process.exit(1);
}

const [_, year, month, day, hour, minute, second] = match.map(String);

const packetTime = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
const packetTimestamp = new Date(packetTime);

const closestCsvRow = findClosestRow(packetTimestamp, csvData);

console.log('--- Decoded Packet ---');
console.log(JSON.stringify(decodedPacket, null, 2));
console.log('----------------------');
console.log('--- Closest CSV Row ---');
console.log(JSON.stringify(closestCsvRow, null, 2));
console.log('-----------------------');
