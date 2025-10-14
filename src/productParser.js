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
            const prompt = `Extract product information from this WhatsApp message. You MUST return a JSON object with ALL of these fields:

            {
              "nombre_vendedor": "string, name of seller if found, empty string if not found",
              "telefono_vendedor": "string, phone number in format '3001234567' (only digits, no spaces or special chars), empty string if not found",
              "nombre_producto": "string, product name/title",
              "precio": "if negotiable use string 'negociable', if fixed use number (convert k to thousands)",
              "descripcion_corta": "string, short description max 140 chars"
            }

            IMPORTANT:
            - Look carefully for phone numbers after words like: contacto, cel, celular, número, whatsapp, etc.
            - Remove ALL non-digit characters from phone numbers
            - ALL fields must be present in the JSON response
            - NEVER return null values, use empty strings instead

            Message to parse: "${message}"

            Respond only with valid JSON. Example for fixed price:
            {
                "nombre_vendedor": "Juan Pérez",
                "telefono_vendedor": "3188098899",
                "nombre_producto": "Bicicleta montañera",
                "precio": 120000,
                "descripcion_corta": "Bicicleta en excelente estado, poco uso"
            }

            Example for negotiable price:
            {
                "nombre_vendedor": "Ana García",
                "telefono_vendedor": "3188170099",
                "nombre_producto": "iPhone 13",
                "precio": "negociable",
                "descripcion_corta": "iPhone 13 128GB, precio conversable"
            }`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a product information parser. Extract structured data from informal messages about products for sale. Always respond with valid JSON and ALWAYS include ALL fields, even if empty. Follow these rules exactly:\n1. ALWAYS extract phone numbers when available (look for patterns like 'contacto:', 'cel', 'número', 'whatsapp', etc.)\n2. For phone numbers, remove all special characters and spaces, keep only digits\n3. For negotiable prices (when price includes words like 'negociable', 'conversable'), set precio to 'negociable'\n4. For fixed prices, use numbers only\n5. Never use null for any field\n\nExample outputs:\n\nInput: 'Vendo iPhone, precio negociable. Contacto: 300-123-4567'\nOutput: { \"nombre_vendedor\": \"\", \"telefono_vendedor\": \"3001234567\", \"nombre_producto\": \"iPhone\", \"precio\": \"negociable\", \"descripcion_corta\": \"iPhone en venta\" }\n\nInput: 'Soy Juan (cel 311-222-3333), vendo bici a 500k'\nOutput: { \"nombre_vendedor\": \"Juan\", \"telefono_vendedor\": \"3112223333\", \"nombre_producto\": \"bici\", \"precio\": 500000, \"descripcion_corta\": \"vendo bici\" }"
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
            telefono_vendedor: data.telefono_vendedor || '',
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