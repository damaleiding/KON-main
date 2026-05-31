"""
验证 OneAgent (Claude) 是否连通
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("ONEAGENT_BASE_URL")
API_KEY = os.getenv("ONEAGENT_API_KEY")
MODEL = os.getenv("ONEAGENT_MODEL")

print(f"🔧 Base URL: {BASE_URL}")
print(f"🔧 Model:    {MODEL}")
print(f"🔧 API Key:  {API_KEY[:10]}...{API_KEY[-4:]}")
print("-" * 50)

resp = httpx.post(
    f"{BASE_URL}/v1/messages",
    headers={
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    },
    json={
        "model": MODEL,
        "max_tokens": 512,
        "messages": [
            {"role": "user", "content": "你是谁?用一句话回答。"}
        ],
    },
    timeout=60,
)

print(f"📡 HTTP Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    text = data["content"][0]["text"]
    print(f"✅ 回复: {text}")
else:
    print(f"❌ 报错响应:\n{resp.text}")