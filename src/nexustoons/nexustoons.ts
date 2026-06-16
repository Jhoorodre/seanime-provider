/// <reference path="../../types/manga-provider.d.ts" />

class Provider {
    private baseUrl = "https://nx-toons.xyz";
    private apiUrl = "https://nx-toons.xyz/api";

    getSettings(): Settings {
        return {
            supportsMultiLanguage: false,
            supportsMultiScanlator: false,
        }
    }

    private async requestAPI(url: string, options: any): Promise<any> {
        const res = await fetch(url, options);

        if (!res.ok) {
            const text = await res.text();
            throw `HTTP Error ${res.status}: ${text}`;
        }

        let contentType = "";
        if (res.headers) {
            if (typeof res.headers.get === 'function') {
                contentType = res.headers.get("content-type") || "";
            } else {
                for (const key in res.headers) {
                    if (key.toLowerCase() === "content-type") {
                        const val = res.headers[key];
                        contentType = Array.isArray(val) ? val[0] : val;
                        break;
                    }
                }
            }
        }

        if (!contentType.includes("application/json")) {
            return await res.text();
        }

        const bodyStr = await res.text();
        let decryptedBody = bodyStr;

        try {
            const enc = JSON.parse(bodyStr);
            if (enc && (enc.v === 1 || enc.v === 2)) {
                const keyIndex = enc.v === 1 ? 0 : (enc.k || 0);
                decryptedBody = OrionCrypto.decrypt(keyIndex, enc.d);
            }
        } catch (e) {
            // Not an encrypted response or failed to decrypt
        }

        try {
            return JSON.parse(decryptedBody);
        } catch (e) {
            return decryptedBody;
        }
    }

    private encodeChapterUrl(chapterId: string, mangaSlug: string = ""): string {
        const timestamp = Date.now().toString(36);
        const paddingLen = 20 + Math.floor(Math.random() * 11);
        const padding = this.randomString(paddingLen);
        const data = `${chapterId}|${mangaSlug}|${timestamp}|${padding}`;

        const xored = this.xorCipher(data, "NexusToons2026SecretKeyForChapterEncryption!@#$");
        const firstEncode = this.base64UrlEncode(xored);
        const secondEncode = this.base64UrlEncode(`${firstEncode}|${this.randomString(10)}`);

        if (secondEncode.length >= 64) {
            return secondEncode;
        } else {
            return secondEncode + this.randomString(64 - secondEncode.length);
        }
    }

