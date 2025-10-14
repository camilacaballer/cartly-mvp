import Airtable from 'airtable';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// __dirname for ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load env from project root
dotenv.config({ path: resolve(__dirname, '../.env') });

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Productos';

if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
    console.error('Error: AIRTABLE_PAT and AIRTABLE_BASE_ID environment variables are required');
    process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_PAT }).base(AIRTABLE_BASE_ID);

export async function saveProduct(productData) {
    try {
        // Ensure all required fields are present
        const fields = {
            nombre_producto: productData.nombre_producto || '',
            nombre_vendedor: productData.nombre_vendedor || '',
            telefono_vendedor: productData.telefono_vendedor || '',
            Precio: typeof productData.precio === 'number' ? productData.precio.toString() : 'negociable',
            descripcion_corta: productData.descripcion_corta || '',
            fotos: productData.fotos && productData.fotos.length > 0 ? productData.fotos[0] : '',
            // fecha_creacion will be automatically set by Airtable's "Created time" field
        };

        const records = await base(AIRTABLE_TABLE_NAME).create([{ fields }]);
        console.log('Product saved successfully:', records[0].getId());
        return records[0];
    } catch (error) {
        console.error('Error saving to Airtable:', error);
        throw error;
    }
}