"""
debate - 多异构 LLM 专家讨论 CLI
用法见 python debate.py --help
"""
import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule

load_dotenv()

ONEAGENT_BASE_URL = os.getenv("ONEAGENT_BASE_URL")
ONEAGENT_API_KEY = os.getenv("ONEAGENT_API_KEY")
ONEAGENT_MODEL = os.getenv("ONEAGENT_MODEL", "claude-opus-4-7")
ARK_BASE_URL = os.getenv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
ARK_API_KEY = os.getenv("ARK_API_KEY")
ARK_MODEL_DOUBAO = os.getenv("ARK_MODEL_DOUBAO")
ARK_MODEL_DEEPSEEK = os.getenv("ARK_MODEL_DEEPSEEK", "deepseek-v4-pro-260425")

TIMEOUT = 120.0
DEFAULT_COLOR_BY_PROVIDER = {
    "oneagent": "cyan",
    "ark": "yellow",
}

# ========== 三套预设人设 ==========

EXPERT_PRESETS = {
    "planning": {
        "claude_pm": {
            "display": "产品经理 (Claude)",
            "color": "cyan",
            "provider": "oneagent",
            "model": ONEAGENT_MODEL,
            "system": "你是资深AI工具产品经理。负责需求规划，关注用户痛点、核心价值和功能边界。用结构化方式表达需求和预期收益。200字内。讨论中如果技术或QA提出合理阻碍，请调整产品设计并妥协，但要保住核心体验。",
        },
        "doubao_tech_lead": {
            "display": "技术负责人 (豆包)",
            "color": "yellow",
            "provider": "ark",
            "model": ARK_MODEL_DOUBAO,
            "system": "你是务实的技术负责人。评估需求的开发成本、技术栈选型和落地可行性。直接说这事能不能低成本搞定，有哪些技术坑。口语化，200字内。看到过度设计或不切实际的需求就直接怼，并给出替代方案。",
        },
        "deepseek_qa": {
            "display": "QA与风险控制 (DeepSeek)",
            "color": "magenta",
            "provider": "ark",
            "model": ARK_MODEL_DEEPSEEK,
            "system": "你是严苛的质量与风险评估专家。第一性原理找需求漏洞、极端边界条件、隐私/安全隐患。至少指出2个可能翻车的场景。禁止骑墙，200字内。必须明确指出前提假设的漏洞。",
        },
    },
    "design": {
        "claude_architect": {
            "display": "系统架构师 (Claude)",
            "color": "cyan",
            "provider": "oneagent",
            "model": ONEAGENT_MODEL,
            "system": "你是资深架构师，关注AI工具的模块边界、扩展性、Prompt管理设计以及与LLM交互的容错架构。指出至少2个设计问题，给出具体改进方案（可带伪代码）。200字内。",
        },
        "doubao_perf": {
            "display": "性能与成本专家 (豆包)",
            "color": "yellow",
            "provider": "ark",
            "model": ARK_MODEL_DOUBAO,
            "system": "你是性能优化老兵，关注：API延迟、Token消耗成本、并发瓶颈、缓存命中率。必须给出量化估算（比如响应时间/Token开销）。200字内。优先考虑实用且省钱的方案。",
        },
        "deepseek_security": {
            "display": "安全与合规专家 (DeepSeek)",
            "color": "magenta",
            "provider": "ark",
            "model": ARK_MODEL_DEEPSEEK,
            "system": "你是安全审计专家，重点找：Prompt注入风险、敏感数据泄露、越权漏洞、API Key安全。至少列2个高危风险，并给出防御手段。200字内。",
        },
    },
    "review": {
        "claude_reviewer": {
            "display": "资深代码审查 (Claude)",
            "color": "cyan",
            "provider": "oneagent",
            "model": ONEAGENT_MODEL,
            "system": "你是严谨的Code Reviewer。关注代码的DRY原则、可读性、命名规范、错误处理逻辑。指出代码中的坏味道，并直接提供更优雅的写法。200字内。",
        },
        "doubao_ops": {
            "display": "部署与运维专家 (豆包)",
            "color": "yellow",
            "provider": "ark",
            "model": ARK_MODEL_DOUBAO,
            "system": "你关注代码在线上的生存能力：日志是否完备、异常是否会被吞掉、部署过程是否平滑、向后兼容性。讲具体踩坑案例，不讲理论。200字内。",
        },
        "deepseek_tester": {
            "display": "测试与鲁棒性专家 (DeepSeek)",
            "color": "magenta",
            "provider": "ark",
            "model": ARK_MODEL_DEEPSEEK,
            "system": "你是自动化测试专家，寻找代码中未被测试覆盖的阴暗角落：网络超时、第三方API宕机、并发竞争。要求补充针对性的测试用例。200字内。",
        },
    },
}

