"""
验证火山方舟 (豆包 + DeepSeek) 是否连通
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("ARK_BASE_URL")
API_KEY = os.getenv("ARK_API_KEY")

models = {
    "豆包Seed2.0Pro": os.getenv("ARK_MODEL_DOUBAO"),
    "DeepSeek-V3.1": os.getenv("ARK_MODEL_DEEPSEEK"),
}

for name, model_id in models.items():
    print(f"\n{'=' * 50}")
    print(f"🧪 测试 {name}  (model={model_id})")
    print("=" * 50)

    resp = httpx.post(
        f"{BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_id,
            "messages": [
                {"role": "user", "content": "你是谁?用一句话回答。"}
            ],
        },
        timeout=60,
    )

    print(f"📡 HTTP Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        print(f"✅ 回复: {text}")
    else:
        print(f"❌ 报错响应:\n{resp.text}")