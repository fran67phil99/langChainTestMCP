
const { translateToUserLanguage } = require('../src/agents/languageAgent');

describe('Language Agent Translation Logic', () => {

  test('should correctly translate a simple sentence to Italian', async () => {
    const englishResponse = "The request has been processed successfully.";
    const translated = await translateToUserLanguage(englishResponse, 'it', 'Italian');
    expect(translated).toBe("La richiesta è stata elaborata con successo.");
  });

  test('should preserve Markdown formatting during translation', async () => {
    const englishResponse = "Here are the results:\n\n*   **Users**: 1,234\n*   **Sessions**: 5,678\n\n_Data updated as of today._";
    const translated = await translateToUserLanguage(englishResponse, 'it', 'Italian');
    expect(translated).toContain("*   **Utenti**: 1,234");
    expect(translated).toContain("*   **Sessioni**: 5,678");
    expect(translated).toContain("_Dati aggiornati ad oggi._");
  });

  test('should handle technical terms and numbers correctly', async () => {
    const englishResponse = "The MCP server 'mcp-data-prod' processed 987 requests with an average latency of 120ms.";
    const translated = await translateToUserLanguage(englishResponse, 'it', 'Italian');
    expect(translated).toContain("Il server MCP 'mcp-data-prod'");
    expect(translated).toContain("987 richieste");
    expect(translated).toContain("latenza media di 120ms");
  });

  test('should return the original response if translation fails', async () => {
    // Simulate a failure by passing a problematic input that might cause the LLM to fail
    const englishResponse = " "; // Empty response might cause issues
    const translated = await translateToUserLanguage(englishResponse, 'it', 'Italian');
    expect(translated).toBe(englishResponse);
  });

  test('should return a fallback for problematic strings like "undefined"', async () => {
    const englishResponse = "undefined";
    const translated = await translateToUserLanguage(englishResponse, 'it', 'Italian');
    expect(translated).toBe("Mi dispiace, si è verificato un errore nel processamento della risposta.");
  });

});