console = Console()


def log(msg, quiet=False):
    if not quiet:
        console.print(msg)


def normalize_provider(provider):
    provider = provider.lower()
    alias_map = {
        "claude": "oneagent",
        "oneagent": "oneagent",
        "anthropic": "oneagent",
        "doubao": "ark",
        "deepseek": "ark",
        "ark": "ark",
    }
    if provider not in alias_map:
        raise ValueError(f"不支持的 provider: {provider}")
    return alias_map[provider]


def default_model_for_provider(provider):
    if provider == "oneagent":
        return ONEAGENT_MODEL
    if provider == "ark":
        return ARK_MODEL_DOUBAO
    raise ValueError(f"不支持的 provider: {provider}")


def normalize_expert_entry(entry, index):
    if not isinstance(entry, dict):
        raise ValueError(f"第 {index} 个专家配置不是对象")
    provider = normalize_provider(entry.get("provider", "oneagent"))
    return {
        "display": entry.get("display") or entry.get("name") or f"专家 {index}",
        "color": entry.get("color") or DEFAULT_COLOR_BY_PROVIDER.get(provider, "white"),
        "provider": provider,
        "model": entry.get("model") or default_model_for_provider(provider),
        "system": entry.get("system", "").strip(),
    }


def load_custom_experts(experts_file):
    p = Path(experts_file)
    if not p.exists():
        console.print(f"[red]专家配置文件不存在: {experts_file}[/]")
        sys.exit(1)

    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except Exception as ex:
        console.print(f"[red]专家配置文件不是合法 JSON: {type(ex).__name__}: {ex}[/]")
        sys.exit(1)

    if isinstance(raw, dict) and "experts" in raw:
        entries = raw["experts"]
    elif isinstance(raw, list):
        entries = raw
    else:
        console.print("[red]专家配置必须是 JSON 数组，或包含 experts 字段的对象[/]")
        sys.exit(1)

    if not isinstance(entries, list) or len(entries) < 2:
        console.print("[red]至少需要 2 位专家配置[/]")
        sys.exit(1)

    experts = {}
    for idx, entry in enumerate(entries, start=1):
        normalized = normalize_expert_entry(entry, idx)
        if not normalized["system"]:
            console.print(f"[red]第 {idx} 个专家缺少 system 提示词[/]")
            sys.exit(1)
        key = entry.get("key") or f"expert_{idx}"
        experts[key] = normalized
    return experts


# ========== API 调用 ==========

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
    full = [{"role": "system", "content": system}] + messages
    resp = await client.post(
        f"{ARK_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {ARK_API_KEY}", "Content-Type": "application/json"},
        json={"model": model, "messages": full, "max_tokens": 1024},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def ask(client, experts, expert_key, messages):
    e = experts[expert_key]
    try:
        if e["provider"] == "oneagent":
            return await call_claude(client, e["system"], messages, e["model"])
        return await call_ark(client, e["system"], messages, e["model"])
    except Exception as ex:
        return f"[调用失败: {type(ex).__name__}: {ex}]"


# ========== 讨论流程 ==========

def build_peer_ctx(topic, round_num, history, experts):
    parts = [f"【话题】{topic}\n", f"【当前第 {round_num} 轮】"]
    for rnd in range(1, round_num):
        parts.append(f"\n━━━ 第 {rnd} 轮 ━━━")
        for key, turns in history.items():
            idx = rnd * 2 - 1
            if idx < len(turns):
                parts.append(f"\n【{experts[key]['display']}】\n{turns[idx]['content']}")
    return "\n".join(parts)


async def run_round(client, topic, round_num, history, experts, quiet):
    if round_num == 1:
        user_prompt = f"【话题】{topic}\n\n请按你的角色,给出第 1 轮独立观点。"
    else:
        ctx = build_peer_ctx(topic, round_num, history, experts)
        user_prompt = (
            f"{ctx}\n\n━━━ 第 {round_num} 轮 ━━━\n"
            "1. 明确回应至少 1 位其他专家(赞同/反驳/补充)\n"
            "2. 被说服就更新立场,没被说服说清为什么\n"
            "3. 给出本轮最终立场(200 字内)"
        )
    for key in experts:
        history[key].append({"role": "user", "content": user_prompt})

    log(Rule(f"[bold green]Round {round_num} 并发发言中[/]"), quiet)
    tasks = [ask(client, experts, key, history[key]) for key in experts]
    results = await asyncio.gather(*tasks)

    for key, reply in zip(experts.keys(), results):
        history[key].append({"role": "assistant", "content": reply})
        e = experts[key]
        log(Panel(reply, title=e["display"], border_style=e["color"]), quiet)


