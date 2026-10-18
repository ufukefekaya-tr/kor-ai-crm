// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0
import { useState } from "react";
import { entityConfig, initialValues, formBody } from "../lib/entities.js";
import Icon from "./Icon.jsx";
export default function EntityForm({
  kind,
  record,
  collections,
  onClose,
  onSave,
  busy,
  error,
}) {
  const config = entityConfig[kind];
  const [values, setValues] = useState(() => initialValues(kind, record));
  const [stop, setStop] = useState("");
  const update = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const stops = values.stopCustomerIds || [];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="entity-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
      >
        <header>
          <div>
            <span className="eyebrow">
              {record ? "UPDATE RECORD" : "NEW RECORD"}
            </span>
            <h2 id="form-title">
              {record ? "Edit" : "Add"} {config.singular}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close form"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave(formBody(kind, values));
          }}
        >
          <div className="drawer-fields">
            {config.fields.map((field) => {
              const options =
                field.type === "rep"
                  ? collections.reps?.items || []
                  : field.type === "customer"
                    ? collections.customers?.items || []
                    : field.options;
              if (field.type === "checkbox")
                return (
                  <label className="checkbox-field" key={field.key}>
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.key])}
                      onChange={(event) =>
                        update(field.key, event.target.checked)
                      }
                    />
                    {field.label}
                  </label>
                );
              if (field.type === "stops")
                return (
                  <div className="field full-width" key={field.key}>
                    <span>{field.label}</span>
                    <div className="stop-picker">
                      <select
                        aria-label="Choose next route stop"
                        value={stop}
                        onChange={(event) => setStop(event.target.value)}
                      >
                        <option value="">Choose a customer…</option>
                        {(collections.customers?.items || [])
                          .filter((customer) => !stops.includes(customer.id))
                          .map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                      </select>
                      <button
                        className="button button-light"
                        type="button"
                        disabled={!stop}
                        onClick={() => {
                          update(field.key, [...stops, stop]);
                          setStop("");
                        }}
                      >
                        <Icon name="plus" size={16} />
                        Add
                      </button>
                    </div>
                    <div className="ordered-stops">
                      {stops.map((id, index) => (
                        <div key={id}>
                          <b>{index + 1}</b>
                          <span>
                            {collections.customers?.items.find(
                              (customer) => customer.id === id,
                            )?.name || id}
                          </span>
                          <button
                            className="icon-button"
                            type="button"
                            disabled={!index}
                            title="Move earlier"
                            onClick={() => {
                              const ordered = [...stops];
                              [ordered[index], ordered[index - 1]] = [
                                ordered[index - 1],
                                ordered[index],
                              ];
                              update(field.key, ordered);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Remove stop ${index + 1}`}
                            onClick={() =>
                              update(
                                field.key,
                                stops.filter((value) => value !== id),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              return (
                <label
                  className={`field ${field.type === "textarea" ? "full-width" : ""}`}
                  key={field.key}
                >
                  <span>
                    {field.label}
                    {field.required && <em>*</em>}
                  </span>
                  {options ? (
                    <select
                      required={field.required}
                      value={values[field.key] ?? ""}
                      onChange={(event) =>
                        update(field.key, event.target.value)
                      }
                    >
                      {!field.options && <option value="">Choose…</option>}
                      {options.map((option) => (
                        <option
                          key={option.id || option}
                          value={option.id || option}
                        >
                          {option.name || String(option).replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={values[field.key] ?? ""}
                      required={field.required}
                      onChange={(event) =>
                        update(field.key, event.target.value)
                      }
                      rows="3"
                      maxLength={10000}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={values[field.key] ?? ""}
                      min={
                        field.min ?? (field.type === "number" ? 0 : undefined)
                      }
                      max={field.max}
                      step={field.type === "number" ? "any" : undefined}
                      required={field.required}
                      onChange={(event) =>
                        update(field.key, event.target.value)
                      }
                      maxLength={field.type !== "number" ? 500 : undefined}
                    />
                  )}
                </label>
              );
            })}
            {kind === "visits" && (
              <p className="form-note full-width">
                Quality is calculated from your recorded evidence. Missing
                location, brief notes or an unclear next step may be flagged for
                review.
              </p>
            )}
            {kind === "routes" && (
              <p className="form-note full-width">
                Stops keep this order. Distance is a straight-line estimate, not
                a road route or travel-time forecast.
              </p>
            )}
            {kind === "connectors" && (
              <p className="form-note full-width">
                Store only an HTTPS origin, without credentials, paths or
                tokens. No delivery or webhook execution is enabled.
              </p>
            )}
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <footer>
            <button
              className="button button-light"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={busy}
            >
              <Icon name="check" size={16} />
              {busy ? "Saving…" : "Save record"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
