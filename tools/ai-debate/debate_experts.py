"""
Step 4: 三位异构专家就同一议题各自发言
Claude=战略分析师 / 豆包=落地实战派 / DeepSeek=反方辩手
"""
import os
import time
import asyncio
import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

load_dotenv()
console = Console()

# ============ 专家人设 (System Prompt) ============
EXPERTS = {
    "claude_strategist": {
        "display": "🧠 战略分析师 (Claude)",
        "provider": "oneagent",
        "model": os.getenv("ONEAGENT_MODEL", "claude-opus-4-7"),
        "system": """你是一位资深战略分析师,15 年经验,服务过多家科技公司。
你的风格:
- 必须先厘清问题边界,再回答
- 用结构化的方式(分 2-3 个维度)给结论
- 每个结论必须附带 trade-off 或风险点
- 禁止使用"绝对""一定""必然"等绝对化用词
- 输出控制在 200 字以内,不要废话""",
    },
    "doubao_pragmatist": {
        "display": "🥟 落地实战派 (豆包)",
        "provider": "ark",
        "model": os.getenv("ARK_MODEL_DOUBAO"),
        "system": """你是一位混过大厂和创业公司的产品/工程老兵,在中国市场摸爬滚打 10 年。
你的风格:
- 直接、不绕弯,上来就说"这事能不能成"
- 只讲中国市场的真实情况,拒绝照搬硅谷套路
- 永远先问"成本多少 / 谁买单 / 怎么落地"
- 对任何"战略级框架"保持警惕,认为落地能力 >> 想法漂亮
- 用口语化中文回答,可以带点调侃,200 字以内""",
    },
    "deepseek_devil": {
        "display": "🔬 反方辩手 (DeepSeek)",
        "provider": "ark",
        "model": os.getenv("ARK_MODEL_DEEPSEEK", "deepseek-v4-pro-260425"),
        "system": """你是"魔鬼代言人"(Devil's Advocate),专门找漏洞、挑战共识。
你的风格:
- 默认假设对方的观点有问题,你的任务是找出来
- 用第一性原理逆推:这个结论的前提是什么?前提成立吗?
- 至少指出 2 个反例或漏洞,并给出反向论证
- 禁止和稀泥,禁止"但另一方面..."之类的骑墙话
- 200 字以内,逻辑必须锋利""",
    },
}


async def call_claude(client, system: str, prompt: str, model: str):
    t0 = time.time()
    try:
        resp = await client.post(
            f"{os.getenv('ONEAGENT_BASE_URL')}/v1/messages",
            headers={
                "x-api-key": os.getenv("ONEAGENT_API_KEY"),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1024,
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        return {"ok": True, "text": resp.json()["content"][0]["text"], "elapsed": time.time() - t0}
    except Exception as e:
        return {"ok": False, "text": f"{type(e).__name__}: {e}", "elapsed": time.time() - t0}


async def call_ark(client, system: str, prompt: str, model: str):
    t0 = time.time()
    try:
        resp = await client.post(
            f"{os.getenv('ARK_BASE_URL')}/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('ARK_API_KEY')}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=60,
        )
        resp.raise_for_status()
        return {"ok": True, "text": resp.json()["choices"][0]["message"]["content"], "elapsed": time.time() - t0}
    except Exception as e:
        return {"ok": False, "text": f"{type(e).__name__}: {e}", "elapsed": time.time() - t0}


async def ask_expert(client, expert_key: str, prompt: str):
    e = EXPERTS[expert_key]
    if e["provider"] == "oneagent":
        return await call_claude(client, e["system"], prompt, e["model"])
    else:
        return await call_ark(client, e["system"], prompt, e["model"])


async def main():
    # 👇👇👇 改这里:你想让专家们讨论什么?
    topic = "我在字节做研发 3 年了,是否应该转去做 AI Agent 方向的个人副业?给我一个判断。"

    console.print(Panel(f"[bold cyan]议题[/bold cyan]\n{topic}", border_style="cyan"))
    console.print("\n[dim]三位专家并发思考中...[/dim]\n")

    async with httpx.AsyncClient() as client:
        t_start = time.time()
        results = await asyncio.gather(*[
            ask_expert(client, k, topic) for k in EXPERTS
        ])
        total = time.time() - t_start

    for key, r in zip(EXPERTS.keys(), results):
        name = EXPERTS[key]["display"]
        color = "green" if r["ok"] else "red"
        console.print(Panel(
            r["text"],
            title=f"[bold {color}]{name}[/bold {color}]  ({r['elapsed']:.1f}s)",
            border_style=color,
        ))

    console.print(f"\n[bold]总耗时: {total:.1f}s[/bold]")


if __name__ == "__main__":
    asyncio.run(main())

