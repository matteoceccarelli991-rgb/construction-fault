import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import {
  ClipboardList,
  Map as MapIcon,
  CheckCircle,
  X,
  Camera,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STORAGE_KEY = "construction_fault_reports_v4";
const CANTIERI = [
  "A6",
  "Altamura",
  "Borgonovo",
  "Rovigo",
  "Serrotti EST",
  "Stomeo",
  "Stornarella",
  "Uta",
  "Villacidro 1",
  "Villacidro 2",
];

function nowISO() {
  return new Date().toISOString();
}
function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}
function MapAutoFit({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (!markers.length) return;
    const group = L.featureGroup(markers.map((m) => L.marker([m.lat, m.lng])));
    map.fitBounds(group.getBounds().pad(0.5));
  }, [markers, map]);
  return null;
}
async function compressImage(file, maxSizeMB = 2, maxDim = 1000) {
  if (file.size / 1024 / 1024 <= maxSizeMB) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Compressione fallita"));
          else
            resolve(
              new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
              })
            );
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => reject(new Error("Errore caricamento immagine"));
  });
}

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
  const [search, setSearch] = useState("");
  const [selectedCantiere, setSelectedCantiere] = useState("Tutti");
  const [newCantiere, setNewCantiere] = useState(CANTIERI[0]);
  const [userPos, setUserPos] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const commentRef = useRef();
  const fileRef = useRef();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setUserPos(null)
      );
  }, []);

  async function addReport(files) {
    try {
      if (!files?.length) return setError("Nessuna immagine selezionata");
      setError("");
      const pos = await new Promise((res) => {
        if (navigator.geolocation)
          navigator.geolocation.getCurrentPosition(
            (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => res(userPos)
          );
        else res(userPos);
      });
      const timestamp = nowISO();
      const photos = await Promise.all(
        Array.from(files).map(async (f) => {
          const c = await compressImage(f);
          return new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = (e) =>
              res({
                dataUrl: e.target.result,
                filename: f.name,
                timestamp,
                lat: pos?.lat ?? null,
                lng: pos?.lng ?? null,
              });
            reader.onerror = () => rej(new Error("Errore lettura immagine"));
            reader.readAsDataURL(c);
          });
        })
      );
      const newReport = {
        id: "r_" + Math.random().toString(36).slice(2, 9),
        createdAt: timestamp,
        cantiere: newCantiere,
        comment: commentRef.current?.value || "",
        photos,
        completed: false,
        completedAt: null,
      };
      setReports((p) => [newReport, ...p]);
      if (fileRef.current) fileRef.current.value = "";
      if (commentRef.current) commentRef.current.value = "";
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    }
  }

  const filtered = reports.filter((r) => {
    const txt = r.comment.toLowerCase().includes(search.toLowerCase());
    const cant =
      selectedCantiere === "Tutti" || r.cantiere === selectedCantiere;
    return txt && cant;
  });
  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

  function markCompleted(id) {
    setReports((p) =>
      p.map((r) =>
        r.id === id ? { ...r, completed: true, completedAt: nowISO() } : r
      )
    );
  }
  function markReopen(id) {
    setReports((p) =>
      p.map((r) =>
        r.id === id ? { ...r, completed: false, completedAt: null } : r
      )
    );
  }
  function deleteReport(id) {
    if (!confirm("Eliminare la segnalazione?")) return;
    setReports((p) => p.filter((r) => r.id !== id));
  }

  // === EXPORT ===
  function exportCSV() {
    const head = [
      "Cantiere",
      "Commento",
      "Data creazione",
      "Lat",
      "Lng",
      "Completata",
      "Data completamento",
    ];
    const rows = reports.map((r) => [
      r.cantiere,
      r.comment.replace(/[\n\r]/g, " "),
      formatDate(r.createdAt),
      r.photos?.[0]?.lat || "",
      r.photos?.[0]?.lng || "",
      r.completed ? "Sì" : "No",
      r.completed ? formatDate(r.completedAt) : "",
    ]);
    const csv = [head, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "construction_fault_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(reports, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "construction_fault_export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const markers = reports
    .flatMap((r) =>
      r.photos.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        dataUrl: p.dataUrl,
        cantiere: r.cantiere,
        comment: r.comment,
        createdAt: p.timestamp,
        completed: r.completed,
      }))
    )
    .filter((m) => m.lat && m.lng);

  return (
    <div className="min-h-screen flex flex-col bg-green-600 text-gray-900">
      {error && (
        <div className="bg-red-600 text-white text-sm text-center py-2">
          ⚠️ {error}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-3">
          <h1 className="text-2xl font-bold text-center mb-3">
            Construction Fault
          </h1>

          {view === "export" ? (
            <div className="text-center space-y-4 py-10">
              <h2 className="text-lg font-semibold text-green-700">
                📤 Esporta segnalazioni
              </h2>
              <button
                onClick={exportCSV}
                className="w-full sm:w-auto px-5 py-3 bg-green-600 text-white rounded-md"
              >
                📄 Esporta in CSV
              </button>
              <button
                onClick={exportJSON}
                className="w-full sm:w-auto px-5 py-3 bg-blue-600 text-white rounded-md"
              >
                🧾 Esporta in JSON (con foto)
              </button>
            </div>
          ) : view === "map" ? (
            <div className="h-96 border rounded overflow-hidden">
              <MapContainer
                center={[45.4642, 9.19]}
                zoom={6}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {userPos && (
                  <Marker position={[userPos.lat, userPos.lng]}>
                    <Popup>La tua posizione</Popup>
                  </Marker>
                )}
                {markers.map((m, i) => (
                  <Marker key={i} position={[m.lat, m.lng]}>
                    <Popup>
                      <div className="max-w-xs">
                        <img
                          src={m.dataUrl}
                          alt="foto"
                          className="w-full h-32 object-cover rounded mb-1"
                        />
                        <div className="font-semibold text-green-700">
                          {m.cantiere}
                        </div>
                        <div className="text-sm">{m.comment}</div>
                        <div className="text-xs text-gray-500">
                          {formatDate(m.createdAt)}
                        </div>
                        <div className="text-xs">
                          {m.completed ? "Completata" : "Aperta"}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                <MapAutoFit markers={markers} />
              </MapContainer>
            </div>
          ) : (
            <>
              <div className="border p-3 rounded mb-3">
                <label className="text-sm font-medium">Cantiere</label>
                <select
                  value={newCantiere}
                  onChange={(e) => setNewCantiere(e.target.value)}
                  className="w-full border p-2 rounded text-sm mb-2"
                >
                  {CANTIERI.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <label className="text-sm font-medium">Commento</label>
                <textarea
                  ref={commentRef}
                  rows={3}
                  className="w-full border p-2 rounded text-sm"
                  placeholder="Descrivi il problema..."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    id="cameraInput"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => addReport(e.target.files)}
                  />
                  <label
                    htmlFor="cameraInput"
                    className="px-4 py-2 bg-green-600 text-white rounded-md cursor-pointer flex items-center gap-1"
                  >
                    <Camera size={18} /> Scatta foto
                  </label>
                  <input
                    id="galleryInput"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addReport(e.target.files)}
                  />
                  <label
                    htmlFor="galleryInput"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer flex items-center gap-1"
                  >
                    <ImageIcon size={18} /> Galleria
                  </label>
                  <button
                    onClick={() => {
                      if (commentRef.current) commentRef.current.value = "";
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="px-4 py-2 bg-gray-200 rounded-md flex items-center gap-1"
                  >
                    <X size={18} /> Annulla
                  </button>
                </div>
              </div>

              <div className="border p-3 rounded mb-3">
                <label className="text-sm font-medium">
                  Filtra per cantiere
                </label>
                <select
                  value={selectedCantiere}
                  onChange={(e) => setSelectedCantiere(e.target.value)}
                  className="w-full border p-2 rounded text-sm mb-2"
                >
                  <option>Tutti</option>
                  {CANTIERI.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <label className="text-sm font-medium">Ricerca commenti</label>
                <div className="flex gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 border p-2 rounded text-sm"
                    placeholder="Cerca nei commenti..."
                  />
                  <button
                    onClick={() => setSearch("")}
                    className="px-3 py-2 bg-gray-300 rounded-md"
                  >
                    <X size={16} /> Pulisci
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {(view === "list" ? active : completed).map((r) => (
                  <div
                    key={r.id}
                    className="border rounded p-2 flex flex-col sm:flex-row gap-2"
                  >
                    <div className="grid grid-cols-3 gap-1 sm:w-28">
                      {r.photos.map((p, i) => (
                        <img
                          key={i}
                          src={p.dataUrl}
                          alt=""
                          className="w-full h-20 object-cover rounded"
                        />
                      ))}
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="flex justify-between">
                        <div>
                          <div className="font-semibold text-green-700">
                            {r.cantiere}
                          </div>
                          <div>{r.comment || "(nessun commento)"}</div>
                          <div className="text-xs text-gray-500">
                            Creata: {formatDate(r.createdAt)}
                          </div>
                          {r.completed && (
                            <div className="text-xs text-green-600">
                              Completata: {formatDate(r.completedAt)}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1 text-right">
                          {!r.completed ? (
                            <button
                              onClick={() => markCompleted(r.id)}
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                            >
                              Completato
                            </button>
                          ) : (
                            <button
                              onClick={() => markReopen(r.id)}
                              className="px-2 py-1 bg-yellow-300 rounded text-xs"
                            >
                              Riapri
                            </button>
                          )}
                          <button
                            onClick={() => deleteReport(r.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-xs"
                          >
                            Elimina
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {((view === "list" && active.length === 0) ||
                  (view === "completed" && completed.length === 0)) && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Nessuna segnalazione qui.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {success && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-sm">
          ✅ Segnalazione salvata con successo
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-inner flex justify-around py-2 sm:hidden z-50">
        <button
          onClick={() => setView("list")}
          className={`flex flex-col items-center ${
            view === "list" ? "text-green-600" : "text-gray-500"
          }`}
        >
          <ClipboardList size={22} />
          <span className="text-xs">Lista</span>
        </button>
        <button
          onClick={() => setView("map")}
          className={`flex flex-col items-center ${
            view === "map" ? "text-green-600" : "text-gray-500"
          }`}
        >
          <MapIcon size={22} />
          <span className="text-xs">Mappa</span>
        </button>
        <button
          onClick={() => setView("completed")}
          className={`flex flex-col items-center ${
            view === "completed" ? "text-green-600" : "text-gray-500"
          }`}
        >
          <CheckCircle size={22} />
          <span className="text-xs">Completate</span>
        </button>
        <button
          onClick={() => setView("export")}
          className={`flex flex-col items-center ${
            view === "export" ? "text-green-600" : "text-gray-500"
          }`}
        >
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
