
const assert = require('assert');
const { plannerAgent } = require('../src/agents/plannerAgent');
const { orchestratorAgent } = require('../src/agents/orchestratorAgent.optimized');
const { mcpAgent } = require('../src/agents/mcpAgent');
const { dataExplorerAgent } = require('../src/agents/dataExplorerAgent');
const { synthesizerAgent } = require('../src/agents/synthesizerAgent');
const { languageAgent } = require('../src/agents/languageAgent');
const fs = require('fs');
const path = require('path');

// Mocking the necessary modules and functions
jest.mock('../src/agents/mcpAgent');
jest.mock('../src/agents/dataExplorerAgent');
jest.mock('../src/agents/synthesizerAgent');
jest.mock('../src/agents/languageAgent');

const mcpServersConfigPath = path.resolve(__dirname, '../mcp_servers_standard.json');
let originalMcpConfig;

describe('End-to-End Test for Dynamic Multi-Domain Queries', () => {

    beforeAll(() => {
        // Read the original config and enable the necessary servers for the test
        originalMcpConfig = JSON.parse(fs.readFileSync(mcpServersConfigPath, 'utf8'));
        const testConfig = JSON.parse(JSON.stringify(originalMcpConfig));

        // Enable De Agostini and Weather servers
        const deAgostiniServer = testConfig.httpServers.find(s => s.id === 'mauden_sql_server');
        if (deAgostiniServer) {
            deAgostiniServer.enabled = true;
        }
        const weatherServer = testConfig.mcpServers['Weather MCP Server'];
        if (weatherServer) {
            weatherServer.enabled = true;
        }

        fs.writeFileSync(mcpServersConfigPath, JSON.stringify(testConfig, null, 2));
    });

    afterAll(() => {
        // Restore the original config
        fs.writeFileSync(mcpServersConfigPath, JSON.stringify(originalMcpConfig, null, 2));
    });

    it('should handle a complex query involving multiple agents and data sources', async () => {
        const userQuery = "Trova i film del catalogo De Agostini che parlano di 'guerra' e, per ogni film, ottieni le previsioni del tempo per la capitale del paese di produzione.";

        // 1. Planner Agent
        const plan = await plannerAgent({ query: userQuery });
        assert.deepStrictEqual(plan, {
            steps: [
                { agent: 'mcpAgent', task: 'Find movies about war from De Agostini catalog' },
                { agent: 'dataExplorerAgent', task: 'Extract movie titles and production countries' },
                { agent: 'mcpAgent', task: 'Get weather forecast for the capital of each production country' },
                { agent: 'dataExplorerAgent', task: 'Extract weather information' },
                { agent: 'synthesizerAgent', task: 'Synthesize the final answer' }
            ]
        });

        // 2. Orchestrator and other agents (mocked execution)
        const orchestratorResult = await orchestratorAgent({ plan });

        // Mocking the results from each agent
        mcpAgent.mockResolvedValueOnce({ movies: [{ title: 'Platoon', country: 'USA' }, { title: 'Apocalypse Now', country: 'USA' }] });
        dataExplorerAgent.mockResolvedValueOnce({ movies: [{ title: 'Platoon', country: 'USA' }, { title: 'Apocalypse Now', country: 'USA' }] });
        mcpAgent.mockResolvedValueOnce({ weather: { 'Washington D.C.': 'Sunny' } });
        dataExplorerAgent.mockResolvedValueOnce({ weather: { 'Washington D.C.': 'Sunny' } });
        synthesizerAgent.mockResolvedValueOnce({
            answer: 'I film che parlano di guerra sono: Platoon (USA), Apocalypse Now (USA). Le previsioni del tempo per Washington D.C. sono: Soleggiato.'
        });

        // Assert the final result
        assert.strictEqual(orchestratorResult.finalAnswer, 'I film che parlano di guerra sono: Platoon (USA), Apocalypse Now (USA). Le previsioni del tempo per Washington D.C. sono: Soleggiato.');
    });
});
