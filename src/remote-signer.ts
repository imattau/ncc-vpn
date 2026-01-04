<<<<<<< HEAD
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools';
export async function createRemoteSigner(bunkerInput) {
=======
import { BunkerSigner, parseBunkerInput, BunkerPointer } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools';
import { NostrSigner } from 'ncc-05-js';

export async function createRemoteSigner(bunkerInput: string): Promise<NostrSigner> {
>>>>>>> 5c9af38e21a51b25072647801661000320bb938c
    const bp = await parseBunkerInput(bunkerInput);
    if (!bp) {
        throw new Error(`Invalid bunker input: ${bunkerInput}`);
    }
<<<<<<< HEAD
    const clientSecretKey = generateSecretKey();
    const bunkerSigner = BunkerSigner.fromBunker(clientSecretKey, bp);
=======

    const clientSecretKey = generateSecretKey();
    const bunkerSigner = BunkerSigner.fromBunker(clientSecretKey, bp);

>>>>>>> 5c9af38e21a51b25072647801661000320bb938c
    // Initial connection
    console.log(`[RemoteSigner] Connecting to bunker ${bp.pubkey}...`);
    await bunkerSigner.connect();
    console.log(`[RemoteSigner] Connected.`);
<<<<<<< HEAD
=======

>>>>>>> 5c9af38e21a51b25072647801661000320bb938c
    return {
        async getPublicKey() {
            return await bunkerSigner.getPublicKey();
        },
<<<<<<< HEAD
        async signEvent(event) {
            return await bunkerSigner.signEvent(event);
        },
        async nip44Decrypt(peerPubkey, ciphertext) {
            return await bunkerSigner.nip44Decrypt(peerPubkey, ciphertext);
        },
        async nip44Encrypt(peerPubkey, plaintext) {
=======
        async signEvent(event: any) {
            return await bunkerSigner.signEvent(event) as any;
        },
        async nip44Decrypt(peerPubkey: string, ciphertext: string) {
            return await bunkerSigner.nip44Decrypt(peerPubkey, ciphertext);
        },
        async nip44Encrypt(peerPubkey: string, plaintext: string) {
>>>>>>> 5c9af38e21a51b25072647801661000320bb938c
            return await bunkerSigner.nip44Encrypt(peerPubkey, plaintext);
        },
        async close() {
            await bunkerSigner.close();
        }
    };
}
