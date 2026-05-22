// @ts-nocheck — componente importado do protótipo; tipagem gradual depois
import { useState, useEffect, useCallback } from "react";

const JIRA_BASE = "https://fenasbac-tech.atlassian.net/browse/";

const CAT_COLORS = {
  "Ativos": "#6366f1",
  "Manutenção / Sustentação": "#38bdf8",
  "Plataformas / Core": "#f59e0b",
  "Operacional / Interno": "#ec4899",
  "Arquivados": "#484f58",
};

const STATUS_CAT = {
  new: { bg:"#1e3a5f", text:"#60a5fa", dot:"#3b82f6" },
  indeterminate: { bg:"#3b2d00", text:"#fbbf24", dot:"#f59e0b" },
  done: { bg:"#0f3020", text:"#34d399", dot:"#10b981" },
};

function getStatusCat(s) {
  const k = s?.statusCategory?.key;
  if (k === "done") return "done";
  if (k === "indeterminate") return "indeterminate";
  return "new";
}

const PROJ_COLORS = ["#6366f1","#8b5cf6","#a78bfa","#f59e0b","#f97316","#fb7185","#34d399","#38bdf8","#22d3ee","#ec4899","#10b981","#3b82f6","#facc15","#e879f9"];
const projColorCache = {};
let colorIdx = 0;
function projColor(key) {
  if (!projColorCache[key]) projColorCache[key] = PROJ_COLORS[colorIdx++ % PROJ_COLORS.length];
  return projColorCache[key];
}

const isLocalDev = import.meta.env.DEV;

async function callClaude(prompt) {
  const res = await fetch("/api/anthropic/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514",
      max_tokens:1000,
      system:`You are a Jira data assistant. Return ONLY valid JSON, no markdown, no explanation.`,
      messages:[{ role:"user", content: prompt }],
      mcp_servers:[{ type:"url", url:"https://mcp.atlassian.com/v1/mcp", name:"atlassian" }]
    })
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "API indisponível neste ambiente. Rode localmente com npm run dev e VITE_ANTHROPIC_API_KEY no .env"
    );
  }
  const data = await res.json();
  const texts = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  const toolResults = (data.content||[]).filter(b=>b.type==="mcp_tool_result");
  return { texts, toolResults, raw: data };
}

