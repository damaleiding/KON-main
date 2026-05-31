"""
Step 5: 多轮异构 LLM 讨论 + 共识收敛
"""
import asyncio
import json
import os
import re
from datetime import datetime

import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule

load_dotenv()
console = Console()

ONEAGENT_BASE_URL = os.getenv("ONEAGENT_BASE_URL")
ONEAGENT_API_KEY = os.getenv("ONEAGENT_API_KEY")
ONEAGENT_MODEL = os.getenv("ONEAGENT_MODEL", "claude-opus-4-7")

ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
ARK_API_KEY = os.getenv("ARK_API_KEY")
ARK_MODEL_DOUBAO = os.getenv("ARK_MODEL_DOUBAO")
ARK_MODEL_DEEPSEEK = os.getenv("ARK_MODEL_DEEPSEEK", "deepseek-v4-pro-260425")

MAX_ROUNDS = 3
TIMEOUT = 120.0

EXPERTS = {
    "claude_strategist": {
        "display": "🧠 战略分析师 (Claude)",
        "color": "cyan",
        "provider": "oneagent",
        "model": ONEAGENT_MODEL,
        "system": "你是一位资深战略分析师。风格:先厘清问题边界再给结论;用 2-3 个维度结构化表达;每个结论附带 trade-off 或风险;200 字以内。多轮讨论中:被挑战时要么承认并修正,要么用事实反驳,禁止和稀泥;明确说清你坚持或让步了哪些点。",
    },
    "doubao_pragmatist": {
        "display": "🥟 落地实战派 (豆包)",
        "color": "yellow",
        "provider": "ark",
        "model": ARK_MODEL_DOUBAO,
        "system": "你是混过大厂和创业公司的产品工程老兵。风格:直接,上来说这事能不能成;只讲中国市场真实情况;永远先问成本、谁买单、怎么落地;口语化中文可带点调侃,200 字以内。多轮中:看到别人空谈战略要怼具体场景和数字;对方说得对就大方承认。",
    },
    "deepseek_devil": {
        "display": "🔬 反方辩手 (DeepSeek)",
        "color": "magenta",
        "provider": "ark",
        "model": ARK_MODEL_DEEPSEEK,
        "system": "你是魔鬼代言人。风格:第一性原理逆推找反例和漏洞;至少指出 2 个问题;禁止和稀泥、禁止骑墙;200 字以内。多轮中:精确指出对方观点的前提假设是什么、如果假设不成立会怎样;只有被彻底说服才同意。",
    },
}


