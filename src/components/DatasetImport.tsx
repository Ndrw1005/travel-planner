import { useEffect, useState } from "react";
import { type Trip, exportFile, money } from "../lib/model";
import {
  type Dataset,
  readDatasetFile,
  matchPlace,
  mergeDataset,
  mergeFields,
} from "../lib/import/dataset";
import { savePhoto } from "../lib/photos";
export default function DatasetImport({
  trip,
  update,
  file,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  file?: File;
}) {
  const [data, setData] = useState<Dataset>(),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [overrides, setOverrides] = useState<Record<string, string[]>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [photos, setPhotos] = useState(false);
  async function read(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const d = await readDatasetFile(file);
      setData(d);
      setOverrides({});
      setSelected(
        new Set(
          d.rows
            .filter((r) => !r.issues.some((i) => i.startsWith("BLOCKED:")))
            .map((r) => r.key),
        ),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (file) void read(file);
  }, [file]);
  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      const result = mergeDataset(trip, data, selected, overrides);
      if (JSON.stringify(result.trip).length > 2000000)
        throw new Error(
          "Trip exceeds device storage budget. Export a backup first.",
        );
      exportFile(
        `wayfarer-before-dataset-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify({ version: 1, trips: [trip] }, null, 2),
      );
      if (photos)
        for (const row of data.rows) {
          if (!selected.has(row.key) || !row.place?.photoKey) continue;
          const bytes = data.photos[row.raw.photo_asset_path];
          if (bytes) await savePhoto(row.place.photoKey, bytes);
        }
      update(result.trip);
      setMessage(
        `Dataset saved: ${result.log.added} added, ${result.log.matched} matched, ${result.log.skipped} skipped, ${result.log.needingConfirmation} need confirmation. A backup was downloaded.`,
      );
      setData(undefined);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel dataset-import">
      <h2>Import researched dataset</h2>
      <p>
        Upload your ChatGPT research as CSV, v2 JSON, or a ZIP with the master
        JSON and private photos. Exact fields are read directly. This workflow
        merges research and preserves saved history and edits.
      </p>
      <label>
        Research dataset files
        <input
          type="file"
          accept=".csv,.json,.zip"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void read(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="muted">
        Start with osaka_research_master.json to review all four datasets
        together. CSVs can be imported individually. Files are processed in this
        browser. Selected records follow your existing device or cloud storage
        setting.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data && (
        <>
          <h3>Dry-run preview · {data.rows.length} records</h3>
          <p>
            {selected.size} selected ·{" "}
            {data.rows.filter((r) => matchPlace(trip, r)).length} match saved
            places. Existing values are kept unless you choose an incoming field
            below.
          </p>
          <button
            onClick={() =>
              setSelected(
                new Set(
                  data.rows
                    .filter(
                      (r) => !r.issues.some((i) => i.startsWith("BLOCKED:")),
                    )
                    .map((r) => r.key),
                ),
              )
            }
          >
            Select all valid records
          </button>
          <button onClick={() => setSelected(new Set())}>
            Deselect dataset records
          </button>
          <div className="dataset-rows">
            {data.rows.map((row, index) => {
              const existing = matchPlace(trip, row);
              return (
                <details className="dataset-row" key={row.key + index}>
                  <summary>
                    <input
                      aria-label={`Import ${row.key}`}
                      type="checkbox"
                      checked={selected.has(row.key)}
                      disabled={row.issues.some((i) =>
                        i.startsWith("BLOCKED:"),
                      )}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          e.target.checked
                            ? next.add(row.key)
                            : next.delete(row.key);
                          return next;
                        })
                      }
                    />
                    <b>{row.name}</b> · {row.kind}{" "}
                    {row.observation &&
                      `· ${money(row.observation.amount, row.observation.currency)}`}{" "}
                    {existing ? "· Matches saved place" : ""}
                  </summary>
                  {row.observation && (
                    <p>
                      {row.observation.basis} · {row.observation.at} ·{" "}
                      {row.observation.research?.details.departure} →{" "}
                      {row.observation.research?.details.arrival}
                    </p>
                  )}
                  {row.issues.map((issue, i) => (
                    <p className="notice" key={i}>
                      {issue}
                    </p>
                  ))}
                  {existing &&
                    row.place &&
                    mergeFields
                      .filter(
                        (f) =>
                          existing[f] !== undefined &&
                          existing[f] !== "" &&
                          row.place![f] !== undefined &&
                          row.place![f] !== "" &&
                          existing[f] !== row.place![f],
                      )
                      .map((field) => (
                        <label key={field}>
                          {field}: saved “{String(existing[field])}” → incoming
                          “{String(row.place![field])}”
                          <select
                            aria-label={`${row.key} ${field} conflict`}
                            value={
                              overrides[row.key]?.includes(field)
                                ? "incoming"
                                : "saved"
                            }
                            onChange={(e) =>
                              setOverrides((current) => ({
                                ...current,
                                [row.key]:
                                  e.target.value === "incoming"
                                    ? [...(current[row.key] || []), field]
                                    : (current[row.key] || []).filter(
                                        (x) => x !== field,
                                      ),
                              }))
                            }
                          >
                            <option value="saved">Keep my saved value</option>
                            <option value="incoming">Use incoming value</option>
                          </select>
                        </label>
                      ))}
                  <dl>
                    {Object.entries(row.raw)
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              );
            })}
          </div>
          {Object.keys(data.photos).length > 0 ? (
            <label className="check">
              <input
                type="checkbox"
                checked={photos}
                onChange={(e) => setPhotos(e.target.checked)}
              />
              Save bundled photos privately on this device (IndexedDB). Photos
              are not published or cloud-synced.
            </label>
          ) : (
            <p>
              No bundled photos supplied. Missing photo paths display
              placeholders.
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !selected.size}
            onClick={() => void save()}
          >
            Import selected dataset records
          </button>
          <button onClick={() => setData(undefined)}>
            Cancel dataset import
          </button>
          <p>A full trip JSON backup downloads before changes are saved.</p>
        </>
      )}
      {!!trip.datasetImports?.length && (
        <details>
          <summary>
            Dataset import history ({trip.datasetImports.length})
          </summary>
          {trip.datasetImports.map((log) => (
            <div key={log.id}>
              <b>{log.name}</b>
              <p>
                {log.at} · {log.added} added · {log.matched} matched ·{" "}
                {log.skipped} skipped · {log.needingConfirmation} need
                confirmation
              </p>
              <details>
                <summary>Issue report</summary>
                {log.issues.map((issue, i) => (
                  <p key={i}>{issue}</p>
                ))}
              </details>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
