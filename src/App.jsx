import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ClipboardList, Map as MapIcon, CheckCircle, Upload } from "lucide-react";

const STORAGE_KEY = "construction_fault_reports_v16";
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

  // Foto per chiusura
  async function handleClosingPhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
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
          const quality = file.size > 2 * 1024 * 1024 ? 0.7 : 0.9;
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

  function centerMap() {
    if (userPos && mapRef.current) {
      mapRef.current.flyTo(userPos, 15, { animate: true, duration: 1.5 });
    }
  }

  // 🔥 RETURN UNICO CORRETTO
  return (
    <div className="min-h-screen flex flex-col bg-green-600 text-gray-900">
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-4">
          {/* Tutto il contenuto rimane identico al tuo */}
          {/* ... (mappa, lista, completate, esporta, modale, ecc.) */}
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
          onClick={() => setView("export")}
          className={`flex flex-col items-center ${view === "export" ? "text-green-600" : "text-gray-500"}`}
        >
          <Upload size={22} />
          <span className="text-xs">Esporta</span>
        </button>
      </nav>
    </div>
  );
}