    private xorCipher(input: string, key: string): string {
        let out = "";
        for (let i = 0; i < input.length; i++) {
            out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    }

    private base64UrlEncode(input: string): string {
        const bytes = encodeUTF8(input);
        const b64 = encodeBase64(bytes);
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    private randomString(length: number): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let res = "";
        for (let i = 0; i < length; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        let url = `${this.apiUrl}/mangas?page=1&limit=30&includeNsfw=true`;
        if (opts.query && opts.query.trim() !== "") {
            url += `&search=${encodeURIComponent(opts.query)}`;
        } else {
            url += `&sortBy=views&sortOrder=desc`;
        }

        const response = await this.requestAPI(url, {
            headers: {
                "Accept": "application/json",
                "Referer": `${this.baseUrl}/`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const items = response?.data || [];

        return items.map((manga: any) => ({
            id: manga.slug,
            title: manga.title,
            synonyms: [],
            year: 0,
            image: manga.coverImage || ""
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const response = await this.requestAPI(`${this.apiUrl}/manga/${id}`, {
            headers: {
                "Accept": "application/json",
                "Referer": `${this.baseUrl}/`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const chaptersList = response?.chapters || [];

        const chapters: ChapterDetails[] = chaptersList.map((ch: any) => {
            const chNum = ch.number?.toString() || "";
            let title = ch.title;
            if (!title || title.trim() === "") {
                title = `Capítulo ${chNum.replace(/\.0$/, '')}`;
            } else {
                title = `${title} ${chNum}`;
            }

            return {
                id: ch.id.toString(),
                url: `${this.baseUrl}/r/${this.encodeChapterUrl(ch.id.toString(), id)}`,
                title: title,
                chapter: chNum,
                index: 0,
                updatedAt: ch.createdAt
            };
        });

        chapters.sort((a, b) => {
            const numA = parseFloat(a.chapter);
            const numB = parseFloat(b.chapter);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return 0;
        });

        chapters.forEach((ch, i) => {
            ch.index = i;
        });

        return chapters;
    }

    async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
        const response = await this.requestAPI(`${this.apiUrl}/read/${chapterId}`, {
            headers: {
                "Accept": "application/json",
                "Referer": `${this.baseUrl}/`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const pages = response?.pages || [];
        const pageToken = response?.pageToken || "";

        return pages.map((page: any, index: number) => {
            let imageUrl = page.imageUrl;
            if (!imageUrl) {
                imageUrl = `${this.apiUrl}/p/${pageToken}/${index}`;
            } else if (imageUrl.startsWith("/api")) {
                imageUrl = `${this.baseUrl}${imageUrl}`;
            }

            return {
                url: imageUrl,
                index: index,
                headers: {
                    "Referer": `${this.baseUrl}/`
                }
            };
        });
    }
}

// ======================= CRYPTO UTILS =======================

class OrionCrypto {
    private static initialized = false;
    private static keys: { key: Uint8Array, sbox: Int32Array, rsbox: Int32Array }[] = [];
    private static NUM_KEYS = 5;
    private static CRYPTO_SECRET = "OrionNexus2025CryptoKey!Secure";

    private static initialize() {
        if (this.initialized) return;

        for (let i = 0; i < this.NUM_KEYS; i++) {
            const pattern = `_orion_key_${i}_v2_${this.CRYPTO_SECRET}`;
            const hexHash = sha256(pattern); 
            const hash = hexToBytes(hexHash);

            const keyData = {
                key: hash,
                sbox: new Int32Array(256),
                rsbox: new Int32Array(256)
            };
            this.initSBoxForKey(keyData);
            this.keys.push(keyData);
        }
        this.initialized = true;
    }

    private static initSBoxForKey(keyData: { key: Uint8Array, sbox: Int32Array, rsbox: Int32Array }) {
        for (let i = 0; i < 256; i++) {
            keyData.sbox[i] = i;
        }

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + keyData.sbox[i] + keyData.key[i % keyData.key.length]) % 256;
            const temp = keyData.sbox[i];
            keyData.sbox[i] = keyData.sbox[j];
            keyData.sbox[j] = temp;
        }

        for (let i = 0; i < 256; i++) {
            keyData.rsbox[keyData.sbox[i]] = i;
        }
    }

    private static rotateRight(byte: number, shift: number): number {
        const s = shift % 8;
        return ((byte >>> s) | (byte << (8 - s))) & 0xFF;
    }

    public static decrypt(keyIndex: number, base64Data: string): string {
        this.initialize();

        if (keyIndex < 0 || keyIndex >= this.NUM_KEYS) {
            throw new Error(`Invalid key index: ${keyIndex}`);
        }

        const keyData = this.keys[keyIndex];
        const key = keyData.key;
        const rsbox = keyData.rsbox;

        const input = decodeBase64(base64Data);
        const output = new Uint8Array(input.length);
        const keyLen = key.length;

        for (let i = input.length - 1; i >= 0; i--) {
            let byte = input[i];

            if (i > 0) {
                byte = byte ^ input[i - 1];
            } else {
                byte = byte ^ key[keyLen - 1];
            }

            byte = rsbox[byte];

            const rotAmount = ((key[(i + 3) % keyLen] + (i & 0xFF)) & 0xFF) % 7 + 1;

            byte = this.rotateRight(byte, rotAmount);

            byte = byte ^ key[i % keyLen];

            output[i] = byte;
        }

        return decodeUTF8(output);
    }
}

function sha256(ascii: string): string {
    function rightRotate(value: number, amount: number) {
        return (value>>>amount) | (value<<(32 - amount));
    };
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j; // Used as a counter across the whole file
    var result = '';

    var words: any[] = [];
    var asciiBitLength = ascii.length * 8;
    
    var hash: any = (sha256 as any).h = (sha256 as any).h || [];
    var k: any = (sha256 as any).k = (sha256 as any).k || [];
    var primeCounter = k.length;

    var isComposite: any = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
            k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
        }
    }
    
    ascii += '\x80'; 
    while (ascii.length % 64 - 56) ascii += '\x00'; 
    for (i = 0; i < ascii.length; i++) {
        j = ascii.charCodeAt(i);
        if (j>>8) return ""; 
        words[i>>2] |= j << ((3 - i)%4)*8;
    }
    words[words.length] = ((asciiBitLength/maxWord)|0);
    words[words.length] = (asciiBitLength)
    
    for (j = 0; j < words.length;) {
        var w = words.slice(j, j += 16); 
        var oldHash = hash;
        hash = hash.slice(0, 8);
        
        for (i = 0; i < 64; i++) {
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) 
                + ((e&hash[5])^((~e)&hash[6])) 
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3)) 
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10)) 
                    )|0
                );
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) 
                + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])); 
            
