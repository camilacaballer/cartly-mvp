import ProductParser from './productParser.js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// __dirname for ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load env from project root
dotenv.config({ path: resolve(__dirname, '../.env') });

function simpleParse(message, mediaUrls = []) {
    const texto = (message || '').toLowerCase();

    let nombre_vendedor = '';
    const mName = message.match(/soy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/i);
    if (mName) nombre_vendedor = mName[1].trim();

    let precio = null;
    const mPrecio1 = texto.match(/(\d+[\.,]?\d*)\s*k/);
    const mPrecio2 = texto.match(/\$?\s?(\d{1,3}(?:[\.\,]\d{3})*|\d+)(?:\s|$|\.|,)/);
    const negociableWords = ['negociable', 'conversable', 'precio conversable'];
    const isNegociable = negociableWords.some(w => texto.includes(w));
    if (isNegociable) {
        precio = 'negociable';
    } else if (mPrecio1) {
        const n = parseFloat(mPrecio1[1].replace(/\./g, '').replace(/,/g, '.'));
        precio = Math.round(n * 1000);
    } else if (mPrecio2) {
        const numStr = mPrecio2[1].replace(/\./g, '').replace(/,/g, '');
        const n = parseInt(numStr, 10);
        if (!Number.isNaN(n)) precio = n;
    } else {
        precio = 'negociable';
    }

    let nombre_producto = '';
    const mProd = message.match(/(?:vendo|ofrezco)\s+([^,\.\n]{1,60})/i);
    if (mProd) nombre_producto = mProd[1].trim().slice(0, 60);
    else nombre_producto = message.split(/[\s,\.]+/).slice(0, 4).join(' ').slice(0, 60);

    let descripcion_corta = message.replace(/(?:vendo|ofrezco)\s+[^,\.\n]{1,60}/i, '').trim();
    descripcion_corta = descripcion_corta.slice(0, 140);

    const fotos = Array.isArray(mediaUrls) ? mediaUrls.slice(0, 3) : [];

    return {
        nombre_vendedor: nombre_vendedor || '',
        nombre_producto: nombre_producto || '',
        precio: precio === null ? 'negociable' : precio,
        descripcion_corta: descripcion_corta || '',
        fotos
    };
}

async function main() {
    try {
        const raw = process.argv[2];
        if (!raw) {
            console.error('Usage: node parseMessageCli.js <json-message>');
            process.exit(2);
        }

        const input = JSON.parse(raw);
        const text = input.text || '';
        const mediaUrls = Array.isArray(input.mediaUrls) ? input.mediaUrls : [];

        const apiKey = process.env.OPENAI_API_KEY;
        let parsed;

        if (apiKey) {
            const parser = new ProductParser(apiKey);
            parsed = await parser.parseMessage(text, mediaUrls);
        } else {
            parsed = simpleParse(text, mediaUrls);
        }

    // Print only the JSON object to stdout for easy parsing by caller.
    // Some libraries (dotenv, productParser) may write informational logs to stdout,
    // so emit a unique marker line and then the JSON. The caller will extract
    // the JSON after the marker.
    const MARKER = '---PARSED_JSON---';
    console.log(MARKER);
    console.log(JSON.stringify(parsed));
        process.exit(0);
    } catch (err) {
        console.error('parseMessageCli error:', err?.message || err);
        process.exit(1);
    }
}

main();
