// Test con diverse configurazioni LangChain
require('dotenv').config();
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');

async function testDifferentConfigs() {
  try {
    console.log('🧪 Testing different LangChain configurations...');
    
    // Test 1: Configurazione minimale
    console.log('\n1. Testing minimal config...');
    const llm1 = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    const response1 = await llm1.invoke([new HumanMessage("ciao")]);
    console.log('✅ Minimal config works, response:', response1.content.substring(0, 50));
    
    // Test 2: Con temperatura
    console.log('\n2. Testing with temperature...');
    const llm2 = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });
    
    const response2 = await llm2.invoke([new HumanMessage("ciao")]);
    console.log('✅ Temperature config works, response:', response2.content.substring(0, 50));
    
    // Test 3: Con model specifico
    console.log('\n3. Testing with specific model...');
    const llm3 = new ChatOpenAI({
      model: "gpt-3.5-turbo",
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });
    
    const response3 = await llm3.invoke([new HumanMessage("ciao")]);
    console.log('✅ Model config works, response:', response3.content.substring(0, 50));
    
    // Test 4: Con modelName (come nel nostro codice)
    console.log('\n4. Testing with modelName...');
    const llm4 = new ChatOpenAI({
      modelName: "gpt-3.5-turbo",
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
    });
    
    const response4 = await llm4.invoke([new HumanMessage("ciao")]);
    console.log('✅ ModelName config works, response:', response4.content.substring(0, 50));
    
  } catch (error) {
    console.error('❌ Test failed at step:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testDifferentConfigs();
