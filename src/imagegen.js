import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate an image from a text prompt and return it as a base64 data URI.
 * Images are stored inline (in MongoDB) instead of on the local filesystem so
 * the backend stays stateless and works on ephemeral hosts like Railway.
 *
 * Returns a `data:<mime>;base64,<data>` string, or null if generation failed.
 */
export async function generateImageDataUri(prompt) {
  const tryModel = async (modelName, withModalities) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    if (withModalities) {
      request.generationConfig = { responseModalities: ['image', 'text'] };
    }

    const result = await model.generateContent(request);
    const parts = result.response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const mime = part.inlineData.mimeType || 'image/png';
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
    return null;
  };

  // Primary: Gemini flash image generation
  try {
    const dataUri = await tryModel('gemini-2.0-flash-exp', true);
    if (dataUri) return dataUri;
  } catch (err) {
    console.warn('Gemini image generation failed, trying Imagen:', err.message);
  }

  // Fallback: Imagen
  try {
    const dataUri = await tryModel('imagen-3.0-generate-002', false);
    if (dataUri) return dataUri;
  } catch (err) {
    console.error('Imagen image generation failed:', err.message);
  }

  return null;
}
