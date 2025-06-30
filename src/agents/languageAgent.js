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
  
  // Defensive check for invalid input
  if (!englishResponse || typeof englishResponse !== 'string') {
    console.log(`⚠️ Invalid English response provided for translation:`, englishResponse);
    return targetLanguage === 'it' 
      ? "Mi dispiace, non sono riuscito a generare una risposta valida."
      : "I apologize, but I couldn't generate a valid response.";
  }
  
  // Check for problematic values that shouldn't be translated literally
  const problematicValues = ['undefined', 'null', 'NaN', '[object Object]'];
  if (problematicValues.some(val => englishResponse.trim().toLowerCase() === val.toLowerCase())) {
    console.log(`⚠️ English response is a problematic value, providing fallback`);
    return targetLanguage === 'it' 
      ? "Mi dispiace, si è verificato un errore nel processamento della risposta."
      : "I apologize, there was an error processing the response.";
  }
  
  // If target is English, no translation needed
  if (targetLanguage === 'en') {
    console.log(`✅ No translation needed - response already in English`);
    return englishResponse;
  }
  
  try {
    const translationMessages = [
      new HumanMessage(`You are a professional translator. Translate this English response to ${targetLanguageName}.

ENGLISH RESPONSE TO TRANSLATE:
---
${englishResponse}
---

TARGET LANGUAGE: ${targetLanguageName} (${targetLanguage})

TRANSLATION GUIDELINES:
1.  **Preserve Formatting**: Maintain the exact same structure, including Markdown (like lists, bold, italics), code blocks, and line breaks.
2.  **Accurate Meaning**: Translate the meaning, tone, and professional style accurately.
3.  **Technical Terms**: Preserve technical terms, acronyms, and proper nouns (like "Mauden", "SQL", "MCP").
4.  **Data Integrity**: Keep all numbers, statistics, and data unchanged.
5.  **No Additions**: Do not add any extra explanations, apologies, or comments. Provide only the direct translation.

First, think step-by-step on how to preserve the formatting. Then, provide the final translated response.

TRANSLATED RESPONSE:`)
    ];

    const response = await llm.invoke(translationMessages);
    let translatedResponse = response.content.trim();
    
    // Post-translation validation: check for empty or very short response
    if (!translatedResponse || translatedResponse.length < englishResponse.length / 4) {
      console.log(`⚠️ Translation seems empty or too short. Using original response as fallback.`);
      return englishResponse; // Return original if translation is suspicious
    }
    
    console.log(`✅ Response successfully translated to ${targetLanguageName}`);
    return translatedResponse;
    
  } catch (error) {
    console.error(`❌ Translation Error:`, error);
    console.log(`🔄 Fallback: Providing original English response due to translation failure.`);
    // Return the original English response as a safe fallback
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
    
    // Defensive check for englishResult
    if (!englishResult || (!englishResult.finalResponse && !englishResult.response)) {
      console.log(`⚠️ Processing function returned invalid result:`, englishResult);
      
      const fallbackMessage = languageInfo.detectedLanguage === 'it' 
        ? "Mi dispiace, non sono riuscito a elaborare la tua richiesta al momento."
        : "I apologize, but I couldn't process your request at this time.";
        
      return {
        originalLanguage: languageInfo,
        englishProcessing: englishResult || { response: "Processing failed", finalResponse: "Processing failed" },
        finalResponse: fallbackMessage
      };
    }
    
    // Get the response content - try finalResponse first, then response
    const responseContent = englishResult.finalResponse || englishResult.response;
    
    // Step 3: Translate response back to user's language
    const finalResponse = await translateToUserLanguage(
      responseContent,
      languageInfo.detectedLanguage,
      languageInfo.languageName
    );
    
    // Final validation of the translated response
    if (!finalResponse || finalResponse.trim().length === 0) {
      console.log(`⚠️ Final response is empty, providing fallback`);
      const fallbackMessage = languageInfo.detectedLanguage === 'it' 
        ? "Mi dispiace, si è verificato un problema nella generazione della risposta finale."
        : "I apologize, there was a problem generating the final response.";
        
      return {
        originalLanguage: languageInfo,
        englishProcessing: englishResult,
        finalResponse: fallbackMessage
      };
    }
    
    return {
      originalLanguage: languageInfo,
      englishProcessing: englishResult,
      finalResponse: finalResponse
    };
    
  } catch (error) {
    console.error(`❌ Language Processing Error:`, error);
    
    // Provide error message in user's language if possible
    let errorMessage = "I apologize, but there was an error processing your request.";
    try {
      const quickLang = await quickLanguageDetection(userInput);
      if (quickLang === 'it') {
        errorMessage = "Mi dispiace, si è verificato un errore durante l'elaborazione della tua richiesta.";
      }
    } catch (langError) {
      console.log(`Could not detect language for error message, using English`);
    }
    
    // Return structured error instead of throwing
    return {
      originalLanguage: { detectedLanguage: 'unknown', originalText: userInput, translatedText: userInput },
      englishProcessing: { response: errorMessage, finalResponse: errorMessage },
      finalResponse: errorMessage,
      error: error.message
    };
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