            hash = [(temp1 + temp2)|0].concat(hash); 
            hash[4] = (hash[4] + temp1)|0;
        }
        
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i])|0;
        }
    }
    
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i]>>(j*8))&255;
            result += ((b < 16) ? 0 : '') + b.toString(16);
        }
    }
    return result;
}

function hexToBytes(hex: string): Uint8Array {
    let bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function decodeBase64(base64: string): Uint8Array {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    let bufferLength = base64.length * 0.75;
    if (base64[base64.length - 1] === "=") bufferLength--;
    if (base64[base64.length - 2] === "=") bufferLength--;
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
        let enc1 = lookup[base64.charCodeAt(i)], enc2 = lookup[base64.charCodeAt(i + 1)];
        let enc3 = lookup[base64.charCodeAt(i + 2)], enc4 = lookup[base64.charCodeAt(i + 3)];
        bytes[p++] = (enc1 << 2) | (enc2 >> 4);
        if (enc3 !== undefined && base64.charCodeAt(i + 2) !== 61) bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
        if (enc4 !== undefined && base64.charCodeAt(i + 3) !== 61) bytes[p++] = ((enc3 & 3) << 6) | (enc4 & 63);
    }
    return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let base64 = "";
    for (let i = 0; i < bytes.length; i += 3) {
        base64 += chars[bytes[i] >> 2];
        base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64 += chars[bytes[i + 2] & 63];
    }
    if ((bytes.length % 3) === 2) {
        base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (bytes.length % 3 === 1) {
        base64 = base64.substring(0, base64.length - 2) + "==";
    }
    return base64;
}

function encodeUTF8(str: string): Uint8Array {
    const arr = [];
    for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) arr.push(charcode);
        else if (charcode < 0x800) arr.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        else if (charcode < 0xd800 || charcode >= 0xe000) arr.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        else {
            i++;
            charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            arr.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        }
    }
    return new Uint8Array(arr);
}

function decodeUTF8(bytes: Uint8Array): string {
    let out = "", i = 0;
    while (i < bytes.length) {
        let c = bytes[i++];
        if (c < 0x80) out += String.fromCharCode(c);
        else if (c > 0xbf && c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (c > 0xdf && c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
        else {
            let c2 = bytes[i++], c3 = bytes[i++], c4 = bytes[i++];
            let u = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000;
            out += String.fromCharCode(0xd800 | (u >> 10), 0xdc00 | (u & 0x3ff));
        }
    }
    return out;
}
