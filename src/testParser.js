import ProductParser from './productParser.js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { saveProduct } from './airtableHandler.js';

// Get the directory name of the current module
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Configure dotenv with the correct path
dotenv.config({ path: resolve(__dirname, '../.env') });

async function testParser() {
    // Create parser instance with OpenAI API key
    const parser = new ProductParser(process.env.OPENAI_API_KEY);

    // Test messages
    const messages = [
        {
            text: "Hola! Mi nombre es Juan Pérez, contacto: 3004567890. Vendo bicicleta GW en excelente estado, 200k. Poco uso, color negro, modelo 2024.",
            mediaUrls: ["http://example.com/bike1.jpg"]
        },
        {
            text: "Soy María González (cel 3112345678). Ofrezco zapatos deportivos Nike originales, talla 42, precio negociable. Nuevos en caja, originales.",
            mediaUrls: ["http://example.com/shoes1.jpg"]
        },
        {
            text: "Mesa de centro moderna, diseño minimalista. Precio conversable, valor aproximado $180.000. Medidas: 120x60cm. Material: madera y vidrio templado. Contacto Carlos Ruiz 3509876543",
            mediaUrls: []
        },
        {
            text: "Hola, soy Santiago Seade, mi whatsapp es 3215439876. Estoy vendiendo dos boletas al concierto de Royal Blood el 31 de octubre a las 10 AM. Precio negociable.",
            mediaUrls: []
        }
    ];

    // Process each message
    for (const msg of messages) {
        try {
            console.log('\nProcesando mensaje:', msg.text);
            const result = await parser.parseMessage(msg.text, msg.mediaUrls);
            console.log('Resultado estructurado:');
            console.log(JSON.stringify(result, null, 2));
            
            // Save to Airtable
            await saveProduct(result);
            console.log('Saved to Airtable successfully');
        } catch (error) {
            console.error('Error procesando mensaje:', error);
        }
    }
}

// Run the test
testParser().catch(console.error);