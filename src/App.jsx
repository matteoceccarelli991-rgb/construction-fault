import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import {
  ClipboardList,
  Map as MapIcon,
  CheckCircle,
  X,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const LS_KEY_V3 = "construction_fault_reports_v3";
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
async function compressImage(file, maxSizeMB = 2, maxDimension = 1000) {
  if (file.size / 1024 / 1024 <= maxSizeMB) return file;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(
        maxDimension / image.width,
        maxDimension / image.height,
        1
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
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
    image.onerror = () => reject(new Error("Errore caricamento immagine"));
  });
}

export default function App() {
  const [reports, setReports] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY_V3);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [selectedCantiere, setSelectedCantiere] = useState("Tutti");
  const [userPos, setUserPos] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [newCantiere, setNewCantiere] = useState(CANTIERI[0]);
  const fileRef = useRef();
  const commentRef = useRef();

  useEffect(() => {
    localStorage.setItem(LS_KEY_V3, JSON.stringify(reports));
  }, [reports]);
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setUserPos(null)
      );
    }
  }, []);

  async function addReportFromFiles(files) {
    try {
      setError("");
      if (!files || !files.length) {
        setError("Nessuna immagine selezionata");
        return;
      }
      const pos = await new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(userPos)
          );
        } else resolve(userPos);
      });
      const timestamp = nowISO();
      const filePromises = Array.from(files).map(async (file) => {
        const compressed = await compressImage(file);
        return new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = (e) =>
            res({
              dataUrl: e.target.result,
              filename: file.name,
              timestamp,
              lat: pos?.lat ?? null,
              lng: pos?.lng ?? null,
            });
          reader.onerror = () => rej(new Error("Errore lettura immagine"));
          reader.readAsDataURL(compressed);
        });
      });
      const photos = await Promise.all(filePromises);
      const newReport = {
        id: "r_" + Math.random().toString(36).slice(2, 9),
        createdAt: timestamp,
        cantiere: newCantiere,
        comment: commentRef.current?.value || "",
        photos,
        completed: false,
        completedAt: null,
      };
      setReports((prev) => [newReport, ...prev]);
      if (fileRef.current) fileRef.current.value = "";
      if (commentRef.current) commentRef.current.value = "";
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Errore durante il salvataggio: " + err.message);
    }
  }

  function markCompleted(id) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, completed: true, completedAt: nowISO() } : r
      )
    );
  }
  function markReopen(id) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, completed: false, completedAt: null } : r
      )
    );
  }
  function deleteReport(id) {
    if (!confirm("Eliminare la segnalazione?")) return;
    setReports((prev) => prev.filter((r) => r.id !== id));
  }

  const filtered = reports.filter((r) => {
    const textMatch = r.comment.toLowerCase().includes(search.toLowerCase());
    const cantiereMatch =
      selectedCantiere === "Tutti" || r.cantiere === selectedCantiere;
    return textMatch && cantiereMatch;
  });

  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

  const photoMarkers = reports
    .flatMap((r) =>
      r.photos.map((p) => ({
        reportId: r.id,
        lat: p.lat,
        lng: p.lng,
        dataUrl: p.dataUrl,
        cantiere: r.cantiere,
        comment: r.comment,
        createdAt: p.timestamp,
        completed: r.completed,
      }))
    )
    .filter((m) => m.lat != null && m.lng != null);

  return (
    <div className="min-h-screen flex flex-col bg-green-600 text-gray-900">
      {error && (
        <div className="bg-red-600 text-white text-sm text-center py-2">
          ⚠️ {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-3 sm:p-4">
          <h1 className="text-2xl sm:text-3xl font-bold mb-3 text-center">
            Construction Fault
          </h1>

          {/* Form nuova segnalazione */}
          <div className="p-3 border rounded mb-3">
            <label className="block text-sm font-medium mb-1">Cantiere</label>
            <select
              value={newCantiere}
              onChange={(e) => setNewCantiere(e.target.value)}
              className="w-full border p-2 rounded text-sm mb-2"
            >
              {CANTIERI.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            <label className="block text-sm font-medium mb-1">Commento</label>
            <textarea
              ref={commentRef}
              rows={3}
              className="w-full border p-2 rounded text-sm"
              placeholder="Descrivi il problema..."
            ></textarea>

            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={fileRef}
                id="cameraInput"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                multiple
                onChange={(e) => addReportFromFiles(e.target.files)}
              />
              <label
                htmlFor="cameraInput"
                className="flex items-center justify-center gap-1 px-4 py-2 bg-green-600 text-white rounded-md cursor-pointer w-full sm:w-auto"
              >
                <Camera size={18} /> Scatta foto
              </label>

              <input
                id="galleryInput"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addReportFromFiles(e.target.files)}
              />
              <label
                htmlFor="galleryInput"
                className="flex items-center justify-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer w-full sm:w-auto"
              >
                <ImageIcon size={18} /> Carica da galleria
              </label>

              <button
                onClick={() => {
                  if (commentRef.current) commentRef.current.value = "";
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="flex items-center justify-center gap-1 px-4 py-2 bg-gray-200 rounded-md w-full sm:w-auto"
              >
                <X size={18} /> Annulla
              </button>
            </div>

            <div className="mt-2 text-sm text-gray-500">
              Posizione attuale:{" "}
              {userPos
                ? `${userPos.lat.toFixed(6)}, ${userPos.lng.toFixed(6)}`
                : "Non disponibile (consenti geolocalizzazione)"}
            </div>
          </div>

          {/* Ricerca */}
          <div className="p-3 border rounded mb-3">
            <label className="block text-sm font-medium mb-1">
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

            <label className="block text-sm font-medium mb-1">
              Ricerca commenti
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 border p-2 rounded text-sm"
                placeholder="Cerca nei commenti..."
              />
              <button
                onClick={() => setSearch("")}
                className="flex items-center gap-1 px-3 py-2 bg-gray-300 rounded-md w-full sm:w-auto"
              >
                <X size={16} /> Pulisci
              </button>
            </div>
          </div>

          {/* Lista o mappa */}
          {view === "map" ? (
            <div className="h-96 border rounded overflow-hidden">
              <MapContainer
                center={[45.4642, 9.19]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {userPos && (
                  <Marker position={[userPos.lat, userPos.lng]}>
                    <Popup>La tua posizione</Popup>
                  </Marker>
                )}
                {photoMarkers.map((m, i) => (
                  <Marker key={i} position={[m.lat, m.lng]}>
                    <Popup>
                      <div className="max-w-xs">
                        <img
                          src={m.dataUrl}
                          alt="foto"
                          className="w-full h-32 object-cover rounded mb-2"
                        />
                        <div className="text-sm font-semibold text-green-700">
                          {m.cantiere}
                        </div>
                        <div className="text-sm">{m.comment}</div>
                        <div className="text-xs text-gray-500">
                          Scattata: {formatDate(m.createdAt)}
                        </div>
                        <div className="text-xs">
                          {m.completed ? "Completata" : "Aperta"}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                <MapAutoFit
                  markers={photoMarkers.map((m) => ({
                    lat: m.lat,
                    lng: m.lng,
                  }))}
                />
              </MapContainer>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {(view === "list" ? active : completed).map((r) => (
                <div
                  key={r.id}
                  className="border rounded p-2 flex flex-col sm:flex-row gap-2"
                >
                  <div className="flex-shrink-0 grid grid-cols-3 gap-1 sm:w-28">
                    {r.photos.map((p, i) => (
                      <img
                        key={i}
                        src={p.dataUrl}
                        className="w-full h-20 object-cover rounded"
                        alt="thumb"
                      />
                    ))}
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-semibold text-green-700">
                          {r.cantiere}
                        </div>
                        <div className="font-medium">
                          {r.comment || (
                            <span className="text-gray-400">
                              (nessun commento)
                            </span>
                          )}
                        </div>
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
          )}
        </div>
      </div>

      {/* Toast successo */}
      {success && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-sm animate-fade-in-out">
          ✅ Segnalazione salvata con successo
        </div>
      )}

      {/* MENU MOBILE */}
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
      </nav>
    </div>
  );
}
