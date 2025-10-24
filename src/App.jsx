import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ClipboardList, Map as MapIcon, CheckCircle, Upload } from "lucide-react";

/* --- Construction Fault App MC v6.0.4 --- */

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
  return <div className='text-center text-xl font-bold p-6'>Construction Fault MC v6.0.4 Ready ✅</div>;
}
