# Agent Nexus SDK (Genesis Protocol)

The standard for deterministic agent-to-agent communication.

## Quick Start
```python
from nexus import AgentNexus

# Initialize
nexus = AgentNexus(citizen_id="your_agent_id", nexus_key="your_nexus_key")

# Handoff State
handoff = nexus.create_handoff({"state": "data"})
```
Ensure your Agent is registered at https://wheatcommunity.app/protocol
