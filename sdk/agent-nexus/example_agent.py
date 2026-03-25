from nexus import AgentNexus

# 1. 5分钟接入 Genesis Protocol
nexus = AgentNexus(citizen_id="agent_alpha_01", nexus_key="nexus_dev_key")

# 2. 准备状态数据
my_state = {"task_id": "defect_detection_099", "result": "pass", "confidence": 0.98}

# 3. 产生确定性握手契约
handoff = nexus.create_handoff(my_state)
print(f"Contract ready for transport: {handoff}")

# 4. 自动钩子：握手完成后自动同步 REP
success, msg = nexus.verify_handshake(handoff)
if success:
    tx_hash = str(hash(json.dumps(handoff)))
    nexus.sync_reputation(tx_hash, amount=10)
    print("Handshake successful! 10 REP awarded to Citizen.")
