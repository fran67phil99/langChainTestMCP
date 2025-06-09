import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import { JsonOutputFunctionsRouter } from 'langchain/chains/router';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { GeneralAgentState } from '../types'; // Import the state
import { LLMResult } from 'langchain/callbacks'; // Not directly used, but good for context

// Helper function to get LLM (similar to Python)
function getLlm() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error(
      '⚠️ OPENAI_API_KEY not configured! Update .env with your OpenAI API key.',
    );
  }
  return new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
    apiKey: apiKey,
  });
}

// System prompts
const defaultSystemPrompt = new SystemMessage(
  'Sei un assistente AI amichevole e utile. Rispondi in modo naturale e conversazionale. Mantieni le risposte concise ma informative. Usa un tono cordiale e professionale. Rispondi sempre in italiano.',
);

const reasoningSystemPrompt = new SystemMessage(
  `Sei un assistente AI esperto in analisi e ragionamento. Quando ricevi una domanda:
1. Analizza attentamente la richiesta
2. Scomponi il problema in parti più piccole se necessario
3. Applica il ragionamento logico passo dopo passo
4. Fornisci spiegazioni chiare e dettagliate
5. Concludi con una risposta completa e ben strutturata

Usa sempre il seguente formato per le risposte complesse:

**Analisi:**
[La tua analisi del problema]

**Ragionamento:**
[I passaggi logici del tuo ragionamento]

**Conclusione:**
[La risposta finale chiara e concisa]

Rispondi sempre in italiano.`,
);

const mcpSummarizationSystemPromptTemplate = (originalQuery: string, mcpData: any) => new SystemMessage(
  `Sei un assistente AI che deve trasformare dati JSON grezzi in una risposta discorsiva e amichevole in italiano.
L'utente ha originariamente chiesto: '${originalQuery}'.
I dati JSON ottenuti da uno strumento sono:
${JSON.stringify(mcpData, null, 2)}

Basati sulla richiesta originale e sui dati JSON, fornisci una risposta chiara, utile e ben ragionata all'utente.
Interpreta i dati e presentali in modo naturale e logico.
Se i dati sono una lista, descrivi cosa rappresenta e trai delle conclusioni se possibile.
Se sono un oggetto, spiega le sue proprietà principali e il loro significato.
Se i dati sono vuoti o non sembrano utili, informa l'utente in modo appropriato, spiegando perché potrebbero non essere utili.
Rispondi sempre in italiano.`
);


// --- Agent Nodes ---

async function analyzeIntentNode(
  state: GeneralAgentState,
): Promise<Partial<GeneralAgentState>> {
  console.log("🧠 General Agent: Analizzando l'intenzione dell'utente...");
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const userInput = lastMessage?.content?.toString() || '';
    const userInputLower = userInput.toLowerCase();

    // Check for MCP summarization request first
    try {
        const parsedInput = JSON.parse(userInput);
        if (parsedInput && parsedInput.action === 'summarize_mcp_data') {
            console.log('💡 Intenzione rilevata: summarize_mcp_data');
            return {
                currentStep: 'intent_analyzed',
                userIntent: 'summarize_mcp_data',
                requiresReasoning: true, // Summarization can be complex
                error: undefined,
            };
        }
    } catch (e) {
        // Not a JSON or not our specific action, continue with other checks
    }

    let intent = 'general';
    let requiresReasoning = false;

    if (
      ['calcola', 'risolvi', 'analizza', 'ragiona', 'spiega perché'].some(word =>
        userInputLower.includes(word),
      )
    ) {
      intent = 'reasoning';
      requiresReasoning = true;
    } else if (
      ['ciao', 'salve', 'buongiorno', 'come stai'].some(word =>
        userInputLower.includes(word),
      )
    ) {
      intent = 'greeting';
      requiresReasoning = false;
    } else if (
      ['cosa', 'come', 'quando', 'dove', 'perché', 'dimmi'].some(word => // Added "dimmi"
        userInputLower.includes(word),
      )
    ) {
      intent = 'question';
      requiresReasoning = true; // Questions often require some reasoning
    }

    console.log(
      `💡 Intenzione rilevata: ${intent} (Ragionamento richiesto: ${requiresReasoning})`,
    );
    return {
      currentStep: 'intent_analyzed',
      userIntent: intent,
      requiresReasoning: requiresReasoning,
      error: undefined,
    };
  } catch (error: any) {
    return {
      currentStep: 'error',
      error: `Errore nell'analisi dell'intenzione: ${error.message}`,
    };
  }
}

