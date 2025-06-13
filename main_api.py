from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import aiohttp
from dotenv import load_dotenv

app = FastAPI()

# Configurazione CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/tools")
async def get_tools():
    """MCP tools discovery endpoint"""
    tools = [
        {
            "name": "get_interns_mcp",
            "description": "Retrieves the list of interns, trainees, and students from Mauden company. Get information about internship programs, university partnerships, and current/past interns.",
            "endpoint_url": "http://localhost:8080/interns",
            "method": "GET", 
            "parameters": {},
            "mcp_source": "http://localhost:8000/stagisti"
        },        {
            "name": "get_employees_csv_mcp",
            "description": "Retrieves complete employee data from Mauden including roles, ages, salaries, wages, earnings, and compensation information. Access comprehensive workforce analytics and employee demographics.",
            "endpoint_url": "http://localhost:8080/employees-csv", 
            "method": "GET",
            "parameters": {},
            "mcp_source": "http://localhost:8000/dati-csv"
        },
        {
            "name": "get_model_summary_mcp", 
            "description": "Gets the summary and details of a specific model from the MCP system. Retrieve model information, parameters, and performance metrics.",
            "endpoint_url": "http://localhost:8080/models/{model_name}/summary",
            "method": "GET",
            "parameters": {
                "model_name": {"type": "string", "description": "The name of the model", "required": True}
            }
        }
    ]
    return tools

@app.get("/interns")
async def get_interns():
    """Get complete list of current and past interns at Mauden"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8000/stagisti") as response:
                if response.status == 200:
                    data = await response.json()
                    stagisti = data.get("dipendenti", [])
                    interns = [emp for emp in stagisti if emp.get("ruolo") == "stagista"]
                    return {
                        "interns": interns, 
                        "total": len(interns),
                        "source": "MCP-8000"
                    }
                else:
                    return {
                        "error": f"MCP service returned status {response.status}",
                        "interns": [],
                        "total": 0
                    }
    except Exception as e:
        return {
            "error": f"Failed to connect to MCP service: {str(e)}",
            "interns": [],
            "total": 0
        }

@app.get("/employees-csv")
async def get_employees_csv():
    """Get detailed Mauden employee data including demographics, roles, and salary information"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8000/dati-csv") as response:
                if response.status == 200:
                    data = await response.json()
                    return {
                        "employees": data, 
                        "total": len(data),
                        "source": "MCP-8000-CSV"
                    }
                else:
                    return {
                        "error": f"MCP service returned status {response.status}",
                        "employees": [],
                        "total": 0
                    }
    except Exception as e:
        return {
            "error": f"Failed to connect to MCP service: {str(e)}",
            "employees": [],
            "total": 0
        }

@app.get("/models/{model_name}/summary")
async def get_model_summary(model_name: str):
    """Get model summary information"""
    model_summaries = {
        "alpha": {
            "name": "alpha",
            "type": "classification",
            "accuracy": 0.95,
            "parameters": "10M",
            "last_updated": "2024-01-15"
        },
        "beta": {
            "name": "beta", 
            "type": "regression",
            "accuracy": 0.87,
            "parameters": "25M",
            "last_updated": "2024-01-20"
        }
    }
    
    if model_name in model_summaries:
        return model_summaries[model_name]
    else:
        return {
            "name": model_name,
            "type": "unknown",
            "accuracy": None,
            "parameters": "Unknown",
            "last_updated": None,
            "note": f"Model '{model_name}' not found in registry"
        }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "OK", 
        "service": "MCP Proxy Server",
        "port": 8080,
        "mcp_target": "http://localhost:8000"
    }

if __name__ == "__main__":
    load_dotenv()

    print("🚀 Starting MCP Proxy Server on http://localhost:8080")
    print("📡 Proxying to MCP Server on http://localhost:8000")
    print("🔗 Available HTTP endpoints:")
    print("  - GET /tools - MCP tools discovery")
    print("  - GET /interns - Mauden interns list")
    print("  - GET /employees-csv - Employee data CSV")
    print("  - GET /models/{model_name}/summary - Model summaries")
    print("  - GET /health - Health check")
    uvicorn.run(app, host="0.0.0.0", port=8080)

