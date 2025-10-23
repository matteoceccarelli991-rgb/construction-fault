import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  ClipboardList,
  Map as MapIcon,
  CheckCircle,
  Upload,
  Camera,
  Image as ImageIcon,
  X,
} from "lucide-react";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STORAGE_KEY = "construction_fault_reports_v5";
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
  const [newCantiere, setNewCantiere] = useState(CANTIERI[0]);
  const [selectedCantiere, setSelectedCantiere] = useState("Tutti");
  const [search, setSearch] = useState("");
  const [userPos, setUserPos] = useState(null);
  const [tempPhotos, setTempPhotos] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const commentRef = useRef();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setUserPos(null)
      );
    }
  }, []);

  async function handleTempPhotos(files) {
    const compressed = await Promise.all(
      Array.from(files).map(async (file) => {
        const comp = await compressImage(file);
        return new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (e) =>
            res({ dataUrl: e.target.result, filename: file.name });
          reader.readAsDataURL(comp);
        });
      })
    );
    setTempPhotos((prev) => [...prev, ...compressed]);
  }

  async function saveReport() {
    try {
      if (!tempPhotos.length)
        return setError("Aggiungi almeno una foto prima di salvare");
      setError("");
      const pos = await new Promise((resolve) => {
        if (navigator.geolocation)
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(userPos)
          );
        else resolve(userPos);
      });
      const timestamp = nowISO();
      const newReport = {
        id: "r_" + Math.random().toString(36).slice(2, 9),
        createdAt: timestamp,
        cantiere: newCantiere,
        comment: commentRef.current?.value || "",
        photos: tempPhotos.map((p) => ({
          ...p,
          timestamp,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        })),
        completed: false,
        completedAt: null,
      };
      setReports((p) => [newReport, ...p]);
      setTempPhotos([]);
      if (commentRef.current) commentRef.current.value = "";
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    }
  }

  function markCompleted(id) {
    setReports((p) =>
      p.map((r) =>
        r.id === id ? { ...r, completed: true, completedAt: nowISO() } : r
      )
    );
  }

  function deleteReport(id) {
    if (!confirm("Eliminare la segnalazione?")) return;
    setReports((p) => p.filter((r) => r.id !== id));
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

  const filtered = reports.filter((r) => {
    const textMatch = r.comment.toLowerCase().includes(search.toLowerCase());
    const cantiereMatch =
      selectedCantiere === "Tutti" || r.cantiere === selectedCantiere;
    return textMatch && cantiereMatch;
  });

  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

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

          {/* --- NUOVA SEGNALAZIONE --- */}
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

            {/* ANTEPRIMA FOTO */}
            {tempPhotos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {tempPhotos.map((photo, i) => (
                  <img
                    key={i}
                    src={photo.dataUrl}
                    alt="Anteprima"
                    className="w-full h-24 object-cover rounded border"
                  />
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                id="cameraInput"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => handleTempPhotos(e.target.files)}
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
                onChange={(e) => handleTempPhotos(e.target.files)}
              />
              <label
                htmlFor="galleryInput"
                className="px-4 py-2 bg-blue-600 text-white rounded-md cursor-pointer flex items-center gap-1"
              >
                <ImageIcon size={18} /> Galleria
              </label>

              <button
                onClick={saveReport}
                className="px-4 py-2 bg-green-700 text-white rounded-md flex items-center gap-1"
              >
                💾 Salva segnalazione
              </button>

              <button
                onClick={() => {
                  setTempPhotos([]);
                  if (commentRef.current) commentRef.current.value = "";
                }}
                className="px-4 py-2 bg-gray-200 rounded-md flex items-center gap-1"
              >
                <X size={18} /> Annulla
              </button>
            </div>
          </div>

          {/* --- FILTRO --- */}
          <div className="border p-3 rounded mb-3">
            <label className="text-sm font-medium">Filtra per cantiere</label>
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border p-2 rounded text-sm"
              placeholder="Cerca nei commenti..."
            />
          </div>

          {/* --- LISTA SEGNALAZIONI --- */}
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
                    </div>
                    <div className="space-y-1 text-right">
                      {!r.completed && (
                        <button
                          onClick={() => markCompleted(r.id)}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                        >
                          Completato
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
          </div>
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
          onClick={() => exportJSON()}
          className={`flex flex-col items-center text-gray-500`}
        >
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
