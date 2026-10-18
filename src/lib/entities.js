// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
const field = (key, label, type = "text", options = {}) => ({
  key,
  label,
  type,
  ...options,
});
export const entityConfig = {
  customers: {
    title: "Customers",
    singular: "customer",
    icon: "people",
    description: "Know the account. Keep the next step clear.",
    fields: [
      field("name", "Customer name", "text", { required: true }),
      field("contactName", "Contact person"),
      field("email", "Email", "email"),
      field("phone", "Phone"),
      field("industry", "Industry"),
      field("status", "Relationship status", "select", {
        options: ["prospect", "active", "at_risk", "inactive"],
      }),
      field("assignedRepId", "Account owner", "rep"),
      field("address", "Address", "textarea"),
      field("lat", "Latitude", "number", { optional: true, min: -90, max: 90 }),
      field("lng", "Longitude", "number", {
        optional: true,
        min: -180,
        max: 180,
      }),
      field("notes", "Account notes", "textarea"),
    ],
    defaults: { status: "prospect" },
  },
  reps: {
    title: "Team",
    singular: "representative",
    icon: "briefcase",
    description: "People, territories and clear ownership.",
    fields: [
      field("name", "Full name", "text", { required: true }),
      field("email", "Email", "email"),
      field("phone", "Phone"),
      field("region", "Region"),
      field("active", "Active representative", "checkbox"),
    ],
    defaults: { active: true },
  },
  visits: {
    title: "Visits",
    singular: "visit",
    icon: "activity",
    description: "Turn field conversations into useful account context.",
    fields: [
      field("customerId", "Customer", "customer", { required: true }),
      field("repId", "Representative", "rep", { required: true }),
      field("occurredAt", "Visit time", "datetime-local", { required: true }),
      field("outcome", "Outcome", "select", {
        options: [
          "discovery",
          "follow_up",
          "proposal",
          "won",
          "lost",
          "no_contact",
        ],
      }),
      field("notes", "Conversation notes", "textarea", { required: true }),
      field("actionTaken", "Action taken", "textarea"),
      field("nextStep", "Next step", "textarea"),
      field("amount", "Recorded sales amount", "number"),
      field("durationMinutes", "Duration · minutes", "number"),
      field("lat", "Visit latitude", "number", {
        optional: true,
        min: -90,
        max: 90,
      }),
      field("lng", "Visit longitude", "number", {
        optional: true,
        min: -180,
        max: 180,
      }),
    ],
    defaults: { outcome: "discovery", amount: 0, durationMinutes: 30 },
  },
  appointments: {
    title: "Calendar",
    singular: "appointment",
    icon: "calendar",
    description: "Keep the next conversation on the calendar.",
    fields: [
      field("title", "Appointment title", "text", { required: true }),
      field("customerId", "Customer", "customer", { required: true }),
      field("repId", "Representative", "rep", { required: true }),
      field("startsAt", "Starts at", "datetime-local", { required: true }),
      field("endsAt", "Ends at", "datetime-local", { required: true }),
      field("status", "Status", "select", {
        options: ["planned", "completed", "cancelled"],
      }),
      field("notes", "Preparation notes", "textarea"),
    ],
    defaults: { status: "planned" },
  },
  routes: {
    title: "Routes",
    singular: "route",
    icon: "route",
    description: "An ordered plan for a day in the field.",
    fields: [
      field("name", "Route name", "text", { required: true }),
      field("repId", "Representative", "rep", { required: true }),
      field("visitDate", "Visit date", "date", { required: true }),
      field("stopCustomerIds", "Ordered customer stops", "stops"),
      field("notes", "Route notes", "textarea"),
    ],
    defaults: { stopCustomerIds: [] },
  },
  targets: {
    title: "Targets",
    singular: "target",
    icon: "target",
    description: "Make progress visible for each representative.",
    fields: [
      field("repId", "Representative", "rep", { required: true }),
      field("periodStart", "Period starts", "date", { required: true }),
      field("periodEnd", "Period ends", "date", { required: true }),
      field("visitGoal", "Visit goal", "number", { required: true }),
      field("salesGoal", "Sales goal · amount", "number", { required: true }),
    ],
    defaults: { visitGoal: 10, salesGoal: 1000 },
  },
  connectors: {
    title: "Connectors",
    singular: "connector",
    icon: "connector",
    description: "Keep connection metadata together. Delivery is disabled.",
    fields: [
      field("name", "Connector name", "text", { required: true }),
      field("type", "Type", "select", { options: ["webhook", "crm"] }),
      field("url", "HTTPS origin", "url", { required: true }),
    ],
    defaults: { type: "crm" },
  },
};
export function localInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function initialValues(kind, record = {}) {
  record = record || {};
  const config = entityConfig[kind];
  const result = { ...config.defaults };
  for (const field of config.fields) {
    if (record[field.key] !== undefined)
      result[field.key] =
        field.type === "datetime-local"
          ? localInput(record[field.key])
          : record[field.key];
  }
  if (kind === "visits" && !result.occurredAt)
    result.occurredAt = localInput(new Date().toISOString());
  if (kind === "appointments" && !result.startsAt) {
    result.startsAt = localInput(new Date().toISOString());
    result.endsAt = localInput(new Date(Date.now() + 3600000).toISOString());
  }
  if (kind === "routes" && !result.visitDate)
    result.visitDate = new Date().toISOString().slice(0, 10);
  return result;
}
export function formBody(kind, values) {
  const result = {};
  for (const field of entityConfig[kind].fields) {
    let value = values[field.key];
    if (field.type === "number") {
      if (value === "" || value === null || value === undefined) {
        if (field.optional) continue;
        value = 0;
      } else value = Number(value);
    } else if (field.type === "datetime-local") {
      if (value) value = new Date(value).toISOString();
    } else if (field.type === "checkbox") value = Boolean(value);
    else if (field.type === "stops") value = value || [];
    else if (value === undefined || value === "") {
      if (field.required) result[field.key] = "";
      continue;
    }
    result[field.key] = value;
  }
  return result;
}
