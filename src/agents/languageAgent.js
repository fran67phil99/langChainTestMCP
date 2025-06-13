// Language Agent - Multilingual support with automatic detection and translation
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LLM for language processing with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-3.5-turbo",
  temperature: 0.3, // Lower temperature for more consistent translations
});

/**
 * Detects the language of user input and translates it to English for internal processing
 * @param {string} userInput - The original user input in any language
 * @returns {Promise<{detectedLanguage: string, originalText: string, translatedText: string}>}
 */
async function detectAndTranslateToEnglish(userInput) {
  console.log(`🌍 Language Agent: Detecting language and translating to English...`);
  
  // Log language detection start
  logAgentActivity('language_agent', 'detection_start', { userInput });
  
  try {
    const detectionMessages = [
      new HumanMessage(`You are a language detection and translation expert. Analyze this user input and provide:

USER INPUT: "${userInput}"

Please respond in this exact JSON format:
{
  "detectedLanguage": "language_code_here",
  "languageName": "Full Language Name",
  "translatedText": "english_translation_here",
  "confidenceLevel": "high/medium/low"
}

Rules:
- Detect the primary language (use ISO codes: en, it, fr, es, de, etc.)
- If already in English, translatedText should be the same as original
- Provide accurate translation maintaining the original meaning and intent
- Be especially careful with technical terms and proper nouns`)
    ];    const response = await llm.invoke(detectionMessages);
    const result = JSON.parse(response.content);
    
    console.log(`✅ Language detected: ${result.languageName} (${result.detectedLanguage}), Confidence: ${result.confidenceLevel}`);
    
    // Log successful detection
    logAgentActivity('language_agent', 'detection_success', {
      detectedLanguage: result.detectedLanguage,
      languageName: result.languageName,
      confidenceLevel: result.confidenceLevel,
      originalText: userInput,
      translatedText: result.translatedText
    });
    
    return {
      detectedLanguage: result.detectedLanguage,
      languageName: result.languageName,
      originalText: userInput,
      translatedText: result.translatedText,
      confidenceLevel: result.confidenceLevel
    };
    
  } catch (error) {
    console.error(`❌ Language Detection Error:`, error);
    
    // Log detection error
    logAgentActivity('language_agent', 'detection_error', {
      error: error.message,
      userInput
    });
    
    // Fallback: assume English
    return {
      detectedLanguage: 'en',
      languageName: 'English',
      originalText: userInput,
      translatedText: userInput,
      confidenceLevel: 'low'
    };
  }
}

/**
 * Translates English response back to user's detected language
 * @param {string} englishResponse - The response in English from agents
 * @param {string} targetLanguage - Target language code (e.g., 'it', 'fr', 'es')
 * @param {string} targetLanguageName - Full name of target language
 * @returns {Promise<string>} - Translated response
 */
async function translateToUserLanguage(englishResponse, targetLanguage, targetLanguageName) {
  console.log(`🌍 Language Agent: Translating response to ${targetLanguageName}...`);
  
  // If target is English, no translation needed
  if (targetLanguage === 'en') {
    console.log(`✅ No translation needed - response already in English`);
    return englishResponse;
  }
  
  try {
    const translationMessages = [
      new HumanMessage(`You are a professional translator. Translate this English response to ${targetLanguageName} while maintaining:

ENGLISH RESPONSE TO TRANSLATE:
"${englishResponse}"

TARGET LANGUAGE: ${targetLanguageName} (${targetLanguage})

TRANSLATION GUIDELINES:
- Maintain the exact same meaning, tone, and professional style
- Keep emoji, Markdown formatting, and structure intact
- Preserve technical terms appropriately
- Maintain any statistical data or numbers exactly
- Keep company names (like "Mauden") unchanged
- Ensure cultural appropriateness for the target language
- Do not add explanations - only provide the direct translation

TRANSLATED RESPONSE:`)
    ];

    const response = await llm.invoke(translationMessages);
    const translatedResponse = response.content.trim();
    
    console.log(`✅ Response successfully translated to ${targetLanguageName}`);
    return translatedResponse;
    
  } catch (error) {
    console.error(`❌ Translation Error:`, error);
    console.log(`🔄 Fallback: Returning English response due to translation error`);
    return englishResponse;
  }
}

/**
 * Main language processing function that handles the complete flow
 * @param {string} userInput - Original user input
 * @param {Function} processingFunction - Function that processes the English query
 * @returns {Promise<{originalLanguage: object, finalResponse: string}>}
 */
async function processWithLanguageSupport(userInput, processingFunction) {
  console.log(`🚀 Language Agent: Starting multilingual processing...`);
  
  try {
    // Step 1: Detect language and translate to English
    const languageInfo = await detectAndTranslateToEnglish(userInput);
    
    // Step 2: Process the English query through the system
    console.log(`🔄 Processing English query: "${languageInfo.translatedText}"`);
    const englishResult = await processingFunction(languageInfo.translatedText);
    
    // Step 3: Translate response back to user's language
    const finalResponse = await translateToUserLanguage(
      englishResult.finalResponse,
      languageInfo.detectedLanguage,
      languageInfo.languageName
    );
    
    return {
      originalLanguage: languageInfo,
      englishProcessing: englishResult,
      finalResponse: finalResponse
    };
    
  } catch (error) {
    console.error(`❌ Language Processing Error:`, error);
    throw error;
  }
}

/**
 * Quick language detection without translation (for routing decisions)
 * @param {string} text - Text to analyze
 * @returns {Promise<string>} - Language code
 */
async function quickLanguageDetection(text) {
  try {
    const messages = [
      new HumanMessage(`Detect the language of this text and respond with ONLY the ISO language code (en, it, fr, es, de, etc.):

"${text}"

Response:`)
    ];
    
    const response = await llm.invoke(messages);
    return response.content.trim().toLowerCase();
  } catch (error) {
    console.error('Quick language detection failed:', error);
    return 'en'; // Default to English
  }
}

module.exports = {
  detectAndTranslateToEnglish,
  translateToUserLanguage,
  processWithLanguageSupport,
  quickLanguageDetection
};