async function responseNode(
  state: GeneralAgentState,
): Promise<Partial<GeneralAgentState>> {
  const { messages, userIntent, requiresReasoning } = state;
  console.log(`💬 General Agent: Generando risposta per intento: ${userIntent}`);
  const llm = getLlm();
  let systemPromptToUse = requiresReasoning
    ? reasoningSystemPrompt
    : defaultSystemPrompt;

  const currentMessages: BaseMessage[] = [...messages]; // Copy existing messages

  // Handle MCP data summarization
  if (userIntent === 'summarize_mcp_data') {
    const lastMessageContent = messages[messages.length - 1]?.content?.toString();
    if (lastMessageContent) {
        try {
            const mcpRequest = JSON.parse(lastMessageContent);
            if (mcpRequest.action === 'summarize_mcp_data') {
                console.log("✍️ General Agent: Preparing MCP summarization prompt.");
                systemPromptToUse = mcpSummarizationSystemPromptTemplate(
                    mcpRequest.original_query,
                    mcpRequest.mcp_data
                );
                // For summarization, we might not want to send the whole history,
                // just the system prompt. Or, send history *before* the JSON request.
                // For now, let's clear previous messages for this specific task and only use the system prompt.
                // This matches the Python version's implicit behavior where only the system prompt with data is used.
                currentMessages.splice(0, currentMessages.length, systemPromptToUse);
            }
        } catch (e) {
            console.error("Error parsing MCP summarization request in responseNode:", e);
            return { currentStep: "error", error: "Failed to parse MCP summarization request." };
        }
    }
  } else {
     // Standard flow: Add appropriate system prompt if not already there or different
    if (!(currentMessages[0] instanceof SystemMessage) || currentMessages[0].content !== systemPromptToUse.content) {
        currentMessages.unshift(systemPromptToUse);
    }
  }

  try {
    const response = await llm.invoke(currentMessages);
    const aiMessage = new AIMessage({ content: response.content.toString() });

    return {
      messages: [...state.messages, aiMessage], // Add AI response to original messages list
      currentStep: 'response_complete',
      result: aiMessage.content.toString(),
      error: undefined,
    };
  } catch (error: any) {
    return {
      currentStep: 'error',
      error: `Errore nella generazione della risposta: ${error.message}`,
    };
  }
}

async function errorNode(
  state: GeneralAgentState,
): Promise<Partial<GeneralAgentState>> {
  const errorMsg = state.error || 'Errore sconosciuto';
  console.log(`❌ General Agent: Gestione errore: ${errorMsg}`);
  const userFriendlyError = `Mi dispiace, si è verificato un problema: ${errorMsg}`;
  const errorMessage = new AIMessage({ content: userFriendlyError });
  return {
    messages: [...state.messages, errorMessage],
    currentStep: 'error_handled',
    result: userFriendlyError,
  };
}

// LangGraph-style graph definition (conceptual)
// In LangChain.js, we'd use LCEL chains and runnables.
// This is a simplified representation of the flow.

export async function runGeneralAgent(
  initialMessages: BaseMessage[],
  threadId?: string, // Thread ID for potential future use with memory/checkpoints
): Promise<GeneralAgentState> {
  console.log(`🚀 General Agent: Starting run for threadId: ${threadId}`);
  let currentState: GeneralAgentState = {
    messages: [...initialMessages],
    currentStep: 'initial',
  };

  // 1. Analyze Intent
  const intentState = await analyzeIntentNode(currentState);
  currentState = { ...currentState, ...intentState };

  if (currentState.currentStep === 'error') {
    const errorState = await errorNode(currentState);
    return { ...currentState, ...errorState };
  }

  // 2. Generate Response (covers simple, reasoning, and MCP summarization)
  const responseResultState = await responseNode(currentState);
  currentState = { ...currentState, ...responseResultState };

  if (currentState.currentStep === 'error') {
    const errorState = await errorNode(currentState);
    return { ...currentState, ...errorState };
  }

  // 3. Finalize (implicitly done by returning the state)
  currentState.currentStep = 'completed';
  console.log(`🏁 General Agent: Run completed. Final message: ${currentState.result?.substring(0,100)}...`);
  return currentState;
}

// Example Usage (for testing this file directly)
async function testGeneralAgent() {
  console.log('--- Test General Agent ---');
  const testQueries = [
    { messages: [new HumanMessage('Ciao, come stai?')], id: 'greeting' },
    { messages: [new HumanMessage('Raccontami una barzelletta.')], id: 'joke_simple' },
    { messages: [new HumanMessage('Spiega la teoria della relatività in termini semplici.')], id: 'reasoning_complex'},
    {
      messages: [new HumanMessage(JSON.stringify({
        action: "summarize_mcp_data",
        original_query: "chi sono gli stagisti di mauden?",
        mcp_data: [{name: "Mario Rossi", role: "Dev Intern"}, {name: "Luigi Verdi", role: "AI Intern"}]
      }))],
      id: 'mcp_summary'
    },
    { messages: [new HumanMessage(JSON.stringify({ action: "summarize_mcp_data", original_query: "Qual è il summary del modello 'alpha'?", mcp_data: { model_name: "alpha", accuracy: "0.95", type: "classification" } }))], id: 'mcp_summary_object'},

  ];

  for (const test of testQueries) {
    console.log(`\n--- Test Case: ${test.id} --- `);
    console.log(`Input: ${test.messages[0].content}`);
    const result = await runGeneralAgent(test.messages, `test-thread-${test.id}`);
    console.log(`Result (${result.currentStep}):`, result.result);
    if (result.error) {
      console.error('Error in test case:', result.error);
    }
  }
}

// Uncomment to run test when executing this file directly:
// if (require.main === module) {
//   require('dotenv').config(); // Load .env for direct execution
//   testGeneralAgent().catch(console.error);
// }