export default function Dashboard() {
  const [tab, setTab] = useState("sprint");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [projects, setProjects] = useState([]);
  const [sprintIssues, setSprintIssues] = useState([]);
  const [sprintName, setSprintName] = useState("S10");

  const [filterProj, setFilterProj] = useState("Todos");
  const [filterMember, setFilterMember] = useState("Todos");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!isLocalDev) return;
    setLoading(true);
    setError(null);
    try {
      // Step 1: Get projects
      setLoadMsg("Buscando projetos...");
      const projRes = await callClaude(
        `Use the Jira MCP tool to get all visible projects for cloudId "040e81a3-4dfa-4460-a11c-1f53aad11752". Return a JSON array of objects with fields: key, name, categoryName. Example: [{"key":"TECH","name":"TechOps","categoryName":"Ativos"}]`
      );
      let projs = [];
      try {
        const clean = projRes.texts.replace(/```json|```/g,"").trim();
        projs = JSON.parse(clean);
      } catch {
        // try extracting from tool results
        for (const tr of projRes.toolResults) {
          try {
            const txt = tr.content?.[0]?.text || "";
            const parsed = JSON.parse(txt);
            if (parsed.values) {
              projs = parsed.values.map(p => ({
                key: p.key,
                name: p.name,
                categoryName: p.projectCategory?.name || "Outros"
              }));
              break;
            }
          } catch {}
        }
      }
      setProjects(projs);

      // Step 2: Get sprint S10 issues
      setLoadMsg("Buscando issues da sprint S10...");
      const issueRes = await callClaude(
        `Use the Jira MCP to search issues with JQL: sprint = "S10" ORDER BY project ASC, status ASC on cloudId "040e81a3-4dfa-4460-a11c-1f53aad11752", get up to 100 results with fields summary,status,priority,project,issuetype,assignee,updated. Return a JSON array of objects: [{key,projectKey,projectName,summary,statusName,statusCatKey,assigneeName,priority,updated}]. statusCatKey must be "new","indeterminate", or "done".`
      );
      let issues = [];
      try {
        const clean = issueRes.texts.replace(/```json|```/g,"").trim();
        issues = JSON.parse(clean);
      } catch {
        for (const tr of issueRes.toolResults) {
          try {
            const txt = tr.content?.[0]?.text || "";
            const parsed = JSON.parse(txt);
            if (parsed.issues) {
              issues = parsed.issues.map(i => ({
                key: i.key,
                projectKey: i.fields.project?.key,
                projectName: i.fields.project?.name,
                summary: i.fields.summary,
                statusName: i.fields.status?.name,
                statusCatKey: getStatusCat(i.fields.status),
                assigneeName: i.fields.assignee?.displayName || "Sem responsável",
                priority: i.fields.priority?.name,
                updated: i.fields.updated?.slice(0,10),
              }));
              break;
            }
          } catch {}
        }
      }
      setSprintIssues(issues);
      setLastUpdated(new Date().toLocaleString("pt-BR"));
    } catch (e) {
      setError("Erro ao buscar dados: " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
    setLoadMsg("");
  }, []);

  useEffect(() => {
    if (isLocalDev) fetchData();
  }, [fetchData]);

  // Derived stats
  const totals = {
    total: sprintIssues.length,
    done: sprintIssues.filter(i=>i.statusCatKey==="done").length,
    inprogress: sprintIssues.filter(i=>i.statusCatKey==="indeterminate").length,
    pending: sprintIssues.filter(i=>i.statusCatKey==="new").length,
  };

  const byProject = {};
  sprintIssues.forEach(i => {
    if (!byProject[i.projectKey]) byProject[i.projectKey] = { name:i.projectName, total:0, done:0, inprogress:0, pending:0 };
    byProject[i.projectKey].total++;
    if (i.statusCatKey==="done") byProject[i.projectKey].done++;
    else if (i.statusCatKey==="indeterminate") byProject[i.projectKey].inprogress++;
    else byProject[i.projectKey].pending++;
  });

  const members = [...new Set(sprintIssues.map(i=>i.assigneeName))].sort();
  const memberStats = {};
  members.forEach(name => {
    const mis = sprintIssues.filter(i=>i.assigneeName===name);
    memberStats[name] = {
      total:mis.length,
      done:mis.filter(i=>i.statusCatKey==="done").length,
      inprogress:mis.filter(i=>i.statusCatKey==="indeterminate").length,
      pending:mis.filter(i=>i.statusCatKey==="new").length,
    };
  });

  const byCategory = {};
  projects.forEach(p => {
    const cat = p.categoryName || "Outros";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  });

  const filtered = sprintIssues.filter(i => {
    if (filterProj !== "Todos" && i.projectKey !== filterProj) return false;
    if (filterMember !== "Todos" && i.assigneeName !== filterMember) return false;
    if (filterStatus === "Pendente" && i.statusCatKey !== "new") return false;
    if (filterStatus === "Em Andamento" && i.statusCatKey !== "indeterminate") return false;
    if (filterStatus === "Concluído" && i.statusCatKey !== "done") return false;
    if (search && !i.summary.toLowerCase().includes(search.toLowerCase()) && !i.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pct = (n,t) => t ? Math.round((n/t)*100) : 0;

  const S = { background:"#0d1117", minHeight:"100vh", color:"#e6edf3", fontFamily:"system-ui,sans-serif", padding:"20px" };

  if (loading) return (
    <div style={{ ...S, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ fontSize:32, animation:"spin 1s linear infinite" }}>⚡</div>
      <div style={{ fontSize:14, color:"#8b949e" }}>{loadMsg || "Carregando..."}</div>
      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ ...S, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
      <div style={{ fontSize:28 }}>⚠️</div>
      <div style={{ color:"#f87171", fontSize:13 }}>{error}</div>
      <button onClick={fetchData} style={{ background:"#6366f1", border:"none", borderRadius:8, color:"#fff", padding:"8px 20px", cursor:"pointer", fontSize:13 }}>Tentar novamente</button>
    </div>
  );

  return (
    <div style={S}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚡</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, background:"linear-gradient(90deg,#a5b4fc,#c4b5fd)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              Dashboard · {sprintName} · fenasbac-tech
            </div>
            <div style={{ fontSize:11, color:"#8b949e" }}>
              {lastUpdated ? `Atualizado em ${lastUpdated}` : "—"} · {projects.length} projetos · {sprintIssues.length} issues na sprint
            </div>
          </div>
        </div>
        <button onClick={fetchData} style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:8, color:"#a5b4fc", padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600 }}>
          🔄 Atualizar
        </button>
      </div>

      {!isLocalDev && (
        <div style={{
          background:"#161b22", border:"1px solid #30363d", borderRadius:12,
          padding:"16px 18px", marginBottom:16, fontSize:13, lineHeight:1.6, color:"#c9d1d9"
        }}>
          <div style={{ fontWeight:700, color:"#a5b4fc", marginBottom:8 }}>Visualização publicada (GitHub Pages)</div>
          <div>
            Os dados do Jira só carregam em desenvolvimento local, com a chave da API no arquivo <code style={{ color:"#fbbf24" }}>.env</code>.
          </div>
          <div style={{ marginTop:10, color:"#8b949e" }}>
            No seu computador: <code style={{ color:"#e6edf3" }}>cd ~/Projects/dashboard-s10-jira && npm run dev</code>
          </div>
          <div style={{ marginTop:8 }}>
            Relatório estático da sprint:{" "}
            <a href="https://lenita-costa.github.io/dashboard-s10-fenasbac/" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>
              dashboard-s10-fenasbac
            </a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["projects","🗂 Projetos"],["sprint","⚡ Sprint"],["team","👥 Time"],["issues","📋 Issues"]].map(([t,l]) => (
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
            background: tab===t ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#161b22",
            color: tab===t ? "#fff" : "#8b949e"
          }}>{l}</button>
        ))}
      </div>

      {/* PROJECTS */}
      {tab === "projects" && (
        <div>
          {projects.length === 0 ? (
            <div style={{ color:"#8b949e", textAlign:"center", padding:40, fontSize:13 }}>Nenhum projeto carregado. Clique em Atualizar.</div>
          ) : Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat} style={{ marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color: CAT_COLORS[cat] || "#6366f1", marginBottom:10 }}>
                {cat} <span style={{ fontWeight:400, color:"#8b949e", fontSize:11 }}>({list.length})</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:8 }}>
                {list.map(p => {
                  const col = projColor(p.key);
                  const stats = byProject[p.key];
                  return (
                    <div key={p.key} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:"12px 14px", cursor:"pointer", position:"relative", overflow:"hidden" }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=col}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="#21262d"}
                      onClick={()=>{ setFilterProj(p.key); setTab("issues"); }}>
                      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:col }} />
                      <div style={{ fontSize:10, fontWeight:700, color:col, letterSpacing:".5px" }}>{p.key}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#c9d1d9", marginTop:2, lineHeight:1.3 }}>{p.name}</div>
                      {stats ? (
                        <>
                          <div style={{ background:"#0d1117", borderRadius:99, height:3, overflow:"hidden", margin:"8px 0 4px" }}>
                            <div style={{ width:`${pct(stats.done,stats.total)}%`, background:col, height:"100%", borderRadius:99 }} />
                          </div>
                          <div style={{ display:"flex", gap:8, fontSize:10 }}>
                            <span style={{ color:"#10b981" }}>✓{stats.done}</span>
                            <span style={{ color:"#f59e0b" }}>⟳{stats.inprogress}</span>
                            <span style={{ color:"#3b82f6" }}>○{stats.pending}</span>
                            <span style={{ color:col, marginLeft:"auto", fontWeight:700 }}>{pct(stats.done,stats.total)}%</span>
                          </div>
                        </>
                      ) : <div style={{ fontSize:10, color:"#484f58", marginTop:6 }}>Sem issues na sprint</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SPRINT */}
      {tab === "sprint" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:18 }}>
            {[["⚡","Total",totals.total,"#6366f1"],["✅","Concluídas",totals.done,"#10b981"],["⚙️","Em Andamento",totals.inprogress,"#f59e0b"],["🕐","Pendentes",totals.pending,"#3b82f6"]].map(([ic,lb,v,c])=>(
              <div key={lb} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:"14px 16px", position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:c, borderRadius:"12px 12px 0 0" }} />
                <div style={{ fontSize:20 }}>{ic}</div>
                <div style={{ fontSize:28, fontWeight:700, color:c, lineHeight:1, marginTop:4 }}>{v}</div>
                <div style={{ fontSize:11, color:"#8b949e", marginTop:3 }}>{lb}</div>
              </div>
            ))}
          </div>

          <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:16, marginBottom:18 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Progresso geral — {pct(totals.done,totals.total)}%</div>
            <div style={{ display:"flex", gap:3, height:8, borderRadius:99, overflow:"hidden" }}>
              {totals.done>0 && <div style={{ width:`${pct(totals.done,totals.total)}%`, background:"#10b981" }} />}
              {totals.inprogress>0 && <div style={{ width:`${pct(totals.inprogress,totals.total)}%`, background:"#f59e0b" }} />}
              {totals.pending>0 && <div style={{ width:`${pct(totals.pending,totals.total)}%`, background:"#3b82f6" }} />}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:10 }}>
            {Object.entries(byProject).sort((a,b)=>b[1].total-a[1].total).map(([key,data])=>{
              const col = projColor(key);
              return (
                <div key={key} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:14, cursor:"pointer" }}
                  onClick={()=>{ setFilterProj(key); setTab("issues"); }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:col }}>{key}</div>
                      <div style={{ fontSize:12, color:"#c9d1d9" }}>{data.name}</div>
                    </div>
                    <div style={{ fontSize:11, color:"#8b949e" }}>{data.total}</div>
                  </div>
                  <div style={{ background:"#21262d", borderRadius:99, height:5, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ width:`${pct(data.done,data.total)}%`, background:col, height:"100%", borderRadius:99 }} />
                  </div>
                  <div style={{ display:"flex", gap:10, fontSize:11 }}>
                    <span style={{ color:"#10b981" }}>✓{data.done}</span>
                    <span style={{ color:"#f59e0b" }}>⟳{data.inprogress}</span>
                    <span style={{ color:"#3b82f6" }}>○{data.pending}</span>
                    <span style={{ color:col, marginLeft:"auto", fontWeight:700 }}>{pct(data.done,data.total)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TEAM */}
      {tab === "team" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:12 }}>
          {members.map(name => {
            const s = memberStats[name];
            const col = PROJ_COLORS[members.indexOf(name) % PROJ_COLORS.length];
            const initials = name.split(" ").map(w=>w[0]).slice(0,2).join("");
            return (
              <div key={name} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:col+"22", border:`2px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:col, flexShrink:0 }}>{initials}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{name}</div>
                    <div style={{ fontSize:11, color:"#8b949e" }}>{s.total} issues na sprint</div>
                  </div>
                </div>
                <div style={{ background:"#21262d", borderRadius:99, height:5, overflow:"hidden", marginBottom:10 }}>
                  <div style={{ width:`${pct(s.done,s.total)}%`, background:col, height:"100%", borderRadius:99 }} />
                </div>
                <div style={{ display:"flex", gap:8, fontSize:12, marginBottom:10 }}>
                  {[["#10b981","✓",s.done],["#f59e0b","⟳",s.inprogress],["#3b82f6","○",s.pending]].map(([c,ic,v])=>(
                    <div key={ic} style={{ flex:1, textAlign:"center" }}>
                      <div style={{ color:c, fontWeight:700, fontSize:16 }}>{v}</div>
                      <div style={{ color:"#8b949e", fontSize:10 }}>{ic==="✓"?"Concluído":ic==="⟳"?"Em andamento":"Pendente"}</div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{ setFilterMember(name); setTab("issues"); }}
                  style={{ width:"100%", background:"#0d1117", border:`1px solid ${col}44`, borderRadius:6, color:col, fontSize:11, padding:"6px 0", cursor:"pointer", fontWeight:600 }}>
                  Ver issues →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ISSUES */}
      {tab === "issues" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
            <input placeholder="🔍 Buscar..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:8, padding:"7px 12px", color:"#e6edf3", fontSize:12, minWidth:160, outline:"none" }} />
            <select value={filterProj} onChange={e=>setFilterProj(e.target.value)}
              style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:8, padding:"7px 10px", color:"#e6edf3", fontSize:12, cursor:"pointer" }}>
              <option>Todos</option>
              {Object.keys(byProject).sort().map(k=><option key={k}>{k}</option>)}
            </select>
            <select value={filterMember} onChange={e=>setFilterMember(e.target.value)}
              style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:8, padding:"7px 10px", color:"#e6edf3", fontSize:12, cursor:"pointer" }}>
              <option>Todos</option>
              {members.map(m=><option key={m}>{m}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:8, padding:"7px 10px", color:"#e6edf3", fontSize:12, cursor:"pointer" }}>
              <option>Todos</option>
              <option>Pendente</option>
              <option>Em Andamento</option>
              <option>Concluído</option>
            </select>
            {(filterProj!=="Todos"||filterMember!=="Todos"||filterStatus!=="Todos"||search) && (
              <button onClick={()=>{ setFilterProj("Todos"); setFilterMember("Todos"); setFilterStatus("Todos"); setSearch(""); }}
                style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:8, padding:"7px 10px", color:"#8b949e", fontSize:12, cursor:"pointer" }}>✕</button>
            )}
          </div>
          <div style={{ fontSize:11, color:"#8b949e", marginBottom:8 }}>{filtered.length} de {sprintIssues.length} issues</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {filtered.map(i => {
              const sc = STATUS_CAT[i.statusCatKey] || STATUS_CAT.new;
              const col = projColor(i.projectKey);
              const initials = (i.assigneeName||"?").split(" ").map(w=>w[0]).slice(0,2).join("");
              return (
                <div key={i.key} style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:9, padding:"9px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=col}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#21262d"}>
                  <div style={{ width:7, height:7, background:sc.dot, borderRadius:99, flexShrink:0 }} />
                  <a href={`${JIRA_BASE}${i.key}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                    style={{ fontSize:11, fontWeight:700, color:col, textDecoration:"none", minWidth:90, letterSpacing:".5px" }}>{i.key}</a>
                  <div style={{ flex:1, fontSize:12, color:"#c9d1d9", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{i.summary}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:"#21262d", border:"1.5px solid #30363d", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#c9d1d9" }}
                      title={i.assigneeName}>{initials}</div>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:sc.bg, color:sc.text, fontWeight:600, whiteSpace:"nowrap" }}>{i.statusName}</span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ textAlign:"center", padding:40, color:"#8b949e", fontSize:13 }}>Nenhuma issue encontrada.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