async def draft_consensus(client, topic, history, round_num, experts):
    lines = [f"【话题】{topic}\n"]
    for rnd in range(1, round_num + 1):
        lines.append(f"\n━━━ Round {rnd} ━━━")
        for key in experts:
            idx = rnd * 2 - 1
            if idx < len(history[key]):
                lines.append(f"\n【{experts[key]['display']}】\n{history[key][idx]['content']}")
    sys_p = "你是讨论主持人,中立精炼,只提炼事实与逻辑。"
    prompt = "\n".join(lines) + "\n\n请提炼共识草案(300 字内),格式:\n【共识草案】\n1. xxx\n2. xxx\n3. xxx\n只列所有专家都可能同意的点。"
    return await call_claude(client, sys_p, [{"role": "user", "content": prompt}], ONEAGENT_MODEL)


async def vote(draft, experts):
    vp = (
        f"共识草案:\n\n{draft}\n\n"
        "严格按 JSON 回复(不要任何其他内容):\n"
        '{"vote": "AGREE 或 DISAGREE", "reason": "一句话", "amendment": "DISAGREE 时怎么改"}'
    )
    async with httpx.AsyncClient() as client:
        tasks = [ask(client, experts, key, [{"role": "user", "content": vp}]) for key in experts]
        results = await asyncio.gather(*tasks)
    votes = {}
    for key, raw in zip(experts.keys(), results):
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = {"vote": "DISAGREE", "reason": "解析失败", "amendment": raw[:100]}
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:
                pass
        votes[key] = parsed
    return votes


async def final_report(client, topic, history, draft, rounds_used, experts):
    lines = [f"【话题】{topic}\n", f"【轮数】{rounds_used}"]
    for rnd in range(1, rounds_used + 1):
        lines.append(f"\n━━━ Round {rnd} ━━━")
        for key in experts:
            idx = rnd * 2 - 1
            if idx < len(history[key]):
                lines.append(f"\n【{experts[key]['display']}】\n{history[key][idx]['content']}")
    lines.append(f"\n【共识草案】\n{draft}")
    sys_p = "你是讨论主持人,负责综合输出最终报告。"
    prompt = "\n".join(lines) + (
        "\n\n输出最终报告(500 字内),严格用 Markdown 结构:\n"
        "## 专家共识\n(都同意的点)\n\n"
        "## 剩余分歧\n(未解决的,若无则写 无 )\n\n"
        "## 行动建议\n(3 条可执行下一步)"
    )
    return await call_claude(client, sys_p, [{"role": "user", "content": prompt}], ONEAGENT_MODEL)


# ========== 主入口 ==========

async def run_debate(topic, mode, experts, max_rounds, quiet, output_path, json_mode):

    if not quiet:
        console.print(Panel.fit(
            f"[bold]话题[/]\n{topic[:200]}{'...' if len(topic) > 200 else ''}\n\n"
            f"[dim]模式: {mode} | 最多 {max_rounds} 轮[/]",
            border_style="green", title="AI 专家讨论组"
        ))

    history = {k: [] for k in experts}
    consensus = False
    final_draft = ""
    rounds_used = 0

    async with httpx.AsyncClient() as client:
        for rn in range(1, max_rounds + 1):
            rounds_used = rn
            await run_round(client, topic, rn, history, experts, quiet)

            log(Rule(f"[bold blue]Round {rn} 主持人提炼共识[/]"), quiet)
            draft = await draft_consensus(client, topic, history, rn, experts)
            log(Panel(draft, title="共识草案", border_style="blue"), quiet)

            log(Rule("[bold blue]专家投票[/]"), quiet)
            votes = await vote(draft, experts)

            for key, v in votes.items():
                icon = "[OK]" if v.get("vote") == "AGREE" else "[NO]"
                log(f"{icon} [{experts[key]['color']}]{experts[key]['display']}[/]: "
                    f"[bold]{v.get('vote')}[/] - {v.get('reason', '')}", quiet)

            if all(v.get("vote") == "AGREE" for v in votes.values()):
                log(Rule("[bold green]专家共识达成[/]"), quiet)
                consensus = True
                final_draft = draft
                break
            else:
                final_draft = draft
                if rn < max_rounds:
                    log(Rule(f"[yellow]进入 Round {rn + 1}[/]"), quiet)
                else:
                    log(Rule("[yellow]达到最大轮数,强制收敛[/]"), quiet)

        log(Rule("[bold cyan]生成最终报告[/]"), quiet)
        report = await final_report(client, topic, history, final_draft, rounds_used, experts)

    if json_mode:
        out = {
            "topic": topic,
            "mode": mode,
            "rounds": rounds_used,
            "consensus": consensus,
            "report": report,
            "draft": final_draft,
            "history": {k: [m for m in v] for k, v in history.items()},
        }
        text = json.dumps(out, ensure_ascii=False, indent=2)
    else:
        lines = [
            f"# AI 专家讨论报告\n",
            f"**话题**: {topic}\n",
            f"**模式**: {mode} | **轮数**: {rounds_used} | **共识**: {'是' if consensus else '否'}\n",
            "\n---\n",
            report,
            "\n---\n\n## 原始讨论记录\n",
        ]
        for rn in range(1, rounds_used + 1):
            lines.append(f"\n### Round {rn}\n")
            for key in experts:
                idx = rn * 2 - 1
                if idx < len(history[key]):
                    lines.append(f"\n**{experts[key]['display']}**\n\n{history[key][idx]['content']}\n")
        text = "\n".join(lines)

    if output_path:
        Path(output_path).write_text(text, encoding="utf-8")
        if not quiet:
            console.print(f"[dim]报告已保存: {output_path}[/]")
    else:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext = "json" if json_mode else "md"
        default = f"debate_report_{ts}.{ext}"
        Path(default).write_text(text, encoding="utf-8")
        if not quiet:
            console.print(f"[dim]报告已保存: {default}[/]")

    if quiet:
        print(text)

    return consensus


