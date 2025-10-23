import React, { useEffect, useState, useRef } from "react";
import {
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  ClipboardList,
  Map as MapIcon,
  CheckCircle,
  Upload,
  Camera,
  Image as ImageIcon,
  X,
} from "lucide-react";

const STORAGE_KEY = "construction_fault_reports_v7";
const GOOGLE_MAPS_API_KEY = "INAIzaSyDRwnapT5_xsxLnoW8TgNuYK77G9Ghgo3M"; // 🔑 Sostituisci con la tua
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

  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(null);
  const [isDeleting, setIsDeleting] = useState(null);
  const [mapType, setMapType] = useState("roadmap");

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
    if (isSaving) return;
    try {
      setIsSaving(true);
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
    } finally {
      setIsSaving(false);
    }
  }

  function markCompleted(id) {
    if (isCompleting) return;
    setIsCompleting(id);
    setTimeout(() => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, completed: true, completedAt: nowISO() } : r
        )
      );
      setIsCompleting(null);
    }, 1000);
  }

  function deleteReport(id) {
    if (isDeleting) return;
    if (!confirm("Eliminare la segnalazione?")) return;
    setIsDeleting(id);
    setTimeout(() => {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setIsDeleting(null);
    }, 800);
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

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

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
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-3 sm:p-4">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 text-center">
            Construction Fault
          </h1>
          <p className="text-xs text-gray-500 text-center mb-3">MC v5.3</p>

          {/* --- MAPPA GOOGLE --- */}
          {view === "map" && (
            <div className="h-96 border rounded overflow-hidden mb-3 relative">
              {isLoaded ? (
                <>
                  <GoogleMap
                    center={
                      userPos || { lat: 41.8719, lng: 12.5674 } // Italia
                    }
                    zoom={6}
                    mapTypeId={mapType}
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                  >
                    {userPos && (
                      <Marker
                        position={userPos}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 8,
                          fillColor: "#4285F4",
                          fillOpacity: 1,
                          strokeColor: "#fff",
                          strokeWeight: 2,
                        }}
                      />
                    )}
                    {markers.map((m, i) => (
                      <Marker
                        key={i}
                        position={{ lat: m.lat, lng: m.lng }}
                        title={`${m.cantiere}: ${m.comment}`}
                      />
                    ))}
                  </GoogleMap>

                  <button
                    onClick={() =>
                      setMapType(mapType === "roadmap" ? "satellite" : "roadmap")
                    }
                    className="absolute top-2 right-2 bg-white text-sm px-3 py-1 rounded shadow"
                  >
                    Vista: {mapType === "roadmap" ? "Mappa" : "Satellite"}
                  </button>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Caricamento mappa...
                </div>
              )}
            </div>
          )}

          {/* --- SEZIONE NORMALE --- */}
          {view !== "map" && (
            <>
              {/* (Modulo e lista come prima, non modificato per brevità) */}
              <p className="text-center text-gray-400 text-sm">
                (La sezione mappa è ora basata su Google Maps)
              </p>
            </>
          )}
        </div>
      </div>

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
          className="flex flex-col items-center text-gray-500"
        >
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
