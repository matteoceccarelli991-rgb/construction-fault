import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Fix per icone Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const LS_KEY = "construction_fault_reports_v2";

function nowISO() {
  return new Date().toISOString();
}

function useLocalReports() {
  const [reports, setReports] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(reports));
  }, [reports]);

  return [reports, setReports];
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

export default function App() {
  const [reports, setReports] = useLocalReports();
  const [view, setView] = useState("list"); // 'list' | 'map' | 'completed'
  const [search, setSearch] = useState("");
  const [userPos, setUserPos] = useState(null);
  const fileRef = useRef();
  const commentRef = useRef();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        (err) => {
          console.warn("Geolocation error", err.message);
        }
      );
    }
  }, []);

  function addReportFromFiles(files) {
    if (!files || !files.length) return;
    const createReport = (pos) => {
      const timestamp = nowISO();
      const filePromises = Array.from(files).map(
        (file) =>
          new Promise((res) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              res({
                dataUrl: e.target.result,
                filename: file.name,
                timestamp,
                lat: pos?.lat ?? null,
                lng: pos?.lng ?? null,
              });
            };
            reader.readAsDataURL(file);
          })
      );

      Promise.all(filePromises).then((photos) => {
        const newReport = {
          id: "r_" + Math.random().toString(36).slice(2, 9),
          createdAt: timestamp,
          comment: commentRef.current?.value || "",
          photos,
          completed: false,
          completedAt: null,
        };
        setReports((prev) => [newReport, ...prev]);
        if (fileRef.current) fileRef.current.value = "";
        if (commentRef.current) commentRef.current.value = "";
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          createReport({ lat: p.coords.latitude, lng: p.coords.longitude });
        },
        () => createReport(userPos)
      );
    } else {
      createReport(userPos);
    }
  }

  function markCompleted(reportId) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, completed: true, completedAt: nowISO() } : r
      )
    );
  }

  function markReopen(reportId) {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, completed: false, completedAt: null } : r
      )
    );
  }

  function deleteReport(reportId) {
    if (!confirm("Eliminare la segnalazione?")) return;
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }

  const filtered = reports.filter((r) =>
    r.comment.toLowerCase().includes(search.toLowerCase())
  );
  const active = filtered.filter((r) => !r.completed);
  const completed = filtered.filter((r) => r.completed);

  const photoMarkers = reports
    .flatMap((r) =>
      r.photos.map((p) => ({
        reportId: r.id,
        lat: p.lat,
        lng: p.lng,
        dataUrl: p.dataUrl,
        comment: r.comment,
        createdAt: p.timestamp,
        completed: r.completed,
      }))
    )
    .filter((m) => m.lat != null && m.lng != null);

  return (
    <div className="min-h-screen bg-green-600 text-gray-900 p-4">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow p-4">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Construction Fault</h1>
          <div className="space-x-2">
            <button
              onClick={() => setView("list")}
              className="px-3 py-1 rounded bg-gray-100"
            >
              Lista
            </button>
            <button
              onClick={() => setView("map")}
              className="px-3 py-1 rounded bg-gray-100"
            >
              Mappa
            </button>
            <button
              onClick={() => setView("completed")}
              className="px-3 py-1 rounded bg-gray-100"
            >
              Completate
            </button>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="p-3 border rounded">
              <label className="block text-sm font-medium mb-1">
                Commento
              </label>
              <textarea
                ref={commentRef}
                rows={3}
                className="w-full border p-2 rounded"
                placeholder="Descrivi il problema..."
              ></textarea>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                />
                <button
                  onClick={() => addReportFromFiles(fileRef.current?.files)}
                  className="px-3 py-2 bg-green-600 text-white rounded"
                >
                  Salva segnalazione
                </button>
                <button
                  onClick={() => {
                    if (fileRef.current) fileRef.current.value = "";
                    if (commentRef.current) commentRef.current.value = "";
                  }}
                  className="px-3 py-2 bg-gray-200 rounded"
                >
                  Annulla
                </button>
              </div>

              <div className="mt-2 text-sm text-gray-500">
                Posizione attuale:{" "}
                {userPos
                  ? `${userPos.lat.toFixed(6)}, ${userPos.lng.toFixed(6)}`
                  : "Non disponibile (consenti geolocalizzazione)"}
              </div>
            </div>

            <div className="p-3 border rounded">
              <label className="block text-sm font-medium mb-1">
                Ricerca commenti
              </label>
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 border p-2 rounded"
                  placeholder="Cerca nei commenti..."
                />
                <button className="px-3 py-2 bg-blue-600 text-white rounded">
                  Trova
                </button>
                <button
                  onClick={() => setSearch("")}
                  className="px-3 py-2 bg-gray-300 rounded"
                >
                  Pulisci
                </button>
              </div>
            </div>

            <div className="p-3 border rounded">
              <h3 className="font-semibold mb-2">Statistiche</h3>
              <div>Segnalazioni totali: {reports.length}</div>
              <div>Attive: {reports.filter((r) => !r.completed).length}</div>
              <div>Completate: {reports.filter((r) => r.completed).length}</div>
            </div>
          </div>

          <div className="space-y-3">
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
                  {photoMarkers.map((m, idx) => (
                    <Marker key={idx} position={[m.lat, m.lng]}>
                      <Popup>
                        <div className="max-w-xs">
                          <img
                            src={m.dataUrl}
                            alt="foto"
                            className="w-full h-32 object-cover rounded mb-2"
                          />
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
              <div className="space-y-2 max-h-96 overflow-auto">
                {(view === "list" ? active : completed).map((r) => (
                  <div key={r.id} className="border rounded p-2 flex gap-3">
                    <div className="w-28 grid grid-cols-1 gap-1 overflow-hidden">
                      {r.photos.map((p, i) => (
                        <img
                          key={i}
                          src={p.dataUrl}
                          className="w-28 h-20 object-cover rounded"
                          alt="thumb"
                        />
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold">
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
                              className="px-2 py-1 bg-green-600 text-white rounded text-sm"
                            >
                              Completato
                            </button>
                          ) : (
                            <button
                              onClick={() => markReopen(r.id)}
                              className="px-2 py-1 bg-yellow-300 rounded text-sm"
                            >
                              Riapri
                            </button>
                          )}
                          <button
                            onClick={() => deleteReport(r.id)}
                            className="px-2 py-1 bg-red-500 text-white rounded text-sm"
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
                  <div className="p-4 text-center text-gray-500">
                    Nessuna segnalazione qui.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <footer className="mt-4 text-sm text-gray-500">
          App demo — archiviazione in localStorage. Per produzione integrare un
          backend (Supabase/Firebase) e storage per immagini.
        </footer>
      </div>
    </div>
  );
}
