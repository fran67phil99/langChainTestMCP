# 🌍 Multilingual LangGraph System with Language Agent

## Overview
A sophisticated multilingual AI system built with LangGraph that automatically detects user language, processes queries through intelligent routing, and provides responses in the user's preferred language.

## 🏗️ Architecture

```
User Input (Any Language)
    ↓
Language Agent (Detection + Translation to English)
    ↓
Orchestrator (English Processing)
    ↓
┌─────────────────┬─────────────────┐
│   MCP Agent     │  General Agent  │
│ (Company Data)  │ (General Q&A)   │
└─────────────────┴─────────────────┘
    ↓
Language Agent (Translation to User Language)
    ↓
Final Response (User's Language)
```

## 🚀 Key Features

### 🤖 **Intelligent Agents**
- **Language Agent**: Handles automatic language detection and translation
- **Orchestrator Agent**: Routes queries to appropriate specialized agents
- **MCP Agent**: Processes company-specific data queries
- **General Agent**: Handles general knowledge questions

### 🌐 **Multilingual Support**
- **Automatic Language Detection**: Uses LLM to identify user's language
- **Seamless Translation**: Converts queries to English for internal processing
- **Native Responses**: Translates final answers back to user's language
- **Supported Languages**: Italian, English, Spanish, French, German, and more

### 🔧 **LLM-Powered Intelligence**
- **No Hardcoded Rules**: All routing and processing decisions made by LLM
- **Dynamic Tool Selection**: AI chooses the best MCP tool for each query
- **Smart Response Generation**: Context-aware, professional responses
- **Scalable**: Automatically adapts to new tools and languages

## 📁 Project Structure

```
├── src/
│   ├── agents/
│   │   ├── languageAgent.js         # Multilingual processing
│   │   ├── orchestratorAgent.optimized.js  # Main routing logic
│   │   └── ...
│   └── utils/
│       └── mcpUtils.commonjs.js     # MCP tool utilities
├── main_api.py                     # MCP server (Python)
├── simple-server.js               # Node.js server
├── test-multilingual.js           # Testing script
└── README-MULTILINGUAL.md         # This file
```

## 🔨 Usage Examples

### Italian Query
```javascript
Input:  "Quanti dipendenti lavorano in Mauden?"
Output: "👥 **Team Mauden - Panoramica Dipendenti**..."
```

### English Query  
```javascript
Input:  "How many employees work at Mauden?"
Output: "👥 **Mauden Team - Employee Overview**..."
```

### Spanish Query
```javascript
Input:  "¿Cuántos empleados trabajan en Mauden?"
Output: "👥 **Equipo Mauden - Resumen de Empleados**..."
```

## 🧪 Testing

Run the multilingual test suite:
```bash
node test-multilingual.js
```

## 🛠️ Configuration

### Environment Variables
```env
OPENAI_API_KEY=your_openai_api_key_here
```

### MCP Tools Configuration
Edit `main_api.py` to add new MCP tools with English descriptions:
```python
{
    "name": "new_tool_name",
    "description": "English description of what this tool does",
    "endpoint_url": "http://localhost:8080/endpoint",
    "method": "GET"
}
```

## 🔄 System Flow

1. **User Input**: User asks question in any language
2. **Language Detection**: Language Agent identifies the language
3. **Translation**: Query translated to English for internal processing
4. **Routing**: Orchestrator decides between MCP Agent or General Agent
5. **Tool Selection**: If MCP, AI selects the best tool
6. **Processing**: Agent processes query and generates English response
7. **Translation**: Response translated back to user's language
8. **Output**: Final answer delivered in user's preferred language

## 🎯 Benefits

- **🌍 Global Accessibility**: Users can interact in their native language
- **🧠 AI-Powered**: No manual configuration of language rules
- **📈 Scalable**: Easy to add new languages and tools
- **🔧 Maintainable**: Standardized English internal processing
- **💼 Professional**: Context-aware, business-appropriate responses

## 🚀 Next Steps

- Add more MCP tools for extended functionality
- Implement conversation history with language persistence
- Add language preference settings
- Extend to more specialized domains

---
*Built with LangGraph, OpenAI GPT-3.5, and LLM-powered intelligence*