def build_topic(args):
    pieces = []
    if args.topic:
        pieces.append(args.topic)
    if args.file:
        p = Path(args.file)
        if not p.exists():
            console.print(f"[red]文件不存在: {args.file}[/]")
            sys.exit(1)
        pieces.append(f"\n【文档内容】\n{p.read_text(encoding='utf-8')}")
    if args.code:
        p = Path(args.code)
        if not p.exists():
            console.print(f"[red]代码文件不存在: {args.code}[/]")
            sys.exit(1)
        content = p.read_text(encoding="utf-8")
        pieces.append(f"\n【代码文件: {args.code}】\n```\n{content}\n```")
    if not pieces:
        console.print("[red]必须提供 topic / --file / --code 之一[/]")
        sys.exit(1)
    return "\n".join(pieces)


def main():
    parser = argparse.ArgumentParser(
        prog="debate",
        description="多异构 LLM 专家讨论 CLI (Claude + 豆包 + DeepSeek) - AI工具制作流程",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  python debate.py --mode planning "我们需要一个代码审查辅助工具，支持接入多种LLM"
  python debate.py --mode design "使用 AST 还是正则表达式来做代码分析？"
  python debate.py --mode review --code ./auth.py "审查这段用户认证代码"
  python debate.py --experts-file ./experts.json "请 3 位定制专家讨论这套方案"
  python debate.py --file ./PRD.md --rounds 2 --quiet --output out.md
  python debate.py "xxx" --json
""",
    )
    parser.add_argument("topic", nargs="?", default="", help="讨论话题")
    parser.add_argument("--mode", choices=list(EXPERT_PRESETS.keys()), default="planning",
                        help="专家预设: planning(默认) / design / review")
    parser.add_argument("--experts-file", help="自定义专家配置 JSON 文件；传入后会覆盖 --mode")
    parser.add_argument("--file", help="从文件读取话题")
    parser.add_argument("--code", help="附带代码文件作为上下文(review 模式必备)")
    parser.add_argument("--rounds", type=int, default=3, help="最多几轮(默认 3)")
    parser.add_argument("--quiet", action="store_true", help="只输出最终报告到 stdout")
    parser.add_argument("--json", dest="json_mode", action="store_true", help="JSON 格式输出")
    parser.add_argument("--output", help="报告保存路径")

    args = parser.parse_args()

    missing = [k for k, v in [
        ("ONEAGENT_API_KEY", ONEAGENT_API_KEY),
        ("ARK_API_KEY", ARK_API_KEY),
        ("ARK_MODEL_DOUBAO", ARK_MODEL_DOUBAO),
        ("ARK_MODEL_DEEPSEEK", ARK_MODEL_DEEPSEEK),
    ] if not v]
    if missing:
        console.print(f"[red]缺少环境变量: {missing}(检查 .env)[/]")
        sys.exit(1)

    topic = build_topic(args)
    experts = load_custom_experts(args.experts_file) if args.experts_file else EXPERT_PRESETS[args.mode]
    selected_mode = "custom" if args.experts_file else args.mode
    try:
        consensus = asyncio.run(run_debate(
            topic, selected_mode, experts, args.rounds, args.quiet, args.output, args.json_mode
        ))
        sys.exit(0 if consensus else 2)
    except KeyboardInterrupt:
        console.print("\n[yellow]已中断[/]")
        sys.exit(130)


if __name__ == "__main__":
    main()


