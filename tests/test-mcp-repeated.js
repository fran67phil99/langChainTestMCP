const axios = require('axios');

async function testMcpDiscovery() {
  console.log('🧪 Test MCP Discovery - 5 richieste consecutive');
  console.log('='.repeat(50));
  
  const baseUrl = 'http://localhost:8001';
  const testQuery = 'Quanti film ci sono nel database? Usa strumenti MCP per accedere ai dati reali.';
  
  for (let i = 1; i <= 5; i++) {
    try {
      console.log(`\n📤 Richiesta ${i}/5:`);
      console.log(`Query: ${testQuery}`);
      
      const startTime = Date.now();
      
      const response = await axios.post(`${baseUrl}/api/chat`, {
        message: testQuery,
        mode: 'conversational'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const duration = Date.now() - startTime;
      
      if (response.status === 200) {
        const responseText = response.data.response || response.data.message || JSON.stringify(response.data);
        
        console.log(`✅ Richiesta ${i} completata in ${duration}ms`);
        console.log(`📊 Lunghezza risposta: ${responseText.length} caratteri`);
        
        // Verifica se la risposta contiene dati reali o è una risposta di fallback
        const hasRealData = responseText.includes('19907') || responseText.includes('19,907') || (responseText.includes('film') && responseText.match(/\d{4,}/));
        const isFallback = responseText.includes('non ho accesso') || responseText.includes('non posso') || responseText.includes('simulato') || responseText.includes('non definito');
        
        if (hasRealData && !isFallback) {
          console.log('🎯 Risposta con DATI REALI - MCP funziona');
        } else if (isFallback) {
          console.log('⚠️ Risposta di FALLBACK - MCP non funziona');
        } else {
          console.log('❓ Risposta ambigua - da verificare');
        }
        
        // Mostra un estratto della risposta
        const excerpt = responseText.substring(0, 300) + (responseText.length > 300 ? '...' : '');
        console.log(`📝 Estratto: ${excerpt}`);
        
      } else {
        console.log(`❌ Richiesta ${i} fallita: HTTP ${response.status}`);
      }
      
      // Pausa tra le richieste per evitare sovraccarico
      if (i < 5) {
        console.log('⏳ Pausa 3 secondi...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      console.log(`❌ Richiesta ${i} errore: ${error.message}`);
      if (error.response) {
        console.log(`📊 Status: ${error.response.status}`);
        console.log(`📝 Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
  }
  
  console.log('\n🏁 Test completato');
  console.log('='.repeat(50));
}

// Avvia il test
testMcpDiscovery().catch(console.error);
