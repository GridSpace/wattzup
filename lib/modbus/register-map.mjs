// register-map.js
// This module loads the register definition file, calculates the byte offset for each register,
// and exports the augmented data structure for use in other scripts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Since we are in an ES module, __dirname is not available. We can derive it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registerFile = path.join(__dirname, 'eg4_registers.json');
const registers = JSON.parse(fs.readFileSync(registerFile));

/**
 * Determines the byte length of a given Modbus datatype.
 * @param {string} datatype - The datatype string (e.g., 'uint16', 'uint32').
 * @returns {number} The number of bytes for the datatype.
 */
function getByteLength(datatype) {
    switch (datatype) {
        case 'uint32':
        case 'int32':
            return 4;
        case 'uint16':
        case 'int16':
        default:
            return 2;
    }
}

// Iterate over each register type ('input', 'hold')
for (const registerType of registers.registers) {
    let offset = 0;
    // Iterate over each register in the map and calculate its offset
    for (const register of registerType.register_map) {
        register.byte_offset = offset;
        offset += getByteLength(register.datatype);
    }
}

// Export the modified structure so other modules can use it.
export default registers;