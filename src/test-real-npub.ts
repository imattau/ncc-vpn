import { resolveNpubService } from './ncc-resolver.js';

async function test() {
    const npub = 'npub1e7n2k2tnra83p6wmkqch2jf8dnf2tv7spyfe2gdhux0lq7w0zgpqc73wft';
    console.log(`[Test] Testing resolution for user identity: ${npub}`);
    console.log(`[Test] NSEC from env:`, process.env.NSEC ? 'PRESENT' : 'MISSING');
    
    // Add a hard timeout to ensure script exits
    const timer = setTimeout(() => {
        console.error('[Test] 💀 Script timed out after 15s');
        process.exit(1);
    }, 15000);

    const services = ['service', 'manager', 'api', 'relay'];
    
    for (const serviceId of services) {
        console.log(`[Test] Trying serviceId: ${serviceId}...`);
        try {
            const result = await resolveNpubService(npub, serviceId, { nsec: process.env.NSEC });
            console.log(`✅ SUCCESS (${serviceId}):`, result.endpoint);
            clearTimeout(timer);
            process.exit(0);
        } catch (err: any) {
            console.error(`❌ FAILED (${serviceId}):`, err.message);
        }
    }
    
    console.log('[Test] All service IDs failed.');
    clearTimeout(timer);
    process.exit(1);
}

test().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
