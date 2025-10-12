import ProductParser from './productParser.js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Configure dotenv with the correct path
dotenv.config({ path: resolve(__dirname, '../.env') });

async function testParser() {
    // Get API key from environment variables
    const apiKey = process.env.OPENAI_API_KEY;
    const parser = new ProductParser(apiKey);

    // Test message
    const message = "Vendo bicicleta GW en excelente estado, 200k. Poco uso, color negro, modelo 2024.";
    
    try {
        console.log('\nProcesando mensaje:', message);
        const result = await parser.parseMessage(message);
        console.log('Resultado estructurado:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error procesando mensaje:', error);
    }
}

// Run the test
testParser().catch(console.error);