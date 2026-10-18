import DatasetImport from "./DatasetImport";
import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  FileText,
  Check,
  Plus,
  Download,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { type Trip, exportFile } from "../lib/model";
import { blankDraft, digest, parseDocument } from "../lib/import/parser";
import {
  applyDrafts,
  comparable,
  exportResearch,
  mergeResearch,
  matches,
  suggestMatches,
  validateResearchBackup,
  validation,
} from "../lib/import/reconcile";
import {
  fieldLabels,
  type Draft,
  type ExtractedDocument,
  type ResearchDetails,
} from "../lib/import/types";
import { readDocument } from "../lib/import/readDocument";
const commonFields: (keyof ResearchDetails)[] = [
  "start",
  "end",
  "passengers",
  "priceScope",
  "taxes",
  "cancellation",
  "notes",
];
const flightFields: (keyof ResearchDetails)[] = [
  "origin",
  "destination",
  "cabin",
  "flightNumber",
  "departure",
  "arrival",
  "returnSchedule",
  "stops",
  "duration",
  "baggage",
];
const hotelFields: (keyof ResearchDetails)[] = [
  "propertyId",
  "location",
  "room",
  "beds",
  "proximity",
  "amenities",
  "availability",
];
export default function ResearchImport({
  trip,
  update,
  initialKind = "auto",
  openMap,
}: {
  trip: Trip;
  update: (t: Trip) => void;
  initialKind?: "auto" | "flight" | "hotel";
  openMap: () => void;
}) {
  const [datasetFile, setDatasetFile] = useState<File>();
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [documents, setDocuments] = useState<
      (ExtractedDocument & { url?: string })[]
    >([]),
    [text, setText] = useState(""),
    [format, setFormat] = useState<"auto" | "flight" | "hotel">("auto"),
    [language, setLanguage] = useState<"eng" | "eng+jpn">("eng"),
    [forceOcr, setForceOcr] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [messages, setMessages] = useState<string[]>([]),
    [drag, setDrag] = useState(false),
    [backup, setBackup] = useState<unknown>(),
    [capture, setCapture] = useState("");
  const abort = useRef<AbortController | null>(null),
    urls = useRef<string[]>([]),
    input = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    if (!drafts.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts.length]);
  const edit = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) =>
      ds.map((d) =>
        d.id === id ? { ...d, ...patch, reviewed: patch.reviewed ?? false } : d,
      ),
    );
  function addDocument(doc: ExtractedDocument, url?: string) {
    const rows = parseDocument(doc, trip, format).map((d) =>
      d.kind === "hotel" ? suggestMatches(d, trip) : d,
    );
    if (rows.length > 200)
      throw new Error(
        "More than 200 offers detected. Split the source into smaller files.",
      );
    setDocuments((ds) => [
      ...ds.filter((d) => d.hash !== doc.hash),
      { ...doc, url },
    ]);
    setDrafts((ds) => [
      ...ds.filter((d) => d.source.hash !== doc.hash),
      ...rows,
    ]);
    if (!rows.length)
      setMessages((ms) => [
        ...ms,
        `${doc.name}: no confidently grouped price blocks found. Inspect the extracted text, add explicit Airline: or Hotel: headings, and reparse; or add an entry manually. No offers were invented.`,
      ]);
  }
  async function files(files: File[]) {
    if (busy) return;
    if (
      files.filter((file) => /\.(csv|json|zip)$/i.test(file.name)).length > 1
    ) {
      setMessages([
        "Import one master JSON/ZIP or one CSV at a time. Use the master JSON to load all research together.",
      ]);
      return;
    }
    if (files.length > 10) {
      setMessages(["Choose up to 10 files per batch."]);
      return;
    }
    setBusy(true);
    setMessages([]);
    abort.current = new AbortController();
    for (const file of files) {
      if (abort.current.signal.aborted) break;
      try {
        if (/\.(csv|zip)$/i.test(file.name)) {
          setDatasetFile(file);
          continue;
        }
        if (/\.json$/i.test(file.name)) {
          if (file.size > 20 * 1024 * 1024)
            throw new Error("JSON backup exceeds 20 MB.");
          const data = JSON.parse(await file.text());
          if (data?.metadata?.version === "2.0") {
            setDatasetFile(file);
            continue;
          }
          validateResearchBackup(data);
          setBackup(data);
          continue;
        }
        const doc = await readDocument(file, {
          signal: abort.current.signal,
          language,
          forceOcr,
          progress: setProgress,
        });
        if (capture) {
          doc.capturedAt = capture;
          doc.dateOrigin = "Capture date entered for this import";
        }
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        addDocument(doc, url);
      } catch (e) {
        setMessages((ms) => [...ms, `${file.name}: ${(e as Error).message}`]);
      }
    }
    setBusy(false);
    setProgress("");
  }
  async function paste() {
    if (!text.trim()) return;
    if (text.length > 200000) {
      setMessages([
        "Pasted text exceeds 200,000 characters. Split it into smaller portions.",
      ]);
      return;
    }
    const hash = await digest(text.trim().replace(/\r\n/g, "\n"));
    addDocument({
      name: "Pasted travel research",
      hash,
      pages: [{ page: 1, text, method: "paste" }],
      capturedAt: capture || new Date().toISOString().slice(0, 10),
      dateOrigin: capture
        ? "Capture date entered for this import"
        : "Import date default — confirm capture date",
    });
    setText("");
  }
  function isDuplicate(d: Draft) {
    return (
      d.kind !== "flight" &&
      (trip.researchReceipts?.includes(d.fingerprint) ||
        trip.observations.some(
          (o) => o.research?.fingerprint === d.fingerprint,
        ))
    );
  }
  function save(entries = drafts) {
    try {
      const result = applyDrafts(trip, entries, { replaceFlights: true });
      if (JSON.stringify(result.trip).length > 2000000)
        throw new Error(
          "Trip data would exceed the safe device-storage budget. Export a backup and reduce source excerpts before importing.",
        );
      update(result.trip);
      setMessages([
        `${result.added} price observations added; ${result.updated} hotel descriptions updated; ${result.duplicates} duplicate entries skipped. Previous flights were replaced when flights were imported. Hotel history was preserved.`,
      ]);
      setDrafts((ds) =>
        ds.filter(
          (d) =>
            !entries.some(
              (entry) =>
                entry.id === d.id && entry.selected && entry.action !== "skip",
            ),
        ),
      );
    } catch (e) {
      setMessages([(e as Error).message]);
    }
  }
  function approveAndImport() {
    const entries = drafts.map((d) => ({
      ...d,
      selected: d.action !== "skip" && !isDuplicate(d),
      reviewed: true,
      contextConfirmed: true,
    }));
    setDrafts(entries);
    save(entries);
  }
  const selected = drafts.filter((d) => d.selected && d.action !== "skip");
  const errors = selected.flatMap((d) =>
    validation(d, trip).map(
      (error) => `${d.name || "Unnamed entry"}: ${error}`,
    ),
  );
  return (
    <>
      <DatasetImport trip={trip} update={update} file={datasetFile} />
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR RESEARCH, READY TO USE</span>
          <h2>Save the search. Keep the story.</h2>
          <p>
            Bring flight and hotel research into your trip. Review every offer
            before it is saved.
          </p>
        </div>
        <button
          onClick={() =>
            exportFile(
              "wayfarer-research.json",
              JSON.stringify(exportResearch(trip), null, 2),
            )
          }
        >
          <Download size={16} />
          Export research
        </button>
      </div>
      <div className="import-intro">
        <span className="badge">
          <Check size={12} />
          Private browser processing
        </span>
        <span>
          No paid API · No account required · No deployment per import
        </span>
      </div>
      <div className="two-col">
        <div
          className={`panel import-drop ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void files(Array.from(e.dataTransfer.files));
          }}
        >
          <UploadCloud size={36} />
          <h3>Drop your travel research here</h3>
          <p>
            PDFs, PNG or JPEG screenshots
            <br />
            Up to 10 files · 25 MB each · 30 pages per PDF
          </p>
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Research files"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.json,.csv,.zip"
            disabled={busy}
            onChange={(e) => {
              void files(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            className="primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            Choose files
          </button>
          <small>
            Research JSON backups can also be reviewed and merged here.
          </small>
        </div>
        <div className="panel">
          <label>
            Or paste copied website text
            <textarea
              rows={5}
              placeholder="Paste a flight or hotel result, including its name, price and conditions…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200001}
            />
          </label>
          <div className="row wrap">
            <button
              disabled={busy || !text.trim()}
              onClick={() => void paste()}
            >
              <FileText size={16} />
              Extract pasted text
            </button>
            <button
              disabled={busy}
              onClick={() =>
                setDrafts((ds) => [
                  ...ds,
                  blankDraft(
                    trip,
                    format === "hotel" || initialKind === "hotel"
                      ? "hotel"
                      : "flight",
                  ),
                ])
              }
            >
              <Plus size={16} />
              Add manual entry
            </button>
          </div>
        </div>
      </div>
      <details className="panel import-options">
        <summary>Extraction options & capture date</summary>
        <div className="form-grid">
          <label>
            Document format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="auto">Detect flights / hotels</option>
              <option value="flight">Flight research</option>
              <option value="hotel">Hotel research</option>
            </select>
          </label>
          <label>
            Screenshot / scanned PDF language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              <option value="eng">English</option>
              <option value="eng+jpn">English + Japanese</option>
            </select>
          </label>
          <label>
            Capture date override (optional)
            <input
              type="date"
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={forceOcr}
              onChange={(e) => setForceOcr(e.target.checked)}
            />
            Use OCR even when a PDF has embedded text
          </label>
        </div>
        <p>
          PDF creation dates are editable defaults, not evidence of price
          validity. OCR may confuse digits or merge columns. All detected
          entries start unselected. Nothing is saved until you confirm.
        </p>
      </details>
      {busy && (
        <div className="notice row" role="status">
          <span className="grow">{progress || "Reading files…"}</span>
          <button onClick={() => abort.current?.abort()}>
            Cancel extraction
          </button>
        </div>
      )}
      {messages.map((m, i) => (
        <p className="notice import-message" role="status" key={i}>
          {m}
        </p>
      ))}
      {backup !== undefined && (
        <div className="panel">
          <h3>Review research backup merge</h3>
          <p>
            {validateResearchBackup(backup).observations.length} observations
            and {validateResearchBackup(backup).places.length} hotels. Merge
            adds missing records, preserves existing descriptions and
            coordinates, and skips matching observation IDs/fingerprints. New
            transferred hotels need their map locations confirmed.
          </p>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                try {
                  const result = mergeResearch(trip, backup);
                  if (JSON.stringify(result.trip).length > 2000000)
                    throw new Error(
                      "Merged research would exceed the device-storage budget. Split the backup first.",
                    );
                  update(result.trip);
                  setMessages([
                    `Research backup merged: ${result.added} observations added, ${result.duplicates} duplicates skipped.`,
                  ]);
                  setBackup(undefined);
                } catch (e) {
                  setMessages([(e as Error).message]);
                }
              }}
            >
              Confirm backup merge
            </button>
            <button onClick={() => setBackup(undefined)}>Cancel merge</button>
          </div>
        </div>
      )}
      {documents.length > 0 && (
        <details className="panel">
          <summary>
            Source documents & extracted text ({documents.length})
          </summary>
          <p>
            Use the original document to check grouping and digits. Editing
            extracted text and reparsing replaces only this document’s unsaved
            preview rows.
          </p>
          {documents.map((doc) => (
            <section className="import-source" key={doc.hash}>
              <div className="section-heading">
                <h3>
                  {doc.name} · {doc.pages.length} pages
                </h3>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer">
                    View original ↗
                  </a>
                )}
              </div>
              {doc.pages.map((p) => (
                <details key={p.page}>
                  <summary>
                    Page {p.page} · {p.method}
                    {p.confidence !== undefined
                      ? ` · OCR ${Math.round(p.confidence)}%`
                      : ""}
                  </summary>
                  <textarea
                    aria-label={`${doc.name} page ${p.page} extracted text`}
                    rows={10}
                    value={p.text}
                    onChange={(e) =>
                      setDocuments((ds) =>
                        ds.map((d) =>
                          d.hash === doc.hash
                            ? {
                                ...d,
                                pages: d.pages.map((x) =>
                                  x.page === p.page
                                    ? { ...x, text: e.target.value }
                                    : x,
                                ),
                              }
                            : d,
                        ),
                      )
                    }
                  />
                </details>
              ))}
              <button
                onClick={() => {
                  if (
                    drafts.some(
                      (d) => d.source.hash === doc.hash && d.reviewed,
                    ) &&
                    !confirm(
                      "Replace this document’s unsaved review edits with a fresh parse?",
                    )
                  )
                    return;
                  addDocument(doc, doc.url);
                }}
              >
                Reparse this source
              </button>
            </section>
          ))}
        </details>
      )}
      {drafts.length > 0 && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">REVIEW BEFORE SAVING</span>
              <h2>
                {drafts.length} detected{" "}
                {drafts.length === 1 ? "entry" : "entries"}
              </h2>
            </div>
            <div className="row wrap">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  setDrafts((ds) =>
                    ds.map((d) => {
                      const duplicate = isDuplicate(d);
                      return duplicate || d.action === "skip"
                        ? { ...d, selected: false }
                        : {
                            ...d,
                            selected: true,
                            reviewed: true,
                            contextConfirmed: true,
                          };
                    }),
                  )
                }
              >
                <Check size={16} />
                Approve all entries
              </button>
              <button
                onClick={() =>
                  setDrafts((ds) =>
                    ds.map((d) => ({
                      ...d,
                      selected: d.reviewed && d.action !== "skip",
                    })),
                  )
                }
              >
                Select reviewed entries
              </button>
              <button
                onClick={() =>
                  setDrafts((ds) => ds.map((d) => ({ ...d, selected: false })))
                }
              >
                Deselect all
              </button>
            </div>
          </div>
          <p className="muted">
            Approve all confirms the displayed dates, guests and price basis,
            marks entries reviewed, and selects them. Duplicates and skipped
            entries stay excluded. Choose Confirm import to save the batch.
          </p>
          {drafts.map((d, index) => {
            const candidates = matches(d, trip);
            const existing =
              d.kind === "hotel"
                ? trip.places.filter((p) => p.kind === "hotel")
                : Array.from(
                    new Map(
                      trip.observations
                        .filter((o) => o.kind === "flight")
                        .map((o) => [o.itemId, { id: o.itemId, name: o.name }]),
                    ).values(),
                  );
            const duplicate = isDuplicate(d);
            return (
              <article className="panel import-entry" key={d.id}>
                <div className="section-heading">
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Select entry ${index + 1}`}
                      checked={d.selected}
                      disabled={duplicate}
                      onChange={(e) =>
                        edit(d.id, {
                          selected: e.target.checked,
                          reviewed: d.reviewed,
                        })
                      }
                    />
                    <b>Entry {index + 1}</b>
                    <span className="badge">{d.kind}</span>
                    {duplicate && (
                      <span className="badge amber">
                        Already imported · will skip
                      </span>
                    )}
                  </label>
                  <button
                    className="icon-button"
                    aria-label={`Remove entry ${index + 1}`}
                    onClick={() =>
                      setDrafts((ds) => ds.filter((x) => x.id !== d.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="import-main-fields">
                  <label>
                    Name
                    <input
                      value={d.name}
                      onChange={(e) => edit(d.id, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Displayed price
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={d.amount}
                      onChange={(e) => edit(d.id, { amount: e.target.value })}
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      value={d.currency}
                      onChange={(e) =>
                        edit(d.id, {
                          currency: e.target.value as Draft["currency"],
                        })
                      }
                    >
                      <option value="">Confirm…</option>
                      {["JPY", "USD", "TWD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Capture date
                    <input
                      type="date"
                      value={d.source.capturedAt}
                      onChange={(e) =>
                        edit(d.id, {
                          source: {
                            ...d.source,
                            capturedAt: e.target.value,
                            dateOrigin: "Capture date confirmed by user",
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <p className="muted">
                  {d.source.name} · page {d.source.page} · {d.source.method} ·{" "}
                  {d.source.dateOrigin}
                </p>
                <details>
                  <summary>
                    <AlertCircle size={13} /> {d.warnings.length} review notes ·{" "}
                    {comparable(d)
                      ? "Complete comparison basis"
                      : "Comparison uncertain"}
                  </summary>
                  <ul>
                    {d.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary>Edit all offer details</summary>
                  <label>
                    Entry type
                    <select
                      value={d.kind}
                      onChange={(e) =>
                        edit(d.id, {
                          kind: e.target.value as Draft["kind"],
                          matchId: "",
                          action: "new",
                        })
                      }
                    >
                      <option value="flight">Flight</option>
                      <option value="hotel">Hotel</option>
                    </select>
                  </label>
                  <div className="form-grid">
                    {[
                      ...commonFields,
                      ...(d.kind === "flight" ? flightFields : hotelFields),
                    ].map((key) => (
                      <label key={key}>
                        {fieldLabels[key]}
                        {key === "priceScope" ? (
                          <select
                            value={d.details[key]}
                            onChange={(e) =>
                              edit(d.id, {
                                details: {
                                  ...d.details,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          >
                            {[
                              "unknown",
                              "stay total",
                              "per night",
                              "per person",
                              "round-trip (party basis unknown)",
                              "round-trip per person",
                              "round-trip party total",
                              "one-way",
                            ].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : key === "notes" ? (
                          <textarea
                            value={d.details[key]}
                            onChange={(e) =>
                              edit(d.id, {
                                details: {
                                  ...d.details,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                        ) : (
                          <input
                            type={
                              ["start", "end"].includes(key) ? "date" : "text"
                            }
                            value={d.details[key]}
                            placeholder="Not established by source"
                            onChange={(e) =>
                              edit(d.id, {
                                details: {
                                  ...d.details,
                                  [key]: e.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </details>
                <details>
                  <summary>Source excerpt</summary>
                  <pre>
                    {d.source.excerpt ||
                      "Manual entry — add details from your source."}
                  </pre>
                </details>
                <div className="form-grid">
                  <label>
                    What should happen?
                    <select
                      value={d.action}
                      onChange={(e) =>
                        edit(d.id, {
                          action: e.target.value as Draft["action"],
                        })
                      }
                    >
                      <option value="new">
                        {d.kind === "flight"
                          ? "Replace saved flights with this batch"
                          : "Create a separate candidate + observation"}
                      </option>
                      {d.kind === "hotel" && (
                        <option value="observation">
                          Add observation to an existing candidate
                        </option>
                      )}
                      {d.kind === "hotel" && (
                        <option value="update">
                          Update hotel description only (no price)
                        </option>
                      )}
                      <option value="skip">Skip entry</option>
                    </select>
                  </label>
                  {(d.action === "observation" || d.action === "update") && (
                    <label>
                      Existing candidate
                      <select
                        value={d.matchId}
                        onChange={(e) =>
                          edit(d.id, { matchId: e.target.value })
                        }
                      >
                        <option value="">Choose explicitly…</option>
                        {existing.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {candidates.length > 0 && (
                  <p>
                    Suggested match:{" "}
                    {candidates
                      .map((c) => `${c.name} (${c.reason})`)
                      .join("; ")}
                    . Confirm the candidate before saving.
                  </p>
                )}
                {d.action === "observation" && (
                  <p className="muted">
                    Adds history only. Existing hotel descriptions, estimate and
                    verified coordinates stay unchanged.
                  </p>
                )}
                {d.action === "update" && (
                  <p className="notice">
                    Updates nonempty descriptive fields shown above. Existing
                    coordinates are preserved. No price observation will be
                    added.
                  </p>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={d.contextConfirmed}
                    onChange={(e) =>
                      edit(d.id, { contextConfirmed: e.target.checked })
                    }
                  />
                  I confirm these travel/stay dates, guests and price basis
                  apply to this offer.
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={d.reviewed}
                    onChange={(e) => edit(d.id, { reviewed: e.target.checked })}
                  />
                  I checked this entry against the source; unknown details
                  remain unknown.
                </label>
              </article>
            );
          })}
          <div
            className="import-save panel"
            aria-label="Save reviewed research"
          >
            <div>
              <button
                className="primary"
                disabled={
                  busy ||
                  !drafts.some((d) => d.action !== "skip" && !isDuplicate(d))
                }
                onClick={approveAndImport}
              >
                <Check size={16} /> Approve &amp; import all entries
              </button>
              <p>
                Finished reviewing? This confirms the displayed details and
                saves the batch. Imported flights replace all previously saved
                flights. Hotel history stays intact. Skipped entries are
                excluded.
              </p>
            </div>
            <div>
              <b>{selected.length} selected</b>
              <p>
                {errors.length
                  ? `${errors.length} review issues remain. Complete each selected entry before saving.`
                  : "Flight imports replace previously saved flights. Hotel history is retained."}
              </p>
            </div>
            {errors.length > 0 && (
              <div
                className="notice"
                role="alert"
                style={{ flexBasis: "100%" }}
              >
                <b>Fix these fields to import:</b>
                <ul>
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {drafts.some((d) => !d.currency && d.action !== "skip") && (
              <label>
                Currency for entries with an unknown currency
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const currency = e.target.value as Draft["currency"];
                    if (currency)
                      setDrafts((ds) =>
                        ds.map((d) => (!d.currency ? { ...d, currency } : d)),
                      );
                  }}
                >
                  <option value="">Choose once for all unknown prices…</option>
                  <option value="USD">USD — US dollars</option>
                  <option value="TWD">TWD — Taiwan dollars</option>
                  <option value="JPY">JPY — Japanese yen</option>
                </select>
                A bare $ does not identify its currency. This applies your
                choice to all entries missing currency.
              </label>
            )}
            <button
              className="primary"
              disabled={!selected.length || busy}
              onClick={() => save()}
            >
              <Check size={16} />
              Confirm import
            </button>
          </div>
        </>
      )}
      <div className="panel">
        <h3>What happens after import?</h3>
        <p>
          Prices become dated research observations in Flights or Hotels.
          Imported hotels appear in comparisons immediately; they have no map
          pin until their location is confirmed. With Google Places configured,
          use the map search to link a result to a saved hotel. Otherwise, enter
          verified coordinates in its details.
        </p>
        <button onClick={openMap}>Open map workspace</button>
        <p className="muted">
          Files and OCR stay in your browser. Only selected records and source
          excerpts are saved using your existing device/cloud storage setting.
          Leaving this page discards unsaved previews. Imported prices are
          historical snapshots, not live availability.
        </p>
      </div>
    </>
  );
}
