import "./animations.css";
import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ClipboardList, Map as MapIcon, CheckCircle, Upload } from "lucide-react";

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

  // ---------- Foto compressione ----------
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

  async function handleClosingPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
    setClosingTempPhoto({ dataUrl, name: file.name });
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

  // EXPORT
  function getReportsForExport() {
    return exportCantiere === "Tutti"
      ? reports
      : reports.filter((r) => r.cantiere === exportCantiere);
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
      let rowIndex = 2;
      pool.forEach((r) => {
        ws.addRow({
          cantiere: r.cantiere,
          comment: r.comment,
          createdAt: formatDate(r.createdAt),
          stato: r.completed ? "Completata" : "Aperta",
          closingComment: r.closingComment || "",
        });
        ws.getRow(rowIndex).height = 80;
        rowIndex++;
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `export_${exportCantiere === "Tutti" ? "all" : exportCantiere}.xlsx`;
      a.click();
    } catch (err) {
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

      autoTable(doc, {
        startY: 90,
        styles: { fontSize: 9 },
        head: [["Cantiere", "Commento", "Creato", "Stato", "Chiusura"]],
        body: pool.map((r) => [
          r.cantiere,
          r.comment || "",
          formatDate(r.createdAt),
          r.completed ? "Completata" : "Aperta",
          r.closingComment || "",
        ]),
        theme: "grid",
        margin: { left: 40, right: 40 },
      });

      doc.save(`export_${exportCantiere === "Tutti" ? "all" : exportCantiere}.pdf`);
    } catch {
      alert("Per l'export PDF installa jspdf e jspdf-autotable");
    }
  }

  // --- RETURN ---
  return (
    <div className="min-h-screen flex flex-col bg-gray-100 text-gray-900">
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-4">

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

              {/* FOTO */}
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

              {/* Filtri */}
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

              {/* Lista segnalazioni */}
              {active.map((r) => (
                <div key={r.id} className="border rounded p-3 mb-2 shadow-sm bg-gray-50">
                  <strong>{r.cantiere}</strong>
                  <p>{r.comment}</p>
                  <small>{formatDate(r.createdAt)}</small>
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
                  </div>
                ))
              )}
            </>
          )}

          {/* ESPORTA */}
          {view === "export" && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold mb-3 text-center">Esporta segnalazioni</h2>
              <select
                value={exportCantiere}
                onChange={(e) => setExportCantiere(e.target.value)}
                className="border rounded p-2 w-full"
              >
                <option>Tutti</option>
                {CANTIERI.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-center">
                <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded">
                  Excel (.xlsx)
                </button>
                <button onClick={exportPDF} className="bg-red-600 text-white px-4 py-2 rounded">
                  PDF (.pdf)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-inner flex justify-around py-2 z-50">
        <button onClick={() => setView("list")} className={`flex flex-col items-center ${view === "list" ? "text-green-600" : "text-gray-500"}`}>
          <ClipboardList size={22} />
          <span className="text-xs">Lista</span>
        </button>
        <button onClick={() => setView("map")} className={`flex flex-col items-center ${view === "map" ? "text-green-600" : "text-gray-500"}`}>
          <MapIcon size={22} />
          <span className="text-xs">Mappa</span>
        </button>
        <button onClick={() => setView("completed")} className={`flex flex-col items-center ${view === "completed" ? "text-green-600" : "text-gray-500"}`}>
          <CheckCircle size={22} />
          <span className="text-xs">Completate</span>
        </button>
        <button onClick={() => setView("export")} className={`flex flex-col items-center ${view === "export" ? "text-green-600" : "text-gray-500"}`}>
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
