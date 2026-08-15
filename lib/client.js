window.__ModuleLoader__.load({
  id: "dsh-client-ui-writing",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var inject = ["slots"];

    // 快捷键总线：在插件加载时（应用自身监听注册之前）以捕获阶段挂到 window，
    // 先于应用/浏览器 UI 拿到按键；索引视图组件把自己的处理器挂到总线上。
    var indexKeyBus = null;
    var keyBound = false;

    // /api Typert RPC：新版 dsh 的 remote 通道（旧 props 注入已移除）
    function rpc(method, args) {
      var id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : ("r" + Date.now() + Math.random());
      return fetch("/api/writing/" + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: id, method: "writing/" + method, payload: { args: args || {} } })
      }).then(function (r) { return r.json(); }).then(function (j) {
        return (j && j.result) ? j.result : { ok: false, error: { message: "rpc 响应异常" } };
      }).catch(function (e) { return { ok: false, error: { message: String((e && e.message) || e) } }; });
    }

    var C = {
      text: "var(--dsw-alias-label-primary, #e8e8e8)",
      dim: "var(--dsw-alias-label-secondary, #9a9a9a)",
      hover: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))",
      border: "var(--dsw-alias-border-l2, rgba(128,128,128,0.28))",
      panel: "var(--dsw-specific-sidebar-fill, var(--dsw-alias-button-elevated-fill, #232323))"
    };

    // 磁盘英文名 → 中文显示名（磁盘保持英文以保证编码/跨平台安全，界面全中文）
    var ZH_DIR = { chapters: "正文", lore: "设定库", outline: "大纲", research: "考据", export: "导出" };
    var ZH_LORE = { characters: "人物", world: "世界观", timeline: "时间线", foreshadowing: "伏笔", other: "其他" };
    var ZH_FILE = { "novel.json": "作品信息", "plot-log.md": "情节日志", "style-profile.md": "风格指纹", "inbox.md": "待定收件箱", "conflicts.md": "冲突记录", "INDEX.md": "目录", "README.md": "说明", "foreshadowing.json": "伏笔台账", "evolution.json": "演化档案", "threads.json": "线索图谱", "plan.json": "连载计划", ".writing-index.sqlite": "全文索引", ".writing-concepts.json": "语义索引" };
    function zhRel(rel) {
      var seg = String(rel || "").replace(/\\\\/g, "/").split("/");
      var out = [];
      for (var i = 0; i < seg.length; i++) {
        var s = seg[i];
        if (!s) continue;
        if (i === 0 && ZH_DIR[s]) out.push(ZH_DIR[s]);
        else if (ZH_LORE[s]) out.push(ZH_LORE[s]);
        else if (ZH_FILE[s]) out.push(ZH_FILE[s]);
        else out.push(s.replace(/\.md$/, ""));
      }
      return out.join(" · ") || rel;
    }

    function zhLoreGroup(lore) {
      var e2 = React.createElement;
      if (!lore) return e2("div", { style: { color: C.dim, fontSize: 11 } }, "（设定库为空：对话中用 novel_lore 登记人物/世界观）");
      var order = ["characters", "world", "timeline", "foreshadowing", "other"];
      var rows = [];
      order.forEach(function (cat) {
        var files = lore[cat] || [];
        if (!files.length) return;
        rows.push(e2("div", { key: cat, style: { margin: "4px 0" } },
          e2("div", { style: { color: C.text, fontWeight: 600, fontSize: 12 } }, ZH_LORE[cat] || cat),
          files.map(function (f) {
            return e2("div", { key: f, style: { color: C.dim, fontSize: 11, paddingLeft: 10 } }, "· " + f.split("/").pop().replace(/\.md$/, ""));
          })
        ));
      });
      if (!rows.length) return e2("div", { style: { color: C.dim, fontSize: 11 } }, "（设定库为空：对话中用 novel_lore 登记人物/世界观）");
      return e2("div", { style: { marginTop: 8, borderTop: "1px solid " + C.border, paddingTop: 6 } },
        e2("div", { style: { color: C.text, fontWeight: 700, marginBottom: 2 } }, "设定库"),
        rows);
    }

    function WritingPanel(props) {
      var e = React.createElement;
      var useState = React.useState;
      var useEffect = React.useEffect;

      // 模式门控：只在「写作」预设（agentPreset === "writing"）的会话显示
      var preset;
      if (typeof props.useSessions === "function") {
        preset = props.useSessions(function (state) {
          var cur = state.current;
          return cur ? (state.byId[cur] && state.byId[cur].agentPreset) : undefined;
        });
      } else {
        preset = "writing";
      }
      var cwd = (typeof props.useSessions === "function") ? props.useSessions(function (state) {
        var cur = state.current;
        return cur ? (state.byId[cur] && state.byId[cur].cwd) : undefined;
      }) : undefined;
      function getCwd() { return Promise.resolve(cwd || ""); }

      var openS = useState(false);
      var tabS = useState("project");
      var loreS = useState(null);
      var projectS = useState(null);
      var libraryS = useState(null);
      var qS = useState("");
      var resultsS = useState(null);
      var evolutionS = useState([]);
      var threadsS = useState([]);
      var selSubjectS = useState(null);
      var busyS = useState(false);
      var errS = useState(null);

      var open = openS[0], setOpen = openS[1];
      var tab = tabS[0], setTab = tabS[1];
      var project = projectS[0], setProject = projectS[1];
      var library = libraryS[0], setLibrary = libraryS[1];
      var q = qS[0], setQ = qS[1];
      var results = resultsS[0], setResults = resultsS[1];
      var evolution = evolutionS[0], setEvolution = evolutionS[1];
      var threads = threadsS[0], setThreads = threadsS[1];
      var selSubject = selSubjectS[0], setSelSubject = selSubjectS[1];
      var lore = loreS[0], setLore = loreS[1];
      var busy = busyS[0], setBusy = busyS[1];
      var err = errS[0], setErr = errS[1];

      function refresh() {
        setBusy(true); setErr(null);
        rpc("libraryList", {}).then(function (r) { if (r && r.ok) setLibrary(r.value); else setLibrary(null); }).catch(function (x) { setErr(String((x && x.message) || x)); });
        getCwd().then(function (root) {
          rpc("projectStatus", { projectRoot: root }).then(function (r) { if (r && r.ok) setProject(r.value); else setProject(null); }).catch(function () {});
          rpc("evolutionList", { projectRoot: root }).then(function (r) { if (r && r.ok) setEvolution(r.value || []); else setEvolution([]); }).catch(function () {});
          rpc("threadGraph", { projectRoot: root }).then(function (r) { if (r && r.ok) setThreads(r.value || []); else setThreads([]); }).catch(function () {});
          rpc("loreList", { projectRoot: root }).then(function (r) { if (r && r.ok) setLore(r.value); else setLore(null); }).catch(function () {});
          setBusy(false);
        }).catch(function () { setBusy(false); });
      }
      function doSync() {
        setBusy(true); setErr(null);
        getCwd().then(function (root) {
          return rpc("syncNow", { projectRoot: root }).then(function (r) {
            if (r && r.error) { setErr(String((r && r.error && r.error.message) || r.error)); setBusy(false); return; }
            refresh();
          });
        }).catch(function (x) { setErr(String((x && x.message) || x)); setBusy(false); });
      }
      function doSearch() {
        var query = String(q).trim(); if (!query) return;
        setBusy(true); setErr(null);
        getCwd().then(function (root) {
          return rpc("projectSearch", { projectRoot: root, query: query }).then(function (r) { if (r && r.ok) setResults(r.value); else setResults(null); setBusy(false); });
        }).catch(function (x) { setErr(String((x && x.message) || x)); setBusy(false); });
      }
      useEffect(function () { if (open) refresh(); }, [open]);

      // 面板常驻（写作工具入口），不随预设隐藏；索引视图仍按写作预设门控

      function tabBtn(key, label) {
        return e("button", {
          key: key, onClick: function () { setTab(key); },
          style: {
            border: "none", background: tab === key ? C.hover : "transparent",
            color: tab === key ? C.text : C.dim, cursor: "pointer",
            borderRadius: 8, padding: "4px 10px", fontSize: 12
          }
        }, label);
      }

      function ThreadGraphSVG(threads) {
        var e2 = React.createElement;
        var n = threads.length;
        var W = 300, H = 190, cx = 150, cy = 95, r = 62;
        var nodes = threads.map(function (t, i) {
          var angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          return { name: t.name, x: Math.round((cx + r * Math.cos(angle)) * 10) / 10, y: Math.round((cy + r * Math.sin(angle)) * 10) / 10 };
        });
        var edges = [];
        for (var i = 0; i < n; i++) {
          for (var j = i + 1; j < n; j++) {
            if ((threads[i].intersects || []).indexOf(threads[j].name) >= 0 || (threads[j].intersects || []).indexOf(threads[i].name) >= 0) edges.push([i, j]);
          }
        }
        return e2("svg", { viewBox: "0 0 300 190", width: "100%", style: { display: "block", margin: "2px auto 6px", maxWidth: 320 } },
          edges.map(function (ed, k) {
            var a = nodes[ed[0]], b = nodes[ed[1]];
            return e2("line", { key: "e" + k, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "var(--dsw-alias-border-l2, rgba(140,140,140,0.45))", strokeWidth: 1.5 });
          }),
          nodes.map(function (node, k) {
            var st = threads[k].status || "active";
            return e2("g", { key: "n" + k },
              e2("circle", { cx: node.x, cy: node.y, r: 5, fill: st === "resolved" ? "var(--dsw-alias-label-secondary, #8a8a8a)" : "var(--dsw-alias-brand-primary, #4d8dff)" }),
              e2("text", { x: node.x, y: node.y - 12, textAnchor: "middle", fill: "var(--dsw-alias-label-primary, #e6e6e6)", fontSize: 10 }, node.name),
              e2("text", { x: node.x, y: node.y + 18, textAnchor: "middle", fill: "var(--dsw-alias-label-secondary, #8a8a8a)", fontSize: 9 }, st)
            );
          })
        );
      }

      var content;
      if (tab === "project") {
        if (!project) content = e("div", { style: { color: C.dim } },
          e("div", null, "（空项目：尚未建立写作工程骨架）"),
          e("button", {
            onClick: function () {
              setBusy(true); setErr(null);
              getCwd().then(function (root) {
                return rpc("scaffoldNow", { projectRoot: root }).then(function (r) {
                  if (r && r.error) { setErr(String((r && r.error && r.error.message) || r.error)); setBusy(false); return; }
                  refresh();
                });
              }).catch(function (x) { setErr(String((x && x.message) || x)); setBusy(false); });
            },
            style: { marginTop: 8, border: "1px solid " + C.border, background: C.hover, color: C.text, cursor: "pointer", borderRadius: 8, padding: "6px 12px", fontSize: 12 }
          }, "一键初始化写作工程"));
        else {
          var m = project.manifest || {};
          var volumes = project.volumes || {};
          var vrows = Object.keys(volumes).map(function (v) {
            var cs = volumes[v];
            var w = cs.reduce(function (s, c) { return s + (c.words || 0); }, 0);
            return e("div", { key: v, style: { margin: "6px 0" } },
              e("div", { style: { color: C.text, fontWeight: 600 } }, v + " · " + cs.length + " 章 / " + w + " 字"),
              cs.map(function (c) {
                return e("div", { key: c.id, style: { color: C.dim, fontSize: 12, paddingLeft: 12 } }, "· " + c.id + "  " + (c.title || "") + "（" + (c.words || 0) + " 字）");
              })
            );
          });
          content = e("div", null,
            e("div", { style: { color: C.text, fontWeight: 700, marginBottom: 4 } }, "《" + (m.title || "未命名") + "》" + (m.genre ? " · " + m.genre : "")),
            e("div", { style: { color: C.dim, fontSize: 11, marginBottom: 6 } }, "共 " + (project.chapterCount || 0) + " 章 / " + (project.totalWords || 0) + " 字"),
            vrows.length ? vrows : e("div", { style: { color: C.dim } }, "（尚无章节）"),
            e("div", { style: { marginTop: 10 } }, zhLoreGroup(lore))
          );
        }
      } else if (tab === "library") {
        if (!library || !library.length) content = e("div", { style: { color: C.dim } }, "（书库为空，用 novel_library_import 导入）");
        else content = e("div", null, library.map(function (novel) {
          return e("div", { key: novel.id, style: { margin: "6px 0" } },
            e("div", { style: { color: C.text, fontWeight: 600 } }, "《" + novel.title + "》"),
            e("div", { style: { color: C.dim, fontSize: 11 } }, (novel.author || "佚名") + " · " + (novel.genre || "-") + " · " + novel.chapters + " 章 / " + novel.words + " 字")
          );
        }));
      } else if (tab === "evolution") {
        var evolLines = [];
        if (evolution && evolution.length) {
          if (selSubject) {
            // —— 内联演化 diff：某一主体的完整版本链 ——
            var chain = evolution.filter(function (ev) { return ev.subject === selSubject; });
            evolLines.push(e("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
              e("button", { onClick: function () { setSelSubject(null); }, style: { border: "none", background: C.hover, color: C.text, cursor: "pointer", borderRadius: 4, padding: "2px 8px", fontSize: 11 } }, "← 返回"),
              e("span", { style: { color: C.text, fontWeight: 700 } }, selSubject)
            ));
            evolLines.push(e("div", { style: { color: C.dim, fontSize: 11, marginBottom: 6 } },
              "维度：" + (chain.length ? (chain[0].dimension || "-") : "-") + " · 共 " + chain.length + " 个版本"));
            chain.forEach(function (ev, i) {
              evolLines.push(e("div", { key: "ch" + i, style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "baseline", marginBottom: 3 } },
                e("span", { style: { color: "var(--dsw-alias-brand-primary, #4d8dff)", fontSize: 11, fontWeight: 600, minWidth: 20 } }, "v" + (i + 1)),
                e("span", { style: { color: C.text, fontSize: 12 } }, ev.from ? ev.from + " → " + ev.to : "初始：" + ev.to),
                ev.chapterId ? e("span", { style: { color: C.dim, fontSize: 11 } }, "@" + ev.chapterId) : null,
                ev.reason ? e("span", { style: { color: C.dim, fontSize: 11 } }, "（" + ev.reason + "）") : null
              ));
            });
          } else {
            // —— 主题列表（按主体去重，点击查看版本链）——
            evolLines.push(e("div", { style: { color: C.text, fontWeight: 600, marginBottom: 2 } }, "演化史"));
            evolLines.push(e("div", { style: { color: C.dim, fontSize: 11, marginBottom: 4 } }, "点击条目查看该主体的完整版本链"));
            var seen = {}; var uniq = [];
            for (var i2 = evolution.length - 1; i2 >= 0; i2--) {
              var ev2 = evolution[i2];
              if (!seen[ev2.subject]) { seen[ev2.subject] = true; uniq.push(ev2); }
            }
            uniq.slice(0, 12).forEach(function (ev) {
              evolLines.push(e("div", {
                key: "ev" + (ev.id || "") + (ev.createdAt || ""),
                onClick: function () { setSelSubject(ev.subject); },
                title: "查看版本链",
                style: { color: C.dim, fontSize: 12, marginBottom: 2, cursor: "pointer", borderRadius: 4, padding: "1px 4px" }
              }, "· " + ev.subject + "【" + ev.dimension + "】" + (ev.from ? ev.from + " → " : "") + ev.to + (ev.chapterId ? " @" + ev.chapterId : "")));
            });
            if (evolution.length > 12) evolLines.push(e("div", { style: { color: C.dim, fontSize: 11 } }, "（仅显示最近登记的主题，共 " + evolution.length + " 条记录）"));
          }
        } else {
          evolLines.push(e("div", { style: { color: C.dim } }, "（无演化记录，写正文后用 novel_sync 自动登记）"));
        }
        var thrLines = [];
        if (threads && threads.length) {
          thrLines.push(e("div", { style: { color: C.text, fontWeight: 600, margin: "10px 0 4px" } }, "线索图谱"));
          if (threads.length >= 2) thrLines.push(ThreadGraphSVG(threads));
          threads.forEach(function (t, i) {
            var isLast = i === threads.length - 1;
            thrLines.push(e("div", { key: "th" + t.name, style: { marginBottom: 4 } },
              e("div", { style: { color: C.text, fontSize: 12 } }, (isLast ? "└─ " : "├─ ") + "◆ " + t.name + " [" + (t.status || "active") + "]"),
              t.intersects && t.intersects.length ? e("div", { style: { color: C.dim, fontSize: 11, paddingLeft: 18 } }, (isLast ? "   " : "│  ") + "⇄ " + t.intersects.join("、")) : null));
          });
        } else {
          thrLines.push(e("div", { style: { color: C.dim, marginTop: 8 } }, "（无线索，用 novel_threads 登记）"));
        }
        content = e("div", null, evolLines.concat(thrLines));
      } else {
        var lines = [];
        if (results) {
          ((results.project && results.project.results) || []).forEach(function (h) {
            lines.push(e("div", { key: "p" + h.rel, style: { margin: "6px 0" } },
              e("div", { style: { color: C.dim, fontSize: 11 } }, "项目 · " + zhRel(h.rel)),
              e("div", { style: { color: C.text, fontSize: 12 } }, h.snippet)));
          });
          ((results.library && results.library.results) || []).forEach(function (x) {
            lines.push(e("div", { key: "l" + x.chapterFile, style: { margin: "6px 0" } },
              e("div", { style: { color: C.dim, fontSize: 11 } }, "书库 · " + x.novelTitle + " · " + x.chapterTitle),
              e("div", { style: { color: C.text, fontSize: 12 } }, x.snippet)));
          });
        }
        content = e("div", null,
          e("div", { style: { display: "flex", gap: 6, marginBottom: 8 } },
            e("input", {
              value: q, onChange: function (ev) { setQ(ev.target.value); },
              onKeyDown: function (ev) { if (ev.key === "Enter") doSearch(); },
              placeholder: "检索人名/设定/情节…",
              style: {
                flex: 1, fontSize: 12, padding: "5px 8px", color: C.text,
                background: "transparent", border: "1px solid " + C.border, borderRadius: 8, outline: "none"
              }
            }),
            e("button", { onClick: doSearch, disabled: busy, style: { border: "none", background: C.hover, color: C.text, cursor: "pointer", borderRadius: 8, padding: "5px 10px", fontSize: 12 } }, "搜索")
          ),
          lines.length ? lines : e("div", { style: { color: C.dim, fontSize: 11 } }, "在项目与书库中全文检索")
        );
      }

      var header = e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
        e("strong", { style: { color: C.text } }, "写作"),
        e("div", { style: { display: "flex", gap: 4 } },
          e("button", { onClick: doSync, disabled: busy, title: "章末编排：摘要+设定抽取+演化检测+伏笔提醒", style: { border: "none", background: C.hover, color: C.text, cursor: "pointer", borderRadius: 6, padding: "3px 8px", fontSize: 12 } }, busy ? "…" : "同步"),
          e("button", { onClick: refresh, disabled: busy, style: { border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 12 } }, "刷新")
        )
      );

      React.useEffect(function () {
        try {
          if (open) document.body.setAttribute("data-writing-panel-open", "1");
          else document.body.removeAttribute("data-writing-panel-open");
        } catch (e) {}
        return function () {
          try { document.body.removeAttribute("data-writing-panel-open"); } catch (e) {}
        };
      }, [open]);

      var trigger = e("button", {
        onClick: function () { setOpen(!open); },
        title: "写作",
        style: {
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          height: 28, minWidth: 28, padding: "0 8px",
          background: open ? C.hover : "transparent", border: "none", borderRadius: 8,
          color: C.text, cursor: "pointer", fontSize: 13
        }
      }, "✍", props.wide ? e("span", null, "写作") : null);

      var backdrop = open ? e("div", { onClick: function () { setOpen(false); }, style: { position: "fixed", inset: 0, zIndex: 2147483646 } }) : null;
      var panel = open ? e("div", {
        style: {
          position: "fixed", left: 10, bottom: 52, width: 320, maxHeight: 420,
          background: C.panel, color: C.text, border: "1px solid " + C.border,
          borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          padding: 12, fontSize: 13, zIndex: 2147483647, overflowY: "auto"
        }
      }, header,
        e("div", { style: { display: "flex", gap: 4, marginBottom: 8 } }, tabBtn("project", "项目"), tabBtn("library", "书库"), tabBtn("search", "搜索"), tabBtn("evolution", "演化")),
        err ? e("div", { style: { color: "#e06c6c", fontSize: 12 } }, String(err)) : null,
        content) : null;

      return e(React.Fragment, null, backdrop, trigger, panel);
    }

    // —— 工作区索引视图：会话顶部「对话/轨迹」旁的第三个 tab ——
    // 浏览式定位（不靠记忆搜索）：分卷目录 + 字数/状态/摘要 + 快速定位 + 预览 + 打开文件
    // 交互：/ 搜索 · ↑↓ 选择 · Enter 预览 · Esc 关闭 · 左右滑动（触摸/鼠标拖拽）切换模块
    function WritingIndexView(props) {
      var e = React.createElement;
      var useState = React.useState;
      var useEffect = React.useEffect;
      var useRef = React.useRef;

      var preset;
      if (typeof props.useSessions === "function") {
        preset = props.useSessions(function (state) {
          var cur = state.current;
          return cur ? (state.byId[cur] && state.byId[cur].agentPreset) : undefined;
        });
      } else { preset = "writing"; }
      var cwd = (typeof props.useSessions === "function") ? props.useSessions(function (state) {
        var cur = state.current;
        return cur ? (state.byId[cur] && state.byId[cur].cwd) : undefined;
      }) : undefined;
      function getCwd() { return Promise.resolve(cwd || ""); }

      var dataS = useState(null);
      var busyS = useState(false);
      var errS = useState(null);
      var qS = useState("");
      var volS = useState("全部");
      var stS = useState("全部");
      var modS = useState("目录");
      var selS = useState(null);
      var previewS = useState(null);
      var collapsedS = useState({});
      var touchS = useRef(null);
      var searchRefS = useRef(null);
      var wheelAccS = useRef({ x: 0, t: 0 });

      var data = dataS[0], setData = dataS[1];
      var busy = busyS[0], setBusy = busyS[1];
      var err = errS[0], setErr = errS[1];
      var q = qS[0], setQ = qS[1];
      var vol = volS[0], setVol = volS[1];
      var st = stS[0], setSt = stS[1];
      var mod = modS[0], setMod = modS[1];
      var sel = selS[0], setSel = selS[1];
      var collapsed = collapsedS[0], setCollapsed = collapsedS[1];
      var preview = previewS[0], setPreview = previewS[1];
      var touchRef = touchS[0];
      var searchRef = searchRefS[0];

      function load() {
        setBusy(true); setErr(null);
        getCwd().then(function (root) {
          return rpc("workspaceIndex", { projectRoot: root }).then(function (r) {
            if (r && r.ok) setData(r.value);
            else if (r && r.error) setErr(String((r && r.error && r.error.message) || r.error));
            else setData(null);
            setBusy(false);
          });
        }).catch(function (x) { setErr(String((x && x.message) || x)); setBusy(false); });
      }
      useEffect(function () { load(); }, []);

      function openPreview(c) {
        if (!c) return;
        setPreview({ meta: c, text: null, error: false });
        getCwd().then(function (root) {
          return rpc("chapterText", { projectRoot: root, chapterId: c.id }).then(function (r) {
            if (r && r.ok && r.value) setPreview({ meta: c, text: r.value.text, full: r.value, error: false });
            else setPreview({ meta: c, text: null, error: (r && r.error && r.error.message) || "读取失败" });
          });
        }).catch(function (x) { setPreview({ meta: c, text: null, error: "读取失败：" + ((x && x.message) || x) }); });
      }
      function renameChapter(c) {
        var nt2 = (typeof window.prompt === "function") ? window.prompt("章节新标题：《" + (c.title || "无标题") + "》", c.title || "") : null;
        if (!nt2 || !String(nt2).trim()) return;
        getCwd().then(function (root) {
          return rpc("renameChapter", { projectRoot: root, chapterId: c.id, title: String(nt2).trim(), renameBody: true }).then(function (r) {
            if (r && r.ok) load();
            else setErr((r && r.error && r.error.message) || "改名失败");
          });
        }).catch(function () {});
      }

      function openFile(c) {
        getCwd().then(function (root) {
          var abs = String(root).replace(/[\\/]+$/, "") + "/" + c.path;
          (props.openPath || function () {}).call(props, abs).catch(function () {});
        }).catch(function () {});
      }

      var chapters = data ? (data.chapters || []) : [];
      var vols = data ? (data.volumes || []) : [];
      // 数字直达：输入纯数字 N = 第 N 章（或章号含 N）
      var numMatch = /^\d+$/.test(q.trim()) ? parseInt(q.trim(), 10) : 0;
      var flat = chapters.filter(function (c, ci) {
        if (vol !== "全部" && (c.volume || "（未分卷）") !== vol) return false;
        if (st !== "全部" && (c.status || "draft") !== st) return false;
        var qq = q.trim().toLowerCase();
        if (numMatch) {
          if ((ci + 1) === numMatch) return true;
          if (String(c.id).indexOf(String(numMatch)) >= 0) return true;
          return false;
        }
        if (qq) {
          if (String(c.id).toLowerCase().indexOf(qq) < 0 && String(c.title || "").toLowerCase().indexOf(qq) < 0 && String(c.summary || "").toLowerCase().indexOf(qq) < 0) return false;
        }
        return true;
      });
      function goBack() {
        if (preview) { setPreview(null); return; }
        if (mod === "速览") { setMod("目录"); return; }
      }
      function goNext() {
        if (mod === "目录") setMod("速览");
      }

      // 键盘（本视图挂载时全局生效；切到「对话」tab 后组件卸载自动失效）
      // 键盘处理器挂到模块级总线（捕获阶段、插件加载时注册），先于应用拿到按键
      var keyHandlerRef = useRef(null);
      keyHandlerRef.current = function (ev) {
        if (ev.key === "Escape") { setPreview(null); return; }
        var isFocusKey = ev.key === "/" || ev.key === "?" || (ev.key === "/" && ev.ctrlKey) || (ev.key.toLowerCase() === "k" && ev.altKey);
        if (isFocusKey && !ev.metaKey) {
          var inSearch = searchRef.current && ev.target === searchRef.current;
          if (!inSearch) {
            ev.preventDefault();
            if (searchRef.current) searchRef.current.focus();
          }
          return;
        }
        if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
          var inInput = ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA");
          if (!inInput) {
            ev.preventDefault();
            if (ev.key === "ArrowLeft") goBack(); else goNext();
          }
          return;
        }
        if (!flat.length) return;
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          var i = -1;
          for (var k = 0; k < flat.length; k++) if (flat[k].id === sel) { i = k; break; }
          var n = ev.key === "ArrowDown" ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1);
          if (n >= 0 && n < flat.length) setSel(flat[n].id);
          return;
        }
        if (ev.key === "Enter" && sel) {
          for (var k2 = 0; k2 < flat.length; k2++) if (flat[k2].id === sel) { openPreview(flat[k2]); break; }
        }
      };
      useEffect(function () {
        var bound = function (ev) { if (keyHandlerRef.current) keyHandlerRef.current(ev); };
        indexKeyBus = bound;
        return function () { if (indexKeyBus === bound) indexKeyBus = null; };
      }, []);

      if (preset !== undefined && preset !== "writing") {
        return e("div", { style: { padding: 32, color: "var(--dsw-alias-label-secondary, #9a9a9a)", fontSize: 13, textAlign: "center" } },
          "（本会话非「写作模式」。在写作模式会话中，这里是全书索引：分卷目录 / 字数状态摘要 / 快速定位 / 预览与打开原文）");
      }

      var m = data ? data.manifest : null;
      var statusColors = { draft: "var(--dsw-alias-label-secondary, #9a9a9a)", polished: "var(--dsw-alias-state-business-primary, #4d8dff)", final: "#3dd68c" };
      function pill(status) {
        var col = statusColors[status] || "var(--dsw-alias-label-secondary, #9a9a9a)";
        return e("span", { style: { fontSize: 10, padding: "0 6px", borderRadius: 8, color: col, border: "1px solid " + col } }, status || "draft");
      }
      function stat(label, val) {
        return e("div", { style: { border: "1px solid " + C.border, borderRadius: 10, padding: "8px 12px", minWidth: 92, background: "transparent" } },
          e("div", { style: { fontSize: 16, fontWeight: 700, color: C.text } }, val),
          e("div", { style: { color: C.dim, fontSize: 11 } }, label));
      }
      function modBtn(name) {
        var on = mod === name;
        return e("button", {
          key: name, onClick: function () { setMod(name); },
          style: {
            border: on ? "1px solid " + C.border : "1px solid transparent",
            background: on ? C.hover : "transparent",
            color: on ? C.text : C.dim, cursor: "pointer", borderRadius: 14,
            padding: "3px 12px", fontSize: 12,
            transition: "all .2s ease"
          }
        }, name);
      }
      function chip(name, active, onPick) {
        return e("button", {
          key: name, onClick: onPick,
          style: {
            border: "1px solid " + (active ? C.border : C.border),
            background: active ? C.hover : "transparent",
            color: active ? C.text : C.dim,
            borderRadius: 12, padding: "2px 8px", fontSize: 11, cursor: "pointer"
          }
        }, name);
      }

      var volChips = ["全部"].concat((vols || []).map(function (v) { return v.name; })).map(function (name) {
        return chip(name, vol === name, function () { setVol(name); });
      });
      var statusChips = ["全部", "draft", "polished", "final"].map(function (name) {
        return chip(name, st === name, function () { setSt(name); });
      });

      // 目录模块：按卷分组
      var listEls = [];
      if (!data) listEls.push(e("div", { style: { color: C.dim } }, busy ? "加载中…" : "（未初始化项目：对话中 novel_init，或侧边栏「写作」面板一键初始化）"));
      else if (!flat.length) listEls.push(e("div", { style: { color: C.dim } }, "（无匹配章节：调整筛选或清空搜索）"));
      else {
        var groups = [];
        var lastVol = null;
        for (var gi = 0; gi < flat.length; gi++) {
          var cv = flat[gi].volume || "（未分卷）";
          if (cv !== lastVol) { groups.push({ name: cv, items: [] }); lastVol = cv; }
          groups[groups.length - 1].items.push(flat[gi]);
        }
        for (var g2 = 0; g2 < groups.length; g2++) {
          var grp = groups[g2];
          var isCollapsed = !!collapsed[grp.name];
          listEls.push(e("div", { key: "v" + grp.name, onClick: function () { var nx = Object.assign({}, collapsed); if (isCollapsed) delete nx[grp.name]; else nx[grp.name] = true; setCollapsed(nx); }, style: { color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: 1, margin: "10px 0 4px", cursor: "pointer", userSelect: "none" } }, (isCollapsed ? "▸ " : "▾ ") + grp.name + " · " + grp.items.length + " 章"));
          if (isCollapsed) continue;
          for (var ri = 0; ri < grp.items.length; ri++) {
            (function (c) {
              var isSel = c.id === sel;
              listEls.push(e("div", {
                key: c.id,
                onClick: function () { setSel(c.id); openPreview(c); },
                style: {
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, cursor: "pointer",
                  marginBottom: 2, fontSize: 12, color: C.text,
                  background: isSel ? C.hover : "transparent",
                  border: "1px solid " + (isSel ? C.border : "transparent"),
                  transition: "background .15s ease, border-color .15s ease"
                }
              },
                e("span", { style: { color: C.dim, fontVariantNumeric: "tabular-nums", minWidth: 46, fontSize: 11 } }, c.id),
                e("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } }, c.title || "（无标题）"),
                e("span", { onClick: function (ev) { ev.stopPropagation(); renameChapter(c); }, title: "改名", style: { color: C.dim, cursor: "pointer", padding: "0 4px", fontSize: 12 } }, "✎"),
                e("span", { style: { color: C.dim, fontSize: 11, whiteSpace: "nowrap" } }, (c.words || 0) + "字"),
                pill(c.status),
                e("span", { style: { color: C.dim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 } }, c.summary || "")
              ));
            })(grp.items[ri]);
          }
        }
      }

      // 速览模块
      var overviewEls = [];
      if (data && m) {
        overviewEls.push(e("div", { style: { color: C.text, fontWeight: 700, fontSize: 15 } }, "《" + (m.title || "未命名") + "》"));
        overviewEls.push(e("div", { style: { color: C.dim, fontSize: 12, marginTop: 2 } }, (m.genre || "题材未填") + " · " + (m.synopsis || "简介未填")));
        overviewEls.push(e("div", { style: { display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" } },
          stat("章节", data.chapterCount), stat("总字数", data.totalWords), stat("未回收伏笔", data.foreOpen), stat("演化记录", data.evoCount)));
        overviewEls.push(e("div", { style: { color: C.text, fontWeight: 600, margin: "16px 0 4px", fontSize: 12 } }, "情节日志（最近）"));
        overviewEls.push(e("pre", {
          style: {
            whiteSpace: "pre-wrap", color: C.dim, fontSize: 11, lineHeight: 1.6,
            maxHeight: 280, overflowY: "auto", background: "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.03))",
            borderRadius: 8, padding: 10, margin: 0
          }
        }, data.plotTail || "（暂无。写完章节跑 novel_sync 后自动登记摘要）"));
      } else {
        overviewEls.push(e("div", { style: { color: C.dim } }, "（未初始化项目）"));
      }

      var wheelAcc = wheelAccS[0];
      function onPointerDown(ev) { touchRef.current = { x: ev.clientX, y: ev.clientY }; }
      function onPointerUp(ev) {
        var s = touchRef.current; touchRef.current = null;
        if (!s) return;
        var dx = ev.clientX - s.x, dy = ev.clientY - s.y;
        // 左滑 = 前进（目录→速览）；右滑 = 回退（关预览 → 回目录）
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) goNext(); else goBack();
        }
      }
      // 触控板横向滚动（Windows 笔记本两指横滑走 wheel.deltaX，浏览器整页回退手势之外的可用通道）
      function onWheel(ev) {
        if (!ev.deltaX) return;
        var now = Date.now();
        if (now - wheelAcc.t > 400) wheelAcc.x = 0;
        wheelAcc.t = now;
        wheelAcc.x += ev.deltaX;
        if (wheelAcc.x > 120) { wheelAcc.x = 0; goNext(); }
        else if (wheelAcc.x < -120) { wheelAcc.x = 0; goBack(); }
      }

      var previewPane = preview ? e("div", {
        style: {
          position: "absolute", top: 0, right: 0, bottom: 0, width: "54%", minWidth: 320,
          background: "var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, #232323))", borderLeft: "1px solid " + C.border,
          boxShadow: "-12px 0 32px rgba(0,0,0,0.35)", zIndex: 20,
          display: "flex", flexDirection: "column", animation: "widxFade .2s ease"
        }
      },
        e("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid " + C.border } },
          e("span", { style: { color: C.text, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 } }, preview.meta.id + " · " + (preview.meta.title || "（无标题）") + " · " + (preview.meta.words || 0) + "字"),
          e("button", { onClick: function () { openFile(preview.meta); }, title: "用系统默认编辑器打开原文文件", style: { border: "1px solid " + C.border, background: C.hover, color: C.text, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 } }, "打开文件"),
          e("button", { onClick: function () { setPreview(null); }, style: { border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 14 } }, "✕")
        ),
        e("pre", {
          style: {
            flex: 1, overflowY: "auto", whiteSpace: "pre-wrap", color: C.text,
            fontSize: 12.5, lineHeight: 1.8, padding: "12px 16px", margin: 0
          }
        }, preview.text ? (preview.text + (preview.full && preview.full.truncated ? "\n\n…（预览截断，点「打开文件」看全文）" : "")) : (preview.error ? ("（" + preview.error + "）") : "加载正文…"))
      ) : null;

      return e("div", {
        onPointerDown: onPointerDown,
        onPointerUp: onPointerUp,
        onWheel: onWheel,
        onClick: function (ev) {
          if (ev.target !== ev.currentTarget) return;
          if (searchRef.current) searchRef.current.focus();
        },
        style: {
          position: "relative", height: "100%", display: "flex", flexDirection: "column",
          padding: "16px calc(var(--dsh-composer-side-clearance, 0px) + 16px)",
          boxSizing: "border-box", color: C.text,
          background: "var(--dsw-alias-bg-layer-1, transparent)",
          touchAction: "pan-y"
        }
      },
        e("style", null, "@keyframes widxFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"),
        e("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" } },
          e("span", { style: { fontWeight: 800, fontSize: 15, letterSpacing: 2, color: "var(--dsw-alias-brand-primary, #4d8dff)" } }, data && m ? "《" + m.title + "》索引" : "写作索引"),
          e("span", { style: { color: C.dim, fontSize: 11 } }, data ? ("第 " + data.chapterCount + " 章 · " + data.totalWords + " 字") : ""),
          e("span", { style: { flex: 1 } }),
          modBtn("目录"), modBtn("速览"),
          e("button", { onClick: load, disabled: busy, style: { border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 12 } }, busy ? "…" : "↻ 刷新")
        ),
        e("div", { style: { display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" } },
          e("input", {
            ref: searchRef,
            autoFocus: true,
            value: q,
            onChange: function (ev) { setQ(ev.target.value); },
            placeholder: "快速定位：章号 / 标题 / 摘要（/ ? Ctrl+/ Alt+K 聚焦，纯数字直达第 N 章）",
            style: {
              flex: "1 1 180px", minWidth: 140, fontSize: 12, padding: "6px 10px",
              color: C.text, background: "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.04))",
              border: "1px solid " + C.border, borderRadius: 8, outline: "none"
            }
          }),
          e("button", { onClick: function () { if (searchRef.current) searchRef.current.focus(); }, title: "聚焦搜索", style: { border: "1px solid " + C.border, background: "transparent", color: C.text, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 } }, "⌕"),
          volChips,
          e("span", { style: { color: C.dim, fontSize: 11 } }, "状态"),
          statusChips
        ),
        err ? e("div", { style: { color: "#e06c6c", fontSize: 12, marginBottom: 6 } }, String(err)) : null,
        e("div", { key: mod, style: { flex: 1, overflowY: "auto", animation: "widxFade .22s ease", paddingBottom: 8, userSelect: "none" } },
          mod === "目录" ? listEls : overviewEls),
        e("div", { style: { color: C.dim, fontSize: 11, borderTop: "1px solid " + C.border, paddingTop: 8, marginTop: 6 } },
          "/ ? Ctrl+/ Alt+K 聚焦搜索 · 纯数字=直达第N章 · ↑↓ 选章 · Enter 打开 · Esc 关闭 · ← 回退（关预览/回目录）· → 前进 · 左右滑动/触控板横滚同效 · 「打开文件」用系统编辑器定位原文"),
        previewPane
      );
    }

    function apply(ctx) {
      // 皮肤兼容：写作面板打开时淡出人物，避免遮挡写作内容
      try {
        if (!document.getElementById("writing-panel-skin-patch")) {
          var st = document.createElement("style");
          st.id = "writing-panel-skin-patch";
          st.textContent = "body[data-writing-panel-open] [data-maid-character] { opacity: 0.12 !important; } body[data-writing-panel-open] [data-skin-chrome='character-stage'] { z-index: -1 !important; }";
          document.head.appendChild(st);
        }
      } catch (e) {}

      if (!keyBound) {
        keyBound = true;
        window.addEventListener("keydown", function (ev) {
          if (indexKeyBus) {
            try { indexKeyBus(ev); } catch (e) {}
          }
        }, true);
      }
      ctx.slots.inject("sidebar.footer.action", function () {
        return ctx.slots.register({
          name: "sidebar.footer.action",
          id: "writing-panel",
          inject: function () {
            return {
              libraryList: function () {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.libraryList();
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              projectStatus: function (root) {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.projectStatus(root);
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              evolutionList: function (root) {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.evolutionList(root);
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              threadGraph: function (root) {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.threadGraph(root);
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              syncNow: function (root) {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.syncNow(root);
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              scaffoldNow: function (root) {
                if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.scaffoldNow(root);
                return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
              },
              search: function (root, query) {
                if (!(ctx.remote && ctx.remote.writing)) return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
                return Promise.all([
                  ctx.remote.writing.projectSearch(root, query),
                  ctx.remote.writing.librarySearch(query)
                ]).then(function (rs) {
                  return {
                    ok: true,
                    value: {
                      project: (rs[0] && rs[0].ok) ? rs[0].value : { results: [] },
                      library: (rs[1] && rs[1].ok) ? rs[1].value : { results: [] }
                    }
                  };
                }).catch(function (err) { return { ok: false, error: err }; });
              },
              getCwd: function () {
                var c = ctx.get("connection");
                if (c && c.api && c.api.host && c.api.host.describe) {
                  return c.api.host.describe({}).then(function (r) {
                    return (r && r.value && r.value.cwd) ? r.value.cwd : ".";
                  }).catch(function () { return "."; });
                }
                return Promise.resolve(".");
              }
            };
          }
        }, WritingPanel);
      });

      // 「索引」视图：会话顶部「对话/轨迹」旁的第三个 tab（工作区索引）
      // 按会话模式动态挂载：仅当前会话为写作模式时出现，切到其他模式自动消失
      ctx.slots.inject("conversation.view", function () {
        var sessions = null;
        try { sessions = ctx.get("sessions"); } catch (e) { sessions = null; }
        var disposeEntry = null;
        function makeEntry() {
          return ctx.slots.register({
            name: "conversation.view",
            id: "writing-index",
            order: 20,
            label: function () { return "索引"; },
            inject: function () {
              return {
                workspaceIndex: function (root) {
                  if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.workspaceIndex(root);
                  return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
                },
                chapterText: function (root, chapterId) {
                  if (ctx.remote && ctx.remote.writing) return ctx.remote.writing.chapterText(root, chapterId);
                  return Promise.resolve({ ok: false, error: { message: "writing remote 未挂载" } });
                },
                openPath: function (abs) {
                  var ws = ctx.get("workspaces");
                  if (ws && typeof ws.openPath === "function") return ws.openPath(abs);
                  return Promise.resolve();
                },
                getCwd: function () {
                  var c = ctx.get("connection");
                  if (c && c.api && c.api.host && c.api.host.describe) {
                    return c.api.host.describe({}).then(function (r) {
                      return (r && r.value && r.value.cwd) ? r.value.cwd : ".";
                    }).catch(function () { return "."; });
                  }
                  return Promise.resolve(".");
                }
              };
            }
          }, WritingIndexView);
        }
        function presetNow() {
          if (!sessions || !sessions.list) return "writing";
          var snap = sessions.list.getSnapshot();
          var cur = snap && snap.current;
          return cur ? (snap.byId[cur] && snap.byId[cur].agentPreset) : undefined;
        }
        function sync() {
          var isWriting = presetNow() === "writing";
          if (isWriting && !disposeEntry) disposeEntry = makeEntry();
          else if (!isWriting && disposeEntry) { disposeEntry(); disposeEntry = null; }
        }
        var unsub = (sessions && sessions.list) ? sessions.list.subscribe(sync) : function () {};
        sync();
        return function () {
          unsub();
          if (disposeEntry) { disposeEntry(); disposeEntry = null; }
        };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
