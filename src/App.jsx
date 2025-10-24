import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ClipboardList, Map as MapIcon, CheckCircle, Upload } from "lucide-react";

/* --- Construction Fault App MC v6.1 FULL ---
 * - Foto: scatta/galleria + compressione >2MB + anteprima cliccabile
 * - Dati: cantiere, commento, modifica, cancellazione
 * - Chiusura: commento obbligatorio + foto di chiusura (facoltativa)
 * - Mappa: OSM/Esri Satellite, punto utente, marker 🟠 aperte / 🟢 chiuse
 * - Filtri: ricerca testo + filtro per cantiere
 * - Export: JSON, Excel (.xlsx con immagini), PDF (con immagini)
 *   -> Richiede dipendenze: exceljs, jspdf, jspdf-autotable
 *   Installare con:
 *   npm i exceljs jspdf jspdf-autotable
 * ------------------------------------------- */

const STORAGE_KEY = "construction_fault_reports_v17";
const CANTIERI = [
  "A6", "Altamura", "Borgonovo", "Rovigo",
  "Serrotti EST", "Stomeo", "Stornarella", "Uta",
  "Villacidro 1", "Villacidro 2"
];
const defaultPos = { lat: 41.8719, lng: 12.5674 };

const nowISO = () => new Date().toISOString();
const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : "-");

