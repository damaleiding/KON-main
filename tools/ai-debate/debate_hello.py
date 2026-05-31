"""
Step 3: 异构并发 Hello World - 3 路真异构
Claude (OneAgent) + 豆包 (方舟) + DeepSeek (方舟)
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


async def call_claude(client: httpx.AsyncClient, prompt: str) -> dict:
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
                "model": os.getenv("ONEAGENT_MODEL"),
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        text = resp.json()["content"][0]["text"]
        return {"ok": True, "text": text, "elapsed": time.time() - t0}
    except Exception as e:
        return {"ok": False, "text": f"{type(e).__name__}: {e}", "elapsed": time.time() - t0}


async def call_ark(client: httpx.AsyncClient, model_id: str, prompt: str) -> dict:
    t0 = time.time()
    try:
        resp = await client.post(
            f"{os.getenv('ARK_BASE_URL')}/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('ARK_API_KEY')}",
                "Content-Type": "application/json",
            },
            json={
                "model": model_id,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=60,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        return {"ok": True, "text": text, "elapsed": time.time() - t0}
    except Exception as e:
        return {"ok": False, "text": f"{type(e).__name__}: {e}", "elapsed": time.time() - t0}


async def main():
    prompt = "请用 100 字以内,谈谈你对「AI Agent 的核心竞争力是什么」的看法。"

    console.print(Panel(f"[bold cyan]问题[/bold cyan]\n{prompt}", border_style="cyan"))
    console.print("\n[dim]3 个模型并发思考中...[/dim]\n")

    async with httpx.AsyncClient() as client:
        t_start = time.time()
        results = await asyncio.gather(
            call_claude(client, prompt),
            call_ark(client, os.getenv("ARK_MODEL_DOUBAO"), prompt),
            call_ark(client, os.getenv("ARK_MODEL_DEEPSEEK"), prompt),
        )
        total = time.time() - t_start

    names = ["🧠 Claude (OneAgent)", "🥟 豆包 Seed 2.0 Pro", "🔬 DeepSeek V3.1"]
    for name, r in zip(names, results):
        status = "green" if r["ok"] else "red"
        console.print(Panel(
            r["text"],
            title=f"[bold {status}]{name}[/bold {status}]  ({r['elapsed']:.1f}s)",
            border_style=status,
        ))

    console.print(f"\n[bold]总耗时: {total:.1f}s (并发)[/bold]")


if __name__ == "__main__":
    asyncio.run(main())