async def call_claude(client, system, messages, model):
    resp = await client.post(
        f"{ONEAGENT_BASE_URL}/v1/messages",
        headers={
            "x-api-key": ONEAGENT_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={"model": model, "max_tokens": 1024, "system": system, "messages": messages},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


async def call_ark(client, system, messages, model):
    full_messages = [{"role": "system", "content": system}] + messages
    resp = await client.post(
        f"{ARK_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {ARK_API_KEY}", "Content-Type": "application/json"},
        json={"model": model, "messages": full_messages, "max_tokens": 1024},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def ask(client, expert_key, messages):
    expert = EXPERTS[expert_key]
    try:
        if expert["provider"] == "oneagent":
            return await call_claude(client, expert["system"], messages, expert["model"])
        else:
            return await call_ark(client, expert["system"], messages, expert["model"])
    except Exception as e:
        return f"[调用失败: {type(e).__name__}: {e}]"


def build_peer_context(topic, round_num, history):
    parts = [f"【讨论话题】{topic}\n", f"【当前是第 {round_num} 轮】\n"]
    for rnd in range(1, round_num):
        parts.append(f"\n━━━ 第 {rnd} 轮各位的发言 ━━━")
        for key, turns in history.items():
            idx = rnd * 2 - 1
            if idx < len(turns):
                parts.append(f"\n【{EXPERTS[key]['display']}】\n{turns[idx]['content']}")
    return "\n".join(parts)


async def run_round(client, topic, round_num, history):
    if round_num == 1:
        user_prompt = f"【话题】{topic}\n\n请按你的人设,给出第 1 轮独立观点。"
    else:
        peer_ctx = build_peer_context(topic, round_num, history)
        user_prompt = (
            f"{peer_ctx}\n\n"
            f"━━━ 现在是第 {round_num} 轮 ━━━\n"
            f"请:\n"
            f"1. 明确对至少 1 位其他专家的观点做出回应(赞同/反驳/补充)\n"
            f"2. 如果被说服就更新立场;没被说服说清为什么\n"
            f"3. 给出你本轮最终立场(200 字以内)"
        )

    for key in EXPERTS:
        history[key].append({"role": "user", "content": user_prompt})

    console.print(Rule(f"[bold green]Round {round_num} - 3 位专家并发发言中[/]"))
    tasks = [ask(client, key, history[key]) for key in EXPERTS]
    results = await asyncio.gather(*tasks)

    for key, reply in zip(EXPERTS.keys(), results):
        history[key].append({"role": "assistant", "content": reply})
        expert = EXPERTS[key]
        console.print(Panel(reply, title=expert["display"], border_style=expert["color"], expand=True))


async def moderator_draft_consensus(client, topic, history, round_num):
    transcript = [f"【话题】{topic}\n"]
    for rnd in range(1, round_num + 1):
        transcript.append(f"\n━━━ Round {rnd} ━━━")
        for key in EXPERTS:
            idx = rnd * 2 - 1
            if idx < len(history[key]):
                transcript.append(f"\n【{EXPERTS[key]['display']}】\n{history[key][idx]['content']}")

    system = "你是讨论主持人,中立、精炼、只提炼事实与逻辑,不带立场。"
    prompt = (
        "\n".join(transcript)
        + "\n\n请基于以上讨论,提炼一份共识草案(300 字以内),格式:\n【共识草案】\n1. xxx\n2. xxx\n3. xxx\n只列三方都可能同意的点,不要列分歧。"
    )
    return await call_claude(client, system, [{"role": "user", "content": prompt}], ONEAGENT_MODEL)


async def vote_on_consensus(client_unused, draft):
    vote_prompt = (
        f"主持人刚刚提炼了一份共识草案:\n\n{draft}\n\n"
        "请严格按以下 JSON 格式回复(不要任何其他内容):\n"
        '{"vote": "AGREE 或 DISAGREE", "reason": "一句话理由", "amendment": "若 DISAGREE 你希望怎么改"}'
    )
    async with httpx.AsyncClient() as client2:
        tasks = [ask(client2, key, [{"role": "user", "content": vote_prompt}]) for key in EXPERTS]
        results = await asyncio.gather(*tasks)

    votes = {}
    for key, raw in zip(EXPERTS.keys(), results):
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = {"vote": "DISAGREE", "reason": "解析失败", "amendment": raw[:100]}
        if match:
            try:
                parsed = json.loads(match.group(0))
            except Exception:
                pass
        votes[key] = parsed
    return votes


async def moderator_final_synthesis(client, topic, history, final_draft, rounds_used):
    transcript = [f"【话题】{topic}\n", f"【共讨论轮数】{rounds_used}\n"]
    for rnd in range(1, rounds_used + 1):
        transcript.append(f"\n━━━ Round {rnd} ━━━")
        for key in EXPERTS:
            idx = rnd * 2 - 1
            if idx < len(history[key]):
                transcript.append(f"\n【{EXPERTS[key]['display']}】\n{history[key][idx]['content']}")
    transcript.append(f"\n\n【最终共识草案】\n{final_draft}")

    system = "你是讨论主持人,负责综合输出最终报告。"
    prompt = (
        "\n".join(transcript)
        + "\n\n请输出最终报告(500 字以内),严格使用以下 Markdown 结构:\n"
        "## 三方共识\n(列出都同意的点)\n\n"
        "## 剩余分歧\n(如还有未解决的列出来,若无则写 无 )\n\n"
        "## 行动建议\n(给提问者 3 条可执行的下一步)"
    )
    return await call_claude(client, system, [{"role": "user", "content": prompt}], ONEAGENT_MODEL)


async def main():
    topic = "我在字节做研发 3 年了,是否应该转去做 AI Agent 方向的个人副业?"

    console.print(Panel.fit(
        f"[bold]讨论话题[/]\n{topic}\n\n[dim]最多 {MAX_ROUNDS} 轮,三方共识即停止[/]",
        border_style="green", title="AI 专家讨论组"
    ))

    history = {key: [] for key in EXPERTS}
    consensus_reached = False
    final_draft = ""
    rounds_used = 0

    async with httpx.AsyncClient() as client:
        for round_num in range(1, MAX_ROUNDS + 1):
            rounds_used = round_num
            await run_round(client, topic, round_num, history)

            console.print(Rule(f"[bold blue]Round {round_num} 结束 - 主持人提炼共识草案[/]"))
            draft = await moderator_draft_consensus(client, topic, history, round_num)
            console.print(Panel(draft, title="共识草案", border_style="blue"))

            console.print(Rule("[bold blue]三方投票中[/]"))
            votes = await vote_on_consensus(client, draft)

            for key, v in votes.items():
                icon = "[OK]" if v.get("vote") == "AGREE" else "[NO]"
                console.print(
                    f"{icon} [{EXPERTS[key]['color']}]{EXPERTS[key]['display']}[/]: "
                    f"[bold]{v.get('vote')}[/] - {v.get('reason', '')}"
                )
                if v.get("vote") == "DISAGREE" and v.get("amendment"):
                    console.print(f"   [dim]修改建议: {v['amendment']}[/]")

            all_agree = all(v.get("vote") == "AGREE" for v in votes.values())
            if all_agree:
                console.print(Rule("[bold green]三方共识达成,停止讨论[/]"))
                consensus_reached = True
                final_draft = draft
                break
            else:
                if round_num < MAX_ROUNDS:
                    console.print(Rule(f"[yellow]尚未达成共识,进入 Round {round_num + 1}[/]"))
                else:
                    console.print(Rule("[yellow]达到最大轮数,强制收敛[/]"))
                    final_draft = draft

        console.print(Rule("[bold cyan]生成最终报告[/]"))
        final_report = await moderator_final_synthesis(client, topic, history, final_draft, rounds_used)
        console.print(Panel(final_report, title="最终报告", border_style="green"))

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"debate_report_{timestamp}.md"
        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"# AI 专家讨论报告\n\n")
            f.write(f"**话题**: {topic}\n\n")
            f.write(f"**讨论轮数**: {rounds_used}\n\n")
            f.write(f"**是否达成共识**: {'是' if consensus_reached else '否(达到最大轮数)'}\n\n")
            f.write("---\n\n")
            for rnd in range(1, rounds_used + 1):
                f.write(f"## Round {rnd}\n\n")
                for key in EXPERTS:
                    idx = rnd * 2 - 1
                    if idx < len(history[key]):
                        f.write(f"### {EXPERTS[key]['display']}\n\n{history[key][idx]['content']}\n\n")
            f.write("---\n\n")
            f.write(f"## 最终共识草案\n\n{final_draft}\n\n")
            f.write(f"## 最终报告\n\n{final_report}\n")
        console.print(f"[dim]报告已保存: {filename}[/]")


if __name__ == "__main__":
    asyncio.run(main())

