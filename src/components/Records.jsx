// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import { entityConfig } from "../lib/entities.js";
import { number, day, dateTime, initials } from "../lib/api.js";
import { Badge, Score } from "./Dashboard.jsx";
import Icon from "./Icon.jsx";
export default function Records({
  kind,
  collection,
  collections,
  summary,
  search,
  onEdit,
  onDelete,
  onNew,
}) {
  const config = entityConfig[kind];
  const items = collection?.items || [];
  const rows = items.filter((record) =>
    JSON.stringify(record).toLowerCase().includes(search.toLowerCase()),
  );
  const rep = (id) =>
    collections.reps?.items.find((item) => item.id === id)?.name ||
    "Unassigned";
  const customer = (id) =>
    collections.customers?.items.find((item) => item.id === id)?.name || "—";
  const columns = {
    customers: ["CUSTOMER", "CONTACT", "OWNER", "STATUS", "LOCATION"],
    reps: ["REPRESENTATIVE", "REGION", "EMAIL", "ACCOUNTS", "STATUS"],
    visits: [
      "CUSTOMER / VISIT",
      "REPRESENTATIVE",
      "OUTCOME",
      "QUALITY",
      "AMOUNT",
    ],
    appointments: [
      "APPOINTMENT",
      "CUSTOMER",
      "REPRESENTATIVE",
      "SCHEDULE",
      "STATUS",
    ],
    routes: [
      "ROUTE",
      "REPRESENTATIVE",
      "DATE",
      "ORDERED STOPS",
      "EST. DISTANCE",
    ],
    targets: [
      "REPRESENTATIVE",
      "PERIOD",
      "VISIT GOAL",
      "SALES GOAL",
      "RECORDED VISITS",
    ],
    connectors: ["CONNECTOR", "TYPE", "HTTPS ORIGIN", "DELIVERY"],
  };
  function cells(item) {
    switch (kind) {
      case "customers":
        return [
          <span className="account-cell">
            <i>{initials(item.name)}</i>
            <span>
              <strong>{item.name}</strong>
              <small>{item.industry || "Industry not set"}</small>
            </span>
          </span>,
          <>
            <strong>{item.contactName || "—"}</strong>
            <small>{item.email || item.phone || "No contact details"}</small>
          </>,
          rep(item.assignedRepId),
          <Badge
            tone={
              item.status === "active"
                ? "green"
                : item.status === "at_risk"
                  ? "red"
                  : "neutral"
            }
          >
            {item.status?.replaceAll("_", " ")}
          </Badge>,
          item.lat != null && item.lng != null ? (
            <span className="subtle">
              {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
            </span>
          ) : (
            "Not recorded"
          ),
        ];
      case "reps":
        return [
          <span className="account-cell">
            <i>{initials(item.name)}</i>
            <strong>{item.name}</strong>
          </span>,
          item.region || "—",
          item.email || "—",
          number(
            collections.customers?.items.filter(
              (customer) => customer.assignedRepId === item.id,
            ).length,
          ),
          <Badge tone={item.active ? "green" : "neutral"}>
            {item.active ? "Active" : "Inactive"}
          </Badge>,
        ];
      case "visits":
        return [
          <>
            <strong>{item.customerName || customer(item.customerId)}</strong>
            <small>{dateTime(item.occurredAt)}</small>
          </>,
          item.repName || rep(item.repId),
          <Badge
            tone={
              item.outcome === "won"
                ? "green"
                : item.outcome === "proposal"
                  ? "amber"
                  : "neutral"
            }
          >
            {item.outcome?.replaceAll("_", " ")}
          </Badge>,
          <details className="score-details">
            <summary>
              <Score value={item.analysis?.quality?.score} />
              <span>Why?</span>
            </summary>
            <div>
              <strong>
                Visit quality · {item.analysis?.quality?.status || "not scored"}
              </strong>
              <ul>
                {(item.analysis?.quality?.reasons || []).map(
                  (reason, index) => (
                    <li key={index}>{reason}</li>
                  ),
                )}
              </ul>
              <strong>Sales context</strong>
              <p>
                {item.analysis?.sales?.stage || "No stage recorded"} · score{" "}
                {item.analysis?.sales?.score ?? "—"}
              </p>
              <strong>Account context</strong>
              <p>{item.analysis?.health?.band || "unknown"}</p>
              {(item.analysis?.health?.reasons || []).map((reason, index) => (
                <p key={index}>{reason}</p>
              ))}
            </div>
          </details>,
          number(item.amount),
        ];
      case "appointments":
        return [
          <>
            <strong>{item.title}</strong>
            <small>{item.notes || "No preparation notes"}</small>
          </>,
          item.customerName || customer(item.customerId),
          item.repName || rep(item.repId),
          <>
            <strong>{dateTime(item.startsAt)}</strong>
            <small>until {dateTime(item.endsAt)}</small>
          </>,
          <Badge
            tone={
              item.status === "completed"
                ? "green"
                : item.status === "cancelled"
                  ? "red"
                  : "neutral"
            }
          >
            {item.status}
          </Badge>,
        ];
      case "routes":
        return [
          <strong>{item.name}</strong>,
          item.repName || rep(item.repId),
          day(item.visitDate),
          <div className="route-stop-labels">
            {item.stopCustomerIds?.map((id, index) => (
              <span key={`${id}-${index}`}>
                {index + 1}. {customer(id)}
              </span>
            ))}
          </div>,
          item.distanceKm == null ? (
            "Missing coordinates"
          ) : (
            <>
              <strong>{number(item.distanceKm)} km</strong>
              <small>Straight-line estimate</small>
            </>
          ),
        ];
      case "targets":
        return [
          <strong>{item.repName || rep(item.repId)}</strong>,
          `${day(item.periodStart)} — ${day(item.periodEnd)}`,
          number(item.visitGoal),
          number(item.salesGoal),
          number(
            summary?.targets?.find((target) => target.id === item.id)
              ?.actualVisits,
          ),
        ];
      case "connectors":
        return [
          <strong>{item.name}</strong>,
          <Badge>{item.type}</Badge>,
          item.url,
          <Badge tone="amber">Disabled · metadata only</Badge>,
        ];
      default:
        return [];
    }
  }
  return (
    <section className="panel records-panel">
      <div className="panel-heading">
        <div>
          <h2>{config.title}</h2>
          <p>
            {rows.length} shown · {items.length} loaded of{" "}
            {collection?.total ?? items.length} total
            {items.length < (collection?.total || 0)
              ? " · loading is capped at 5,000 records"
              : ""}
          </p>
        </div>
        <div className="table-filter-pill">
          <Icon name={config.icon} size={15} />
          {kind === "visits"
            ? "Explainable scoring"
            : kind === "routes"
              ? "Ordered stops"
              : "Local records"}
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns[kind].map((column) => (
                <th key={column}>{column}</th>
              ))}
              <th className="actions-header">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                {cells(item).map((value, index) => (
                  <td key={index}>{value}</td>
                ))}
                <td>
                  <div className="row-actions">
                    <button
                      className="text-button"
                      onClick={() => onEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Delete ${item.name || item.title || config.singular}`}
                      onClick={() => onDelete(item)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">
            <Icon name={config.icon} size={35} />
            <h3>
              {search
                ? "No matching records."
                : `Your ${config.title.toLowerCase()} start here.`}
            </h3>
            <p>{search ? "Try a different search." : config.description}</p>
            {!search && (
              <button className="button button-primary" onClick={onNew}>
                <Icon name="plus" size={15} />
                Add {config.singular}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