export default function App() {
  const [reports, setReports] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [view, setView] = useState("list");
  const [newCantiere, setNewCantiere] = useState(CANTIERI[0]);
  const [mapType, setMapType] = useState("road");
  const [userPos, setUserPos] = useState(null);
  const [tempPhotos, setTempPhotos] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCantiere, setFilterCantiere] = useState("Tutti");
  const [editingId, setEditingId] = useState(null);
  const [editComment, setEditComment] = useState("");
  const [editCantiere, setEditCantiere] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [closingComment, setClosingComment] = useState("");
  const [closingTempPhoto, setClosingTempPhoto] = useState(null);
  const [modalImg, setModalImg] = useState(null);
  const [exportCantiere, setExportCantiere] = useState("Tutti");
  const commentRef = useRef();
  const mapRef = useRef();

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)), [reports]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserPos(defaultPos)
      );
    } else setUserPos(defaultPos);
  }, []);

  // ---------- Foto: compressione > 2MB ----------
  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);

    async function compressImage(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 1600;
            const scale = Math.min(1, MAX_WIDTH / img.width);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const quality = file.size > 2 * 1024 * 1024 ? 0.7 : 0.9;
            canvas.toBlob(
              (blob) => {
                const r2 = new FileReader();
                r2.onload = (ev2) =>
                  resolve({
                    dataUrl: ev2.target.result,
                    name: file.name,
                    compressed: file.size > 2 * 1024 * 1024,
                  });
                r2.readAsDataURL(blob);
              },
              "image/jpeg",
              quality
            );
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const results = await Promise.all(files.map((f) => compressImage(f)));
    setTempPhotos((prev) => [...prev, ...results]);

    const compressed = results.filter((r) => r.compressed).length;
    if (compressed > 0) alert(`${compressed} foto sono state compresse automaticamente.`);
  }

  // Foto per chiusura (singola, facoltativa)
  async function handleClosingPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // riciclo la stessa compressione
    const fakeEvent = { target: { files: [file] } };
    const compressedArr = [];
    await (async () => {
      const files = Array.from(fakeEvent.target.files);
      for (const f of files) {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const MAX_WIDTH = 1200;
              const scale = Math.min(1, MAX_WIDTH / img.width);
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const quality = f.size > 2 * 1024 * 1024 ? 0.7 : 0.9;
              canvas.toBlob(
                (blob) => {
                  const r2 = new FileReader();
                  r2.onload = (ev2) => resolve(ev2.target.result);
                  r2.readAsDataURL(blob);
                },
                "image/jpeg",
                quality
              );
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(f);
        });
        compressedArr.push({ dataUrl, name: f.name });
      }
    })();
    setClosingTempPhoto(compressedArr[0]);
  }

  function saveReport() {
    if (!tempPhotos.length) return alert("Aggiungi almeno una foto");
    const pos = userPos || defaultPos;
    const timestamp = nowISO();
    const newReport = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      cantiere: newCantiere,
      comment: commentRef.current?.value || "",
      completed: false,
      completedAt: null,
      closingComment: "",
      closingPhoto: null,
      photos: tempPhotos.map((p) => ({ ...p, timestamp, lat: pos.lat, lng: pos.lng })),
    };
    setReports((prev) => [newReport, ...prev]);
    setTempPhotos([]);
    if (commentRef.current) commentRef.current.value = "";
  }

  function saveEdit(id) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, comment: editComment, cantiere: editCantiere } : r
      )
    );
    setEditingId(null);
  }

  function confirmComplete(id) {
    setClosingId(id);
    setClosingComment("");
    setClosingTempPhoto(null);
  }

  function saveCompletion(id) {
    if (!closingComment.trim()) {
      alert("Inserisci un commento di chiusura prima di completare la segnalazione.");
      return;
    }
    setReports((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              completed: true,
              completedAt: nowISO(),
              closingComment: closingComment.trim(),
              closingPhoto: closingTempPhoto ? { ...closingTempPhoto } : null,
            }
          : r
      )
    );
    setClosingId(null);
    setClosingTempPhoto(null);
  }

  function deleteReport(id) {
    if (confirm("Eliminare la segnalazione?"))
      setReports((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = reports
    .filter((r) => r.comment.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => filterCantiere === "Tutti" || r.cantiere === filterCantiere);

  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

  const iconUser = L.icon({
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
  const iconReport = (color) =>
    L.divIcon({
      className: "custom-marker",
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white"></div>`,
    });

  function centerMap() {
    if (userPos && mapRef.current) {
      mapRef.current.flyTo(userPos, 15, { animate: true, duration: 1.5 });
    }
  }

  // ------------- EXPORT HELPERS -------------
  function getReportsForExport() {
    const pool =
      exportCantiere === "Tutti"
        ? reports
        : reports.filter((r) => r.cantiere === exportCantiere);
    return pool;
  }

  function exportJSON() {
    const pool = getReportsForExport();
    const blob = new Blob([JSON.stringify(pool, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export_${exportCantiere === "Tutti" ? "all" : exportCantiere}.json`;
    a.click();
  }

  async function exportExcel() {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Segnalazioni");

      ws.columns = [
        { header: "Cantiere", key: "cantiere", width: 20 },
        { header: "Commento", key: "comment", width: 40 },
        { header: "Creato il", key: "createdAt", width: 20 },
        { header: "Stato", key: "stato", width: 12 },
        { header: "Chiusura", key: "closingComment", width: 40 },
      ];

      const pool = getReportsForExport();
      // Per non appesantire troppo: inseriamo la prima foto e l'eventuale foto di chiusura
      let rowIndex = 2; // header è riga 1
      pool.forEach((r) => {
        const stato = r.completed ? "Completata" : "Aperta";
        ws.addRow({
          cantiere: r.cantiere,
          comment: r.comment,
          createdAt: formatDate(r.createdAt),
          stato,
          closingComment: r.closingComment || "",
        });

        // Prima foto (se esiste)
        if (r.photos && r.photos[0]?.dataUrl) {
          const imgId = wb.addImage({
            base64: r.photos[0].dataUrl,
            extension: "jpeg",
          });
          ws.addImage(imgId, {
            tl: { col: 5.2, row: rowIndex - 1 + 0.1 },
            ext: { width: 120, height: 90 },
            editAs: "oneCell",
          });
        }

        // Foto di chiusura (se esiste)
        if (r.closingPhoto?.dataUrl) {
          const imgId2 = wb.addImage({
            base64: r.closingPhoto.dataUrl,
            extension: "jpeg",
          });
          ws.addImage(imgId2, {
            tl: { col: 7.2, row: rowIndex - 1 + 0.1 },
            ext: { width: 120, height: 90 },
            editAs: "oneCell",
          });
        }

        // aumenta un po' l'altezza riga
        ws.getRow(rowIndex).height = 80;
        rowIndex += 1;
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `export_${exportCantiere === "Tutti" ? "all" : exportCantiere}.xlsx`;
      a.click();
    } catch (err) {
      console.error(err);
      alert("Per l'export Excel installa le dipendenze: npm i exceljs");
    }
  }

  async function exportPDF() {
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      const pool = getReportsForExport();

      doc.setFontSize(16);
      doc.text("Construction Fault - Report", 40, 40);
      doc.setFontSize(10);
      doc.text(`Cantiere: ${exportCantiere}`, 40, 58);
      doc.text(`Generato: ${new Date().toLocaleString()}`, 40, 72);

      let y = 90;

      for (let i = 0; i < pool.length; i++) {
        const r = pool[i];

        // Tabella dati base
        autoTable(doc, {
          startY: y,
          styles: { fontSize: 9 },
          head: [["Cantiere", "Commento", "Creato", "Stato", "Chiusura"]],
          body: [[
            r.cantiere,
            r.comment || "",
            formatDate(r.createdAt),
            r.completed ? "Completata" : "Aperta",
            r.closingComment || ""
          ]],
          theme: "grid",
          margin: { left: 40, right: 40 },
          tableWidth: "auto",
        });

        y = doc.lastAutoTable.finalY + 8;

        // Immagini (prima foto + eventuale closing)
        const maxW = 220;
        const maxH = 160;

        const addImg = (dataUrl, x) => {
          if (!dataUrl) return;
          try {
            doc.addImage(dataUrl, "JPEG", x, y, maxW, maxH);
          } catch (e) {
            // alcuni dataURL potrebbero non essere JPEG reali -> fallback PNG
            try { doc.addImage(dataUrl, "PNG", x, y, maxW, maxH); } catch {}
          }
        };

        const firstPhoto = r.photos?.[0]?.dataUrl || null;
        const closing = r.closingPhoto?.dataUrl || null;

        if (firstPhoto || closing) {
          addImg(firstPhoto, 40);
          if (closing) addImg(closing, 40 + maxW + 12);
          y += maxH + 16;
        }

        // page break se siamo in fondo
        if (y > 730 && i < pool.length - 1) {
          doc.addPage();
          y = 40;
        }
      }

      doc.save(`export_${exportCantiere === "Tutti" ? "all" : exportCantiere}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Per l'export PDF installa le dipendenze: npm i jspdf jspdf-autotable");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-green-600 text-gray-900">
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-center">Construction Fault</h1>
          <p className="text-xs text-gray-500 text-center mb-4">MC v6.1</p>

          {/* MAPPA */}
          {view === "map" && (
            <div className="h-96 border rounded overflow-hidden mb-3 relative">
              <MapContainer
                center={userPos || defaultPos}
                zoom={6}
                whenCreated={(m) => (mapRef.current = m)}
                style={{ width: "100%", height: "100%" }}
              >
                <TileLayer
                  url={
                    mapType === "road"
                      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  }
                />
                {userPos && <Marker position={userPos} icon={iconUser} />}
                {reports.flatMap((r) =>
                  r.photos.map((p, i) =>
                    p.lat && p.lng ? (
                      <Marker
                        key={r.id + i}
                        position={{ lat: p.lat, lng: p.lng }}
                        icon={iconReport(r.completed ? "#22c55e" : "#f97316")}
                      >
                        <Popup>
                          <strong>{r.cantiere}</strong>
                          <br />
                          {r.comment}
                          <br />
                          <small>{formatDate(r.createdAt)}</small>
                        </Popup>
                      </Marker>
                    ) : null
                  )
                )}
              </MapContainer>
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => setMapType(mapType === "road" ? "satellite" : "road")}
                  className="bg-white text-sm px-3 py-1 rounded shadow"
                >
                  Vista: {mapType === "road" ? "Mappa" : "Satellite"}
                </button>
                <button onClick={() => {
                  if (!userPos) return;
                  mapRef.current?.flyTo(userPos, 15, { animate: true, duration: 1.5 });
                }} className="bg-white text-sm px-3 py-1 rounded shadow">
                  📍 Centra
                </button>
              </div>
            </div>
          )}

          {/* LISTA */}
          {view === "list" && (
            <>
              {/* Form nuova segnalazione */}
              <div className="mb-3">
                <label className="block font-medium mb-1">Cantiere</label>
                <select
                  value={newCantiere}
                  onChange={(e) => setNewCantiere(e.target.value)}
                  className="border rounded w-full p-2"
                >
                  {CANTIERI.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="block font-medium mb-1">Commento</label>
                <textarea
                  ref={commentRef}
                  className="border rounded w-full p-2"
                  placeholder="Descrivi il problema..."
                />
              </div>

              {/* FOTO: scatta & galleria */}
              <div className="flex gap-2 mb-2">
                <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer text-sm text-center flex-1">
                  📷 Scatta foto
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                <label className="bg-blue-600 text-white px-3 py-2 rounded cursor-pointer text-sm text-center flex-1">
                  🖼️ Galleria
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Anteprima foto */}
              {tempPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {tempPhotos.map((p, i) => (
                    <img
                      key={i}
                      src={p.dataUrl}
                      alt={p.name}
                      className="w-24 h-24 object-cover rounded border cursor-pointer"
                      onClick={() => setModalImg(p.dataUrl)}
                    />
                  ))}
                </div>
              )}
              <button
                onClick={saveReport}
                className="bg-green-600 text-white px-4 py-2 rounded mb-4"
              >
                Salva segnalazione
              </button>

              {/* FILTRI */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Cerca nei commenti..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border rounded w-full p-2"
                />
                <select
                  value={filterCantiere}
                  onChange={(e) => setFilterCantiere(e.target.value)}
                  className="border rounded p-2"
                >
                  <option>Tutti</option>
                  {CANTIERI.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* SEGNALAZIONI ATTIVE */}
              {active.map((r) => (
                <div key={r.id} className="border rounded p-3 mb-2 shadow-sm bg-gray-50">
                  {editingId === r.id ? (
                    <>
                      <div className="mb-2">
                        <label className="block text-sm font-medium mb-1">Cantiere</label>
                        <select
                          value={editCantiere}
                          onChange={(e) => setEditCantiere(e.target.value)}
                          className="border rounded w-full p-1"
                        >
                          {CANTIERI.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-2">
                        <label className="block text-sm font-medium mb-1">Commento</label>
                        <textarea
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          className="border rounded w-full p-1"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(r.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Salva modifiche
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="bg-gray-300 text-black px-3 py-1 rounded text-sm"
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  ) : closingId === r.id ? (
                    <>
                      <label className="block text-sm font-medium mb-1">Commento di chiusura</label>
                      <textarea
                        value={closingComment}
                        onChange={(e) => setClosingComment(e.target.value)}
                        className="border rounded w-full p-1 mb-2"
                        placeholder="Note sulla risoluzione..."
                      />
                      <div className="mb-2">
                        <label className="block text-sm font-medium mb-1">Foto di chiusura (opzionale)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleClosingPhotoUpload}
                        />
                        {closingTempPhoto && (
                          <img
                            src={closingTempPhoto.dataUrl}
                            alt="closing"
                            className="w-24 h-24 object-cover rounded border mt-2"
                          />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveCompletion(r.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Salva chiusura
                        </button>
                        <button
                          onClick={() => { setClosingId(null); setClosingTempPhoto(null); }}
                          className="bg-gray-300 text-black px-3 py-1 rounded text-sm"
                        >
                          Annulla
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>{r.cantiere}</strong>
                      <p>{r.comment}</p>
                      <small>{formatDate(r.createdAt)}</small>
                      {r.photos?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.photos.map((p, i) => (
                            <img
                              key={i}
                              src={p.dataUrl}
                              alt={p.name}
                              className="w-24 h-24 object-cover rounded cursor-pointer"
                              onClick={() => setModalImg(p.dataUrl)}
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditComment(r.comment);
                            setEditCantiere(r.cantiere);
                          }}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                        >
                          Modifica
                        </button>
                        <button
                          onClick={() => confirmComplete(r.id)}
                          className="bg-green-500 text-white px-3 py-1 rounded text-sm"
                        >
                          Completato
                        </button>
                        <button
                          onClick={() => deleteReport(r.id)}
                          className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                        >
                          Cancella
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {active.length === 0 && (
                <p className="text-gray-500 text-center">Nessuna segnalazione attiva.</p>
              )}
            </>
          )}

          {/* COMPLETATE */}
          {view === "completed" && (
            <>
              <h2 className="text-lg font-semibold mb-2">Segnalazioni completate</h2>
              {completed.length === 0 ? (
                <p className="text-gray-500 text-center">Nessuna segnalazione completata.</p>
              ) : (
                completed.map((r) => (
                  <div key={r.id} className="border rounded p-3 mb-2 bg-green-50 shadow-sm">
                    <strong>{r.cantiere}</strong>
                    <p>{r.comment}</p>
                    <small>{formatDate(r.createdAt)}</small>
                    <p className="mt-2 text-sm text-green-700">
                      <strong>Chiusura:</strong> {r.closingComment}
                    </p>
                    <small>Completato il: {formatDate(r.completedAt)}</small>
                    {r.photos?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {r.photos.map((p, i) => (
                          <img
                            key={i}
                            src={p.dataUrl}
                            alt={p.name}
                            className="w-24 h-24 object-cover rounded cursor-pointer"
                            onClick={() => setModalImg(p.dataUrl)}
                          />
                        ))}
                      </div>
                    )}
                    {r.closingPhoto?.dataUrl && (
                      <div className="mt-2">
                        <p className="text-sm font-medium">Foto di chiusura:</p>
                        <img
                          src={r.closingPhoto.dataUrl}
                          alt="closing"
                          className="w-32 h-32 object-cover rounded cursor-pointer"
                          onClick={() => setModalImg(r.closingPhoto.dataUrl)}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {/* MODAL FOTO */}
          {modalImg && (
            <div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
              onClick={() => setModalImg(null)}
            >
              <img
                src={modalImg}
                alt="preview"
                className="max-h-[90%] max-w-[90%] rounded-lg shadow-lg"
              />
            </div>
          )}

          {/* EXPORT BAR */}
          <div className="mt-4 border-t pt-3">
            <h3 className="text-sm font-semibold mb-2">Esporta segnalazioni</h3>
            <div className="flex gap-2 items-center flex-wrap">
              <select
                value={exportCantiere}
                onChange={(e) => setExportCantiere(e.target.value)}
                className="border rounded p-2"
              >
                <option>Tutti</option>
                {CANTIERI.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button onClick={exportJSON} className="bg-gray-700 text-white px-3 py-2 rounded text-sm">
                JSON
              </button>
              <button onClick={exportExcel} className="bg-emerald-600 text-white px-3 py-2 rounded text-sm">
                Excel (.xlsx)
              </button>
              <button onClick={exportPDF} className="bg-red-600 text-white px-3 py-2 rounded text-sm">
                PDF
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              (Per Excel/PDF assicurati di installare le dipendenze: <code>npm i exceljs jspdf jspdf-autotable</code>)
            </p>
          </div>
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-inner flex justify-around py-2 z-50">
        <button
          onClick={() => setView("list")}
          className={`flex flex-col items-center ${view === "list" ? "text-green-600" : "text-gray-500"}`}
        >
          <ClipboardList size={22} />
          <span className="text-xs">Lista</span>
        </button>
        <button
          onClick={() => setView("map")}
          className={`flex flex-col items-center ${view === "map" ? "text-green-600" : "text-gray-500"}`}
        >
          <MapIcon size={22} />
          <span className="text-xs">Mappa</span>
        </button>
        <button
          onClick={() => setView("completed")}
          className={`flex flex-col items-center ${view === "completed" ? "text-green-600" : "text-gray-500"}`}
        >
          <CheckCircle size={22} />
          <span className="text-xs">Completate</span>
        </button>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(reports, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "export_all.json";
            a.click();
          }}
          className="flex flex-col items-center text-gray-500"
        >
          <Upload size={22} />
          <span className="text-xs">Esporta JSON</span>
        </button>
      </nav>
    </div>
  );
}
