// collect.js
//
// ## Description
// This script connects to one or more inverters over TCP, captures the binary data
// packets they send, and saves them to a local cache directory. It is designed to be
// resilient, handling multiple connections asynchronously and gracefully managing
// connection errors or timeouts.
//
// This has only been tested with EG4 6000XP inverters and their ModBUS packet format
// may be proprietary.
//
// The script identifies individual packets by detecting quiescent periods on the TCP
// socket. It also groups packets into bursts, resetting the packet counter when a
// longer pause is detected. This is useful for associating the multiple packets that
// make up a single telemetry snapshot.
//
// ## How to Use
// The script is executed via Node.js and can be configured with command-line arguments:
//
//   node collect.js [--hosts=host1,host2] [--max-packets=N] [--timeout=S]
//
// ### Arguments
//
// - `--hosts`: A comma-separated list of inverter IP addresses.
//              (Default: '10.4.2.40')
//
// - `--max-packets`: The total number of packets to save from all hosts combined before
//                    the script automatically exits. (Default: unlimited)
//
// - `--timeout`: The total number of seconds to run the script before it
//                automatically exits. (Default: unlimited)
//
// ## Filename Format
// Saved packets follow this convention: `YYYY-MMDD-HHMMSS.IP_ADDRESS.PACKET_NUM.bin`
//   - `YYYY-MMDD-HHMMSS`: The timestamp when the packet was saved.
//   - `IP_ADDRESS`: The IP of the inverter (dots replaced with underscores).
//   - `PACKET_NUM`: A counter that resets for each new burst of packets.
//
// ## Logic
//
// 1.  **Argument Parsing:** It uses the 'minimist' library to parse command-line
//     arguments for hosts, max packets, and timeout.
//
// 2.  **Connection Handling:** For each host specified, it creates an independent TCP
//     socket connection. Failures or timeouts on one connection do not affect others.
//
// 3.  **Data Buffering:** Incoming data chunks for each connection are appended to a
//     dedicated buffer.
//
// 4.  **Packet Detection:** A timer (`SHORT_TIMEOUT`) checks for pauses in data reception.
//     If no data arrives for a short period, the contents of the buffer are considered
//     a complete packet and are saved to a file.
//
// 5.  **Burst Detection:** A second timer (`GROUP_TIMEOUT`) checks for longer pauses.
//     If a longer pause is detected, the packet counter is reset, ensuring that the
//     next packet saved will be marked as the first in a new burst.
//
// 6.  **Graceful Shutdown:** The script can be stopped with Ctrl+C (`SIGINT`), or it will
//     exit automatically if `--max-packets` or `--timeout` is reached. In all cases,
//     it attempts to save any remaining data in the buffers before closing connections.
//

const net = require('net');
const fs = require('fs');
const path = require('path');

const DEFAULT_HOSTS = '192.168.44.4';
const PORT = 8000;
const OUTPUT_DIR = 'inv-logs';
const SHORT_TIMEOUT = 100; // ms - Defines a pause between individual packets.
const GROUP_TIMEOUT = 1000; // ms - Defines a pause between bursts of packets.

// --- Argument Parsing ---
const args = require('minimist')(process.argv.slice(2));
const maxPackets = args['max-packets'] ? parseInt(args['max-packets'], 10) : null;
const timeoutSeconds = args.timeout ? parseInt(args.timeout, 10) : null;
const hosts = (args.hosts || DEFAULT_HOSTS).split(',');

let totalPacketsSaved = 0;
const activeClients = new Set();
const debugData = false;

/**
 * Generates a formatted timestamp string for filenames.
 * @returns {string} The formatted timestamp (e.g., '2025-0810-163233').
 */
function getFormattedTimestamp() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Shuts down all active connections and exits the script.
 */
function globalShutdown() {
    console.log('Limit reached or timeout. Shutting down all connections.');
    activeClients.forEach(client => client.destroy());
    // Allow a moment for any final file writes to complete.
    setTimeout(() => process.exit(0), 500);
}

/**
 * Establishes and manages a connection to a single inverter host.
 * @param {string} host - The IP address of the inverter.
 */
function connectToHost(host) {
    const client = new net.Socket();
    activeClients.add(client);

    let buffer = Buffer.alloc(0);
    let lastPackTime = null; // Tracks time of last data chunk for packet separation.
    let lastBurstTime = null; // Tracks time of last data chunk for burst separation.
    let packetCounter = 1;

    /**
     * Saves the current buffer contents to a uniquely named .bin file.
     */
    const savePacket = () => {
        if (buffer.length === 0) return;

        if (maxPackets && totalPacketsSaved >= maxPackets) {
            if (activeClients.size > 0) globalShutdown();
            return;
        }

        const safeHost = host.replace(/\./g, '_');
        const timestamp = getFormattedTimestamp();
        const filename = `${timestamp}.${safeHost}.${packetCounter.toString().padStart(4, '0')}.bin`;
        const filepath = path.join(OUTPUT_DIR, filename);

        console.log(`[${host}] Saving packet to ${filepath} (${buffer.length} bytes)`);
        fs.writeFile(filepath, buffer, (err) => {
            if (err) console.error(`[${host}] Error writing file: ${err.message}`);
        });

        buffer = Buffer.alloc(0);
        packetCounter++;
        totalPacketsSaved++;

        if (maxPackets && totalPacketsSaved >= maxPackets) {
            globalShutdown();
        }
    };

    // This timer detects short pauses to separate individual packets.
    setInterval(() => {
        if (lastPackTime && (Date.now() - lastPackTime > SHORT_TIMEOUT)) {
            savePacket();
            lastPackTime = null; // Reset timer to prevent continuous saving.
        }
    }, SHORT_TIMEOUT);

    // This timer detects longer pauses to separate bursts of packets.
    setInterval(() => {
        if (lastBurstTime && (Date.now() - lastBurstTime > GROUP_TIMEOUT)) {
            packetCounter = 1; // Reset the packet counter for the new burst.
            lastBurstTime = null;
        }
    }, GROUP_TIMEOUT);

    client.on('connect', () => {
        console.log(`[${host}] Connected to inverter.`);
    });

    client.on('data', (chunk) => {
        if (debugData) console.log(`[${host}] Received ${chunk.length} bytes`);
        buffer = Buffer.concat([buffer, chunk]);
        lastPackTime = Date.now();
        lastBurstTime = Date.now();
    });

    client.on('close', () => {
        console.log(`[${host}] Connection closed.`);
        activeClients.delete(client);
        savePacket(); // Save any remaining data in the buffer.
    });

    client.on('error', (err) => {
        console.error(`[${host}] Connection error: ${err.message}. This host will be ignored.`);
        activeClients.delete(client);
        client.destroy();
    });

    client.on('timeout', () => {
        console.error(`[${host}] Connection timed out.`);
        activeClients.delete(client);
        client.destroy();
    });

    console.log(`[${host}] Attempting to connect...`);
    client.connect({ port: PORT, host: host, timeout: 5000 });
}

// --- Main Execution ---
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

hosts.forEach(connectToHost);

if (timeoutSeconds) {
    console.log(`Script will time out after ${timeoutSeconds} seconds.`);
    setTimeout(globalShutdown, timeoutSeconds * 1000);
}

process.on('SIGINT', () => {
    console.log('Caught interrupt signal.');
    globalShutdown();
});