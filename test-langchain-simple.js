// Test semplice di LangChain per identificare il problema
require('dotenv').config();
const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');

async function testLangChain() {
  try {
    console.log('🧪 Testing basic LangChain functionality...');
    
    const llm = new ChatOpenAI({
      modelName: "gpt-3.5-turbo",
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    console.log('✅ LLM created successfully');
    
    const messages = [new HumanMessage("Hello, how are you?")];
    console.log('✅ Messages created successfully');
    
    console.log('🔄 Invoking LLM...');
    const response = await llm.invoke(messages);
    
    console.log('✅ LLM invoked successfully');
    console.log('Response type:', typeof response);
    console.log('Response content:', response.content);
    console.log('Response keys:', Object.keys(response));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

testLangChain();
