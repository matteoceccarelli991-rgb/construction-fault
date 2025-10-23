import React, { useEffect, useState, useRef } from "react";
import {
  GoogleMap,
  Marker,
  InfoWindow,
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

/** ============ Config ============ */
const STORAGE_KEY = "construction_fault_reports_v7";
const VERSION = "MC v5.3";
// 🔑 Inserisci qui la tua API key (meglio ancora: usa una env var su Vercel)
const GOOGLE_MAPS_API_KEY = "AIzaSyDRwnapT5_xsxLnoW8TgNuYK77G9Ghgo3M";

/** Cantieri in ordine alfabetico */
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

/** ============ Helper ============ */
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

/** ============ App ============ */
export default function App() {
  // Dati
  const [reports, setReports] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // UI state
  const [view, setView] = useState("list"); // list | map | completed | export
  const [newCantiere, setNewCantiere] = useState(CANTIERI[0]);
  const [selectedCantiere, setSelectedCantiere] = useState("Tutti");
  const [search, setSearch] = useState("");
  const [tempPhotos, setTempPhotos] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Azioni in corso (effetti visivi)
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(null); // id
  const [isDeleting, setIsDeleting] = useState(null); // id

  // Mappa
  const [userPos, setUserPos] = useState(null);
  const [mapType, setMapType] = useState("roadmap"); // roadmap | satellite
  const [activeInfo, setActiveInfo] = useState(null); // index marker aperto

  // Refs
  const commentRef = useRef();

  // Persistenza
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  // Geolocalizzazione
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setUserPos(null)
      );
    }
  }, []);

  // Caricamento Google Maps
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  /** ============ Handlers Nuova Segnalazione ============ */
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
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError("Errore durante il salvataggio: " + err.message);
    } finally {
      setIsSaving(false);
    }
  }

  /** ============ Azioni su segnalazioni ============ */
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
    }, 800);
  }

  function deleteReport(id) {
    if (isDeleting) return;
    if (!confirm("Eliminare la segnalazione?")) return;
    setIsDeleting(id);
    setTimeout(() => {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setIsDeleting(null);
    }, 600);
  }

  /** ============ Export ============ */
  function exportCSV() {
    const header = [
      "Cantiere",
      "Commento",
      "Data creazione",
      "Latitudine",
      "Longitudine",
      "Completata",
      "Data completamento",
    ];
    const rows = reports.map((r) => [
      r.cantiere,
      (r.comment || "").replace(/[\n\r]/g, " "),
      formatDate(r.createdAt),
      r.photos?.[0]?.lat ?? "",
      r.photos?.[0]?.lng ?? "",
      r.completed ? "Sì" : "No",
      r.completed ? formatDate(r.completedAt) : "",
    ]);
    const csv = [header, ...rows].map((row) => row.join(";")).join("\n");
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

  /** ============ Filtri & Dati derivati ============ */
  const filtered = reports.filter((r) => {
    const textMatch = (r.comment || "")
      .toLowerCase()
      .includes(search.toLowerCase());
    const cantiereMatch =
      selectedCantiere === "Tutti" || r.cantiere === selectedCantiere;
    return textMatch && cantiereMatch;
  });
  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

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
    .filter((m) => m.lat != null && m.lng != null);

  /** ============ UI ============ */
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
          <p className="text-xs text-gray-500 text-center mb-3">{VERSION}</p>

          {/* MAPPA */}
          {view === "map" && (
            <div className="h-96 border rounded overflow-hidden mb-3 relative">
              {isLoaded ? (
                <>
                  <GoogleMap
                    center={
                      userPos || { lat: 41.8719, lng: 12.5674 } // centro Italia
                    }
                    zoom={6}
                    mapTypeId={mapType}
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                  >
                    {/* Punto blu (utente) */}
                    {userPos && (
                      <Marker
                        position={userPos}
                        icon={{
                          path: window.google?.maps.SymbolPath.CIRCLE,
                          scale: 8,
                          fillColor: "#4285F4",
                          fillOpacity: 1,
                          strokeColor: "#fff",
                          strokeWeight: 2,
                        }}
                        title="La tua posizione"
                      />
                    )}

                    {/* Marker segnalazioni */}
                    {markers.map((m, i) => (
                      <Marker
                        key={i}
                        position={{ lat: m.lat, lng: m.lng }}
                        onClick={() => setActiveInfo(i)}
                        title={`${m.cantiere} — ${m.comment || ""}`}
                      />
                    ))}

                    {/* InfoWindow */}
                    {activeInfo != null && markers[activeInfo] && (
                      <InfoWindow
                        position={{
                          lat: markers[activeInfo].lat,
                          lng: markers[activeInfo].lng,
                        }}
                        onCloseClick={() => setActiveInfo(null)}
                      >
                        <div style={{ maxWidth: 220 }}>
                          <img
                            src={markers[activeInfo].dataUrl}
                            alt="foto"
                            style={{
                              width: "100%",
                              height: 100,
                              objectFit: "cover",
                              borderRadius: 6,
                              marginBottom: 6,
                            }}
                          />
                          <div className="text-sm font-semibold text-green-700">
                            {markers[activeInfo].cantiere}
                          </div>
                          <div className="text-sm">
                            {markers[activeInfo].comment || "(nessun commento)"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDate(markers[activeInfo].createdAt)}
                          </div>
                          <div className="text-xs">
                            {markers[activeInfo].completed
                              ? "Completata"
                              : "Aperta"}
                          </div>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>

                  {/* Toggle mappa/satellite */}
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

          {/* VISTA ESPORTA */}
          {view === "export" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <h2 className="text-lg font-semibold text-green-700">
                📤 Esporta segnalazioni
              </h2>
              <button
                onClick={exportCSV}
                className="px-6 py-3 bg-green-600 text-white rounded-lg shadow w-full sm:w-auto"
              >
                📄 Esporta in CSV
              </button>
              <button
                onClick={exportJSON}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow w-full sm:w-auto"
              >
                🧾 Esporta in JSON (con foto)
              </button>
            </div>
          )}

          {/* VISTE LISTA / COMPLETATE + FORM */}
          {view !== "map" && view !== "export" && (
            <>
              {/* NUOVA SEGNALAZIONE */}
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
                    disabled={isSaving}
                    className={`px-4 py-2 rounded-md flex items-center gap-1 text-white transition ${
                      isSaving
                        ? "bg-green-800 opacity-75 cursor-not-allowed"
                        : "bg-green-700 hover:bg-green-800"
                    }`}
                  >
                    {isSaving ? "⏳ Salvataggio..." : "💾 Salva segnalazione"}
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

              {/* FILTRI */}
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

              {/* LISTA / COMPLETATE */}
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
                          {!r.completed && (
                            <button
                              onClick={() => markCompleted(r.id)}
                              disabled={isCompleting === r.id}
                              className={`px-2 py-1 rounded text-xs text-white transition ${
                                isCompleting === r.id
                                  ? "bg-green-800 opacity-75 cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-700"
                              }`}
                            >
                              {isCompleting === r.id
                                ? "⏳ In completamento..."
                                : "Completato"}
                            </button>
                          )}
                          <button
                            onClick={() => deleteReport(r.id)}
                            disabled={isDeleting === r.id}
                            className={`px-2 py-1 rounded text-xs text-white transition ${
                              isDeleting === r.id
                                ? "bg-red-800 opacity-75 cursor-not-allowed"
                                : "bg-red-500 hover:bg-red-600"
                            }`}
                          >
                            {isDeleting === r.id
                              ? "⏳ Eliminazione..."
                              : "Elimina"}
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

      {/* Toast successo */}
      {success && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg text-sm">
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
