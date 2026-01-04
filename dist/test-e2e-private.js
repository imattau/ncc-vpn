import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
import { MockRelay } from 'ncc-05-js/dist/mock-relay.js';
import { SimplePool, getPublicKey, finalizeEvent, nip19, generateSecretKey } from 'nostr-tools';
import { NCC05Publisher } from 'ncc-05-js';
import { encryptPrivateRecipients } from 'ncc-02-js';
import { startSocksServer } from './socks-server.js';
import { SocksClient } from 'socks';
import * as net from 'net';
// Configuration
const RELAY_PORT = 8889;
const PROXY_PORT = 1082;
const BACKEND_PORT = 9999;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
async function runE2EPrivateTest() {
    console.log('--- Starting E2E Private NCC-VPN Test ---');
    // 1. Setup Identities
    const serviceSk = generateSecretKey();
    const servicePk = getPublicKey(serviceSk);
    const serviceNpub = nip19.npubEncode(servicePk);
    const userSk = generateSecretKey();
    const userPk = getPublicKey(userSk);
    const userNpub = nip19.npubEncode(userPk);
    const userNsec = nip19.nsecEncode(userSk);
    console.log(`[Test] Service: ${serviceNpub}`);
    console.log(`[Test] User:    ${userNpub}`);
    // 2. Start Mock Relay
    console.log(`[Test] Starting mock relay on ${RELAY_URL}...`);
    const relay = new MockRelay(RELAY_PORT);
    const pool = new SimplePool();
    // 3. Start Mock Backend (the "Service")
    const backend = net.createServer((socket) => {
        socket.on('data', (data) => {
            console.log(`[Backend] Received request!`);
            socket.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK");
            socket.end();
        });
    });
    backend.listen(BACKEND_PORT, '127.0.0.1');
    console.log(`[Test] Mock backend listening on 127.0.0.1:${BACKEND_PORT}`);
    try {
        // 4. Publish Private NCC-02
        console.log(`[Test] Publishing Private NCC-02...`);
        const encryptedRecipients = await encryptPrivateRecipients(serviceSk, [userPk]);
        const ncc02Event = finalizeEvent({
            kind: 30059,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'relay'], // Use 'relay' to match default mapping for port 80/7777 etc
                ['private', 'true'],
                ...encryptedRecipients.map(r => ['privateRecipients', r]),
                ['exp', String(Math.floor(Date.now() / 1000) + 3600)]
            ],
            content: 'Private API Service'
        }, serviceSk);
        await Promise.all(pool.publish([RELAY_URL], ncc02Event));
        // 5. Publish Encrypted NCC-05
        console.log(`[Test] Publishing Encrypted NCC-05...`);
        const publisher = new NCC05Publisher({ pool });
        const payload = {
            v: 1,
            ttl: 3600,
            updated_at: Math.floor(Date.now() / 1000),
            endpoints: [
                { type: 'http', url: `http://127.0.0.1:${BACKEND_PORT}`, priority: 1, family: 'ipv4' }
            ]
        };
        await publisher.publish([RELAY_URL], serviceSk, payload, {
            identifier: 'addr',
            recipientPubkey: userPk
        });
        // 6. Start SOCKS Proxy - Pass userNsec in options
        console.log(`[Test] Starting NCC-VPN Proxy on ${PROXY_PORT}...`);
        startSocksServer(PROXY_PORT, {
            bootstrapRelays: [RELAY_URL],
            authorizedNsec: userNsec
        });
        // 7. Attempt resolution & connection through proxy
        console.log(`[Test] Connecting to ${serviceNpub}.nostr:7777 via Proxy...`);
        await new Promise(r => setTimeout(r, 1000));
        const info = await SocksClient.createConnection({
            proxy: { host: '127.0.0.1', port: PROXY_PORT, type: 5 },
            command: 'connect',
            destination: { host: `${serviceNpub}.nostr`, port: 7777 },
        });
        const socket = info.socket;
        socket.write("GET / HTTP/1.1\r\nHost: mock\r\n\r\n");
        const response = await new Promise((resolve) => {
            socket.on('data', (data) => resolve(data.toString()));
        });
        console.log(`[Test] Response from proxy connection:\n${response}`);
        if (response.includes("200 OK")) {
            console.log(`[Test] ✅ SUCCESS: Resolved private service and tunneled traffic!`);
        }
        else {
            throw new Error("Failed to get valid response from backend");
        }
    }
    catch (err) {
        console.error(`[Test] ❌ FAILED: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
    finally {
        relay.stop();
        backend.close();
        pool.close([RELAY_URL]);
        console.log(`[Test] Cleanup complete.`);
        process.exit(0);
    }
}
runE2EPrivateTest();
