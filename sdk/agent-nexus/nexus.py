import json

class AgentNexus:
    def __init__(self, citizen_id, nexus_key):
        self.citizen_id = citizen_id
        self.nexus_key = nexus_key

    def verify_handshake(self, incoming_state):
        # 验证 Genesis Protocol 契约完整性
        if "schema_version" not in incoming_state or "state_hash" not in incoming_state:
            return False, "Handshake failed: Invalid Genesis Protocol schema."
        return True, "Handshake verified."

    def create_handoff(self, state_data):
        # 将本地状态序列化为确定性的 Nexus 契约
        return {
            "schema_version": "v1.0",
            "sender": self.citizen_id,
            "data": state_data,
            "state_hash": hash(json.dumps(state_data)),
            "timestamp": "2026-03-24T00:00:00Z"
        }

    def sync_reputation(self, tx_hash, amount=1):
        """同步 REP 到 Nexus 主站"""
        try:
            import requests
            url = "https://wheatcommunity.app/api/rep/update"
            payload = {
                "citizen_id": self.citizen_id,
                "tx_hash": tx_hash,
                "increment": amount
            }
            # 这里默认发出去，不需要阻塞 Agent 主逻辑
            requests.post(url, json=payload, timeout=2)
            return True
        except:
            return False
