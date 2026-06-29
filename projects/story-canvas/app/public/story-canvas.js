let state = {
      root: document.getElementById("rootInput").value,
      groups: [],
      selectedGroupId: null,
      selectedPartPath: null,
      selectedBlockId: null,
      feedbackTarget: null,
      expanded: new Set(),
      transform: { x: 70, y: 80, scale: 1 },
      lastFingerprint: "",
      liveEnabled: true,
      isScanning: false,
      sidebarCollapsed: localStorage.getItem("storyCanvas.sidebarCollapsed") === "1",
      inspectorWidth: Number(localStorage.getItem("storyCanvas.inspectorWidth")) || 520,
      resizeInspector: null,
      feedbackDrafts: {},
      rerollSettings: loadRerollSettings(),
      dragCanvas: null,
      dragNode: null,
      dragDraftConnector: null,
      dragFrame: null,
      suppressClick: null,
      undoStack: [],
      redoStack: [],
      isRestoringCanvasState: false,
      workspaceSaveTimer: null,
      isAutosavingWorkspace: false,
      lastWorkspaceSaveSignature: "",
      agentStatus: [],
      codexTasks: []
    };

    const els = {
      appShell: document.getElementById("appShell"),
      sidebar: document.getElementById("sidebar"),
      inspector: document.querySelector(".inspector"),
      canvasShell: document.querySelector(".canvas-shell"),
      viewport: document.getElementById("viewport"),
      world: document.getElementById("world"),
      nodes: document.getElementById("nodes"),
      edges: document.getElementById("edges"),
      canvasBreadcrumb: document.getElementById("canvasBreadcrumb"),
      zoomLabel: document.getElementById("zoomLabel"),
      chapterList: document.getElementById("chapterList"),
      agentStatusList: document.getElementById("agentStatusList"),
      codexTaskList: document.getElementById("codexTaskList"),
      inspectorContent: document.getElementById("inspectorContent"),
      emptyHint: document.getElementById("emptyHint"),
      floatingReroll: document.getElementById("floatingReroll"),
      floatingFeedback: document.getElementById("floatingFeedback"),
      floatingAgentSelect: document.getElementById("floatingAgentSelect"),
      floatingModelInput: document.getElementById("floatingModelInput"),
      floatingVersionCount: document.getElementById("floatingVersionCount"),
      floatingTargetChars: document.getElementById("floatingTargetChars"),
      floatingStatus: document.getElementById("floatingStatus")
    };

    document.getElementById("toggleSidebarBtn").addEventListener("click", toggleSidebar);
    document.getElementById("scanBtn").addEventListener("click", scanFolder);
    document.getElementById("savePositionsBtn").addEventListener("click", savePositions);
    document.getElementById("toggleLiveBtn").addEventListener("click", toggleLive);
    document.getElementById("refreshAgentsBtn").addEventListener("click", () => loadAgentStatus({ probe: true }));
    document.getElementById("refreshCodexTasksBtn").addEventListener("click", () => loadCodexBridgeTasks());
    document.getElementById("refreshHistoryBtn").addEventListener("click", () => {
      const group = selectedGroup();
      loadHistory(group ? selectedPart(group) : null);
    });
    document.getElementById("inspectorTabs").addEventListener("click", event => {
      const button = event.target.closest("[data-inspector-scroll]");
      if (!button) return;
      document.querySelectorAll("#inspectorTabs button").forEach(item => item.classList.toggle("active", item === button));
      document.getElementById(button.dataset.inspectorScroll)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    document.getElementById("layoutBtn").addEventListener("click", layoutGroups);
    document.getElementById("zoomOut").addEventListener("click", () => zoomBy(0.88));
    document.getElementById("zoomIn").addEventListener("click", () => zoomBy(1.12));
    document.getElementById("zoomReset").addEventListener("click", () => {
      state.transform = { x: 70, y: 80, scale: 1 };
      renderTransform();
      scheduleWorkspaceAutosave();
    });
    document.getElementById("floatingRecordBtn").addEventListener("click", () => saveFloatingReroll({ generate: false }));
    document.getElementById("floatingRollBtn").addEventListener("click", () => saveFloatingReroll({ generate: true }));
    document.getElementById("floatingAgentSelect").addEventListener("change", event => {
      const modelInput = document.getElementById("floatingModelInput");
      if (modelInput) modelInput.value = defaultModelForAgent(event.target.value);
      saveRerollSettingsFromControls();
    });
    ["floatingModelInput", "floatingVersionCount", "floatingTargetChars"].forEach(id => {
      document.getElementById(id).addEventListener("input", saveRerollSettingsFromControls);
    });
    document.getElementById("floatingFeedback").addEventListener("input", event => {
      const key = currentFeedbackKey();
      if (key) state.feedbackDrafts[key] = event.target.value;
    });
    document.getElementById("inspectorResizer").addEventListener("pointerdown", startInspectorResize);
    document.getElementById("historyList").addEventListener("click", restoreFromHistory);
    els.inspector.addEventListener("scroll", renderFloatingReroll);
    window.addEventListener("resize", renderFloatingReroll);
    window.addEventListener("keydown", handleCanvasShortcut);
    document.addEventListener("pointerdown", event => {
      if (!state.feedbackTarget && !state.selectedBlockId && els.floatingReroll.hidden) return;
      if (event.target.closest(".story-block, #floatingReroll")) return;
      clearFeedbackTarget();
    }, true);
    applySidebarState();

    els.viewport.addEventListener("pointerdown", event => {
      if (event.target.closest(".node, .part-node, .part-cluster, .draft-handle")) return;
      clearFeedbackTarget();
      state.dragCanvas = {
        x: event.clientX,
        y: event.clientY,
        startX: state.transform.x,
        startY: state.transform.y
      };
      els.viewport.classList.add("dragging");
      els.viewport.setPointerCapture(event.pointerId);
    });

    window.addEventListener("pointermove", event => {
      if (state.dragCanvas) {
        event.preventDefault();
        state.transform.x = state.dragCanvas.startX + event.clientX - state.dragCanvas.x;
        state.transform.y = state.dragCanvas.startY + event.clientY - state.dragCanvas.y;
        renderTransform();
      }
      if (state.dragNode) {
        event.preventDefault();
        if (Math.abs(event.clientX - state.dragNode.x) > 3 || Math.abs(event.clientY - state.dragNode.y) > 3) {
          state.dragNode.moved = true;
        }
        const dx = (event.clientX - state.dragNode.x) / state.transform.scale;
        const dy = (event.clientY - state.dragNode.y) / state.transform.scale;
        if (state.dragNode.splitItems?.length) {
          for (const item of state.dragNode.splitItems) {
            const start = state.dragNode.startPositions?.[item.id] || item.canvas_position || { x: 0, y: 0 };
            item.canvas_position.x = start.x + dx;
            item.canvas_position.y = start.y + dy;
          }
        } else {
          state.dragNode.group.canvas_position.x = state.dragNode.startX + dx;
          state.dragNode.group.canvas_position.y = state.dragNode.startY + dy;
        }
        updateDraggedElementPosition();
        scheduleDragRender();
      }
      if (state.dragDraftConnector) {
        event.preventDefault();
        state.dragDraftConnector.current = clientToWorld(event.clientX, event.clientY);
        const dx = event.clientX - state.dragDraftConnector.clientStart.x;
        const dy = event.clientY - state.dragDraftConnector.clientStart.y;
        state.dragDraftConnector.moved = Math.hypot(dx, dy) > 18;
        renderEdges();
      }
    });

    window.addEventListener("pointermove", event => {
      if (!state.resizeInspector) return;
      const delta = event.clientX - state.resizeInspector.startX;
      state.inspectorWidth = clamp(state.resizeInspector.startWidth - delta, 360, 820);
      localStorage.setItem("storyCanvas.inspectorWidth", String(Math.round(state.inspectorWidth)));
      applyLayoutState();
      renderFloatingReroll();
    });

    window.addEventListener("pointerup", () => {
      if (!state.resizeInspector) return;
      state.resizeInspector = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      scheduleWorkspaceAutosave();
    });

    window.addEventListener("pointerup", async event => {
      if (state.dragCanvas) {
        state.dragCanvas = null;
        els.viewport.classList.remove("dragging");
        scheduleWorkspaceAutosave();
      }
      if (state.dragDraftConnector) {
        const connector = state.dragDraftConnector;
        state.dragDraftConnector = null;
        connector.element?.classList.remove("connector-source");
        renderEdges();
        if (connector.moved) await createDraftFromConnector(connector);
      }
      if (state.dragNode) {
        const finishedNode = state.dragNode;
        finishedNode.element.classList.remove("dragging");
        state.dragNode = null;
        cancelDragRender();
        if (finishedNode.group.kind === "draft") {
          state.selectedGroupId = finishedNode.group.id;
          state.selectedPartPath = null;
          state.selectedBlockId = null;
          state.feedbackTarget = null;
          if (finishedNode.moved) {
            lockGroupClick(finishedNode.group.id);
            renderNodesOnly();
            savePositions({ undoLabel: "移动草稿节点" });
          } else {
            render();
          }
        } else if (!finishedNode.moved) setChapterFeedbackTarget(finishedNode.group, { anchor: "node" });
        else {
          lockGroupClick(finishedNode.group.id);
          renderNodesOnly();
          savePositions({ undoLabel: "移动节点" });
        }
      }
      try { els.viewport.releasePointerCapture(event.pointerId); } catch {}
    });

    els.viewport.addEventListener("wheel", event => {
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
    }, { passive: false });

    async function scanFolder(options = {}) {
      if (state.isScanning) return;
      state.isScanning = true;
      const previousGroupId = state.selectedGroupId;
      const previousPartPath = state.selectedPartPath;
      const previousBlockId = state.selectedBlockId;
      const previousFeedbackTarget = state.feedbackTarget ? { ...state.feedbackTarget } : null;
      state.root = document.getElementById("rootInput").value.trim();
      setStatus(options.message || "正在读取文件夹，并生成/更新同目录 .story.json...");
      try {
        const data = await fetchJson(`/api/scan?ensure=1&root=${encodeURIComponent(state.root)}`);
        if (!data.ok) throw new Error(data.error || "读取失败");
        state.groups = data.groups;
        state.lastFingerprint = data.fingerprint || state.lastFingerprint;
        if (options.preserve) {
          const group = state.groups.find(item => item.id === previousGroupId) || state.groups[0];
          state.selectedGroupId = group?.id || null;
          if (group?.kind === "draft") {
            state.selectedPartPath = null;
            state.selectedBlockId = null;
            state.feedbackTarget = null;
          } else {
            const part = group?.parts.find(item => item.path === previousPartPath) || group?.parts[0];
            state.selectedPartPath = part?.path || null;
            state.selectedBlockId = part?.blocks.some(item => item.id === previousBlockId) ? previousBlockId : null;
            state.feedbackTarget = restoreFeedbackTarget(previousFeedbackTarget);
          }
        } else if (applyWorkspaceState(data.workspace_state)) {
          state.feedbackTarget = null;
        } else {
          state.selectedGroupId = state.groups[0]?.id || null;
          state.selectedPartPath = state.groups[0]?.parts?.[0]?.path || null;
          state.selectedBlockId = null;
          state.feedbackTarget = null;
        }
        document.getElementById("groupCount").textContent = `${data.group_count} 章`;
        setStatus(options.doneMessage || `已读取 ${data.article_count} 篇文章，形成 ${data.group_count} 个章节节点。`);
        state.lastWorkspaceSaveSignature = JSON.stringify({
          root: state.root,
          positions: currentPositions(),
          workspace_state: currentWorkspaceState()
        });
        render();
        loadCodexBridgeTasks({ quiet: true }).catch(() => {});
      } finally {
        state.isScanning = false;
      }
    }

    async function savePositions(options = {}) {
      if (!state.groups.length) return;
      if (options.undoLabel !== false) await pushCanvasUndoPoint(options.undoLabel || "保存节点位置");
      const positions = {};
      for (const group of state.groups) positions[group.group_key] = group.canvas_position;
      await fetchJson("/api/folder-index", {
        method: "POST",
        body: JSON.stringify({ root: state.root, positions, workspace_state: currentWorkspaceState() }),
        headers: { "Content-Type": "application/json" }
      });
      state.lastWorkspaceSaveSignature = JSON.stringify({
        root: state.root,
        positions,
        workspace_state: currentWorkspaceState()
      });
      await refreshFingerprintQuietly();
      setStatus("节点位置已保存到当前文件夹的 .story-canvas.folder.json。");
    }

    function layoutGroups() {
      state.groups.forEach((group, index) => {
        group.canvas_position = {
          x: 260,
          y: 120 + index * 230
        };
      });
      render();
      savePositions({ undoLabel: "整理布局" });
    }

    function applyWorkspaceState(workspaceState) {
      if (!workspaceState || typeof workspaceState !== "object") return false;
      const transform = workspaceState.transform || {};
      state.transform = {
        x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 70,
        y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 80,
        scale: clamp(Number(transform.scale) || 1, 0.25, 3)
      };
      state.expanded = new Set(
        Array.isArray(workspaceState.expanded_group_ids)
          ? workspaceState.expanded_group_ids.filter(id => state.groups.some(group => group.id === id))
          : []
      );
      state.sidebarCollapsed = Boolean(workspaceState.sidebar_collapsed);
      state.inspectorWidth = clamp(Number(workspaceState.inspector_width) || state.inspectorWidth, 360, 820);
      localStorage.setItem("storyCanvas.sidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
      localStorage.setItem("storyCanvas.inspectorWidth", String(Math.round(state.inspectorWidth)));
      applySidebarState();

      const group = state.groups.find(item => item.id === workspaceState.selected_group_id) || state.groups[0];
      if (!group) return false;
      state.selectedGroupId = group.id;
      if (group.kind === "draft") {
        state.selectedPartPath = null;
        state.selectedBlockId = null;
        return true;
      }
      const part = group.parts.find(item => item.path === workspaceState.selected_part_path) || group.parts[0];
      state.selectedPartPath = part?.path || null;
      state.selectedBlockId = part?.blocks?.some(item => item.id === workspaceState.selected_block_id)
        ? workspaceState.selected_block_id
        : null;
      return true;
    }

    function currentWorkspaceState() {
      const group = selectedGroup();
      const isDraft = group?.kind === "draft";
      return {
        transform: {
          x: Math.round(state.transform.x * 100) / 100,
          y: Math.round(state.transform.y * 100) / 100,
          scale: Math.round(state.transform.scale * 1000) / 1000
        },
        selected_group_id: state.selectedGroupId || "",
        selected_part_path: isDraft ? "" : state.selectedPartPath || "",
        selected_block_id: isDraft ? "" : state.selectedBlockId || "",
        expanded_group_ids: Array.from(state.expanded),
        sidebar_collapsed: state.sidebarCollapsed,
        inspector_width: Math.round(state.inspectorWidth)
      };
    }

    function currentPositions() {
      const positions = {};
      for (const group of state.groups) positions[group.group_key] = group.canvas_position;
      return positions;
    }

    function scheduleWorkspaceAutosave(delay = 600) {
      if (!state.groups.length || state.isScanning || state.isRestoringCanvasState) return;
      if (state.workspaceSaveTimer) clearTimeout(state.workspaceSaveTimer);
      state.workspaceSaveTimer = setTimeout(() => {
        state.workspaceSaveTimer = null;
        saveWorkspaceAutosave();
      }, delay);
    }

    async function saveWorkspaceAutosave() {
      if (!state.groups.length || state.isAutosavingWorkspace) return;
      const payload = {
        root: state.root,
        positions: currentPositions(),
        workspace_state: currentWorkspaceState()
      };
      const signature = JSON.stringify(payload);
      if (signature === state.lastWorkspaceSaveSignature) return;
      state.isAutosavingWorkspace = true;
      try {
        await fetchJson("/api/folder-index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        state.lastWorkspaceSaveSignature = signature;
        await refreshFingerprintQuietly();
        setStatus("工作区状态已自动保存。");
      } catch (error) {
        setStatus(`工作区自动保存失败：${error.message}`);
      } finally {
        state.isAutosavingWorkspace = false;
      }
    }

    async function createDraftFromConnector(connector) {
      const anchor = connector.group;
      if (!anchor) return;
      const route = inferDraftRoute(anchor, connector.current);
      const draftPosition = {
        x: Math.round(connector.current.x),
        y: Math.round(connector.current.y)
      };
      await pushCanvasUndoPoint("拖出续写草稿");
      const result = await fetchJson("/api/draft-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: state.root,
          after_group_key: anchor.group_key,
          after_title: anchor.title,
          before_group_key: route.beforeGroup?.group_key || "",
          before_title: route.beforeGroup?.title || "",
          branch_from_group_key: anchor.group_key,
          route_mode: route.mode,
          title: `${route.mode === "interstitial" ? "插入草稿" : "分支草稿"}：${anchor.title}`,
          canvas_position: draftPosition,
          generation_settings: defaultDraftGenerationSettings(route.mode)
        })
      });
      state.selectedGroupId = result.group_id;
      state.selectedPartPath = null;
      state.selectedBlockId = null;
      state.feedbackTarget = null;
      lockGroupClick([anchor.id, result.group_id], 700);
      setStatus(`已创建${route.mode === "interstitial" ? "插入" : "分支"}续写草稿：${result.draft?.draft_file_path || result.draft_id}`);
      await scanFolder({
        preserve: true,
        message: "正在刷新续写草稿节点...",
        doneMessage: "续写草稿节点已接入画布。"
      });
      state.selectedGroupId = result.group_id;
      render();
      scheduleWorkspaceAutosave();
    }

    function startDraftConnector(event, group, element) {
      event.preventDefault();
      event.stopPropagation();
      lockGroupClick(group.id, 700);
      selectGroup(group.id, false);
      const start = connectorAnchor(group);
      state.dragDraftConnector = {
        group,
        element,
        start,
        current: clientToWorld(event.clientX, event.clientY),
        clientStart: { x: event.clientX, y: event.clientY },
        moved: false
      };
      element.classList.add("connector-source");
      els.viewport.setPointerCapture(event.pointerId);
      renderEdges();
    }

    function connectorAnchor(group) {
      const rect = groupEdgeRect(group);
      return {
        x: rect.x + rect.width,
        y: rect.y + rect.height / 2
      };
    }

    function clientToWorld(clientX, clientY) {
      const rect = els.viewport.getBoundingClientRect();
      return {
        x: (clientX - rect.left - state.transform.x) / state.transform.scale,
        y: (clientY - rect.top - state.transform.y) / state.transform.scale
      };
    }

    function inferDraftRoute(anchor, dropPoint) {
      const baseGroups = state.groups.filter(group => group.kind !== "draft");
      const anchorIndex = baseGroups.findIndex(group => group.group_key === anchor.group_key);
      const beforeGroup = anchorIndex >= 0 ? baseGroups[anchorIndex + 1] : null;
      if (!beforeGroup) return { mode: "branch", beforeGroup: null };
      return isPointBetweenGroups(anchor, beforeGroup, dropPoint)
        ? { mode: "interstitial", beforeGroup }
        : { mode: "branch", beforeGroup: null };
    }

    function isPointBetweenGroups(from, to, point) {
      const a = groupEdgeRect(from);
      const b = groupEdgeRect(to);
      const fromBottom = a.y + a.height;
      const toTop = b.y;
      const minY = Math.min(fromBottom, toTop) - 44;
      const maxY = Math.max(fromBottom, toTop) + 66;
      const fromCenterX = a.x + a.width / 2;
      const toCenterX = b.x + b.width / 2;
      const minX = Math.min(fromCenterX, toCenterX) - 220;
      const maxX = Math.max(fromCenterX, toCenterX) + 220;
      return point.y >= minY && point.y <= maxY && point.x >= minX && point.x <= maxX;
    }

    function defaultDraftGenerationSettings(routeMode) {
      return {
        agent: "trae-main",
        model: "trae-main",
        version_count: 3,
        target_chars: 3000,
        split_count: 1,
        split_mode: "single_segment",
        prompt_goal: routeMode === "interstitial"
          ? "插入到相邻章节之间，补足承接、转折和上下文衔接。"
          : "从当前章节拉出独立分支路线，保留主干事实，不自动合并。"
      };
    }

    function defaultRerollSettings() {
      return {
        agent: "gemini-flash-latest",
        model: "gemini-flash-latest",
        version_count: 1,
        target_chars: 3000,
        split_count: 1,
        split_mode: "single_segment",
        prompt_goal: ""
      };
    }

    function loadRerollSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem("storyCanvas.rerollSettings") || "{}");
        return { ...defaultRerollSettings(), ...(saved && typeof saved === "object" ? saved : {}) };
      } catch {
        return defaultRerollSettings();
      }
    }

    function saveRerollSettingsFromControls() {
      state.rerollSettings = collectFloatingGenerationSettings();
      localStorage.setItem("storyCanvas.rerollSettings", JSON.stringify(state.rerollSettings));
    }

    function collectFloatingGenerationSettings() {
      const fallback = state.rerollSettings || defaultRerollSettings();
      const agent = els.floatingAgentSelect?.value || fallback.agent || "gemini-flash-latest";
      return {
        agent,
        model: els.floatingModelInput?.value.trim() || defaultModelForAgent(agent),
        version_count: clampInteger(els.floatingVersionCount?.value, 1, 8, fallback.version_count || 1),
        target_chars: clampInteger(els.floatingTargetChars?.value, 200, 50000, fallback.target_chars || 3000),
        split_count: 1,
        split_mode: "single_segment",
        prompt_goal: els.floatingFeedback?.value || ""
      };
    }

    function syncFloatingGenerationControls() {
      const settings = { ...defaultRerollSettings(), ...(state.rerollSettings || {}) };
      if (els.floatingAgentSelect.dataset.selected !== settings.agent) {
        els.floatingAgentSelect.innerHTML = agentOptionsHtml(settings.agent);
        els.floatingAgentSelect.dataset.selected = settings.agent;
      }
      els.floatingAgentSelect.value = settings.agent;
      els.floatingModelInput.value = settings.model || defaultModelForAgent(settings.agent);
      els.floatingVersionCount.value = settings.version_count || 1;
      els.floatingTargetChars.value = settings.target_chars || 3000;
    }

    function agentOptions() {
      return [
        ["trae-main", "Trae 主模型（统筹）"],
        ["codex-gpt-5", "Codex / GPT-5"],
        ["claude-opus-4-7", "Claude Opus 4.7"],
        ["deepseek-v4-pro-260425", "DeepSeek V4 Pro"],
        ["gemini-flash-latest", "Gemini Flash（API）"],
        ["gemini-3.5-flash", "Gemini 3.5 Flash（旧配置）"],
        ["manual", "手动填稿"]
      ];
    }

    function agentOptionsHtml(selected) {
      return agentOptions().map(([value, label]) => agentOption(value, label, selected)).join("");
    }

    function agentOption(value, label, selected) {
      return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }

    function draftModelLabel(settings = {}) {
      return settings.model || defaultModelForAgent(settings.agent || "trae-main") || settings.agent || "trae-main";
    }

    function draftStatusLabel(status) {
      if (status === "selected") return "已采纳";
      if (status === "rejected") return "已放弃";
      if (status === "archived") return "已归档";
      if (status === "split_source") return "已拆章";
      return "草稿";
    }

    function draftStatusPillClass(status) {
      if (status === "selected") return "good";
      if (status === "rejected") return "bad";
      return "";
    }

    function draftStatusNodeClass(status) {
      if (status === "selected" || status === "rejected") return `status-${status}`;
      return "";
    }

    function countOption(value, selected) {
      return `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value}</option>`;
    }

    function render() {
      renderTransform();
      renderChapterList();
      renderNodesOnly();
      renderInspector();
      renderCanvasBreadcrumb();
      renderFloatingReroll();
    }

    function renderTransform() {
      els.world.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
      els.zoomLabel.textContent = `zoom ${Math.round(state.transform.scale * 100)}%`;
      renderFloatingReroll();
    }

    function renderCanvasBreadcrumb() {
      const group = selectedGroup();
      if (!group) {
        els.canvasBreadcrumb.textContent = "主线画布";
        return;
      }
      if (group.kind === "draft") {
        const routeLabel = group.route_mode === "interstitial" ? "插入草稿" : "分支草稿";
        els.canvasBreadcrumb.textContent = `${routeLabel} / ${group.title}`;
        return;
      }
      els.canvasBreadcrumb.textContent = `第 ${displayChapterNo(group.chapter_no)} 章 / ${group.title}`;
    }

    function renderChapterList() {
      els.chapterList.innerHTML = "";
      for (const group of state.groups) {
        const button = document.createElement("button");
        button.className = group.id === state.selectedGroupId ? "active" : "";
        button.innerHTML = `
          <div><strong>${escapeHtml(group.title)}</strong></div>
          <div class="muted small">${group.kind === "draft" ? "续写草稿" : `${group.part_count} 部分`} · ${group.total_chars} 字 · ${escapeHtml(group.relative_dir || ".")}</div>
        `;
        button.addEventListener("click", () => selectGroup(group.id));
        els.chapterList.appendChild(button);
      }
    }

    async function loadAgentStatus(options = {}) {
      if (!els.agentStatusList) return;
      els.agentStatusList.innerHTML = `<div class="empty">正在检查 Agent...</div>`;
      try {
        const data = await fetchJson(`/api/agents/status${options.probe ? "?probe=1" : ""}`);
        state.agentStatus = data.agents || [];
        renderAgentStatus();
      } catch (error) {
        els.agentStatusList.innerHTML = `<div class="empty">Agent 检查失败：${escapeHtml(error.message)}</div>`;
      }
    }

    function renderAgentStatus() {
      const items = state.agentStatus || [];
      if (!items.length) {
        els.agentStatusList.innerHTML = `<div class="empty">暂无 Agent 状态。</div>`;
        return;
      }
      els.agentStatusList.innerHTML = items.map(agent => {
        const good = agent.status === "ok" || agent.status === "configured" || agent.status === "bridge-ready";
        const warn = agent.status === "missing-config" || agent.status === "probe-failed";
        return `
          <div class="agent-status-item">
            <div class="row">
              <strong>${escapeHtml(agent.label)}</strong>
              <span class="pill ${good ? "good" : warn ? "bad" : "warn"}">${escapeHtml(agentStatusLabel(agent))}</span>
            </div>
            <div class="muted small">${escapeHtml(agent.model || agent.provider || "")}</div>
            ${agent.message ? `<div class="muted small">${escapeHtml(agent.message)}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    function agentStatusLabel(agent) {
      if (agent.status === "ok") return "可用";
      if (agent.status === "configured") return "已配置";
      if (agent.status === "bridge-ready") return "桥接";
      if (agent.status === "probe-failed") return "失败";
      if (agent.status === "missing-config") return "未配置";
      return agent.status || "未知";
    }

    async function loadCodexBridgeTasks(options = {}) {
      if (!els.codexTaskList || !state.root) return;
      if (!options.quiet) els.codexTaskList.innerHTML = `<div class="empty">正在读取队列...</div>`;
      try {
        const data = await fetchJson(`/api/codex-bridge/tasks?root=${encodeURIComponent(state.root)}`);
        state.codexTasks = data.tasks || [];
        renderCodexBridgeTasks();
      } catch (error) {
        if (!options.quiet) {
          els.codexTaskList.innerHTML = `<div class="empty">队列读取失败：${escapeHtml(error.message)}</div>`;
        }
      }
    }

    function renderCodexBridgeTasks() {
      const tasks = state.codexTasks || [];
      if (!els.codexTaskList) return;
      if (!tasks.length) {
        els.codexTaskList.innerHTML = `<div class="empty">暂无桥接任务。</div>`;
        return;
      }
      els.codexTaskList.innerHTML = tasks.slice(0, 6).map(task => `
        <div class="codex-task-item">
          <div class="row">
            <strong title="${escapeAttr(task.title || task.task_id)}">${escapeHtml(task.title || task.task_id)}</strong>
            <span class="pill ${task.status === "queued" ? "warn" : "good"}">${escapeHtml(codexTaskStatusLabel(task.status))}</span>
          </div>
          <div class="muted small">${escapeHtml(task.task_type || "task")} · ${escapeHtml(formatTime(task.created_at))}</div>
          <div class="muted small" title="${escapeAttr(task.path || "")}">${escapeHtml(task.path || "")}</div>
        </div>
      `).join("");
    }

    function codexTaskStatusLabel(status) {
      if (status === "queued") return "待执行";
      if (status === "running") return "执行中";
      if (status === "done") return "已完成";
      if (status === "failed") return "失败";
      return status || "未知";
    }

    function renderNodesOnly() {
      renderEdges();
      els.nodes.innerHTML = "";
      const splitGroups = draftSplitGroups();
      const renderedDraftIds = new Set();
      for (const group of state.groups) {
        if (group.kind === "draft") {
          if (renderedDraftIds.has(group.id)) continue;
          const splitItems = splitGroups.get(group.split_origin_draft_id || "");
          if (splitItems?.[0]?.id === group.id) {
            renderDraftSplitCluster(splitItems);
            splitItems.forEach(item => renderedDraftIds.add(item.id));
            continue;
          }
          renderDraftNode(group);
          continue;
        }
        const isExpanded = state.expanded.has(group.id);
        if (isExpanded) {
          renderPartNodes(group);
          continue;
        }
        const node = document.createElement("div");
        const pos = group.canvas_position || { x: 0, y: 0 };
        node.className = `node ${group.id === state.selectedGroupId ? "selected" : ""}`;
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.dataset.id = group.id;
        node.innerHTML = `
          <div class="node-meta">
            <span>第 ${displayChapterNo(group.chapter_no)} 章</span>
            <span>${group.part_count} 部分</span>
          </div>
          <div class="node-title">${escapeHtml(group.title)}</div>
          <div class="row">
            <span class="pill">${group.total_chars} 字</span>
            <button data-expand>${isExpanded ? "收起" : "展开"}</button>
          </div>
          <div class="node-line">${escapeHtml(group.relative_dir || ".")}</div>
          <button class="draft-handle" title="拖出续写草稿" aria-label="拖出续写草稿"></button>
        `;
        const draftHandle = node.querySelector(".draft-handle");
        draftHandle.addEventListener("pointerdown", event => {
          startDraftConnector(event, group, node);
        });
        draftHandle.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
        });
        node.addEventListener("click", event => {
          if (consumeSuppressedGroupClick(group.id)) return;
          if (event.target.closest(".draft-handle")) return;
          if (event.target.closest("[data-expand]")) {
            toggleExpanded(group.id);
            return;
          }
          setChapterFeedbackTarget(group, { anchor: "node" });
        });
        node.addEventListener("pointerdown", event => {
          if (event.target.closest(".draft-handle")) return;
          if (event.target.closest("button")) return;
          event.stopPropagation();
          selectGroup(group.id, false);
          state.dragNode = {
            group,
            element: node,
            x: event.clientX,
            y: event.clientY,
            startX: group.canvas_position.x,
            startY: group.canvas_position.y,
            moved: false
          };
          node.classList.add("dragging");
          els.viewport.setPointerCapture(event.pointerId);
        });
        els.nodes.appendChild(node);
      }
      renderFloatingReroll();
    }

    function draftSplitGroups() {
      const map = new Map();
      for (const group of state.groups) {
        if (group.kind !== "draft" || !group.split_origin_draft_id) continue;
        if (!map.has(group.split_origin_draft_id)) map.set(group.split_origin_draft_id, []);
        map.get(group.split_origin_draft_id).push(group);
      }
      for (const [key, items] of map.entries()) {
        if (items.length < 2) {
          map.delete(key);
          continue;
        }
        items.sort((a, b) =>
          (Number(a.split_order) || 0) - (Number(b.split_order) || 0)
          || String(a.title).localeCompare(String(b.title), "zh-Hans-CN")
        );
      }
      return map;
    }

    function renderDraftSplitCluster(items) {
      const clusterRect = draftSplitClusterRect(items);
      const selected = items.some(item => item.id === state.selectedGroupId);
      const cluster = document.createElement("div");
      cluster.className = `part-cluster draft-split-cluster ${selected ? "selected" : ""}`;
      cluster.style.left = `${clusterRect.x}px`;
      cluster.style.top = `${clusterRect.y}px`;
      cluster.style.width = `${clusterRect.width}px`;
      cluster.style.height = `${clusterRect.height}px`;
      cluster.dataset.splitOriginDraftId = items[0]?.split_origin_draft_id || "";
      cluster.addEventListener("click", event => {
        if (event.target === cluster && items[0]) selectGroup(items[0].id);
      });
      cluster.addEventListener("pointerdown", event => {
        if (event.target.closest(".draft-split-card")) return;
        event.stopPropagation();
        if (items[0]) selectGroup(items[0].id, false);
        state.dragNode = {
          group: items[0],
          splitItems: items,
          element: cluster,
          x: event.clientX,
          y: event.clientY,
          startPositions: Object.fromEntries(items.map(item => [
            item.id,
            { ...(item.canvas_position || { x: 0, y: 0 }) }
          ])),
          moved: false
        };
        cluster.classList.add("dragging");
        els.viewport.setPointerCapture(event.pointerId);
      });

      const title = document.createElement("div");
      title.className = "cluster-title";
      title.textContent = `草稿拆章 · ${items.length} 段 · 未确认`;
      cluster.appendChild(title);

      items.forEach((item, index) => {
        const pos = draftSplitCardLocalPosition(items, index);
        const node = document.createElement("div");
        node.className = `part-node draft-split-card ${item.id === state.selectedGroupId ? "selected" : ""}`;
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.dataset.id = item.id;
        node.innerHTML = `
          <div class="part-node-title">${escapeHtml(splitDraftLabel(item, index))}</div>
          <div class="part-node-line">${item.total_chars || 0} 字</div>
          <div class="part-node-line">草稿拆章 ${index + 1}/${items.length}</div>
          <div class="part-node-line">${escapeHtml(item.generation_settings?.model || item.generation_settings?.agent || "")}</div>
        `;
        node.addEventListener("click", event => {
          event.stopPropagation();
          selectGroup(item.id);
        });
        cluster.appendChild(node);
      });
      els.nodes.appendChild(cluster);
    }

    function splitDraftLabel(item, index) {
      const explicit = String(item.title || "").replace(/^#{1,6}\s*/, "").trim();
      if (explicit) return explicit;
      return ["上", "中", "下", "四"][index] || `第 ${index + 1} 段`;
    }

    function renderDraftNode(group) {
      const node = document.createElement("div");
      const pos = group.canvas_position || { x: 0, y: 0 };
      const routeMode = group.route_mode === "interstitial" ? "interstitial" : "branch";
      const settings = group.generation_settings || {};
      const batch = group.generation_batch || {};
      const routeLabel = routeMode === "interstitial" ? "插入中间" : "分支路线";
      const modelLabel = draftModelLabel(settings);
      const versionCount = settings.version_count || 3;
      const versionLabel = batch.version_count ? `${batch.version_index}/${batch.version_count}版` : `${versionCount}版`;
      const statusLabel = draftStatusLabel(group.status);
      const statusClass = draftStatusPillClass(group.status);
      const afterLine = routeMode === "interstitial" && group.before_title
        ? `插入：${group.after_title || "上一节点"} → ${group.before_title}`
        : `分支自：${group.after_title || "当前节点"}`;
      node.className = `node draft route-${routeMode} ${draftStatusNodeClass(group.status)} ${group.id === state.selectedGroupId ? "selected" : ""}`;
      node.style.left = `${pos.x}px`;
      node.style.top = `${pos.y}px`;
      node.dataset.id = group.id;
      node.innerHTML = `
        <div class="node-meta">
          <span>${batch.version_count ? "生成候选" : "续写草稿"}</span>
          <span>${routeLabel}</span>
        </div>
        <div class="node-title">${escapeHtml(group.title)}</div>
        <div class="node-chip-row">
          <span class="pill">${group.total_chars} 字</span>
          <span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span>
          <span class="pill">${settings.target_chars || 3000}字目标</span>
        </div>
        <div class="node-chip-row">
          <span class="pill">${escapeHtml(settings.agent || "trae-main")}</span>
          <span class="pill" title="${escapeAttr(modelLabel)}">${escapeHtml(modelLabel)}</span>
          <span class="pill">${versionLabel}</span>
        </div>
        <div class="node-line">${escapeHtml(afterLine)}</div>
      `;
      node.addEventListener("click", event => {
        if (consumeSuppressedGroupClick(group.id)) return;
        selectGroup(group.id);
      });
      node.addEventListener("pointerdown", event => {
        event.stopPropagation();
        selectGroup(group.id, false);
        state.dragNode = {
          group,
          element: node,
          x: event.clientX,
          y: event.clientY,
          startX: group.canvas_position.x,
          startY: group.canvas_position.y,
          moved: false
        };
        node.classList.add("dragging");
        els.viewport.setPointerCapture(event.pointerId);
      });
      els.nodes.appendChild(node);
    }

    function updateDraggedElementPosition() {
      if (!state.dragNode?.element) return;
      const element = state.dragNode.element;
      if (element.classList.contains("draft-split-cluster")) {
        const rect = draftSplitClusterRect(state.dragNode.splitItems || []);
        element.style.left = `${rect.x}px`;
        element.style.top = `${rect.y}px`;
        return;
      }
      if (element.classList.contains("part-cluster")) {
        const rect = partClusterRect(state.dragNode.group);
        element.style.left = `${rect.x}px`;
        element.style.top = `${rect.y}px`;
        return;
      }
      const pos = state.dragNode.group.canvas_position || { x: 0, y: 0 };
      element.style.left = `${pos.x}px`;
      element.style.top = `${pos.y}px`;
    }

    function scheduleDragRender() {
      if (state.dragFrame) return;
      state.dragFrame = requestAnimationFrame(() => {
        state.dragFrame = null;
        renderEdges();
        renderFloatingReroll();
      });
    }

    function cancelDragRender() {
      if (!state.dragFrame) return;
      cancelAnimationFrame(state.dragFrame);
      state.dragFrame = null;
    }

    function renderPartNodes(group) {
      const clusterRect = partClusterRect(group);
      const cluster = document.createElement("div");
      cluster.className = "part-cluster";
      cluster.style.left = `${clusterRect.x}px`;
      cluster.style.top = `${clusterRect.y}px`;
      cluster.style.width = `${clusterRect.width}px`;
      cluster.style.height = `${clusterRect.height}px`;
      cluster.dataset.groupId = group.id;
      cluster.addEventListener("click", event => {
        if (consumeSuppressedGroupClick(group.id)) return;
        if (event.target === cluster) setChapterFeedbackTarget(group, { anchor: "cluster" });
      });
      cluster.addEventListener("pointerdown", event => {
        if (event.target.closest("button, .part-node, .draft-handle")) return;
        event.stopPropagation();
        selectGroup(group.id, false);
        state.dragNode = {
          group,
          element: cluster,
          x: event.clientX,
          y: event.clientY,
          startX: group.canvas_position.x,
          startY: group.canvas_position.y,
          moved: false
        };
        cluster.classList.add("dragging");
        els.viewport.setPointerCapture(event.pointerId);
      });

      const title = document.createElement("div");
      title.className = "cluster-title";
      title.textContent = `第 ${displayChapterNo(group.chapter_no)} 章 · ${group.title}`;
      cluster.appendChild(title);

      const collapseButton = document.createElement("button");
      collapseButton.className = "cluster-collapse";
      collapseButton.textContent = "收起";
      collapseButton.addEventListener("click", event => {
        event.stopPropagation();
        toggleExpanded(group.id);
      });
      cluster.appendChild(collapseButton);

      const draftHandle = document.createElement("button");
      draftHandle.className = "draft-handle";
      draftHandle.title = "拖出续写草稿";
      draftHandle.setAttribute("aria-label", "拖出续写草稿");
      draftHandle.addEventListener("pointerdown", event => startDraftConnector(event, group, cluster));
      draftHandle.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
      });
      cluster.appendChild(draftHandle);

      group.parts.forEach((part, index) => {
        const pos = partNodeLocalPosition(group, part, index);
        const node = document.createElement("div");
        const selected = state.feedbackTarget?.type === "part"
          && group.id === state.selectedGroupId
          && part.path === state.selectedPartPath;
        node.className = `part-node ${selected ? "selected" : ""}`;
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
        node.dataset.partPath = part.path;
        node.innerHTML = `
          <div class="part-node-title">${escapeHtml(part.part_label || part.title)}</div>
          <div class="part-node-line">${part.primary_count} 字</div>
          <div class="part-node-line">${part.block_count || 0} 剧情块</div>
          <div class="part-node-line">${(part.sidecar?.part_reroll_slots || []).length} 次反馈</div>
        `;
        node.addEventListener("click", event => {
          event.stopPropagation();
          setPartFeedbackTarget(group, part);
        });
        cluster.appendChild(node);
      });
      els.nodes.appendChild(cluster);
    }

    function renderEdges() {
      els.edges.innerHTML = "";
      const baseGroups = state.groups.filter(group => group.kind !== "draft");
      const splitGroups = draftSplitGroups();
      const splitMemberIds = new Set();
      const splitFirstById = new Map();
      for (const items of splitGroups.values()) {
        items.forEach(item => splitMemberIds.add(item.id));
        if (items[0]) splitFirstById.set(items[0].id, items);
      }
      for (let index = 1; index < baseGroups.length; index += 1) {
        const from = baseGroups[index - 1];
        const to = baseGroups[index];
        const hasInterstitial = state.groups.some(group =>
          group.kind === "draft" &&
          group.route_mode === "interstitial" &&
          group.after_group_key === from.group_key &&
          group.before_group_key === to.group_key
        ) || Array.from(splitGroups.values()).some(items => {
          const first = items[0];
          const last = items[items.length - 1];
          return first?.route_mode === "interstitial" &&
            first.after_group_key === from.group_key &&
            last?.before_group_key === to.group_key;
        });
        if (!hasInterstitial) drawEdge(from, to, { stroke: "#2f7dff" });
      }
      for (const draft of state.groups.filter(group => group.kind === "draft")) {
        if (splitMemberIds.has(draft.id) && !splitFirstById.has(draft.id)) continue;
        const splitItems = splitFirstById.get(draft.id);
        const edgeDraft = splitItems?.[0] || draft;
        const lastSplitDraft = splitItems?.[splitItems.length - 1] || draft;
        const from = state.groups.find(group => group.group_key === draft.after_group_key);
        if (from) {
          drawEdge(from, edgeDraft, {
            stroke: edgeDraft.route_mode === "interstitial" ? "#2dd4bf" : "#ffbe5c",
            dash: edgeDraft.route_mode === "interstitial" ? "" : "7 7"
          });
        }
        if (lastSplitDraft.route_mode === "interstitial" && lastSplitDraft.before_group_key) {
          const to = state.groups.find(group => group.group_key === lastSplitDraft.before_group_key);
          if (to) drawEdge(edgeDraft, to, { stroke: "#2dd4bf" });
        }
      }
      if (state.dragDraftConnector) {
        drawPreviewEdge(state.dragDraftConnector.start, state.dragDraftConnector.current);
      }
    }

    function drawEdge(from, to, options = {}) {
      const a = groupEdgeRect(from);
      const b = groupEdgeRect(to);
      const x1 = a.x + a.width / 2;
      const y1 = a.y + a.height;
      const x2 = b.x + b.width / 2;
      const y2 = b.y;
      const mid = (y1 + y2) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
      path.setAttribute("stroke", options.stroke || "#2f7dff");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none");
      if (options.dash) path.setAttribute("stroke-dasharray", options.dash);
      els.edges.appendChild(path);
    }

    function drawPreviewEdge(start, current) {
      const midX = (start.x + current.x) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${current.y}, ${current.x} ${current.y}`);
      path.setAttribute("class", "edge-preview");
      els.edges.appendChild(path);
    }

    function renderInspector() {
      const group = selectedGroup();
      els.emptyHint.hidden = Boolean(group);
      els.inspectorContent.hidden = !group;
      if (!group) return;
      renderInspectorTabs(group);
      if (group.kind === "draft") {
        renderDraftInspector(group);
        return;
      }

      const part = selectedPart(group);
      document.getElementById("chapterNoPill").textContent = `第 ${displayChapterNo(group.chapter_no)} 章`;
      document.getElementById("partCountPill").textContent = `${group.part_count} 部分`;
      document.getElementById("charCountPill").textContent = `${group.total_chars} 字`;
      document.getElementById("inspectorTitle").textContent = group.title;
      document.getElementById("relativeDir").textContent = group.relative_dir || ".";

      if (part && state.selectedPartPath !== part.path) state.selectedPartPath = part.path;
      document.getElementById("partLabel").value = part?.part_label || part?.title || "";
      document.getElementById("sourcePath").value = part?.path || "";
      document.getElementById("sidecarPath").value = part?.sidecar_path || "";
      document.getElementById("generatePanelTitle").textContent = "剧情块";
      document.getElementById("generatePanelHint").textContent = "每个深色块是一段剧情，可单独选中、记录 reroll 目标和候选。";
      document.getElementById("blockCountPill").textContent = `${part?.block_count || 0} 块`;
      renderBlocks(part);
      loadHistory(part);
    }

    function renderInspectorTabs(group) {
      const workTab = document.getElementById("inspectorWorkTab");
      if (workTab) workTab.textContent = group?.kind === "draft" ? "生成" : "文本";
      document.querySelectorAll("#inspectorTabs button").forEach((button, index) => {
        button.classList.toggle("active", index === 0);
      });
    }

    function renderDraftInspector(group) {
      state.selectedPartPath = null;
      state.selectedBlockId = null;
      state.feedbackTarget = null;
      hideFloatingRerollPanel();
      const routeMode = group.route_mode === "interstitial" ? "interstitial" : "branch";
      const settings = {
        ...defaultDraftGenerationSettings(routeMode),
        ...(group.generation_settings || {})
      };
      const batch = group.generation_batch || {};
      const fromTitle = group.after_title || "上一节点";
      const toTitle = routeMode === "interstitial" && group.before_title ? group.before_title : "独立分支路线";
      const routeIntent = routeMode === "interstitial"
        ? "补足相邻章节之间的承接、转折和上下文连续。"
        : "从当前节点派生候选路线，保留主干事实，先不并回主线。";
      document.getElementById("chapterNoPill").textContent = "草稿";
      document.getElementById("partCountPill").textContent = routeMode === "interstitial" ? "插入草稿" : "分支草稿";
      document.getElementById("charCountPill").textContent = `${group.total_chars} 字`;
      document.getElementById("inspectorTitle").textContent = group.title;
      document.getElementById("relativeDir").textContent = routeMode === "interstitial" && group.before_title
        ? `插入：${group.after_title || "上一节点"} → ${group.before_title}`
        : `分支自：${group.after_title || "当前节点"}`;
      document.getElementById("partLabel").value = "续写草稿";
      document.getElementById("sourcePath").value = group.draft_file_path || "";
      document.getElementById("sidecarPath").value = ".story-canvas.folder.json";
      document.getElementById("generatePanelTitle").textContent = "生成草稿";
      document.getElementById("generatePanelHint").textContent = "草稿只记录生成意图和候选正文，不打开正式章节的重Roll反馈框。";
      document.getElementById("blockCountPill").textContent = "草稿";
      const list = document.getElementById("blockList");
      list.innerHTML = `
        <div class="draft-context-strip">
          <div class="row">
            <strong>上下文连接</strong>
            <span class="pill">${routeMode === "interstitial" ? "插入中间" : "独立分支"}</span>
            <span class="pill">${batch.version_count ? `版本 ${batch.version_index}/${batch.version_count}` : `${settings.version_count || 3} 个版本`}</span>
          </div>
          <div class="draft-route-map">
            <div class="draft-route-card">
              <div class="label">读取上游</div>
              <strong title="${escapeAttr(fromTitle)}">${escapeHtml(fromTitle)}</strong>
            </div>
            <div class="draft-route-arrow" aria-hidden="true">&rarr;</div>
            <div class="draft-route-card">
              <div class="label">${routeMode === "interstitial" ? "承接下游" : "输出路线"}</div>
              <strong title="${escapeAttr(toTitle)}">${escapeHtml(toTitle)}</strong>
            </div>
          </div>
          <div class="muted small">${escapeHtml(routeIntent)}</div>
        </div>
        <div class="draft-decision-panel">
          <div class="row">
            <strong>版本决策</strong>
            <span class="pill ${draftStatusPillClass(group.status)}">${escapeHtml(draftStatusLabel(group.status))}</span>
            ${batch.request_id ? `<span class="pill" title="${escapeAttr(batch.request_id)}">批次 ${escapeHtml(String(batch.version_index || "-"))}/${escapeHtml(String(batch.version_count || "-"))}</span>` : ""}
            ${group.decided_at ? `<span class="muted small">${escapeHtml(formatTime(group.decided_at))}</span>` : ""}
          </div>
          <div class="muted small">采纳本版只把它标记为生产候选，不会自动覆盖主线正文；同批次其他版本会标为放弃，仍保留文件。</div>
          <textarea id="draftDecisionNote" placeholder="可选：记录采纳或放弃这一版的原因。">${escapeHtml(group.decision_note || "")}</textarea>
          <div class="row">
            <button class="primary" data-draft-decision="selected">采纳本版</button>
            <button data-draft-decision="rejected">放弃本版</button>
            <button data-draft-decision="draft">恢复草稿</button>
            <span class="muted small" id="draftDecisionStatus"></span>
          </div>
        </div>
        <div class="draft-editor">
          <div>
            <div class="label">草稿标题</div>
            <input id="draftTitleInput" value="${escapeAttr(group.title)}">
          </div>
          <div class="generation-request">
            <div class="row">
              <strong>续写生成</strong>
              <span class="pill">${routeMode === "interstitial" ? "插入中间" : "独立分支"}</span>
            </div>
            <div class="draft-options">
              <div>
                <div class="label">使用 Agent / 文字模型</div>
                <select id="draftAgentSelect">
                  ${agentOptionsHtml(settings.agent)}
                </select>
              </div>
              <div>
                <div class="label">模型</div>
                <input id="draftModelInput" value="${escapeAttr(settings.model || "")}">
              </div>
              <div>
                <div class="label">生成版本数</div>
                <input id="draftVersionCount" type="number" min="1" max="8" step="1" value="${settings.version_count || 3}">
              </div>
              <div>
                <div class="label">目标字数</div>
                <input id="draftTargetChars" type="number" min="200" max="50000" step="100" value="${settings.target_chars || 3000}">
              </div>
              <div>
                <div class="label">拆成章节数</div>
                <select id="draftSplitCount">
                  ${countOption(1, settings.split_count)}
                  ${countOption(2, settings.split_count)}
                  ${countOption(3, settings.split_count)}
                  ${countOption(4, settings.split_count)}
                </select>
              </div>
              <div>
                <div class="label">生成形态</div>
                <select id="draftSplitMode">
                  <option value="single_segment" ${settings.split_mode === "single_segment" ? "selected" : ""}>先生成一段</option>
                  <option value="chapter_nodes" ${settings.split_mode === "chapter_nodes" ? "selected" : ""}>直接按章节拆</option>
                </select>
              </div>
            </div>
            <div>
              <div class="label">草稿方向 / 用户意见</div>
              <textarea id="draftPromptGoal">${escapeHtml(settings.prompt_goal || "")}</textarea>
            </div>
            <div class="row">
              <button id="saveGenerationSettingsBtn">保存生成设置</button>
              <button class="primary" id="requestDraftGenerationBtn">开始生成</button>
              <span class="muted small" id="draftGenerationStatus"></span>
            </div>
            <div class="muted small">Gemini 会直接生成候选草稿节点；其他模型先写入待外部生成请求，后续由对应 Agent 执行。</div>
          </div>
          <div>
            <div class="label">未拆章正文</div>
            <textarea id="draftTextInput">${escapeHtml(group.draft_text || "")}</textarea>
          </div>
          <div class="row">
            <button class="primary" id="saveDraftBtn">保存草稿</button>
            <span class="muted small" id="draftSaveStatus"></span>
          </div>
          <div class="draft-split">
            <div class="row">
              <strong>拆章</strong>
              <span class="pill">Markdown 标题 / --- / 拆章数</span>
            </div>
            <textarea id="draftSplitInput">${escapeHtml(group.draft_text || "")}</textarea>
            <div class="row">
              <button id="splitDraftBtn">拆成草稿章节</button>
              <span class="muted small" id="draftSplitStatus"></span>
            </div>
          </div>
        </div>
      `;
      document.getElementById("saveDraftBtn").addEventListener("click", () => saveDraftNode(group));
      document.getElementById("saveGenerationSettingsBtn").addEventListener("click", () => saveDraftNode(group, { onlySettings: true }));
      document.getElementById("requestDraftGenerationBtn").addEventListener("click", () => generateDraftCandidates(group));
      document.getElementById("splitDraftBtn").addEventListener("click", () => splitDraftNode(group));
      list.querySelectorAll("[data-draft-decision]").forEach(button => {
        button.addEventListener("click", () => setDraftDecision(group, button.dataset.draftDecision, button));
      });
      document.getElementById("draftAgentSelect").addEventListener("change", event => {
        const modelInput = document.getElementById("draftModelInput");
        if (modelInput) modelInput.value = defaultModelForAgent(event.target.value);
      });
      document.getElementById("draftSplitCount").addEventListener("change", event => {
        const splitMode = document.getElementById("draftSplitMode");
        if (splitMode && Number(event.target.value) > 1) splitMode.value = "chapter_nodes";
      });
      document.getElementById("historyList").innerHTML = `<div class="empty">草稿保存会写入草稿文件，并在账本留下记录。</div>`;
    }

    function renderDraftCandidateList(candidates = []) {
      const items = Array.isArray(candidates) ? candidates.slice().reverse() : [];
      if (!items.length) {
        return `
          <div class="candidate-list">
            <div class="empty">还没有候选正文。选择 Gemini 后点击“生成候选”，或先记录请求交给外部模型处理。</div>
          </div>
        `;
      }
      return `
        <div class="candidate-list">
          <div class="row">
            <strong>候选正文</strong>
            <span class="pill">${items.length} 个</span>
          </div>
          ${items.map(candidate => `
            <div class="candidate-card">
              <div class="row">
                <span class="pill">${escapeHtml(candidate.status || "candidate")}</span>
                <span class="pill" title="${escapeAttr(candidate.model || "")}">${escapeHtml(candidate.model || candidate.agent || "")}</span>
                <span class="muted small">${candidate.candidate_chars || 0} 字</span>
              </div>
              <pre class="candidate-text">${escapeHtml(candidate.candidate_text || candidate.preview || "")}</pre>
              <button data-use-draft-candidate="${escapeAttr(candidate.version_id)}">填入草稿正文</button>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderBlocks(part) {
      const list = document.getElementById("blockList");
      list.innerHTML = "";
      if (!part) {
        list.innerHTML = `<div class="empty">这个节点没有可展示的文章部分。</div>`;
        renderFloatingReroll();
        return;
      }
      const partSlots = part.sidecar?.part_reroll_slots || [];
      if (partSlots.length) {
        const partCandidatePanel = document.createElement("div");
        partCandidatePanel.className = "candidate-list";
        partCandidatePanel.innerHTML = `
          <div class="row">
            <strong>部分重Roll候选</strong>
            <span class="pill">${partSlots.length} 个</span>
          </div>
          ${renderRerollSlotCards(partSlots)}
        `;
        list.appendChild(partCandidatePanel);
      }
      for (const block of part.blocks) {
        const selected = block.id === state.selectedBlockId;
        const wrapper = document.createElement("div");
        wrapper.className = `block-entry ${selected ? "selected" : ""}`;
        const blockEl = document.createElement("div");
        blockEl.className = `story-block ${selected ? "selected" : ""}`;
        blockEl.innerHTML = `
          <div class="block-gutter">
            <div>${escapeHtml(block.id)}</div>
            <div>L${block.start_line}-${block.end_line}</div>
            <div>${block.primary_count}字</div>
            <div>${(block.reroll_slots || []).length}次</div>
          </div>
          <pre class="block-text">${escapeHtml(block.text)}</pre>
        `;
        blockEl.addEventListener("click", () => {
          setBlockFeedbackTarget(part, block.id);
        });
        wrapper.appendChild(blockEl);
        if ((block.reroll_slots || []).length) {
          wrapper.insertAdjacentHTML("beforeend", `
            <div class="candidate-list">
              <div class="row">
                <strong>${escapeHtml(block.id)} 重Roll候选</strong>
                <span class="pill">${block.reroll_slots.length} 个</span>
              </div>
              ${renderRerollSlotCards(block.reroll_slots)}
            </div>
          `);
        }
        list.appendChild(wrapper);
      }
    }

    function renderRerollSlotCards(slots = []) {
      return slots.slice().reverse().map(slot => `
        <div class="candidate-card">
          <div class="row">
            <span class="pill">${escapeHtml(slot.status || "pending")}</span>
            <span class="pill" title="${escapeAttr(slot.model || "")}">${escapeHtml(slot.model || slot.agent || "")}</span>
            <span class="muted small">${slot.candidate_chars || 0} 字</span>
          </div>
          <div class="muted small">${escapeHtml(slot.goal || "")}</div>
          ${slot.candidate_text
            ? `<pre class="candidate-text">${escapeHtml(slot.candidate_text)}</pre>`
            : `<div class="empty">已记录反馈，等待所选模型生成候选。</div>`}
        </div>
      `).join("");
    }

    async function loadHistory(part) {
      const list = document.getElementById("historyList");
      if (!part) {
        list.innerHTML = `<div class="empty">选择一个文章部分后显示历史。</div>`;
        return;
      }
      const requestedPath = part.path;
      list.innerHTML = `<div class="empty">正在读取历史...</div>`;
      try {
        const history = await fetchJson(`/api/history?path=${encodeURIComponent(requestedPath)}`);
        const currentPart = selectedPart(selectedGroup());
        if (!currentPart || currentPart.path !== requestedPath) return;
        renderHistory(history);
      } catch (error) {
        list.innerHTML = `<div class="empty">历史读取失败：${escapeHtml(error.message)}</div>`;
      }
    }

    function renderHistory(history) {
      const list = document.getElementById("historyList");
      const sourceItems = history.source_history.slice(0, 8).map(item => historyItemHtml(item, "恢复正文"));
      const sidecarItems = history.sidecar_history.slice(0, 8).map(item => historyItemHtml(item, "恢复JSON"));
      const ledgerItems = history.ledger.slice(0, 12).map(entry => `
        <div class="history-item">
          <div class="row">
            <span class="pill">${escapeHtml(entry.action || "record")}</span>
            <span class="muted small">${escapeHtml(formatTime(entry.ts))}</span>
          </div>
          <div class="muted small">${escapeHtml(entry.target_path || "")}</div>
          ${entry.history_path ? `<div class="muted small">快照：${escapeHtml(entry.history_path)}</div>` : ""}
        </div>
      `);
      list.innerHTML = `
        <div class="stack">
          <strong>正文快照</strong>
          ${sourceItems.length ? sourceItems.join("") : `<div class="empty">暂无正文快照。</div>`}
          <strong>Sidecar 快照</strong>
          ${sidecarItems.length ? sidecarItems.join("") : `<div class="empty">暂无 sidecar 快照。</div>`}
          <strong>账本</strong>
          ${ledgerItems.length ? ledgerItems.join("") : `<div class="empty">暂无账本记录。</div>`}
        </div>
      `;
    }

    function historyItemHtml(item, label) {
      return `
        <div class="history-item">
          <div class="row">
            <span class="pill">${escapeHtml(item.kind)}</span>
            <button data-restore-kind="${escapeAttr(item.kind)}" data-history-path="${escapeAttr(item.path)}">${escapeHtml(label)}</button>
          </div>
          <div><strong>${escapeHtml(item.name)}</strong></div>
          <div class="muted small">${escapeHtml(formatTime(item.mtime))} · ${item.size} bytes</div>
          <div class="muted small">${escapeHtml(item.path)}</div>
        </div>
      `;
    }

    async function restoreFromHistory(event) {
      const button = event.target.closest("[data-restore-kind]");
      if (!button) return;
      const group = selectedGroup();
      const part = group ? selectedPart(group) : null;
      if (!part) return;
      const kind = button.dataset.restoreKind;
      const historyPath = button.dataset.historyPath;
      button.disabled = true;
      button.textContent = "恢复中";
      const result = await fetchJson("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: part.path, kind, history_path: historyPath })
      });
      setStatus(`已恢复 ${result.target_path}，正在刷新页面。`);
      await scanFolder({ preserve: true, message: "已恢复历史版本，正在刷新...", doneMessage: "历史版本已恢复，页面内容已同步。" });
    }

    async function saveDraftNode(group, options = {}) {
      if (!group?.draft_id) return;
      const title = document.getElementById("draftTitleInput")?.value.trim() || group.title;
      const text = document.getElementById("draftTextInput")?.value || "";
      const status = document.getElementById("draftSaveStatus");
      const settings = collectDraftGenerationSettings(group);
      const generationStatus = document.getElementById("draftGenerationStatus");
      if (options.onlySettings) {
        if (generationStatus) generationStatus.textContent = "保存中...";
      } else if (status) {
        status.textContent = "保存中...";
      }
      await pushCanvasUndoPoint(options.onlySettings ? "保存草稿生成设置" : "保存草稿");
      const result = await fetchJson("/api/draft-node/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: state.root,
          draft_id: group.draft_id,
          title,
          text,
          generation_settings: settings
        })
      });
      if (options.onlySettings) {
        if (generationStatus) generationStatus.textContent = result.ok ? "生成设置已保存。" : `失败：${result.error || "未知错误"}`;
      } else if (status) {
        status.textContent = result.ok ? "已保存。" : `失败：${result.error || "未知错误"}`;
      }
      state.selectedGroupId = group.id;
      await scanFolder({
        preserve: true,
        message: "草稿已保存，正在刷新画布...",
        doneMessage: "续写草稿已保存并同步到画布。"
      });
      scheduleWorkspaceAutosave();
    }

    async function setDraftDecision(group, decision, button) {
      if (!group?.draft_id) return;
      const status = document.getElementById("draftDecisionStatus");
      const note = document.getElementById("draftDecisionNote")?.value || "";
      if (status) status.textContent = "正在保存决策...";
      setButtonBusy(button, true, "保存中");
      try {
        await pushCanvasUndoPoint(`标记草稿：${draftStatusLabel(decision)}`);
        const result = await fetchJson("/api/draft-node/decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: state.root,
            draft_id: group.draft_id,
            decision,
            note,
            exclusive_batch: decision === "selected"
          })
        });
        if (status) status.textContent = `已标记为：${draftStatusLabel(result.decision)}。`;
        state.selectedGroupId = result.group_id || group.id;
        await scanFolder({
          preserve: true,
          message: "草稿决策已写入，正在刷新画布...",
          doneMessage: "草稿决策已保存到索引和账本。"
        });
        state.selectedGroupId = result.group_id || group.id;
        render();
        scheduleWorkspaceAutosave();
      } catch (error) {
        if (status) status.textContent = `决策保存失败：${error.message}`;
      } finally {
        setButtonBusy(button, false);
      }
    }

    async function requestDraftGeneration(group) {
      if (!group?.draft_id) return;
      const status = document.getElementById("draftGenerationStatus");
      if (status) status.textContent = "正在记录请求...";
      await pushCanvasUndoPoint("记录草稿生成请求");
      const result = await fetchJson("/api/draft-node/generate-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: state.root,
          draft_id: group.draft_id,
          generation_settings: collectDraftGenerationSettings(group)
        })
      });
      if (status) {
        status.textContent = result.ok
          ? `已记录请求：${result.request.agent} / ${result.request.version_count} 版 / ${result.request.target_chars}字。`
          : `失败：${result.error || "未知错误"}`;
      }
      state.selectedGroupId = group.id;
      await scanFolder({
        preserve: true,
        message: "生成请求已记录，正在刷新画布...",
        doneMessage: "生成请求已写入账本。"
      });
      scheduleWorkspaceAutosave();
    }

    async function generateDraftCandidates(group) {
      if (!group?.draft_id) return;
      const status = document.getElementById("draftGenerationStatus");
      const button = document.getElementById("requestDraftGenerationBtn");
      const settings = collectDraftGenerationSettings(group);
      if (status) {
        status.textContent = draftGenerationStartMessage(settings);
      }
      setButtonBusy(button, true, "生成中");
      try {
        await pushCanvasUndoPoint("生成草稿版本节点");
        const result = await fetchJson("/api/draft-node/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: state.root,
            draft_id: group.draft_id,
            generation_settings: settings
          })
        });
        const generatedCount = result.generated_draft_ids?.length || result.candidates?.length || 0;
        const firstGeneratedGroupId = result.group_ids?.[0] || group.id;
        if (status) {
          status.textContent = result.direct_generation
            ? `已生成 ${generatedCount} 个版本节点：${result.request.model}。`
            : result.request?.codex_bridge_task_id
              ? `已写入 Codex 桥接任务：${result.request.codex_bridge_task_id}。`
            : `已记录待外部生成：${result.request.agent} / ${result.request.model}。`;
        }
        state.selectedGroupId = firstGeneratedGroupId;
        await scanFolder({
          preserve: true,
          message: "草稿版本节点已写入索引，正在刷新画布...",
          doneMessage: result.direct_generation
            ? `已在画布上生成 ${generatedCount} 个草稿版本节点。`
            : result.request?.codex_bridge_task_id
              ? "Codex 桥接任务已写入队列。"
              : "生成请求已写入账本。"
        });
        state.selectedGroupId = firstGeneratedGroupId;
        render();
        loadCodexBridgeTasks({ quiet: true }).catch(() => {});
        scheduleWorkspaceAutosave();
      } catch (error) {
        if (status) status.textContent = `生成失败：${error.message}`;
      } finally {
        setButtonBusy(button, false);
      }
    }

    function collectDraftGenerationSettings(group) {
      const agent = document.getElementById("draftAgentSelect")?.value || group.generation_settings?.agent || "trae-main";
      const splitCount = clampInteger(document.getElementById("draftSplitCount")?.value, 1, 4, 1);
      const splitModeInput = document.getElementById("draftSplitMode")?.value || "single_segment";
      return {
        agent,
        model: document.getElementById("draftModelInput")?.value.trim() || defaultModelForAgent(agent),
        version_count: clampInteger(document.getElementById("draftVersionCount")?.value, 1, 8, 3),
        target_chars: clampInteger(document.getElementById("draftTargetChars")?.value, 200, 50000, 3000),
        split_count: splitCount,
        split_mode: splitCount > 1 ? "chapter_nodes" : splitModeInput,
        prompt_goal: document.getElementById("draftPromptGoal")?.value || ""
      };
    }

    function defaultModelForAgent(agent) {
      if (agent === "claude-opus-4-7") return "claude-opus-4-7";
      if (agent === "deepseek-v4-pro-260425") return "deepseek-v4-pro-260425";
      if (agent === "codex-gpt-5") return "gpt-5";
      if (agent === "gemini-flash-latest" || agent === "gemini-3.5-flash") return "gemini-flash-latest";
      if (agent === "manual") return "manual";
      return "trae-main";
    }

    function isGeminiSettings(settings = {}) {
      const agent = String(settings.agent || "").toLowerCase();
      const model = String(settings.model || "").toLowerCase();
      return agent.startsWith("gemini-") || model.startsWith("gemini-");
    }

    function draftGenerationStartMessage(settings = {}) {
      const status = agentStatusFor(settings.agent);
      if (status?.mode === "bridge-queue") return "正在写入 Codex 桥接任务...";
      if (status?.mode === "direct-api" && status.available) return `正在生成 ${settings.version_count || 1} 个草稿版本...`;
      if (status?.mode === "direct-api" && !status.available) return `${status.label || settings.agent} 未配置，将记录为待外部生成请求。`;
      if (isGeminiSettings(settings)) return `正在生成 ${settings.version_count || 1} 个草稿版本...`;
      return "正在记录生成请求...";
    }

    function agentStatusFor(agentId) {
      return (state.agentStatus || []).find(item => item.id === agentId) || null;
    }

    async function splitDraftNode(group) {
      if (!group?.draft_id) return;
      const status = document.getElementById("draftSplitStatus");
      const button = document.getElementById("splitDraftBtn");
      const raw = document.getElementById("draftSplitInput")?.value || document.getElementById("draftTextInput")?.value || "";
      const requestedCount = clampInteger(document.getElementById("draftSplitCount")?.value, 1, 4, 1);
      const chapters = expandDraftChapters(parseDraftChapters(raw, group.title), requestedCount, group.title);
      if (!chapters.length) {
        if (status) status.textContent = "先写入可拆分的正文。";
        return;
      }
      if (status) status.textContent = `正在拆成 ${chapters.length} 个草稿节点...`;
      setButtonBusy(button, true, "拆章中");
      try {
        await pushCanvasUndoPoint("拆分草稿章节");
        const result = await fetchJson("/api/draft-node/split", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: state.root,
            draft_id: group.draft_id,
            chapters,
            generation_settings: collectDraftGenerationSettings(group)
          })
        });
        state.selectedGroupId = result.group_id;
        state.selectedPartPath = null;
        state.selectedBlockId = null;
        state.feedbackTarget = null;
        await scanFolder({
          preserve: true,
          message: "草稿正在拆成章节节点...",
          doneMessage: `已拆成 ${chapters.length} 个草稿章节节点。`
        });
        state.selectedGroupId = result.group_id;
        render();
        scheduleWorkspaceAutosave();
      } catch (error) {
        if (status) status.textContent = `拆章失败：${error.message}`;
      } finally {
        setButtonBusy(button, false);
      }
    }

    function parseDraftChapters(raw, fallbackTitle) {
      const text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      if (!text) return [];
      const chapters = [];
      let current = { title: "", lines: [] };
      const pushCurrent = () => {
        const body = current.lines.join("\n").trim();
        if (!body) {
          current = { title: current.title, lines: [] };
          return;
        }
        chapters.push({
          title: current.title || `${fallbackTitle || "续写草稿"} ${chapters.length + 1}`,
          text: body
        });
        current = { title: "", lines: [] };
      };
      for (const line of text.split("\n")) {
        const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
        if (heading) {
          pushCurrent();
          current = { title: heading[1].trim(), lines: [] };
          continue;
        }
        if (/^\s*-{3,}\s*$/.test(line)) {
          pushCurrent();
          continue;
        }
        current.lines.push(line);
      }
      pushCurrent();
      return chapters.length ? chapters : [{ title: fallbackTitle || "续写草稿", text }];
    }

    function expandDraftChapters(chapters, requestedCount, fallbackTitle) {
      if (!chapters.length || requestedCount <= 1 || chapters.length !== 1) return chapters;
      const source = chapters[0];
      const paragraphs = source.text
        .split(/\n{2,}/u)
        .map(item => item.trim())
        .filter(Boolean);
      if (paragraphs.length < requestedCount) return chapters;
      const result = [];
      const perChunk = Math.ceil(paragraphs.length / requestedCount);
      for (let index = 0; index < requestedCount; index += 1) {
        const chunk = paragraphs.slice(index * perChunk, (index + 1) * perChunk).join("\n\n").trim();
        if (!chunk) continue;
        result.push({
          title: `${fallbackTitle || source.title || "续写草稿"} ${index + 1}`,
          text: chunk
        });
      }
      return result.length > 1 ? result : chapters;
    }

    async function saveFloatingReroll(options = {}) {
      const target = state.feedbackTarget;
      if (!target) return;
      const goal = els.floatingFeedback.value.trim();
      const key = currentFeedbackKey();
      if (key) state.feedbackDrafts[key] = els.floatingFeedback.value;
      if (!goal) {
        els.floatingStatus.textContent = "先写反馈，再重Roll。";
        return;
      }
      const generateNow = options.generate !== false;
      const generationSettings = collectFloatingGenerationSettings();
      generationSettings.prompt_goal = goal;
      state.rerollSettings = { ...generationSettings, prompt_goal: "" };
      localStorage.setItem("storyCanvas.rerollSettings", JSON.stringify(state.rerollSettings));
      els.floatingStatus.textContent = generateNow && isGeminiSettings(generationSettings)
        ? "正在调用 Gemini 生成候选..."
        : "正在记录...";

      if (target.type === "chapter") {
        const group = state.groups.find(item => item.id === target.groupId);
        if (!group) return;
        const result = await fetchJson("/api/chapter-reroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: state.root,
            group_key: group.group_key,
            chapter_no: group.chapter_no,
            title: group.title,
            goal,
            directive_source: "story-canvas-reroll-box",
            generate_now: generateNow,
            generation_settings: generationSettings,
            part_paths: group.parts.map(part => part.path)
          })
        });
        els.floatingStatus.textContent = result.ok
          ? (result.direct_generation ? `整章已生成 ${result.slots.length} 个候选，并写入账本。` : "整章反馈已写入账本。")
          : `失败：${result.error || "未知错误"}`;
        loadHistory(selectedPart(group));
        return;
      }

      if (target.type === "part") {
        const group = state.groups.find(item => item.id === target.groupId);
        const part = group?.parts.find(item => item.path === target.partPath);
        if (!group || !part) return;
        const result = await fetchJson("/api/part-reroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: part.path,
            goal,
            directive_source: "story-canvas-reroll-box",
            generate_now: generateNow,
            generation_settings: generationSettings,
            candidate_text: ""
          })
        });
        els.floatingStatus.textContent = result.ok
          ? (result.direct_generation ? `部分已生成 ${result.slots.length} 个候选。` : "部分反馈已写入同目录 JSON。")
          : `失败：${result.error || "未知错误"}`;
        state.selectedGroupId = group.id;
        state.selectedPartPath = part.path;
        state.selectedBlockId = null;
        state.feedbackTarget = { ...target };
        await scanFolder({
          preserve: true,
          message: "已提交部分重Roll反馈，正在刷新页面内容...",
          doneMessage: result.direct_generation
            ? `已把 ${part.part_label || part.title} 的候选写入 ${result.sidecar_path}。`
            : `已把 ${part.part_label || part.title} 的重Roll反馈写入 ${result.sidecar_path}。`
        });
        return;
      }

      const group = state.groups.find(item => item.id === target.groupId);
      const part = group?.parts.find(item => item.path === target.partPath);
      const blockId = target.blockId;
      if (!group || !part || !blockId) return;
      const result = await fetchJson("/api/block-reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: part.path,
          block_id: blockId,
          goal,
          directive_source: "story-canvas-reroll-box",
          generate_now: generateNow,
          generation_settings: generationSettings,
          candidate_text: ""
        })
      });
      els.floatingStatus.textContent = result.ok
        ? (result.direct_generation ? `已生成 ${result.slots.length} 个候选，正在同步...` : "已记录，正在同步...")
        : `失败：${result.error || "未知错误"}`;
      state.selectedGroupId = group.id;
      state.selectedPartPath = part.path;
      state.selectedBlockId = result.block?.id || blockId;
      state.feedbackTarget = { ...target, blockId: state.selectedBlockId };
      await scanFolder({
        preserve: true,
        message: "已提交重Roll反馈，正在刷新页面内容...",
        doneMessage: result.direct_generation
          ? `已把 ${blockId} 的候选写入 ${result.sidecar_path}。`
          : `已把 ${blockId} 的重Roll反馈写入 ${result.sidecar_path}。`
      });
    }

    function toggleLive() {
      state.liveEnabled = !state.liveEnabled;
      document.getElementById("liveStatus").textContent = `实时同步：${state.liveEnabled ? "开" : "关"}`;
      document.getElementById("liveStatus").className = `pill ${state.liveEnabled ? "good" : "warn"}`;
      document.getElementById("toggleLiveBtn").textContent = state.liveEnabled ? "暂停实时" : "开启实时";
    }

    function toggleSidebar() {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem("storyCanvas.sidebarCollapsed", state.sidebarCollapsed ? "1" : "0");
      applySidebarState();
      scheduleWorkspaceAutosave();
    }

    function applySidebarState() {
      els.appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
      els.sidebar.classList.toggle("collapsed", state.sidebarCollapsed);
      applyLayoutState();
      const button = document.getElementById("toggleSidebarBtn");
      button.textContent = state.sidebarCollapsed ? "展开" : "收起";
      button.title = state.sidebarCollapsed ? "展开左侧栏" : "折叠左侧栏";
      button.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
    }

    function applyLayoutState() {
      const sidebarWidth = state.sidebarCollapsed ? 48 : 310;
      const inspectorWidth = clamp(state.inspectorWidth, 360, 820);
      els.appShell.style.gridTemplateColumns = `${sidebarWidth}px minmax(480px, 1fr) ${inspectorWidth}px`;
    }

    function startInspectorResize(event) {
      event.preventDefault();
      state.resizeInspector = {
        startX: event.clientX,
        startWidth: state.inspectorWidth
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    async function checkForUpdates() {
      if (
        !state.liveEnabled ||
        state.isScanning ||
        state.isRestoringCanvasState ||
        state.dragCanvas ||
        state.dragNode ||
        state.dragDraftConnector ||
        state.resizeInspector ||
        !state.lastFingerprint ||
        !state.root
      ) return;
      try {
        const data = await fetchJson(`/api/fingerprint?root=${encodeURIComponent(state.root)}`);
        if (data.fingerprint && data.fingerprint !== state.lastFingerprint) {
          await scanFolder({
            preserve: true,
            message: "检测到文件变化，正在实时刷新...",
            doneMessage: "已检测到外部变化，页面内容已同步。"
          });
        }
      } catch (error) {
        setStatus(`实时同步检查失败：${error.message}`);
      }
    }

    function handleCanvasShortcut(event) {
      if (event.key === "Delete" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        deleteSelectedDraftNode();
        return;
      }
      if (!event.ctrlKey || event.key.toLowerCase() !== "z") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      if (event.altKey) redoCanvasState();
      else undoCanvasState();
    }

    function isEditableTarget(target) {
      return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
    }

    async function pushCanvasUndoPoint(label) {
      if (state.isRestoringCanvasState) return;
      try {
        const data = await fetchJson(`/api/folder-index-state?root=${encodeURIComponent(state.root)}`);
        state.undoStack.push({
          label,
          captured_at: new Date().toISOString(),
          state: data.state
        });
        if (state.undoStack.length > 40) state.undoStack.shift();
        state.redoStack = [];
      } catch (error) {
        setStatus(`撤销快照失败：${error.message}`);
      }
    }

    async function undoCanvasState() {
      if (!state.undoStack.length) {
        setStatus("没有可撤回的画布修改。");
        return;
      }
      const previous = state.undoStack.pop();
      const current = await fetchJson(`/api/folder-index-state?root=${encodeURIComponent(state.root)}`);
      state.redoStack.push({
        label: previous.label,
        captured_at: new Date().toISOString(),
        state: current.state
      });
      await restoreCanvasState(previous.state, `已撤回：${previous.label || "上一步修改"}`);
    }

    async function redoCanvasState() {
      if (!state.redoStack.length) {
        setStatus("没有可重做的画布修改。");
        return;
      }
      const next = state.redoStack.pop();
      const current = await fetchJson(`/api/folder-index-state?root=${encodeURIComponent(state.root)}`);
      state.undoStack.push({
        label: next.label,
        captured_at: new Date().toISOString(),
        state: current.state
      });
      await restoreCanvasState(next.state, `已重做：${next.label || "上一步修改"}`);
    }

    async function restoreCanvasState(snapshot, message) {
      state.isRestoringCanvasState = true;
      try {
        await fetchJson("/api/folder-index-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: state.root,
            state: snapshot,
            action: "restore-folder-index-state",
            reason: message
          })
        });
        await scanFolder({ preserve: true, message: "正在恢复画布状态...", doneMessage: message });
        setStatus(message);
      } finally {
        state.isRestoringCanvasState = false;
      }
    }

    async function deleteSelectedDraftNode() {
      const group = selectedGroup();
      if (!group) return;
      if (group.kind !== "draft") {
        setStatus("Delete 只会删除续写草稿节点；正式章节不会被删除。");
        return;
      }
      await pushCanvasUndoPoint("删除草稿节点");
      const fallbackId = state.groups.find(item => item.group_key === group.after_group_key)?.id || null;
      const result = await fetchJson("/api/draft-node/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root: state.root,
          draft_id: group.draft_id
        })
      });
      if (!result.ok) {
        setStatus(`删除失败：${result.error || "未知错误"}`);
        return;
      }
      state.selectedGroupId = fallbackId;
      state.selectedPartPath = null;
      state.selectedBlockId = null;
      state.feedbackTarget = null;
      await scanFolder({
        preserve: true,
        message: "正在删除草稿节点...",
        doneMessage: "草稿节点已从画布移除，草稿文件保留在磁盘以便撤回。"
      });
      if (fallbackId && state.groups.some(item => item.id === fallbackId)) state.selectedGroupId = fallbackId;
      render();
      scheduleWorkspaceAutosave();
    }

    function selectGroup(id, rerender = true) {
      const group = state.groups.find(item => item.id === id);
      if (!group) return;
      state.selectedGroupId = id;
      if (!group.parts.some(part => part.path === state.selectedPartPath)) {
        state.selectedPartPath = group.parts[0]?.path || null;
      }
      state.selectedBlockId = null;
      state.feedbackTarget = null;
      scheduleWorkspaceAutosave();
      if (rerender) render();
    }

    function setChapterFeedbackTarget(group, options = {}) {
      if (!group) return;
      if (group.kind === "draft") {
        selectGroup(group.id);
        return;
      }
      state.selectedGroupId = group.id;
      if (!group.parts.some(part => part.path === state.selectedPartPath)) {
        state.selectedPartPath = group.parts[0]?.path || null;
      }
      state.selectedBlockId = null;
      state.feedbackTarget = {
        type: "chapter",
        groupId: group.id,
        anchor: options.anchor || "node"
      };
      scheduleWorkspaceAutosave();
      render();
    }

    function setPartFeedbackTarget(group, part) {
      if (!group || !part) return;
      if (group.kind === "draft") {
        selectGroup(group.id);
        return;
      }
      state.selectedGroupId = group.id;
      state.selectedPartPath = part.path;
      state.selectedBlockId = null;
      state.feedbackTarget = {
        type: "part",
        groupId: group.id,
        partPath: part.path,
        anchor: "part"
      };
      scheduleWorkspaceAutosave();
      render();
    }

    function setBlockFeedbackTarget(part, blockId) {
      const group = selectedGroup();
      if (!group || !part || !blockId) return;
      if (group.kind === "draft") {
        selectGroup(group.id);
        return;
      }
      state.selectedGroupId = group.id;
      state.selectedPartPath = part.path;
      state.selectedBlockId = blockId;
      state.feedbackTarget = {
        type: "block",
        groupId: group.id,
        partPath: part.path,
        blockId
      };
      scheduleWorkspaceAutosave();
      renderBlocks(part);
      renderFloatingReroll();
    }

    function clearFeedbackTarget() {
      const shouldRefreshBlocks = Boolean(state.feedbackTarget || state.selectedBlockId);
      state.selectedBlockId = null;
      state.feedbackTarget = null;
      const group = selectedGroup();
      const part = group ? selectedPart(group) : null;
      if (shouldRefreshBlocks && part) renderBlocks(part);
      els.floatingReroll.hidden = true;
      els.floatingStatus.textContent = "";
      scheduleWorkspaceAutosave();
      renderFloatingReroll();
    }

    function lockGroupClick(groupIds, durationMs = 350) {
      const ids = (Array.isArray(groupIds) ? groupIds : [groupIds])
        .filter(Boolean)
        .map(String);
      if (!ids.length) return;
      state.suppressClick = {
        groupIds: ids,
        groupId: ids[0],
        until: Date.now() + durationMs
      };
    }

    function consumeSuppressedGroupClick(groupId) {
      const suppressed = state.suppressClick;
      if (!suppressed) return false;
      if (Date.now() > suppressed.until) {
        state.suppressClick = null;
        return false;
      }
      const ids = Array.isArray(suppressed.groupIds)
        ? suppressed.groupIds
        : [suppressed.groupId];
      if (!ids.includes(String(groupId))) return false;
      state.suppressClick = null;
      return true;
    }

    function restoreFeedbackTarget(target) {
      if (!target) return null;
      const group = state.groups.find(item => item.id === target.groupId);
      if (!group) return null;
      if (group.kind === "draft") return null;
      if (target.type === "chapter") return { ...target };
      if (target.type === "part") {
        if (!group.parts.some(item => item.path === target.partPath)) return null;
        return { ...target };
      }
      if (target.type === "block") {
        const part = group.parts.find(item => item.path === target.partPath);
        if (!part?.blocks?.some(item => item.id === target.blockId)) return null;
        state.selectedBlockId = target.blockId;
        return { ...target };
      }
      return null;
    }

    function selectedGroup() {
      return state.groups.find(group => group.id === state.selectedGroupId) || null;
    }

    function selectedPart(group) {
      if (!group) return null;
      return group.parts.find(part => part.path === state.selectedPartPath) || group.parts[0] || null;
    }

    function toggleExpanded(id) {
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      scheduleWorkspaceAutosave();
      renderNodesOnly();
    }

    function zoomBy(factor) {
      state.transform.scale = Math.max(0.4, Math.min(1.8, state.transform.scale * factor));
      renderTransform();
      scheduleWorkspaceAutosave();
    }

    function renderFloatingReroll() {
      if (selectedGroup()?.kind === "draft") {
        hideFloatingRerollPanel();
        return;
      }
      const target = state.feedbackTarget;
      if (!target) {
        hideFloatingRerollPanel();
        return;
      }

      const context = feedbackContext(target);
      if (!context) {
        hideFloatingRerollPanel();
        return;
      }

      els.floatingReroll.hidden = false;
      document.getElementById("floatingRerollLabel").textContent = context.label;
      const key = currentFeedbackKey();
      if (els.floatingFeedback.dataset.key !== key) {
        els.floatingFeedback.dataset.key = key;
        els.floatingFeedback.value = state.feedbackDrafts[key] || "";
        els.floatingStatus.textContent = "";
      }
      syncFloatingGenerationControls();

      const anchorRect = context.anchor?.getBoundingClientRect();
      if (!anchorRect) {
        hideFloatingRerollPanel();
        return;
      }

      const shellRect = els.canvasShell.getBoundingClientRect();
      const panelWidth = els.floatingReroll.offsetWidth || 360;
      const panelHeight = els.floatingReroll.offsetHeight || 230;
      const rawLeft = context.kind === "block"
        ? shellRect.width - panelWidth - 24
        : anchorRect.right - shellRect.left + 14;
      const rawTop = anchorRect.top - shellRect.top;
      const maxLeft = Math.max(12, shellRect.width - panelWidth - 12);
      const maxTop = Math.max(62, shellRect.height - panelHeight - 12);
      els.floatingReroll.style.left = `${clamp(rawLeft, 12, maxLeft)}px`;
      els.floatingReroll.style.top = `${clamp(rawTop, 62, maxTop)}px`;
    }

    function feedbackContext(target) {
      if (target.type === "block") {
        const group = state.groups.find(item => item.id === target.groupId);
        if (group?.kind === "draft") return null;
        const part = group?.parts.find(item => item.path === target.partPath);
        const block = part?.blocks?.find(item => item.id === target.blockId);
        const anchor = document.querySelector(".story-block.selected");
        if (!group || !part || !block || !anchor) return null;
        return {
          kind: "block",
          group,
          part,
          block,
          anchor,
          label: `给 ${block.id} 的剧情块重Roll反馈`
        };
      }

      if (target.type === "part") {
        const group = state.groups.find(item => item.id === target.groupId);
        if (group?.kind === "draft") return null;
        const part = group?.parts.find(item => item.path === target.partPath);
        const anchor = part ? document.querySelector(`.part-node[data-part-path="${cssEscape(part.path)}"]`) : null;
        if (!group || !part || !anchor) return null;
        return {
          kind: "part",
          group,
          part,
          anchor,
          label: `给「${part.part_label || part.title}」部分的重Roll反馈`
        };
      }

      if (target.type === "chapter") {
        const group = state.groups.find(item => item.id === target.groupId);
        if (!group) return null;
        if (group.kind === "draft") return null;
        const anchor = chapterFeedbackAnchor(target);
        if (!anchor) return null;
        return {
          kind: "chapter",
          group,
          anchor,
          label: `给第 ${displayChapterNo(group.chapter_no)} 章的整章重Roll反馈`
        };
      }

      return null;
    }

    function hideFloatingRerollPanel() {
      els.floatingReroll.hidden = true;
      els.floatingStatus.textContent = "";
    }

    function chapterFeedbackAnchor(target) {
      if (target.anchor === "part" && target.partPath) {
        return document.querySelector(`.part-node[data-part-path="${cssEscape(target.partPath)}"]`);
      }
      if (target.anchor === "cluster") {
        return document.querySelector(`.part-cluster[data-group-id="${cssEscape(target.groupId)}"]`)
          || document.querySelector(`.node[data-id="${cssEscape(target.groupId)}"]`);
      }
      if (target.anchor === "node") {
        return document.querySelector(`.node[data-id="${cssEscape(target.groupId)}"]`)
          || document.querySelector(`.part-cluster[data-group-id="${cssEscape(target.groupId)}"]`);
      }
      return document.querySelector(`.part-cluster[data-group-id="${cssEscape(target.groupId)}"]`)
        || document.querySelector(`.node[data-id="${cssEscape(target.groupId)}"]`);
    }

    function groupEdgeRect(group) {
      const splitItems = draftSplitItemsFor(group);
      if (splitItems.length > 1) {
        const cluster = draftSplitClusterRect(splitItems);
        return { x: cluster.x, y: cluster.y, width: cluster.width, height: cluster.height };
      }
      if (state.expanded.has(group.id)) {
        const cluster = partClusterRect(group);
        return { x: cluster.x, y: cluster.y, width: cluster.width, height: cluster.height };
      }
      const pos = group.canvas_position || { x: 0, y: 0 };
      return { x: pos.x, y: pos.y, width: 280, height: 138 };
    }

    function draftSplitItemsFor(group) {
      if (!group?.split_origin_draft_id) return [];
      return state.groups
        .filter(item => item.kind === "draft" && item.split_origin_draft_id === group.split_origin_draft_id)
        .sort((a, b) =>
          (Number(a.split_order) || 0) - (Number(b.split_order) || 0)
          || String(a.title).localeCompare(String(b.title), "zh-Hans-CN")
        );
    }

    function draftSplitClusterRect(items) {
      const first = items[0];
      const pos = first?.canvas_position || { x: 0, y: 0 };
      const columns = draftSplitColumns(items);
      const rows = Math.ceil(Math.max(1, items.length) / columns);
      const cardWidth = 148;
      const gap = 20;
      return {
        x: pos.x - 16,
        y: pos.y - 6,
        width: Math.max(420, 36 + columns * cardWidth + (columns - 1) * gap + 72),
        height: 70 + rows * 90 + 92
      };
    }

    function draftSplitCardLocalPosition(items, index) {
      const columns = draftSplitColumns(items);
      return {
        x: 20 + (index % columns) * 168,
        y: 58 + Math.floor(index / columns) * 90
      };
    }

    function draftSplitColumns(items) {
      return Math.min(4, Math.max(1, items.length));
    }

    function partClusterRect(group) {
      const pos = group.canvas_position || { x: 0, y: 0 };
      const columns = partNodeColumns(group);
      const rows = Math.ceil(group.parts.length / columns);
      const partAreaWidth = columns * 148 + (columns - 1) * 20;
      return {
        x: pos.x - 16,
        y: pos.y - 6,
        width: Math.max(420, 36 + partAreaWidth + 120),
        height: 70 + rows * 90 + 92
      };
    }

    function partNodePosition(group, part, index) {
      const cluster = partClusterRect(group);
      const local = partNodeLocalPosition(group, part, index);
      return {
        x: cluster.x + local.x,
        y: cluster.y + local.y
      };
    }

    function partNodeLocalPosition(group, part, index) {
      const columns = partNodeColumns(group);
      return {
        x: 20 + (index % columns) * 168,
        y: 58 + Math.floor(index / columns) * 90
      };
    }

    function partNodeColumns(group) {
      return Math.min(3, Math.max(1, group.parts.length));
    }

    function currentFeedbackKey() {
      const target = state.feedbackTarget;
      if (!target) return "";
      if (target.type === "block") return `${target.partPath}::${target.blockId}`;
      if (target.type === "part") return `part::${target.partPath}`;
      if (target.type === "chapter") return `chapter::${target.groupId}`;
      return "";
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function clampInteger(value, min, max, fallback) {
      const number = Number.parseInt(value, 10);
      if (!Number.isFinite(number)) return fallback;
      return Math.max(min, Math.min(max, number));
    }

    function setStatus(text) {
      document.getElementById("scanStatus").textContent = text;
    }

    function setButtonBusy(button, busy, label) {
      if (!button) return;
      if (busy) {
        if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
        button.disabled = true;
        button.classList.add("button-busy");
        button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label || "处理中")}</span>`;
        return;
      }
      button.disabled = false;
      button.classList.remove("button-busy");
      if (button.dataset.idleHtml) {
        button.innerHTML = button.dataset.idleHtml;
        delete button.dataset.idleHtml;
      }
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    }

    async function refreshFingerprintQuietly() {
      try {
        const data = await fetchJson(`/api/fingerprint?root=${encodeURIComponent(state.root)}`);
        state.lastFingerprint = data.fingerprint || state.lastFingerprint;
      } catch {
        // Autosave still succeeded; a later live-sync poll can refresh the fingerprint.
      }
    }

    function displayChapterNo(value) {
      return value === 9998 ? "终" : value;
    }

    function formatTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, "&#96;");
    }

    function cssEscape(value) {
      if (window.CSS?.escape) return CSS.escape(value);
      return String(value).replace(/["\\]/g, "\\$&");
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    scanFolder().catch(error => setStatus(`读取失败：${error.message}`));
    loadAgentStatus().catch(() => {});
    loadCodexBridgeTasks({ quiet: true }).catch(() => {});
    setInterval(checkForUpdates, 3000);
