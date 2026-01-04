import { MockRelay } from 'ncc-05-js/dist/mock-relay.js';
import { SimplePool, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { fromNsec } from 'ncc-06-js';
import { NCC05Publisher } from 'ncc-05-js';
import { resolveNpubService } from './ncc-resolver.js';

// Configuration
const MOCK_PORT = 8888;
const MOCK_URL = `ws://localhost:${MOCK_PORT}`;
const TEST_NSEC = 'nsec1j2as2cnplwk3lc2nrg0huzf5xq9syzpkpgyxq0s778ugv52h45psw57w63';
const SERVICE_ID = 'manager';

async function runLocalTest() {
    console.log('--- Starting Local NCC-VPN Integration Test ---');
    
    // 1. Start Mock Relay
    console.log(`[Test] Starting mock relay on ${MOCK_URL}...`);
    const relay = new MockRelay(MOCK_PORT);
    const pool = new SimplePool();

    try {
        const sk = fromNsec(TEST_NSEC) as any;
        const pk = getPublicKey(sk);
        const npub = nip19.npubEncode(pk);
        console.log(`[Test] Identity: ${npub} (${pk})`);

        // 2. Publish NCC-02 Service Record (Kind 30059)
        // We'll publish one with no 'u' tag to force NCC-05 resolution.
        console.log(`[Test] Publishing NCC-02 Service Record...`);
        const ncc02Event = finalizeEvent({
            kind: 30059,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', SERVICE_ID],
                ['k', 'Bi1yeOwrSEYJHr4oIpMHQwKgP-AR1bJOyUZUcgZE5zE'],
                ['exp', String(Math.floor(Date.now() / 1000) + 86400 * 14)]
            ],
            content: 'Local Mock Service'
        }, sk);

        await Promise.all(pool.publish([MOCK_URL], ncc02Event));
        console.log(`[Test] NCC-02 published.`);

        // 3. Publish NCC-05 Locator Record (Kind 30058)
        console.log(`[Test] Publishing NCC-05 Locator Record...`);
        const publisher = new NCC05Publisher({ pool });
        const payload = {
            v: 1,
            ttl: 3600,
            updated_at: Math.floor(Date.now() / 1000),
            endpoints: [
                { type: 'http', url: 'http://127.0.0.1:3000', priority: 10, family: 'ipv4' },
                { type: 'http', url: 'http://test-service.onion:80', priority: 5, family: 'onion' }
            ]
        };

        // Publish as public for simplicity in this test
        await publisher.publish([MOCK_URL], sk, payload, { 
            identifier: 'addr',
            public: true 
        });
        console.log(`[Test] NCC-05 published.`);

        // 4. Run Resolution
        console.log(`[Test] Attempting NCC resolution...`);
        const { resolveServiceEndpoint } = await import('ncc-06-js');
        const result = await resolveServiceEndpoint({
            bootstrapRelays: [MOCK_URL],
            servicePubkey: pk,
            serviceId: SERVICE_ID,
            locatorId: 'addr',
            pool,
            allowedProtocols: ['wss', 'ws', 'https', 'http'],
            torPreferred: true
        });

        console.log('[Test] NCC Resolution Result:', result.endpoint);

        // 5. Test Pass-through logic via the actual SOCKS server
        console.log(`[Test] Starting SOCKS server for pass-through check...`);
        const { startSocksServer } = await import('./socks-server.js');
        startSocksServer(1081); // Use a different port for test

        const { SocksClient } = await import('socks');
        console.log(`[Test] Testing pass-through to google.com:80...`);
        try {
            const passResult = await SocksClient.createConnection({
                proxy: { host: '127.0.0.1', port: 1081, type: 5 },
                command: 'connect',
                destination: { host: 'google.com', port: 80 }
            });
            console.log(`[Test] ✅ PASS-THROUGH SUCCESS: Connected to google.com via proxy.`);
            passResult.socket.destroy();
        } catch (err: any) {
            console.warn(`[Test] ⚠️ PASS-THROUGH FAILED: ${err.message} (Is internet available?)`);
        }

        if (result.endpoint === 'http://test-service.onion:80') {
            console.log('[Test] ✅ NCC SUCCESS: Resolved to preferred Onion endpoint.');
        } else {
            console.error('[Test] ❌ NCC FAILURE: Could not resolve expected endpoint.');
            process.exit(1);
        }

    } catch (err: any) {
        console.error('[Test] ❌ ERROR during test:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        relay.stop();
        pool.close([MOCK_URL]);
        console.log('[Test] Environment cleaned up.');
    }
}

runLocalTest();
