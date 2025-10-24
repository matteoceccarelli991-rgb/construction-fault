import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ClipboardList, Map as MapIcon, CheckCircle, Upload } from "lucide-react";

const STORAGE_KEY = "construction_fault_reports_v15";
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
  const [modalImg, setModalImg] = useState(null);
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

  // compressione immagini >2MB
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
            const scale = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scale;
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
            }
          : r
      )
    );
    setClosingId(null);
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

  return (
    <div className="min-h-screen flex flex-col bg-green-600 text-gray-900">
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-center">Construction Fault</h1>
          <p className="text-xs text-gray-500 text-center mb-4">MC v6.0.3</p>

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
                <button onClick={centerMap} className="bg-white text-sm px-3 py-1 rounded shadow">
                  📍 Centra
                </button>
              </div>
            </div>
          )}

          {/* LISTA */}
          {view === "list" && (
            <>
              {/* FORM nuova segnalazione */}
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveCompletion(r.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Salva chiusura
                        </button>
                        <button
                          onClick={() => setClosingId(null)}
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
                <p className="text-gray-500 text-center">
                  Nessuna segnalazione attiva.
                </p>
              )}
            </>
          )}

          {/* MODAL FOTO GRANDE */}
          {modalImg && (
            <div
              className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
              onClick={() => setModalImg(null)}
            >
              <img src={modalImg} alt="preview" className="max-h-[90%] max-w-[90%] rounded-lg" />
            </div>
          )}
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
            a.download = "export.json";
            a.click();
          }}
          className="flex flex-col items-center text-gray-500"
        >
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
