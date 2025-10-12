import OpenAI from 'openai';

class ProductParser {
    constructor(apiKey) {
        console.log('API Key received:', apiKey ? 'Valid key present' : 'No key or empty');
        this.openai = new OpenAI({
            apiKey: apiKey
        });
    }

    async parseMessage(message, mediaUrls = []) {
        try {
            // Prepare the prompt with clear instructions for the AI
            const prompt = `Extract product information from this WhatsApp message. Format the response as JSON with these fields:
            - nombre_vendedor (name of seller if mentioned)
            - nombre_producto (product name/title)
            - precio (IMPORTANT: if price is negotiable or includes words like "negociable", "conversable", you must set this field to exactly "negociable". Otherwise, use numbers only and convert any "k" to thousands)
            - descripcion_corta (short description, max 140 chars)

            Message: "${message}"

            Respond only with valid JSON. Example for fixed price:
            {
                "nombre_vendedor": "Juan Pérez",
                "nombre_producto": "Bicicleta montañera",
                "precio": 120000,
                "descripcion_corta": "Bicicleta en excelente estado, poco uso"
            }

            Example for negotiable price:
            {
                "nombre_vendedor": "Ana García",
                "nombre_producto": "iPhone 13",
                "precio": "negociable",
                "descripcion_corta": "iPhone 13 128GB, precio conversable"
            }`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a product information parser. Extract structured data from informal messages about products for sale. Always respond with valid JSON. Follow these rules exactly:\n1. For negotiable prices (when price includes words like 'negociable', 'conversable'), set precio to the string 'negociable'\n2. For fixed prices, use numbers only\n3. Never use null for precio\n\nExample with negotiable price:\nInput: 'Vendo iPhone, precio negociable'\nOutput: { \"nombre_vendedor\": \"\", \"nombre_producto\": \"iPhone\", \"precio\": \"negociable\", \"descripcion_corta\": \"iPhone en venta\" }"
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3, // Lower temperature for more consistent parsing
            });

            // Parse the AI response
            const response = completion.choices[0].message.content.trim();
            const parsed = JSON.parse(response);

            // Add any media URLs as photos
            if (mediaUrls && mediaUrls.length > 0) {
                parsed.fotos = mediaUrls.slice(0, 3); // Keep max 3 photos as per original spec
            }

            // Validate the parsed data
            return this.validateParsedData(parsed);
        } catch (error) {
            console.error('Error parsing message:', error);
            throw new Error('Could not parse product information from message');
        }
    }

    validateParsedData(data) {
        // Ensure all required fields exist with proper formatting
        const validated = {
            nombre_vendedor: data.nombre_vendedor || '',
            nombre_producto: (data.nombre_producto || '').slice(0, 60),
            precio: data.precio,  // We'll handle price validation separately
            descripcion_corta: (data.descripcion_corta || '').slice(0, 140),
            fotos: Array.isArray(data.fotos) ? data.fotos : []
        };

        // Price validation
        if (validated.precio === null || validated.precio === undefined) {
            validated.precio = "negociable";  // Default to negotiable if not specified
        } else if (typeof validated.precio === 'number') {
            if (validated.precio < 0 || validated.precio > 1000000000) { // Basic sanity check
                validated.precio = "negociable";
            }
        } else if (validated.precio !== "negociable") {
            validated.precio = "negociable";  // If it's not a number and not "negociable", set it to "negociable"
        }

        return validated;
    }

    // Helper method to clean and preprocess the message
    cleanMessage(message) {
        return message
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/[^\S\r\n]+/g, ' ')                    // Normalize whitespace
            .trim();
    }
}

// Example usage:
/*
const parser = new ProductParser('your-openai-api-key');
const result = await parser.parseMessage(
    "Vendo bicicleta GW en excelente estado, 200k. Poco uso, color negro.",
    ["http://example.com/photo1.jpg"]
);
console.log(result);
*/

export default ProductParser;