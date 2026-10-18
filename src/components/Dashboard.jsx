// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import Icon from "./Icon.jsx";
import { number, day, dateTime, initials } from "../lib/api.js";
export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Score({ value }) {
  return (
    <span
      className={`quality-score ${value == null ? "unknown" : value >= 75 ? "good" : value >= 45 ? "watch" : "attention"}`}
    >
      {value == null ? "—" : Math.round(value)}
      <small>{value == null ? "not scored" : "/ 100"}</small>
    </span>
  );
}
function Metric({ label, value, note, icon, color }) {
  return (
    <article className="metric-card">
      <div>
        <span>{label}</span>
        <i className={color}>
          <Icon name={icon} size={18} />
        </i>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
export default function Dashboard({ summary, onPage, onNew }) {
  const data = summary || {};
  const counts = data.counts || {};
  const quality = data.quality || {};
  const health = data.health || {};
  const days = data.charts?.visitsByDay || [];
  const maximum = Math.max(1, ...days.map((item) => item.count));
  const healthTotal = Object.values(health).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const healthy = healthTotal ? (health.healthy / healthTotal) * 100 : 0;
  const watch = healthTotal ? (health.watch / healthTotal) * 100 : 0;
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Total customers"
          value={number(counts.customers)}
          note={`${number(counts.reps)} representatives in your team`}
          icon="people"
          color="mint"
        />
        <Metric
          label="Recorded visits"
          value={number(counts.visits)}
          note="Useful context from every conversation"
          icon="activity"
          color="peach"
        />
        <Metric
          label="Visit quality"
          value={
            quality.averageScore == null
              ? "—"
              : `${Math.round(quality.averageScore)}%`
          }
          note={`${number(quality.flaggedVisits)} visits need a closer look`}
          icon="check"
          color="lavender"
        />
        <Metric
          label="Recorded sales"
          value={number(data.sales?.totalAmount)}
          note={`${number(data.sales?.orders)} won visits · currency unspecified`}
          icon="briefcase"
          color="sand"
        />
      </div>
      <div className="dashboard-charts">
        <section className="panel activity-chart">
          <div className="panel-heading">
            <div>
              <h2>A little progress, every day.</h2>
              <p>Recorded visits over time</p>
            </div>
            <span className="chart-key">
              <i />
              Visits
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`${days.length} days of recorded visit activity`}
          >
            {days.length ? (
              days.slice(-14).map((item, index) => (
                <div className="chart-column" key={item.date}>
                  <div className="bar-track">
                    <span
                      style={{
                        height: `${Math.max(3, (item.count / maximum) * 100)}%`,
                      }}
                      className={index === days.length - 1 ? "last" : ""}
                    >
                      <b>{item.count}</b>
                    </span>
                  </div>
                  <small>{day(item.date)}</small>
                </div>
              ))
            ) : (
              <div className="empty-chart">
                Record your first visit to see activity here.
              </div>
            )}
          </div>
          <div className="chart-footer">
            <Icon name="info" size={13} />
            Activity reflects recorded visits, not inferred working hours.
          </div>
        </section>
        <section className="panel relationship-panel">
          <div className="panel-heading">
            <div>
              <h2>Customer pulse</h2>
              <p>Explainable signals, human judgment</p>
            </div>
            <Icon name="activity" size={19} />
          </div>
          <div className="pulse-content">
            <div
              className="donut"
              style={{
                background: healthTotal
                  ? `conic-gradient(#5c8e77 0 ${healthy}%,#e8b680 ${healthy}% ${healthy + watch}%,#c88373 ${healthy + watch}% ${100 - ((health.unknown || 0) / healthTotal) * 100}%,#e4e9e2 0)`
                  : "#e4e9e2",
              }}
            >
              <div>
                <strong>{number(counts.customers)}</strong>
                <span>ACCOUNTS</span>
              </div>
            </div>
            <div className="pulse-legend">
              {[
                ["Healthy", health.healthy, "healthy"],
                ["Watch", health.watch, "watch"],
                ["Attention", health.atRisk, "attention"],
                ["Not scored", health.unknown, "unknown"],
              ].map(([label, value, tone]) => (
                <div key={label}>
                  <i className={tone} />
                  <span>{label}</span>
                  <b>{value || 0}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-footer">
            Indicators support review; they are not a credit or financial
            rating.
          </div>
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel recent-visits">
          <div className="panel-heading">
            <div>
              <h2>Conversations that move things forward.</h2>
              <p>Recent field visits and the next opportunity</p>
            </div>
            <button className="text-button" onClick={() => onPage("visits")}>
              View all
              <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th>OWNER</th>
                  <th>OUTCOME</th>
                  <th>QUALITY</th>
                  <th>WHEN</th>
                </tr>
              </thead>
              <tbody>
                {(data.recentVisits || []).slice(0, 5).map((visit) => (
                  <tr key={visit.id}>
                    <td>
                      <strong>{visit.customerName || "Customer"}</strong>
                      <small>
                        {visit.nextStep || "Next step not recorded"}
                      </small>
                    </td>
                    <td>
                      <span className="owner-cell">
                        <i>{initials(visit.repName)}</i>
                        {visit.repName || "—"}
                      </span>
                    </td>
                    <td>
                      <Badge
                        tone={
                          visit.outcome === "won"
                            ? "green"
                            : visit.outcome === "proposal"
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {visit.outcome?.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td>
                      <Score value={visit.analysis?.quality?.score} />
                    </td>
                    <td>{day(visit.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.recentVisits?.length && (
              <div className="empty-state">
                <Icon name="activity" size={30} />
                <h3>Start with a conversation.</h3>
                <p>Add a customer and record your first field visit.</p>
                <button
                  className="button button-primary"
                  onClick={() => onNew("customers")}
                >
                  Add customer
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="panel upcoming-panel">
          <div className="panel-heading">
            <div>
              <h2>Up next</h2>
              <p>Keep the follow-through simple</p>
            </div>
            <Icon name="calendar" size={18} />
          </div>
          <div className="appointment-list">
            {(data.upcomingAppointments || []).slice(0, 3).map((item) => (
              <article key={item.id}>
                <div className="date-tile">
                  <strong>{new Date(item.startsAt).getDate()}</strong>
                  <span>
                    {new Date(item.startsAt).toLocaleDateString(undefined, {
                      month: "short",
                    })}
                  </span>
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.customerName || "Customer appointment"}</p>
                  <small>{dateTime(item.startsAt)}</small>
                </div>
                <i />
              </article>
            ))}
            {!data.upcomingAppointments?.length && (
              <p className="empty-note">No upcoming appointments recorded.</p>
            )}
          </div>
          <button
            className="upcoming-link"
            onClick={() => onPage("appointments")}
          >
            Open calendar
            <Icon name="arrow" size={14} />
          </button>
        </section>
      </div>
      <section className="panel targets-panel">
        <div className="panel-heading">
          <div>
            <h2>Small steps. Shared goals.</h2>
            <p>Progress against each representative’s recorded targets</p>
          </div>
          <button className="text-button" onClick={() => onPage("targets")}>
            Manage targets
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="target-cards">
          {(data.targets || []).slice(0, 4).map((target) => (
            <article key={target.id}>
              <div>
                <span className="rep-avatar">{initials(target.repName)}</span>
                <span>
                  <strong>{target.repName || "Representative"}</strong>
                  <small>
                    {day(target.periodStart)} — {day(target.periodEnd)}
                  </small>
                </span>
              </div>
              <p>
                Visits{" "}
                <b>
                  {number(target.actualVisits)}{" "}
                  <em>/ {number(target.visitGoal)}</em>
                </b>
              </p>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.min(100, Math.max(0, target.visitProgress || 0))}%`,
                  }}
                />
              </div>
              <p className="sales-progress">
                Sales amount{" "}
                <span>
                  {number(target.actualSales)} / {number(target.salesGoal)}
                </span>
              </p>
            </article>
          ))}
          {!data.targets?.length && (
            <p className="empty-note">
              Set a target to make recorded progress visible here.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
