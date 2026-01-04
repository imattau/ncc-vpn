import { getPublicKey, nip19 } from 'nostr-tools';
import { fromNsec } from 'ncc-06-js';
import { resolveNpubService } from './ncc-resolver.js';
import { NCC05Resolver } from 'ncc-05-js';
async function test() {
    console.log('NCC05Resolver class:', NCC05Resolver);
    const nsec = 'nsec1j2as2cnplwk3lc2nrg0huzf5xq9syzpkpgyxq0s778ugv52h45psw57w63';
    const sk = fromNsec(nsec);
    const pk = getPublicKey(sk);
    const npub = nip19.npubEncode(pk);
    console.log(`Testing resolution for npub: ${npub}`);
    try {
        const result = await resolveNpubService(npub, 'manager');
        console.log('Success!', result);
    }
    catch (err) {
        console.error('Resolution failed:', err.message);
    }
}
test();
