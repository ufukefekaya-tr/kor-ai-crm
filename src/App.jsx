// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./components/Icon.jsx";
import Dashboard, { Badge } from "./components/Dashboard.jsx";
import Records from "./components/Records.jsx";
import EntityForm from "./components/EntityForm.jsx";
import Agents from "./components/Agents.jsx";
import { request, subscribeEvents, number } from "./lib/api.js";
import { entityConfig } from "./lib/entities.js";
const collectionNames = Object.keys(entityConfig);
const nav = [
  ["overview", "grid", "Overview"],
  ["customers", "people", "Customers"],
  ["reps", "briefcase", "Team"],
  ["visits", "activity", "Visits"],
  ["appointments", "calendar", "Calendar"],
  ["routes", "route", "Routes"],
  ["targets", "target", "Targets"],
];
const extraNav = [
  ["agents", "spark", "Agent workspace"],
  ["skills", "book", "Skill catalog"],
  ["connectors", "connector", "Connectors"],
];
const pageCopy = {
  overview: [
    "A clearer view of your field.",
    "The right context. The next conversation. A little more progress.",
  ],
  agents: [
    "Good questions. Clearer decisions.",
    "Read-only agents help you reflect on the recorded picture.",
  ],
  skills: [
    "Capabilities, made visible.",
    "A transparent catalog of available, adapted and excluded skill metadata.",
  ],
};
export default function App() {
  const refreshId = useRef(0);
  const [page, setPage] = useState("overview");
  const [collections, setCollections] = useState({});
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [skills, setSkills] = useState([]);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [settings, setSettings] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const api = useCallback(
    (path, options) => request(path, options, token),
    [token],
  );
  const reload = useCallback(async () => {
    const currentRefresh = ++refreshId.current;
    const jobs = [
      api("/summary"),
      api("/health"),
      api("/skills"),
      ...collectionNames.map(async (kind) => {
        const first = await api(`/${kind}?limit=500&offset=0`);
        const items = [...first.items];
        while (items.length < first.total && items.length < 5000) {
          const next = await api(`/${kind}?limit=500&offset=${items.length}`);
          if (!next.items.length) break;
          items.push(...next.items);
        }
        return { ...first, items };
      }),
    ];
    const results = await Promise.allSettled(jobs);
    if (currentRefresh !== refreshId.current) return;
    if (results[0].status === "fulfilled") {
      setSummary(results[0].value);
      setError("");
    } else {
      const reason = results[0].reason;
      setError(
        reason.status === 401
          ? "This workspace requires an API token. Open Connection settings to continue."
          : `Cannot load the local workspace. ${reason.message}`,
      );
    }
    if (results[1].status === "fulfilled") setHealth(results[1].value);
    if (results[2].status === "fulfilled")
      setSkills(results[2].value.items || []);
    setCollections((current) => {
      const next = { ...current };
      collectionNames.forEach((kind, index) => {
        if (results[index + 3].status === "fulfilled")
          next[kind] = results[index + 3].value;
      });
      return next;
    });
    setLoading(false);
  }, [api]);
  useEffect(() => {
    let timer;
    reload();
    const stop = subscribeEvents(
      token,
      () => {
        clearTimeout(timer);
        timer = setTimeout(reload, 150);
      },
      setConnected,
    );
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [reload, token]);
  function navigate(value) {
    setPage(value);
    setSearch("");
    setError("");
    setNotice("");
  }
  function newRecord(kind = page) {
    setFormError("");
    setEditor({ kind, record: null });
  }
  async function saveRecord(body) {
    setBusy(true);
    setFormError("");
    try {
      const { kind, record } = editor;
      await api(
        `/${kind}${record ? `/${encodeURIComponent(record.id)}` : ""}`,
        { method: record ? "PUT" : "POST", body },
      );
      setEditor(null);
      setNotice(
        `${entityConfig[kind].singular[0].toUpperCase() + entityConfig[kind].singular.slice(1)} saved.`,
      );
      await reload();
    } catch (cause) {
      setFormError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/${deleting.kind}/${encodeURIComponent(deleting.record.id)}`, {
        method: "DELETE",
      });
      setDeleting(null);
      setNotice("Record removed.");
      await reload();
    } catch (cause) {
      setError(cause.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }
  const config = entityConfig[page];
  const [title, description] = pageCopy[page] || [
    config?.title,
    config?.description,
  ];
  const skillItems = useMemo(
    () =>
      skills.filter((item) =>
        `${item.title} ${item.description} ${item.capabilities.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [skills, search],
  );
  return (
    <div className="crm-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            KOR<span className="brand-ai">AI</span>
            <small>CRM WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">W</span>
          <span>
            Local workspace<small>Community edition</small>
          </span>
          <Icon name="chevron" size={12} />
        </div>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              title={label}
            >
              <Icon name={icon} size={18} />
              <span>{label}</span>
              {id === "visits" && <small>{summary?.counts?.visits || 0}</small>}
            </button>
          ))}
        </nav>
        <span className="nav-label intelligence-label">
          A LITTLE MORE CONTEXT
        </span>
        <nav aria-label="Tools navigation">
          {extraNav.map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
              title={label}
            >
              <Icon name={icon} size={18} />
              <span>{label}</span>
              {id === "agents" && <i>AI</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="thought-card">
            <span>
              <Icon name="spark" size={19} />
            </span>
            <h3>People first. Context always.</h3>
            <p>
              Helpful signals for human decisions. Your team keeps the final
              say.
            </p>
          </div>
          <button
            className="connection-button"
            onClick={() => {
              setTokenInput(token);
              setSettings(true);
            }}
            title="Connection settings"
          >
            <Icon name="presets" size={17} />
            <span>Connection settings</span>
            <i className={connected ? "live" : ""} />
          </button>
          <div className="sidebar-version">
            LOCAL FIRST <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <Icon name="chevron" size={12} />
            <strong>
              {page === "overview"
                ? "Overview"
                : config?.title ||
                  extraNav.find((item) => item[0] === page)?.[2]}
            </strong>
          </div>
          <div className="header-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Search current records"
              placeholder={
                page === "skills"
                  ? "Search skill metadata…"
                  : config
                    ? `Search ${config.title.toLowerCase()}…`
                    : "Search customers…"
              }
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                if (!config && page !== "skills") setPage("customers");
              }}
            />
          </div>
          <div className="header-right">
            <span className="live-label">
              <i className={connected ? "live" : ""} />
              {connected ? "Live workspace" : "Local workspace"}
            </span>
            <button
              className="icon-button"
              title="Connection settings"
              aria-label="Connection settings"
              onClick={() => {
                setTokenInput(token);
                setSettings(true);
              }}
            >
              <Icon name="presets" size={18} />
            </button>
            <span className="user-avatar">LW</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "overview"
                  ? "THE BIG PICTURE"
                  : page === "agents"
                    ? "THINK TOGETHER"
                    : "YOUR FIELD WORKBENCH"}
              </span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <div className="page-heading-actions">
              {page === "overview" ? (
                <>
                  <span className="date-label">
                    <Icon name="calendar" size={15} />
                    All recorded activity
                  </span>
                  <button
                    className="button button-primary"
                    onClick={() => newRecord("visits")}
                  >
                    <Icon name="plus" size={16} />
                    Log a visit
                  </button>
                </>
              ) : config ? (
                <button
                  className="button button-primary"
                  onClick={() => newRecord()}
                >
                  <Icon name="plus" size={16} />
                  Add {config.singular}
                </button>
              ) : (
                <Badge tone="green">
                  {page === "agents"
                    ? `${health?.aiMode || "mock"} mode · read only`
                    : `${skills.length} catalog entries`}
                </Badge>
              )}
            </div>
          </div>
          {health?.demo && (
            <div className="demo-notice">
              <Icon name="info" size={14} />
              <span>
                Fictional demo workspace · sample records are for exploration.
              </span>
              <Badge>DEMO DATA</Badge>
            </div>
          )}
          {(error || notice) && (
            <div
              className={`notice ${error ? "error" : "success"}`}
              role={error ? "alert" : "status"}
            >
              <Icon name={error ? "info" : "check"} size={16} />
              <span>{error || notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              >
                ×
              </button>
            </div>
          )}
          {page === "overview" && (
            <Dashboard summary={summary} onPage={navigate} onNew={newRecord} />
          )}
          {config && (
            <Records
              kind={page}
              collection={collections[page]}
              collections={collections}
              summary={summary}
              search={search}
              onEdit={(record) => {
                setFormError("");
                setEditor({ kind: page, record });
              }}
              onDelete={(record) => setDeleting({ kind: page, record })}
              onNew={() => newRecord()}
            />
          )}
          {page === "visits" && (
            <section className="quality-explainer">
              <Icon name="info" size={17} />
              <div>
                <h3>Quality signals explain the evidence.</h3>
                <p>
                  Notes, actions, next steps, coordinates and timing contribute
                  to the score. Missing or unusual data calls for review; it
                  does not establish employee intent or misconduct.
                </p>
              </div>
            </section>
          )}
          {page === "agents" && <Agents api={api} health={health} />}
          {page === "skills" && (
            <>
              <div className="skills-intro">
                <Icon name="book" size={22} />
                <div>
                  <h2>A catalog, with clear boundaries.</h2>
                  <p>
                    These entries describe capabilities and provenance. Browsing
                    this page does not execute skills, install tools, contact
                    services or read host data.
                  </p>
                </div>
              </div>
              <div className="skills-grid">
                {skillItems.map((skill) => (
                  <article className="panel skill-card" key={skill.id}>
                    <div>
                      <span className="skill-icon">
                        <Icon
                          name={
                            skill.capabilities.includes("network")
                              ? "connector"
                              : skill.capabilities.includes("host-execution")
                                ? "code"
                                : "book"
                          }
                          size={19}
                        />
                      </span>
                      <Badge
                        tone={skill.status === "excluded" ? "neutral" : "green"}
                      >
                        {skill.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <h2>{skill.title}</h2>
                    <p>{skill.description}</p>
                    <footer>
                      {skill.capabilities.map((capability) => (
                        <span key={capability}>{capability}</span>
                      ))}
                    </footer>
                  </article>
                ))}
              </div>
              {!skillItems.length && (
                <div className="empty-state">No matching skill metadata.</div>
              )}
            </>
          )}
          {page === "connectors" && (
            <div className="quality-explainer">
              <Icon name="connector" size={18} />
              <div>
                <h3>Metadata only. No background deliveries.</h3>
                <p>
                  Connection records are an inventory for review. Saving an
                  origin does not send data, execute a webhook or authorize an
                  integration.
                </p>
              </div>
            </div>
          )}
          <footer className="page-footer">
            <span>
              KOR AI <i>·</i> A little context goes a long way.
            </span>
            <span>
              {loading
                ? "Loading local records…"
                : `${number(summary?.counts?.customers)} customers · ${number(summary?.counts?.visits)} visits`}{" "}
              <i>·</i> Your records stay in this workspace.
            </span>
          </footer>
        </div>
      </main>
      {editor && (
        <EntityForm
          key={`${editor.kind}-${editor.record?.id || "new"}`}
          kind={editor.kind}
          record={editor.record}
          collections={collections}
          onClose={() => !busy && setEditor(null)}
          onSave={saveRecord}
          busy={busy}
          error={formError}
        />
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <span className="delete-symbol">
              <Icon name="trash" size={24} />
            </span>
            <h2 id="delete-title">
              Remove this {entityConfig[deleting.kind].singular}?
            </h2>
            <p>
              {deleting.record.name ||
                deleting.record.title ||
                "The selected record"}{" "}
              will be removed. Records referenced elsewhere may need to be
              unlinked first.
            </p>
            <footer>
              <button
                className="button button-light"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                Keep record
              </button>
              <button
                className="button button-danger"
                onClick={deleteRecord}
                disabled={busy}
              >
                Remove record
              </button>
            </footer>
          </section>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop">
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LOCAL CONNECTION</span>
                <h2 id="connection-title">Connect to this workspace</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close connection settings"
                onClick={() => setSettings(false)}
              >
                ×
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const next = tokenInput.trim();
                setToken(next);
                setTokenInput(next);
                setSettings(false);
                setLoading(true);
                if (next === token) reload();
              }}
            >
              <p>
                If the server requires an API token, enter it here. It is held
                only in this page’s memory and sent to the same local API.
              </p>
              <label className="field">
                <span>Workspace API token · optional</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="Leave empty for an unprotected local server"
                />
              </label>
              <small>Refreshing or closing this page clears the token.</small>
              <footer>
                <button
                  className="button button-light"
                  type="button"
                  onClick={() => {
                    setToken("");
                    setTokenInput("");
                    setSettings(false);
                  }}
                >
                  Clear token
                </button>
                <button className="button button-primary" type="submit">
                  Connect
                  <Icon name="arrow" size={15} />
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
