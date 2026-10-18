// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import Icon from "./Icon.jsx";
import { Badge } from "./Dashboard.jsx";
const agents = [
  {
    id: "analyst",
    name: "The analyst",
    role: "Find the signal",
    description: "An aggregate view of activity, sales and customer context.",
    icon: "activity",
    color: "mint",
  },
  {
    id: "planner",
    name: "The planner",
    role: "Make space for the next step",
    description: "Review upcoming appointments and your saved route plans.",
    icon: "calendar",
    color: "peach",
  },
  {
    id: "coach",
    name: "The coach",
    role: "Build better field notes",
    description: "Reflect on quality signals and useful follow-through.",
    icon: "people",
    color: "lavender",
  },
];
export default function Agents({ api, health }) {
  const [active, setActive] = useState("analyst");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/agents/chat", {
        method: "POST",
        body: { agent: active, message: message.trim() },
      });
      setReplies((current) => [
        ...current,
        {
          question: message,
          reply: result.reply,
          agent: result.agent,
          mode: result.mode,
        },
      ]);
      setMessage("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="agent-cards">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`panel agent-card ${active === agent.id ? "active" : ""}`}
            onClick={() => setActive(agent.id)}
          >
            <span className={`agent-symbol ${agent.color}`}>
              <Icon name={agent.icon} size={24} />
            </span>
            <Badge tone={active === agent.id ? "green" : "neutral"}>
              {active === agent.id ? "Selected" : "Read only"}
            </Badge>
            <h2>{agent.name}</h2>
            <h3>{agent.role}</h3>
            <p>{agent.description}</p>
          </button>
        ))}
      </div>
      <section className="panel agent-chat">
        <div className="panel-heading">
          <div>
            <h2>A second perspective. Your decision.</h2>
            <p>
              {health?.aiMode === "gemini"
                ? "Your configured provider receives your message and bounded aggregate context."
                : "Deterministic local snapshots. No AI provider calls in mock mode."}
            </p>
          </div>
          <Badge tone="green">{health?.aiMode || "mock"} · READ ONLY</Badge>
        </div>
        <div className="conversation">
          {replies.map((item, index) => (
            <article key={index}>
              <div className="user-question">
                <span>YOU</span>
                <p>{item.question}</p>
              </div>
              <div className="agent-answer">
                <span>
                  <Icon name="spark" size={14} />
                  {item.agent} · {item.mode}
                </span>
                <p>{item.reply}</p>
              </div>
            </article>
          ))}
          {!replies.length && (
            <div className="empty-state">
              <Icon name="spark" size={32} />
              <h3>Ask about the bigger picture.</h3>
              <p>
                Try “What needs a closer look?” Agents can explain the recorded
                snapshot. They cannot change records or contact anyone.
              </p>
            </div>
          )}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <form className="agent-composer" onSubmit={send}>
          <textarea
            aria-label="Message the read-only agent"
            placeholder="What would you like to understand about your workspace?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
          />
          <div>
            <span>
              <Icon name="info" size={13} />
              No autonomous actions or notifications.
            </span>
            <button
              className="button button-primary"
              disabled={busy || !message.trim()}
            >
              {busy ? "Reviewing…" : "Ask agent"}
              <Icon name="arrow" size={15} />
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
