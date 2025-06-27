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
  if (problematicValues.some(val => englishResponse.trim().toLowerCase().includes(val.toLowerCase()))) {
    console.log(`⚠️ English response contains problematic values, providing fallback`);
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
    let translatedResponse = response.content.trim();
    
    // Post-translation validation
    if (!translatedResponse || translatedResponse.length === 0) {
      console.log(`⚠️ Empty translation received, using fallback`);
      return englishResponse; // Return original if translation is empty
    }
    
    // Check if translation contains problematic patterns
    const problematicPatterns = [
      'non definito',
      'undefined',
      'null',
      'NaN',
      '[object object]',
      'errore di traduzione'
    ];
    
    if (problematicPatterns.some(pattern => translatedResponse.toLowerCase().includes(pattern))) {
      console.log(`⚠️ Translation contains problematic content: "${translatedResponse}"`);
      console.log(`🔄 Using fallback response in ${targetLanguageName}`);
      
      // Provide appropriate fallback based on target language
      switch (targetLanguage) {
        case 'it':
          translatedResponse = "Mi dispiace, non sono riuscito a fornire una risposta completa. Ti prego di riprovare.";
          break;
        case 'fr':
          translatedResponse = "Je suis désolé, je n'ai pas pu fournir une réponse complète. Veuillez réessayer.";
          break;
        case 'es':
          translatedResponse = "Lo siento, no pude proporcionar una respuesta completa. Por favor, inténtalo de nuevo.";
          break;
        case 'de':
          translatedResponse = "Es tut mir leid, ich konnte keine vollständige Antwort geben. Bitte versuchen Sie es erneut.";
          break;
        default:
          return englishResponse; // Fallback to English for unknown languages
      }
    }
    
    console.log(`✅ Response successfully translated to ${targetLanguageName}`);
    return translatedResponse;
    
  } catch (error) {
    console.error(`❌ Translation Error:`, error);
    console.log(`🔄 Fallback: Providing localized error message for translation failure`);
    
    // Provide appropriate error message based on target language instead of returning English
    switch (targetLanguage) {
      case 'it':
        return "Mi dispiace, si è verificato un problema con la traduzione. Tuttavia, posso confermare che la tua richiesta è stata elaborata correttamente.";
      case 'fr':
        return "Je suis désolé, il y a eu un problème avec la traduction. Cependant, je peux confirmer que votre demande a été traitée correctement.";
      case 'es':
        return "Lo siento, hubo un problema con la traducción. Sin embargo, puedo confirmar que su solicitud fue procesada correctamente.";
      case 'de':
        return "Es tut mir leid, es gab ein Problem mit der Übersetzung. Ich kann jedoch bestätigen, dass Ihre Anfrage korrekt verarbeitet wurde.";
      default:
        return englishResponse; // Fallback to English only for unsupported languages
    }
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
    if (!englishResult || !englishResult.finalResponse) {
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
    
    // Step 3: Translate response back to user's language
    const finalResponse = await translateToUserLanguage(
      englishResult.finalResponse,
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
